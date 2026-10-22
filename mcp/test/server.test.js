import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, beforeEach, test } from "node:test";
import { fileURLToPath } from "node:url";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const SERVER = fileURLToPath(new URL("../server.js", import.meta.url));
const LOOKUP = {
  number: "+4917612345678", valid: true, invalid_reason: null, e164: "+4917612345678", carrier: null,
  line_type: { value: "mobile", confidence: 1, source: "libphonenumber" },
  risk: { score: 0, level: "low", recommendation: "allow", reasons: [] },
};

// A local server that stands in for RapidAPI
const stub = { requests: [], status: 200, answer: LOOKUP };
let http;
let baseUrl;

before(async () => {
  http = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      stub.requests.push({ path: request.url, headers: request.headers, body: JSON.parse(body) });
      response.writeHead(stub.status, { "Content-Type": "application/json" });
      response.end(JSON.stringify(stub.answer));
    });
  });
  await new Promise((resolve) => http.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${http.address().port}`;
});

after(() => http.close());

beforeEach(() => {
  stub.requests = [];
  stub.status = 200;
  stub.answer = LOOKUP;
});

// Starts the server the way an MCP client would, and connects to it over stdio
async function connect(env = { RAPIDAPI_KEY: "test-key" }) {
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(new StdioClientTransport({
    command: process.execPath,
    args: [SERVER],
    env: { PATH: process.env.PATH, PHONERISK_BASE_URL: baseUrl, ...env },
  }));
  return client;
}

const textOf = (result) => result.content[0].text;

test("introduces itself and its tools", async () => {
  const client = await connect();
  assert.equal(client.getServerVersion().name, "phonerisk");
  assert.match(client.getInstructions(), /international format/);

  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((tool) => tool.name), ["lookup_phone_number", "lookup_phone_numbers", "extract_phone_numbers"]);
  for (const tool of tools) {
    assert.ok(tool.description.length > 40, tool.name);
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.ok("default_region" in tool.inputSchema.properties);
  }
  assert.deepEqual(tools[0].inputSchema.required, ["number"]);
  await client.close();
});

test("lookup_phone_number", async () => {
  const client = await connect();
  const result = await client.callTool({ name: "lookup_phone_number", arguments: { number: "+4917612345678" } });
  assert.ok(!result.isError);
  const lookup = JSON.parse(textOf(result));
  assert.equal(lookup.risk.recommendation, "allow");
  // Empty fields are left out to save the assistant tokens
  assert.ok(!("carrier" in lookup) && !("invalid_reason" in lookup));

  const sent = stub.requests[0];
  assert.equal(sent.path, "/api/v1/lookup");
  assert.deepEqual(sent.body, { number: "+4917612345678" });
  assert.equal(sent.headers["x-rapidapi-key"], "test-key");
  assert.equal(sent.headers["x-rapidapi-host"], "phonerisk-api.p.rapidapi.com");
  await client.close();
});

test("default_region is passed on", async () => {
  const client = await connect();
  await client.callTool({ name: "lookup_phone_number", arguments: { number: "0176 12345678", default_region: "DE" } });
  assert.deepEqual(stub.requests[0].body, { number: "0176 12345678", default_region: "DE" });
  await client.close();
});

test("lookup_phone_numbers", async () => {
  const client = await connect();
  stub.answer = { count: 2, results: [LOOKUP, { ...LOOKUP, number: "n/a", valid: false, invalid_reason: "unparseable", e164: null }] };
  const result = await client.callTool({ name: "lookup_phone_numbers", arguments: { numbers: ["+4917612345678", "n/a"] } });
  const batch = JSON.parse(textOf(result));
  assert.equal(batch.count, 2);
  assert.equal(batch.results[1].invalid_reason, "unparseable");
  assert.ok(!("e164" in batch.results[1]));
  assert.equal(stub.requests[0].path, "/api/v1/lookup/batch");
  assert.deepEqual(stub.requests[0].body, { numbers: ["+4917612345678", "n/a"] });
  await client.close();
});

test("extract_phone_numbers", async () => {
  const client = await connect();
  stub.answer = { count: 1, truncated: false, matches: [{ ...LOOKUP, start: 5, end: 21 }] };
  const result = await client.callTool({ name: "extract_phone_numbers", arguments: { text: "Call +49 176 12345678", default_region: "DE" } });
  const found = JSON.parse(textOf(result));
  assert.deepEqual([found.count, found.truncated, found.matches[0].start, found.matches[0].end], [1, false, 5, 21]);
  assert.equal(stub.requests[0].path, "/api/v1/extract");
  assert.deepEqual(stub.requests[0].body, { text: "Call +49 176 12345678", default_region: "DE" });
  await client.close();
});

test("input the API would refuse never leaves the machine", async () => {
  const client = await connect();
  const tooMany = await client.callTool({ name: "lookup_phone_numbers", arguments: { numbers: Array(101).fill("+4917612345678") } });
  const badRegion = await client.callTool({ name: "lookup_phone_number", arguments: { number: "+4917612345678", default_region: "DEU" } });
  assert.ok(tooMany.isError && badRegion.isError);
  assert.equal(stub.requests.length, 0);
  await client.close();
});

test("problems come back as messages the assistant can act on", async () => {
  const client = await connect();
  const call = () => client.callTool({ name: "lookup_phone_number", arguments: { number: "hello" } });

  stub.status = 400;
  stub.answer = { detail: "Invalid phone number format: use international format (+...) or pass default_region" };
  let result = await call();
  assert.ok(result.isError);
  assert.match(textOf(result), /default_region/);

  stub.status = 403;
  stub.answer = { message: "You are not subscribed to this API." };
  result = await call();
  assert.ok(result.isError);
  assert.match(textOf(result), /did not accept the key \(You are not subscribed to this API\.\)/);

  stub.status = 429;
  stub.answer = { message: "You have exceeded the MONTHLY quota" };
  result = await call();
  assert.match(textOf(result), /quota or rate limit/);

  stub.status = 502;
  stub.answer = {};
  result = await call();
  assert.match(textOf(result), /status 502/);
  await client.close();
});

test("without a key the server still starts, and says how to get one", async () => {
  const client = await connect({});
  assert.equal((await client.listTools()).tools.length, 3);
  const result = await client.callTool({ name: "lookup_phone_number", arguments: { number: "+4917612345678" } });
  assert.ok(result.isError);
  assert.match(textOf(result), /RAPIDAPI_KEY/);
  assert.match(textOf(result), /rapidapi\.com\/daimaileri20\/api\/phonerisk-api/);
  assert.equal(stub.requests.length, 0);
  await client.close();
});

test("an API that cannot be reached", async () => {
  const client = await connect({ RAPIDAPI_KEY: "test-key", PHONERISK_BASE_URL: "http://127.0.0.1:9" });
  const result = await client.callTool({ name: "lookup_phone_number", arguments: { number: "+4917612345678" } });
  assert.ok(result.isError);
  assert.match(textOf(result), /could not be reached/);
  await client.close();
});
