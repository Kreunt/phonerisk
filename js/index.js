// Client for the PhoneRisk API, which is served through RapidAPI.
// Runs on Node.js 18 or newer and uses the built-in fetch; there are no dependencies.

export const VERSION = "0.1.0";

// Where RapidAPI serves the API
export const DEFAULT_HOST = "phonerisk-api.p.rapidapi.com";

// Most numbers the API takes in one batch request
export const MAX_BATCH = 100;

/**
 * The API, or RapidAPI in front of it, did not answer the request.
 * `status` is the HTTP status, or null when no answer arrived at all.
 */
export class PhoneRiskError extends Error {
  constructor(status, detail) {
    super(status ? `${status}: ${detail}` : detail);
    this.name = "PhoneRiskError";
    this.status = status;
    this.detail = detail;
  }
}

/**
 * The input could not be read as a phone number (status 400). A number written
 * without "+" needs defaultRegion. A number that can be read but is not valid
 * does not throw: it comes back with valid === false.
 */
export class NotAPhoneNumber extends PhoneRiskError {
  constructor(status, detail) {
    super(status, detail);
    this.name = "NotAPhoneNumber";
  }
}

/** The quota or rate limit of the RapidAPI plan is used up (status 429). */
export class RateLimited extends PhoneRiskError {
  constructor(status, detail) {
    super(status, detail);
    this.name = "RateLimited";
  }
}

// The message of an error answer. The API sends {"detail": ...}, RapidAPI {"message": ...}.
function detailOf(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    return text.trim().slice(0, 200) || "no details given";
  }
  const detail = data && (data.detail ?? data.message);
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    // Validation errors: one entry per rejected field
    return detail
      .map((entry) => [(entry.loc || []).slice(1).join("."), entry.msg].filter(Boolean).join(": "))
      .join("; ");
  }
  return "no details given";
}

// The lookup options that were given, under the names the API uses
function optionsOf({ defaultRegion, dialFrom, at } = {}) {
  const options = {};
  if (defaultRegion != null) options.default_region = defaultRegion;
  if (dialFrom != null) options.dial_from = dialFrom;
  if (at != null) options.at = at instanceof Date ? at.toISOString() : at;
  return options;
}

/**
 * Looks phone numbers up.
 *
 *     const client = new PhoneRisk("YOUR_RAPIDAPI_KEY");
 *     const lookup = await client.lookup("+4917612345678");
 *     lookup.risk.recommendation; // "allow", "review" or "block"
 *
 * The key is read from the RAPIDAPI_KEY environment variable when none is given.
 * Use it on a server: a key that ships to a browser can be read by anyone.
 */
export class PhoneRisk {
  constructor(apiKeyOrOptions = {}) {
    const given = typeof apiKeyOrOptions === "string" ? { apiKey: apiKeyOrOptions } : apiKeyOrOptions;
    const environment = typeof process !== "undefined" ? process.env : {};
    this.apiKey = given.apiKey || environment.RAPIDAPI_KEY;
    if (!this.apiKey) {
      throw new TypeError("Pass your RapidAPI key, or set the RAPIDAPI_KEY environment variable");
    }
    this.host = given.host || DEFAULT_HOST;
    this.timeoutMs = given.timeoutMs ?? 10_000;
    // baseUrl, or the PHONERISK_BASE_URL variable, is for tests and proxies;
    // RapidAPI itself is always reached over HTTPS at the host
    this.baseUrl = (given.baseUrl || environment.PHONERISK_BASE_URL || `https://${this.host}`).replace(/\/+$/, "");
    this.fetch = given.fetch || globalThis.fetch;
  }

  /** Everything about one number. */
  lookup(number, options = {}) {
    return this.#post("/api/v1/lookup", { number, ...optionsOf(options) }, options.nocache);
  }

  /** Up to 100 numbers in one request. An entry that is not a phone number gets a result too. */
  lookupBatch(numbers, options = {}) {
    const list = [...numbers];
    if (list.length < 1 || list.length > MAX_BATCH) {
      throw new RangeError(`One batch takes 1 to ${MAX_BATCH} numbers; use lookupMany for longer lists`);
    }
    return this.#post("/api/v1/lookup/batch", { numbers: list, ...optionsOf(options) }, options.nocache);
  }

  /** Any number of numbers, sent 100 at a time. Results come back in input order. */
  async lookupMany(numbers, options = {}) {
    const list = [...numbers];
    const results = [];
    for (let start = 0; start < list.length; start += MAX_BATCH) {
      const batch = await this.lookupBatch(list.slice(start, start + MAX_BATCH), options);
      results.push(...batch.results);
    }
    return results;
  }

  /** Find every valid phone number in a text and look each one up. */
  extract(text, options = {}) {
    return this.#post("/api/v1/extract", { text, ...optionsOf(options) }, options.nocache);
  }

  /** Tell whether two differently written numbers are the same number. */
  compare(first, second, options = {}) {
    return this.#post("/api/v1/compare", { first, second, ...optionsOf({ defaultRegion: options.defaultRegion }) });
  }

  /** Turn the letters of a vanity number such as 1-800-FLOWERS into digits. */
  vanity(number, options = {}) {
    return this.#get("/api/v1/vanity", { number, default_region: options.defaultRegion });
  }

  /** Example numbers of every line type a country has, for tests and input placeholders. */
  examples(country) {
    return this.#get(`/api/v1/examples/${encodeURIComponent(country)}`, {});
  }

  /** Describe an emergency number or short code, such as 112, as dialled inside a country. */
  shortNumber(number, country) {
    return this.#get("/api/v1/short-number", { number, country });
  }

  #post(path, body, nocache = false) {
    return this.#request("POST", path, nocache ? { nocache: "true" } : {}, body);
  }

  #get(path, query) {
    return this.#request("GET", path, query);
  }

  async #request(method, path, query, body) {
    const url = new URL(this.baseUrl + path);
    for (const [name, value] of Object.entries(query)) {
      if (value != null) url.searchParams.set(name, value);
    }
    const headers = {
      "X-RapidAPI-Key": this.apiKey,
      "X-RapidAPI-Host": this.host,
      Accept: "application/json",
      "User-Agent": `phonerisk-js/${VERSION}`,
    };
    if (body !== undefined) headers["Content-Type"] = "application/json";

    let response;
    let text;
    try {
      response = await this.fetch(url, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(this.timeoutMs),
      });
      text = await response.text();
    } catch (error) {
      const why = error?.name === "TimeoutError" ? `no answer within ${this.timeoutMs} ms` : error?.cause?.code || error?.message;
      throw new PhoneRiskError(null, `Could not reach ${this.host}: ${why}`);
    }

    if (!response.ok) {
      const detail = detailOf(text);
      if (response.status === 400) throw new NotAPhoneNumber(400, detail);
      if (response.status === 429) throw new RateLimited(429, detail);
      throw new PhoneRiskError(response.status, detail);
    }
    try {
      return JSON.parse(text);
    } catch {
      throw new PhoneRiskError(null, `${this.host} answered with something that is not JSON`);
    }
  }
}

export default PhoneRisk;
