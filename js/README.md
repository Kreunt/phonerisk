# phonerisk

JavaScript and TypeScript client for the [PhoneRisk API](https://rapidapi.com/daimaileri20/api/phonerisk-api). One call validates a phone number and tells you how risky it looks: line type, carrier, country, local time, whether it is a known disposable number, and a risk score from 0 to 100 with the reason behind every point.

The client has no dependencies, ships its own types and runs on Node.js 18 and newer.

## Install

```bash
npm install phonerisk
```

You need a RapidAPI key. Subscribe to a plan on the [PhoneRisk API listing](https://rapidapi.com/daimaileri20/api/phonerisk-api) to get one.

## Quick start

```javascript
import { PhoneRisk } from "phonerisk";

const client = new PhoneRisk("YOUR_RAPIDAPI_KEY"); // or set the RAPIDAPI_KEY environment variable

const lookup = await client.lookup("+4917612345678");

lookup.valid;               // true
lookup.e164;                // "+4917612345678"
lookup.line_type.value;     // "mobile"
lookup.carrier.value;       // "O2"
lookup.country_name;        // "Germany"
lookup.risk.score;          // 0
lookup.risk.recommendation; // "allow", "review" or "block"
```

A number written without `+` needs the country it belongs to:

```javascript
await client.lookup("0176 12345678", { defaultRegion: "DE" });
```

Use the client on a server. A key that ships to a browser can be read by anyone who opens the page.

## Decide at sign-up

```javascript
import { NotAPhoneNumber, PhoneRisk } from "phonerisk";

const client = new PhoneRisk();

async function accept(number) {
  try {
    const lookup = await client.lookup(number);
    return lookup.risk.recommendation !== "block";
  } catch (error) {
    if (error instanceof NotAPhoneNumber) return false; // not a phone number at all
    throw error;
  }
}
```

`block` covers numbers that are invalid, fictional, premium-rate or listed as disposable SMS inboxes. `review` covers numbers that are unusual for a person's own phone, such as VoIP and toll-free lines. Every point of the score comes with a reason:

```javascript
const { risk } = await client.lookup("+44 901 234 5678");
for (const reason of risk.reasons) console.log(reason.weight, reason.code, reason.description);
// 70 premium_rate Premium-rate number: costly to reach and a common target of call and SMS revenue fraud
```

## Everything the client does

| Method | What it does |
| --- | --- |
| `lookup(number)` | Everything about one number |
| `lookupBatch(numbers)` | Up to 100 numbers in one request |
| `lookupMany(numbers)` | A list of any length, sent 100 at a time |
| `extract(text)` | Find and look up every phone number in a text |
| `compare(first, second)` | Tell whether two differently written numbers are the same |
| `vanity(number)` | Turn `1-800-FLOWERS` into digits |
| `examples(country)` | Example numbers of every line type a country has |
| `shortNumber(number, country)` | Describe an emergency number or short code |

The lookup methods take the same options as a second argument:

| Option | Meaning |
| --- | --- |
| `defaultRegion` | Two-letter country code used to read a number written without `+` |
| `dialFrom` | Country the number will be dialled from; fills `dial_from_format` |
| `at` | A `Date` or ISO 8601 string to work out `local_time` for; defaults to now |
| `nocache` | `true` keeps the request out of the API's cache |

### Clean a contact list

```javascript
const numbers = ["+4917612345678", "0176 12345678", "n/a", "+1 202 555 0123"];
const results = await client.lookupMany(numbers, { defaultRegion: "DE" });

results.forEach((result, index) => console.log(numbers[index], "->", result.e164, result.risk.recommendation));
// +4917612345678 -> +4917612345678 allow
// 0176 12345678 -> +4917612345678 allow
// n/a -> null block
// +1 202 555 0123 -> +12025550123 block
```

### Find numbers in text

```javascript
const found = await client.extract("Call +49 176 12345678 or 030 123456 after five.", { defaultRegion: "DE" });
for (const match of found.matches) console.log(match.number, match.e164, match.line_type.value);
// +49 176 12345678 +4917612345678 mobile
// 030 123456 +4930123456 fixed_line
```

## What comes back

Methods resolve to the API's JSON, with the field names the API uses. Most facts are signals: an object with `value`, `confidence` (0 to 1) and `source`, or `null` when nothing is known.

```javascript
lookup.line_type;     // { value: "mobile", confidence: 1, source: "libphonenumber" }
lookup.is_disposable; // { value: false, confidence: 0.3, source: "disposable_number_lists" }
```

A number that can be read but is not valid does not throw. It comes back with `valid` set to `false`, an `invalid_reason` and a risk score of 100.

## Errors

| Error | When |
| --- | --- |
| `NotAPhoneNumber` | The input cannot be read as a phone number (status 400) |
| `RateLimited` | The quota or rate limit of your plan is used up (status 429) |
| `PhoneRiskError` | Everything else, and the base class of the two above. `status` holds the HTTP status, or `null` when no answer arrived; `detail` holds the message |

Requests time out after 10 seconds. Change that with `new PhoneRisk({ apiKey, timeoutMs: 3000 })`.

## What the API cannot tell you

Answers come from numbering-plan data and public lists of disposable numbers. Nothing is sent to the phone network, so the API cannot say whether a number is switched on, who owns it or which carrier it moved to. US and Canadian numbers come back with the line type `fixed_or_mobile`, because both kinds share the same ranges there. A low risk score means nothing suspicious was found, not that the number is safe.

## Links

- [Documentation](https://phonerisk.up.railway.app/docs)
- [Free phone risk checker](https://phonerisk.up.railway.app/)
- [Plans and API keys](https://rapidapi.com/daimaileri20/api/phonerisk-api)
- [Source, the Python client and the MCP server](https://github.com/Kreunt/phonerisk)
