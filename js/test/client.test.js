import assert from "node:assert/strict";
import { createServer } from "node:http";
import { after, before, beforeEach, test } from "node:test";

import PhoneRiskDefault, { DEFAULT_HOST, NotAPhoneNumber, PhoneRisk, PhoneRiskError, RateLimited } from "../index.js";

const LOOKUP = { number: "+4917612345678", valid: true, e164: "+4917612345678", risk: { score: 0, recommendation: "allow" } };

// A local server that stands in for RapidAPI: keeps what it was sent, answers what the test tells it to
const stub = { requests: [], status: 200, answer: LOOKUP };
let server;
let client;

before(async () => {
  server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => (body += chunk));
    request.on("end", () => {
      const seen = { method: request.method, path: request.url, headers: request.headers, body: body ? JSON.parse(body) : null };
      stub.requests.push(seen);
      const answer = typeof stub.answer === "function" ? stub.answer(seen) : stub.answer;
      response.writeHead(stub.status, { "Content-Type": "application/json" });
      response.end(typeof answer === "string" ? answer : JSON.stringify(answer));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  client = new PhoneRisk({ apiKey: "test-key", baseUrl: `http://127.0.0.1:${server.address().port}` });
});

after(() => server.close());

beforeEach(() => {
  stub.requests = [];
  stub.status = 200;
  stub.answer = LOOKUP;
});

const last = () => stub.requests.at(-1);

test("lookup", async () => {
  assert.deepEqual(await client.lookup("+4917612345678"), LOOKUP);
  assert.equal(last().method, "POST");
  assert.equal(last().path, "/api/v1/lookup");
  assert.deepEqual(last().body, { number: "+4917612345678" });
});

test("every request carries the RapidAPI headers", async () => {
  await client.lookup("+4917612345678");
  await client.examples("DE");
  for (const request of stub.requests) {
    assert.equal(request.headers["x-rapidapi-key"], "test-key");
    assert.equal(request.headers["x-rapidapi-host"], DEFAULT_HOST);
    assert.match(request.headers["user-agent"], /^phonerisk-js\//);
  }
});

test("lookup options", async () => {
  const when = new Date("2026-10-12T09:30:00Z");
  await client.lookup("0176 12345678", { defaultRegion: "DE", dialFrom: "US", at: when, nocache: true });
  assert.equal(last().path, "/api/v1/lookup?nocache=true");
  assert.deepEqual(last().body, {
    number: "0176 12345678", default_region: "DE", dial_from: "US", at: "2026-10-12T09:30:00.000Z",
  });
  await client.lookup("+4917612345678", { at: "2026-10-12T09:30:00+02:00" });
  assert.equal(last().body.at, "2026-10-12T09:30:00+02:00");
});

test("lookupBatch", async () => {
  stub.answer = { count: 2, results: [LOOKUP, LOOKUP] };
  assert.equal((await client.lookupBatch(["+4917612345678", "n/a"], { defaultRegion: "DE" })).count, 2);
  assert.equal(last().path, "/api/v1/lookup/batch");
  assert.deepEqual(last().body, { numbers: ["+4917612345678", "n/a"], default_region: "DE" });
});

test("one batch has a size limit", () => {
  for (const size of [0, 101]) {
    assert.throws(() => client.lookupBatch(Array(size).fill("+4917612345678")), RangeError);
  }
  assert.equal(stub.requests.length, 0);
});

test("lookupMany sends a long list in batches", async () => {
  const numbers = Array.from({ length: 250 }, (_, index) => `+49176${String(index).padStart(8, "0")}`);
  stub.answer = (request) => ({
    count: request.body.numbers.length,
    results: request.body.numbers.map((number) => ({ number })),
  });
  const results = await client.lookupMany(numbers, { defaultRegion: "DE" });
  assert.deepEqual(stub.requests.map((request) => request.body.numbers.length), [100, 100, 50]);
  assert.deepEqual(results.map((result) => result.number), numbers);
  assert.deepEqual(await client.lookupMany([]), []);
});

test("extract and compare", async () => {
  stub.answer = { count: 0, truncated: false, matches: [] };
  await client.extract("Call +49 176 12345678", { defaultRegion: "DE" });
  assert.equal(last().path, "/api/v1/extract");
  assert.deepEqual(last().body, { text: "Call +49 176 12345678", default_region: "DE" });

  stub.answer = { match_type: "exact_match", is_match: true };
  assert.equal((await client.compare("+49 176 12345678", "0176 12345678", { defaultRegion: "DE" })).is_match, true);
  assert.equal(last().path, "/api/v1/compare");
  assert.deepEqual(last().body, { first: "+49 176 12345678", second: "0176 12345678", default_region: "DE" });
});

test("GET endpoints encode their input", async () => {
  await client.vanity("+1 800 FLOWERS", { defaultRegion: "US" });
  assert.equal(last().method, "GET");
  // A bare "+" in a URL would arrive as a space
  assert.equal(last().path, "/api/v1/vanity?number=%2B1+800+FLOWERS&default_region=US");
  await client.vanity("1-800-FLOWERS");
  assert.equal(last().path, "/api/v1/vanity?number=1-800-FLOWERS");
  await client.shortNumber("112", "DE");
  assert.equal(last().path, "/api/v1/short-number?number=112&country=DE");
  await client.examples("DE");
  assert.equal(last().path, "/api/v1/examples/DE");
  await client.examples("../health");
  assert.equal(last().path, "/api/v1/examples/..%2Fhealth");
});

test("input that is not a phone number", async () => {
  stub.status = 400;
  stub.answer = { detail: "Invalid phone number format: use international format (+...) or pass default_region" };
  await assert.rejects(client.lookup("hello"), (error) => {
    assert.ok(error instanceof NotAPhoneNumber);
    assert.equal(error.status, 400);
    assert.match(error.detail, /default_region/);
    return true;
  });
});

test("rejected fields are named", async () => {
  stub.status = 422;
  stub.answer = { detail: [{ loc: ["body", "default_region"], msg: "Value error, unknown region code" }] };
  await assert.rejects(client.lookup("+4917612345678", { defaultRegion: "XX" }), (error) => {
    assert.equal(error.status, 422);
    assert.equal(error.detail, "default_region: Value error, unknown region code");
    return true;
  });
});

test("key problems reported by RapidAPI", async () => {
  for (const [status, message] of [[401, "Invalid API key."], [403, "You are not subscribed to this API."]]) {
    stub.status = status;
    stub.answer = { message };
    await assert.rejects(client.lookup("+4917612345678"), (error) => {
      assert.ok(error instanceof PhoneRiskError);
      assert.deepEqual([error.status, error.detail, error.message], [status, message, `${status}: ${message}`]);
      return true;
    });
  }
});

test("quota used up", async () => {
  stub.status = 429;
  stub.answer = { message: "You have exceeded the MONTHLY quota for Requests on your current plan" };
  await assert.rejects(client.lookup("+4917612345678"), (error) => {
    // One "catch (error) { if (error instanceof PhoneRiskError) ... }" covers everything the client throws
    assert.ok(error instanceof RateLimited && error instanceof PhoneRiskError);
    assert.equal(error.status, 429);
    return true;
  });
});

test("an answer that is not JSON", async () => {
  stub.answer = "<html>Bad gateway</html>";
  await assert.rejects(client.lookup("+4917612345678"), /not JSON/);
  stub.status = 502;
  await assert.rejects(client.lookup("+4917612345678"), (error) => {
    assert.deepEqual([error.status, error.detail], [502, "<html>Bad gateway</html>"]);
    return true;
  });
});

test("no answer at all", async () => {
  const unreachable = new PhoneRisk({ apiKey: "test-key", baseUrl: "http://127.0.0.1:9", timeoutMs: 2000 });
  await assert.rejects(unreachable.lookup("+4917612345678"), (error) => {
    assert.ok(error instanceof PhoneRiskError);
    assert.equal(error.status, null);
    assert.match(error.detail, /Could not reach/);
    return true;
  });
});

test("an answer that takes too long", async () => {
  const slow = createServer(() => {});
  await new Promise((resolve) => slow.listen(0, "127.0.0.1", resolve));
  const impatient = new PhoneRisk({ apiKey: "test-key", baseUrl: `http://127.0.0.1:${slow.address().port}`, timeoutMs: 100 });
  await assert.rejects(impatient.lookup("+4917612345678"), /no answer within 100 ms/);
  slow.closeAllConnections();
  slow.close();
});

test("key from the environment, or as a plain string", async () => {
  const baseUrl = client.baseUrl;
  process.env.RAPIDAPI_KEY = "key-from-env";
  await new PhoneRisk({ baseUrl }).lookup("+4917612345678");
  assert.equal(last().headers["x-rapidapi-key"], "key-from-env");
  delete process.env.RAPIDAPI_KEY;
  assert.throws(() => new PhoneRisk(), /RAPIDAPI_KEY/);

  const plain = new PhoneRisk("plain-key");
  assert.equal(plain.apiKey, "plain-key");
  assert.equal(plain.baseUrl, "https://phonerisk-api.p.rapidapi.com");
  assert.equal(PhoneRiskDefault, PhoneRisk);
});
