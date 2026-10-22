<!-- Generated from the PhoneRisk site's documentation by tools/export_docs.py. Edit it there, not here. -->

# API reference

> Every endpoint, request option and response field of the PhoneRisk API, with the status codes and limits you will meet.

The PhoneRisk API takes a phone number and returns what can be known about it without calling it: whether it is valid, what kind of line it is, which carrier and country it belongs to, what time it is there, whether it is a known disposable number, and a risk score from 0 to 100 with the reason behind every point.

Every answer comes from numbering-plan data and public lists. Nothing is sent to the phone network, which keeps a lookup fast and private, and also means the API cannot tell you whether a number is switched on. [What the API cannot tell you](#what-the-api-cannot-tell-you) lists the limits.

## Authentication

The API is sold through RapidAPI. [Subscribe to a plan on the listing](https://rapidapi.com/daimaileri20/api/phonerisk-api) to get a key, then send two headers with every request:

| Header | Value |
| --- | --- |
| `X-RapidAPI-Key` | Your key |
| `X-RapidAPI-Host` | `phonerisk-api.p.rapidapi.com` |

The base URL is `https://phonerisk-api.p.rapidapi.com`.

Keep the key on your server. A key that ships inside a web page or a mobile app can be read by anyone who opens it.

## Quick start

```bash
curl -X POST "https://phonerisk-api.p.rapidapi.com/api/v1/lookup" \
  -H "X-RapidAPI-Key: YOUR_RAPIDAPI_KEY" \
  -H "X-RapidAPI-Host: phonerisk-api.p.rapidapi.com" \
  -H "Content-Type: application/json" \
  -d '{"number": "+4917612345678"}'
```

```json
{
  "number": "+4917612345678",
  "valid": true,
  "possible": true,
  "invalid_reason": null,
  "e164": "+4917612345678",
  "national_format": "0176 12345678",
  "international_format": "+49 176 12345678",
  "rfc3966": "tel:+49-176-12345678",
  "dial_from_format": null,
  "calling_code": 49,
  "national_number": "17612345678",
  "country_name": "Germany",
  "country": {"value": "DE", "confidence": 1.0, "source": "libphonenumber"},
  "carrier": {"value": "O2", "confidence": 0.7, "source": "operator_prefix_db"},
  "line_type": {"value": "mobile", "confidence": 1.0, "source": "libphonenumber"},
  "location": {"value": "Germany", "confidence": 0.8, "source": "libphonenumber"},
  "timezones": {"value": ["Europe/Berlin"], "confidence": 1.0, "source": "libphonenumber"},
  "local_time": {
    "time": "2026-10-06T14:32:10+02:00",
    "utc_offsets": ["+02:00"],
    "calling_window": {"start": "08:00", "end": "21:00", "rule": "default"},
    "in_calling_window": true
  },
  "is_voip": {"value": false, "confidence": 0.6, "source": "libphonenumber"},
  "is_disposable": {"value": false, "confidence": 0.3, "source": "disposable_number_lists"},
  "is_reserved": null,
  "risk": {"score": 0, "level": "low", "recommendation": "allow", "reasons": []}
}
```

Most integrations read three things from this: `valid`, `e164` (the form to store) and `risk.recommendation`.

The same call in Python:

```python
import requests

response = requests.post(
    "https://phonerisk-api.p.rapidapi.com/api/v1/lookup",
    headers={
        "X-RapidAPI-Key": "YOUR_RAPIDAPI_KEY",
        "X-RapidAPI-Host": "phonerisk-api.p.rapidapi.com",
    },
    json={"number": "+4917612345678"},
    timeout=10,
)
lookup = response.json()
print(lookup["risk"]["recommendation"])  # allow
```

And in JavaScript:

```javascript
const response = await fetch("https://phonerisk-api.p.rapidapi.com/api/v1/lookup", {
  method: "POST",
  headers: {
    "X-RapidAPI-Key": "YOUR_RAPIDAPI_KEY",
    "X-RapidAPI-Host": "phonerisk-api.p.rapidapi.com",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ number: "+4917612345678" }),
});
const lookup = await response.json();
console.log(lookup.risk.recommendation); // allow
```

## Endpoints

| Endpoint | What it does |
| --- | --- |
| `POST /api/v1/lookup` | Full lookup of one number |
| `GET /api/v1/lookup` | The same lookup with query parameters |
| `POST /api/v1/lookup/batch` | Up to 100 numbers in one request |
| `POST /api/v1/extract` | Find and look up every number in a block of text |
| `POST /api/v1/compare` | Tell whether two differently written numbers are the same |
| `GET /api/v1/vanity` | Turn `1-800-FLOWERS` into digits |
| `GET /api/v1/examples/{country}` | Example numbers of every line type a country has |
| `GET /api/v1/short-number` | Describe an emergency number or short code |
| `GET /api/v1/numverify/validate` | Lookup in Numverify's response format |

## Look up a number

`POST /api/v1/lookup` takes a JSON body:

| Field | Required | Meaning |
| --- | --- | --- |
| `number` | yes | The phone number, up to 64 characters. Spaces, dashes, brackets and vanity letters are fine. It must start with `+` unless you also send `default_region`. |
| `default_region` | no | Two-letter country code such as `DE` or `US`, used to read a number written without `+`. |
| `dial_from` | no | Two-letter country code of the place the number will be dialled from. Fills `dial_from_format`. |
| `at` | no | The moment to work out `local_time` for, in ISO 8601, such as a planned send time. Defaults to now. A value without an offset is read as UTC. |

Adding `?nocache=true` to the URL keeps the request out of the API's short-lived cache, so nothing about the number is kept once the response is sent.

`GET /api/v1/lookup` is the same lookup with `number`, `default_region`, `dial_from`, `at` and `nocache` as query parameters. Write the `+` of a number as `%2B`. Use POST for production traffic: URLs tend to end up in proxy and platform logs, request bodies do not.

### Response fields

| Field | Meaning |
| --- | --- |
| `number` | The number exactly as you sent it. |
| `valid` | The number fits its country's numbering plan. This says nothing about whether it is in service. |
| `possible` | The number has a plausible length for its country, even if its range is not assigned. Lets you soft-accept numbers that a newer numbering plan may have opened up. |
| `invalid_reason` | Why the number is not valid, see [Invalid numbers](#invalid-numbers). `null` when it is valid. |
| `e164` | The normalised number, for example `+4917612345678`. Store this form. |
| `national_format`, `international_format` | The number as written inside its country, and in readable international form. |
| `rfc3966` | A `tel:` link for click-to-call. |
| `dial_from_format` | What to dial from the `dial_from` country, exit code included. `null` unless you sent `dial_from`. |
| `calling_code`, `national_number` | The two halves of the number. |
| `country`, `country_name` | Two-letter country code and English name. `null` for global ranges such as `+800` or `+881`. |
| `line_type` | The kind of line, see [Line types](#line-types). |
| `carrier` | The operator the number's range was first allocated to. Mobile ranges only. |
| `location` | The city, region or country the range belongs to. |
| `timezones` | The IANA time zones the number may be in. |
| `local_time` | Local time and a calling-hours check, see [Local time and calling hours](#local-time-and-calling-hours). |
| `is_voip` | Whether the number is in a range used only for VoIP. |
| `is_disposable` | Whether the number is a known public, throwaway SMS inbox, see [Disposable numbers](#disposable-numbers). |
| `is_reserved` | Whether the number is in a range kept for fiction and testing and never assigned, such as US `555-01XX`. |
| `risk` | Score, recommendation and reasons, see [Risk score](#risk-score). |

`country`, `carrier`, `line_type`, `location`, `timezones`, `is_voip`, `is_disposable` and `is_reserved` are signals. A signal is an object with three keys, or `null` when nothing is known:

| Key | Meaning |
| --- | --- |
| `value` | The answer. |
| `confidence` | How sure the API is, from 0 to 1. |
| `source` | Where the answer came from, for example `libphonenumber`. |

### Line types

| `line_type.value` | Meaning |
| --- | --- |
| `mobile` | Mobile phone |
| `fixed_line` | Landline |
| `fixed_or_mobile` | Either. The country uses the same ranges for both, as the US and Canada do. Confidence is 0.5. |
| `voip` | A range used only for internet telephony |
| `toll_free` | Free to call, paid for by the owner; a business line |
| `premium_rate` | Calls and texts are charged at a higher rate |
| `shared_cost` | The cost is split between caller and owner |
| `personal_number` | A follow-me number that forwards to a destination you cannot see |
| `pager` | A pager |
| `uan` | A company access number |
| `voicemail` | A voicemail access number |
| `unknown` | Valid, but the kind of line cannot be determined |

### Invalid numbers

A number that does not fit its country's numbering plan comes back with status 200, `valid: false`, every signal `null` and a risk score of 100. `invalid_reason` says why:

| `invalid_reason` | Meaning |
| --- | --- |
| `too_short` | Fewer digits than any number of that country has |
| `too_long` | More digits than any number of that country has |
| `invalid_length` | A length no number of that country has |
| `invalid_country_code` | The country calling code does not exist |
| `not_in_numbering_plan` | The length fits, but the range is not in use. `possible` is `true`. |
| `unparseable` | Batch results only: the entry is not a phone number at all |

Input that cannot be read as a phone number at all, such as `hello` or a national number sent without `default_region`, is answered with status 400.

## Risk score

`risk` answers one question: how likely is it that this number is not a real person's own phone?

| Field | Meaning |
| --- | --- |
| `score` | 0 to 100. The sum of the weights of everything that was found, capped at 100. |
| `level` | `low`, `medium` or `high` |
| `recommendation` | `allow` for a score of 0 to 29, `review` for 30 to 69, `block` for 70 to 100 |
| `reasons` | One entry per weight that was added, each with `code`, `weight` and `description` |

[How the risk score works](risk-score.md) lists every weight and shows worked examples.

## Disposable numbers

`is_disposable` checks the number against two public lists of throwaway SMS inboxes, which the API downloads again every day: [Castle's list](https://github.com/castle/disposable-phone-numbers) of the 1,000 numbers most active in sign-up abuse, and the community-maintained [iP1SMS list](https://github.com/iP1SMS/disposable-phone-numbers).

| Listing | `value` | `confidence` |
| --- | --- | --- |
| On the Castle list | `true` | 0.9 |
| On the iP1SMS list, listed within the last year | `true` | 0.7 |
| Listed one to two years ago | `true` | 0.5 |
| Listed more than two years ago | `false` | 0.3 |
| Not listed | `false` | 0.3 |

Old listings are dropped because inbox numbers are handed back and given to ordinary subscribers. A `false` carries low confidence because the lists cover a small share of the inboxes in circulation. [How to detect disposable phone numbers](guides/detect-disposable-phone-numbers.md) goes into what this catches and what it misses.

## Local time and calling hours

`local_time` describes the moment `at`, or now, at the place the number's prefix points to.

| Field | Meaning |
| --- | --- |
| `time` | Local date and time. `null` when the prefix covers time zones that currently differ. |
| `utc_offsets` | Every UTC offset the number may be in. One entry when there is no doubt. |
| `calling_window` | `start` and `end` in local 24-hour time, and the `rule` they come from. |
| `in_calling_window` | Whether the moment falls inside the window. `null` when the possible time zones disagree. |

| `rule` | Window | Applies to |
| --- | --- | --- |
| `us_federal` | 08:00 to 21:00 | US numbers and US territories |
| `us_state_XX` | 08:00 to 20:00 | Alabama, Florida, Louisiana, Maryland, Mississippi, Oklahoma, Tennessee, Washington |
| `us_state_XX` | 09:00 to 20:00 | Connecticut, Nevada |
| `us_state_TX` | 09:00 to 21:00, Sundays 12:00 to 21:00 | Texas |
| `default` | 08:00 to 21:00 | Everywhere else, as a courtesy window, not a legal rule |

The place comes from the number's prefix, and a mobile phone may be somewhere else. Treat the result as a sensible default, not as legal advice.

## Batch lookup

`POST /api/v1/lookup/batch` looks up as many as 100 numbers in one request. `default_region`, `dial_from` and `at` apply to every entry.

```json
{"numbers": ["+4917612345678", "0176 12345678", "n/a"], "default_region": "DE"}
```

The answer is `{"count": 3, "results": [...]}` with one lookup result per entry, in the order you sent them. An entry that is not a phone number does not fail the request. It comes back with `valid: false`, `e164: null` and `invalid_reason: "unparseable"`.

## Extract numbers from text

`POST /api/v1/extract` finds every valid phone number in a text of up to 20,000 characters and looks each one up.

```json
{"text": "Call +49 176 12345678 or 030 123456 after five.", "default_region": "DE"}
```

The answer is `{"count": 2, "truncated": false, "matches": [...]}`. Each match is a full lookup result plus `start` and `end`, the character positions of the match in the text; `number` is the matched text itself. Without `default_region`, only numbers written in international format are found. `truncated` is `true` when the text holds more than 100 numbers.

## Compare two numbers

`POST /api/v1/compare` tells whether two differently written numbers are the same number.

```json
{"first": "+49 176 12345678", "second": "0176 12345678", "default_region": "DE"}
```

```json
{
  "match_type": "exact_match",
  "is_match": true,
  "first_e164": "+4917612345678",
  "second_e164": "+4917612345678"
}
```

| `match_type` | Meaning |
| --- | --- |
| `exact_match` | Same country code and number |
| `nsn_match` | Same national number, but one side has no country code |
| `short_nsn_match` | One could be a shorter form of the other |
| `no_match` | Different numbers |

`is_match` is `true` for `exact_match` and `nsn_match`. Without `default_region`, the example above is an `nsn_match`.

## Vanity numbers

`GET /api/v1/vanity?number=1-800-FLOWERS&default_region=US` turns the letters of a vanity number into the digits to dial.

```json
{"number": "1-800-FLOWERS", "digits": "1-800-3569377", "e164": "+18003569377"}
```

## Example numbers

`GET /api/v1/examples/{country}` returns one correctly formed number of every line type the country has, and one number that fails validation. They are meant for test suites and input placeholders. Any of them may belong to a real subscriber, so do not call or text them.

```json
{
  "country": "DE",
  "country_name": "Germany",
  "calling_code": 49,
  "examples": {
    "mobile": {"e164": "+4915123456789", "national": "01512 3456789", "international": "+49 1512 3456789"},
    "fixed_line": {"e164": "+4930123456", "national": "030 123456", "international": "+49 30 123456"}
  },
  "invalid_example": "+493012"
}
```

The real answer for Germany lists nine line types; two are shown here.

## Short numbers

`GET /api/v1/short-number?number=112&country=DE` describes an emergency number or short code as dialled inside a country.

```json
{
  "number": "112",
  "country": "DE",
  "valid": true,
  "possible": true,
  "is_emergency": true,
  "connects_to_emergency": true,
  "cost": "toll_free",
  "is_carrier_specific": false,
  "is_sms_service": false
}
```

`cost` is `toll_free`, `standard_rate`, `premium_rate` or `unknown`.

## Numverify compatibility

`GET /api/v1/numverify/validate?number=4917612345678` answers with the ten fields of Numverify's response, so code written for Numverify keeps working. [Switching from Numverify](guides/numverify-alternative.md) lists what to change and what behaves differently.

## Status codes

| Code | Meaning |
| --- | --- |
| 200 | The lookup ran. Check `valid` to see whether the number passed. |
| 400 | The input could not be read as a phone number. Use international format or add `default_region`. |
| 401, 403 | RapidAPI did not accept the key, or the key is not subscribed to this API. |
| 404 | `/examples/{country}` was called with an unknown country code. |
| 422 | A field is missing, too long, or not a known country code. `detail` names the field. |
| 429 | The quota or rate limit of your plan is used up. |

401, 403 and 429 are sent by RapidAPI before a request reaches the API. Errors from the API itself carry a `detail` field that says what was wrong.

## Limits

| Limit | Value |
| --- | --- |
| Numbers in one batch request | 100 |
| Matches returned by one `/extract` request | 100 |
| Text sent to `/extract` | 20,000 characters |
| Length of one number | 64 characters |

## Plans

| Plan | Price | Requests per month |
| --- | --- | --- |
| Basic | Free | 1000 |
| Pro | $1 a month | 10,000 |
| Ultra | $5 a month | 100,000 |

Current prices are on [the listing](https://rapidapi.com/daimaileri20/api/phonerisk-api).

## What the API cannot tell you

- **Whether a number is in service.** `valid` means the number can exist under its country's numbering plan. Finding out whether it is assigned, switched on or reachable takes a query to the mobile network, which this API does not make.
- **Who owns a number.** There is no subscriber or caller-name data.
- **The current carrier after a port.** `carrier` is the operator the range was first allocated to.
- **Mobile or landline in the US and Canada.** Both share the same ranges there, so `line_type` is `fixed_or_mobile` with a confidence of 0.5.
- **VoIP numbers issued from ordinary ranges.** `is_voip` is `true` only for ranges used for nothing else, which is why a `false` carries low confidence.
- **Every disposable number.** The lists hold a small share of the inboxes that exist.
- **Where a phone is.** Location and time zone come from the prefix. They say where a number was issued.

## Privacy

- Numbers are looked up in memory, against data that ships with the service. No number is sent to a third party.
- The API does not write numbers, request bodies or submitted text to its logs.
- Lookup results are cached in memory for up to an hour. A request with `nocache=true` is not cached at all.

Requests pass through RapidAPI's gateway, which follows RapidAPI's own privacy policy.

## Machine-readable description

The same endpoints are described in [OpenAPI format](openapi.json), for tools that generate clients or let an AI assistant call the API. A short summary for language models is at [/llms.txt](https://phonerisk.up.railway.app/llms.txt).
