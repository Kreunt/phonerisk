export declare const VERSION: string;
export declare const DEFAULT_HOST: string;
export declare const MAX_BATCH: number;

/** One fact about a number, with how sure the API is and where the fact came from. */
export interface Signal<T = unknown> {
  value: T;
  /** 0 to 1 */
  confidence: number;
  source: string;
}

export type LineType =
  | "mobile" | "fixed_line" | "fixed_or_mobile" | "voip" | "toll_free" | "premium_rate"
  | "shared_cost" | "personal_number" | "pager" | "uan" | "voicemail" | "unknown";

export type InvalidReason =
  | "too_short" | "too_long" | "invalid_length" | "invalid_country_code" | "not_in_numbering_plan" | "unparseable";

export interface RiskReason {
  code: string;
  /** Points this reason adds to the score */
  weight: number;
  description: string;
}

export interface Risk {
  /** 0 to 100: the sum of the reason weights, capped */
  score: number;
  level: "low" | "medium" | "high";
  recommendation: "allow" | "review" | "block";
  reasons: RiskReason[];
}

export interface LocalTime {
  /** null when the number's prefix covers time zones that currently differ */
  time: string | null;
  utc_offsets: string[];
  calling_window: { start: string; end: string; rule: string };
  /** null when the possible time zones disagree */
  in_calling_window: boolean | null;
}

/** Everything the API knows about one number. Signals are null when nothing is known. */
export interface Lookup {
  number: string;
  valid: boolean;
  possible: boolean;
  invalid_reason: InvalidReason | null;
  /** null only in batch results, for an entry that is not a phone number at all */
  e164: string | null;
  national_format: string | null;
  international_format: string | null;
  rfc3966: string | null;
  dial_from_format: string | null;
  calling_code: number | null;
  national_number: string | null;
  country_name: string | null;
  country: Signal<string> | null;
  carrier: Signal<string> | null;
  line_type: Signal<LineType> | null;
  location: Signal<string> | null;
  timezones: Signal<string[]> | null;
  local_time: LocalTime | null;
  is_voip: Signal<boolean> | null;
  is_disposable: Signal<boolean> | null;
  is_reserved: Signal<boolean> | null;
  risk: Risk;
}

export interface BatchResult {
  count: number;
  /** One result per number, in the order they were sent */
  results: Lookup[];
}

export interface ExtractMatch extends Lookup {
  /** Character positions of the match in the text; `number` is the matched text */
  start: number;
  end: number;
}

export interface ExtractResult {
  count: number;
  /** true when the text holds more numbers than one response carries */
  truncated: boolean;
  matches: ExtractMatch[];
}

export interface CompareResult {
  match_type: "exact_match" | "nsn_match" | "short_nsn_match" | "no_match";
  /** true for exact_match and nsn_match */
  is_match: boolean;
  first_e164: string | null;
  second_e164: string | null;
}

export interface VanityResult {
  number: string;
  /** The input with letters replaced by their keypad digits */
  digits: string;
  e164: string | null;
}

export interface ExamplesResult {
  country: string;
  country_name: string | null;
  calling_code: number;
  /** Line type -> a correctly formed number of that type */
  examples: Record<string, { e164: string; national: string; international: string }>;
  invalid_example: string | null;
}

export interface ShortNumberResult {
  number: string;
  country: string;
  valid: boolean;
  possible: boolean;
  is_emergency: boolean;
  connects_to_emergency: boolean;
  cost: "toll_free" | "standard_rate" | "premium_rate" | "unknown";
  is_carrier_specific: boolean;
  is_sms_service: boolean;
}

export interface LookupOptions {
  /** Two-letter country code used to read a number written without "+" */
  defaultRegion?: string;
  /** Country the number will be dialled from; fills dial_from_format */
  dialFrom?: string;
  /** Moment to work out local_time for; defaults to now */
  at?: Date | string;
  /** Keep the request out of the API's cache */
  nocache?: boolean;
}

export interface ClientOptions {
  /** Your RapidAPI key. Defaults to the RAPIDAPI_KEY environment variable. */
  apiKey?: string;
  host?: string;
  /** For tests and proxies */
  baseUrl?: string;
  timeoutMs?: number;
  fetch?: typeof fetch;
}

export declare class PhoneRiskError extends Error {
  /** The HTTP status, or null when no answer arrived at all */
  status: number | null;
  detail: string;
  constructor(status: number | null, detail: string);
}

/** The input could not be read as a phone number (status 400). */
export declare class NotAPhoneNumber extends PhoneRiskError {}

/** The quota or rate limit of the RapidAPI plan is used up (status 429). */
export declare class RateLimited extends PhoneRiskError {}

export declare class PhoneRisk {
  constructor(apiKeyOrOptions?: string | ClientOptions);
  lookup(number: string, options?: LookupOptions): Promise<Lookup>;
  lookupBatch(numbers: Iterable<string>, options?: LookupOptions): Promise<BatchResult>;
  lookupMany(numbers: Iterable<string>, options?: LookupOptions): Promise<Lookup[]>;
  extract(text: string, options?: LookupOptions): Promise<ExtractResult>;
  compare(first: string, second: string, options?: { defaultRegion?: string }): Promise<CompareResult>;
  vanity(number: string, options?: { defaultRegion?: string }): Promise<VanityResult>;
  examples(country: string): Promise<ExamplesResult>;
  shortNumber(number: string, country: string): Promise<ShortNumberResult>;
}

export default PhoneRisk;
