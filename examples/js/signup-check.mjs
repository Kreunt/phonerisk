// Decide whether to accept a phone number at sign-up.
//
//   RAPIDAPI_KEY=... node signup-check.mjs "+44 901 234 5678"
//   RAPIDAPI_KEY=... node signup-check.mjs "0176 12345678" DE

import { NotAPhoneNumber, PhoneRisk } from "phonerisk";

const client = new PhoneRisk();

// Whether to accept the number, and what to tell the person
export async function check(number, defaultRegion) {
  let lookup;
  try {
    lookup = await client.lookup(number, { defaultRegion });
  } catch (error) {
    if (!(error instanceof NotAPhoneNumber)) throw error;
    return [false, "That does not look like a phone number. Include the country code, like +49 176 12345678."];
  }

  if (!lookup.valid) return [false, `That number is not valid (${lookup.invalid_reason}). Check it for typos.`];

  const { risk } = lookup;
  // The first reason is the one with the most weight
  if (risk.recommendation === "block") return [false, `This number cannot be used here: ${risk.reasons[0].description}.`];
  if (risk.recommendation === "review") return [true, `Accepted, but worth a second look: ${risk.reasons[0].description}.`];
  return [true, `Accepted: ${lookup.international_format}, ${lookup.line_type.value}, ${lookup.country_name}.`];
}

const [number, region] = process.argv.slice(2);
if (!number) {
  console.error('Usage: node signup-check.mjs "<number>" [country]');
  process.exit(1);
}
const [accepted, message] = await check(number, region);
console.log(accepted ? "ACCEPT" : "REFUSE", "-", message);
