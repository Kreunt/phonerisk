// Normalise a list of phone numbers, one per line, and say which ones can take a text message.
//
//   RAPIDAPI_KEY=... node clean-list.mjs DE < numbers.txt
//
// The argument is the country that numbers without a "+" belong to.
// Numbers are sent 100 at a time, so 5,000 numbers take 50 requests.

import { readFileSync } from "node:fs";

import { PhoneRisk } from "phonerisk";

// US and Canadian numbers are always fixed_or_mobile; the two cannot be told apart there
const TEXTABLE = new Set(["mobile", "fixed_or_mobile"]);

const numbers = readFileSync(0, "utf8").split("\n").map((line) => line.trim()).filter(Boolean);
const results = await new PhoneRisk().lookupMany(numbers, { defaultRegion: process.argv[2] });

for (const [index, result] of results.entries()) {
  let verdict;
  if (!result.valid) verdict = `drop: ${result.invalid_reason}`;
  else if (result.risk.recommendation === "block") verdict = `drop: ${result.risk.reasons[0].code}`;
  else if (!TEXTABLE.has(result.line_type.value)) verdict = `no text messages: ${result.line_type.value}`;
  else verdict = "keep";
  console.log([numbers[index], result.e164 ?? "", verdict].join("\t"));
}
