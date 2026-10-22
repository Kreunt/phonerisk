#!/usr/bin/env node
// MCP server for the PhoneRisk API: lets an AI assistant validate phone numbers
// and judge how risky they look. It talks to the assistant over stdio and to
// the API over HTTPS, with the RapidAPI key from the RAPIDAPI_KEY variable.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const VERSION = "0.1.0";
const LISTING = "https://rapidapi.com/daimaileri20/api/phonerisk-api";
const HOST = process.env.PHONERISK_HOST || "phonerisk-api.p.rapidapi.com";
// PHONERISK_BASE_URL is for tests; RapidAPI is always reached over HTTPS at the host
const BASE_URL = (process.env.PHONERISK_BASE_URL || `https://${HOST}`).replace(/\/+$/, "");
const TIMEOUT_MS = 15_000;

// The API's own limits; refusing here saves a request that would be turned away
const MAX_NUMBERS = 100;
const MAX_TEXT_LENGTH = 20_000;

const INSTRUCTIONS =
  "Tools for checking phone numbers against numbering-plan data and public lists of disposable numbers. " +
  "Write numbers in international format (+4917612345678), or pass default_region " +
  "(a two-letter country code such as DE) for numbers in national format. " +
  "'valid' means the number fits its country's numbering plan; it does not confirm " +
  "the number is in service. Most facts come as {value, confidence, source}, with " +
  "confidence from 0 to 1. risk.recommendation is allow, review or block.";

// The tools only look numbers up in fixed data: no side effects, the same answer every time
const READ_ONLY = { readOnlyHint: true, idempotentHint: true, openWorldHint: false };

const defaultRegion = z
  .string()
  .length(2)
  .optional()
  .describe("Two-letter country code such as DE or US, used to read numbers written without a leading +");

/** Something went wrong that the assistant can tell the user about. */
class ToolProblem extends Error {}

// Drop empty fields; an assistant pays for every token it reads
function compact(result) {
  return Object.fromEntries(Object.entries(result).filter(([, value]) => value !== null));
}

function detailOf(text) {
  try {
    const data = JSON.parse(text);
    const detail = data.detail ?? data.message;
    if (typeof detail === "string") return detail;
    if (Array.isArray(detail)) return detail.map((entry) => entry.msg).filter(Boolean).join("; ");
  } catch {
    // Not JSON: fall through
  }
  return "";
}

async function callApi(path, body) {
  const key = process.env.RAPIDAPI_KEY;
  if (!key) {
    throw new ToolProblem(
      `No RapidAPI key is configured. Subscribe to a plan at ${LISTING} and set RAPIDAPI_KEY in this server's environment.`,
    );
  }

  let response;
  let text;
  try {
    response = await fetch(BASE_URL + path, {
      method: "POST",
      headers: {
        "X-RapidAPI-Key": key,
        "X-RapidAPI-Host": HOST,
        "Content-Type": "application/json",
        "User-Agent": `phonerisk-mcp/${VERSION}`,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    text = await response.text();
  } catch (error) {
    const why = error?.name === "TimeoutError" ? "no answer in time" : error?.cause?.code || error?.message;
    throw new ToolProblem(`The PhoneRisk API could not be reached (${why}). Try again in a moment.`);
  }

  if (response.ok) {
    try {
      return JSON.parse(text);
    } catch {
      throw new ToolProblem("The PhoneRisk API sent an answer that could not be read. Try again in a moment.");
    }
  }
  const detail = detailOf(text);
  if (response.status === 400) {
    throw new ToolProblem(detail || "That is not a phone number. Use international format (+...) or pass default_region.");
  }
  if (response.status === 401 || response.status === 403) {
    throw new ToolProblem(`RapidAPI did not accept the key (${detail || response.status}). Check RAPIDAPI_KEY and the subscription at ${LISTING}.`);
  }
  if (response.status === 429) {
    throw new ToolProblem(`The quota or rate limit of the RapidAPI plan is used up (${detail || "429"}). Plans: ${LISTING}`);
  }
  throw new ToolProblem(`The PhoneRisk API answered with status ${response.status}${detail ? `: ${detail}` : ""}.`);
}

// Runs a tool and turns its result, or a problem, into what the protocol expects
async function answer(run) {
  try {
    return { content: [{ type: "text", text: JSON.stringify(await run()) }] };
  } catch (error) {
    if (!(error instanceof ToolProblem)) throw error;
    return { content: [{ type: "text", text: error.message }], isError: true };
  }
}

function options(default_region) {
  return default_region ? { default_region } : {};
}

function buildServer() {
  const server = new McpServer({ name: "phonerisk", title: "PhoneRisk", version: VERSION }, { instructions: INSTRUCTIONS });

  server.registerTool(
    "lookup_phone_number",
    {
      title: "Look up a phone number",
      description:
        "Validate one phone number and describe it. Returns validity (with the reason when invalid), E.164, " +
        "national and international formats, country, line type (mobile, fixed_line, voip, toll_free, " +
        "premium_rate, ...), the carrier the range was allocated to, location, time zones, local time with a " +
        "calling-hours check, whether it is a known disposable number, and a 0-100 risk score with reasons " +
        "and an allow / review / block recommendation.",
      inputSchema: {
        number: z.string().min(1).max(64).describe("The phone number, in international format unless default_region is given"),
        default_region: defaultRegion,
      },
      annotations: READ_ONLY,
    },
    ({ number, default_region }) =>
      answer(async () => compact(await callApi("/api/v1/lookup", { number, ...options(default_region) }))),
  );

  server.registerTool(
    "lookup_phone_numbers",
    {
      title: "Look up several phone numbers",
      description:
        "Same as lookup_phone_number for a list of up to 100 numbers, with results in input order. Entries that " +
        'are not phone numbers come back with invalid_reason "unparseable" instead of failing the call.',
      inputSchema: {
        numbers: z.array(z.string().max(64)).min(1).max(MAX_NUMBERS).describe("The phone numbers to look up"),
        default_region: defaultRegion,
      },
      annotations: READ_ONLY,
    },
    ({ numbers, default_region }) =>
      answer(async () => {
        const batch = await callApi("/api/v1/lookup/batch", { numbers, ...options(default_region) });
        return { count: batch.count, results: batch.results.map(compact) };
      }),
  );

  server.registerTool(
    "extract_phone_numbers",
    {
      title: "Find phone numbers in text",
      description:
        "Find every valid phone number in free text and look each one up. Each match carries its position in the " +
        "text (start, end) and the same fields as lookup_phone_number. Numbers in national format are only " +
        "recognised when default_region is given.",
      inputSchema: {
        text: z.string().min(1).max(MAX_TEXT_LENGTH).describe("The text to search, up to 20,000 characters"),
        default_region: defaultRegion,
      },
      annotations: READ_ONLY,
    },
    ({ text, default_region }) =>
      answer(async () => {
        const found = await callApi("/api/v1/extract", { text, ...options(default_region) });
        return { ...found, matches: found.matches.map(compact) };
      }),
  );

  return server;
}

await buildServer().connect(new StdioServerTransport());
