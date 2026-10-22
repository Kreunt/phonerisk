# PhoneRisk

Clients, examples and documentation for the [PhoneRisk API](https://rapidapi.com/daimaileri20/api/phonerisk-api).

The PhoneRisk API takes a phone number and returns what can be known about it without calling it: whether it is valid, what kind of line it is, which carrier and country it belongs to, what time it is there, whether it is a known disposable number, and a risk score from 0 to 100 with the reason behind every point. It is built for the moment before you rely on a number: a sign-up form, a verification text, an order.

| In this repository | What it is |
| --- | --- |
| [`python/`](python) | Python client: `pip install phonerisk` |
| [`js/`](js) | JavaScript and TypeScript client: `npm install phonerisk` |
| [`mcp/`](mcp) | MCP server that gives AI assistants the lookup tools: `npx -y phonerisk-mcp` |
| [`examples/`](examples) | Short scripts: a sign-up check, cleaning a contact list, finding numbers in text |
| [`docs/`](docs) | The API reference, how the risk score works, and guides |

The API itself runs as a hosted service. You get a key by subscribing to a plan on [RapidAPI](https://rapidapi.com/daimaileri20/api/phonerisk-api).

To see what it returns before writing any code, try a number in the [free checker](https://phonerisk.up.railway.app/). The full documentation is at [phonerisk.up.railway.app/docs](https://phonerisk.up.railway.app/docs).

## One request

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

## In Python

```python
from phonerisk import PhoneRisk

client = PhoneRisk("YOUR_RAPIDAPI_KEY")
lookup = client.lookup("+44 901 234 5678")

lookup["risk"]["recommendation"]            # "block"
lookup["risk"]["reasons"][0]["description"]  # "Premium-rate number: costly to reach and ..."
```

## In JavaScript

```javascript
import { PhoneRisk } from "phonerisk";

const client = new PhoneRisk("YOUR_RAPIDAPI_KEY");
const lookup = await client.lookup("+44 901 234 5678");

lookup.risk.recommendation; // "block"
```

## In an AI assistant

Add the MCP server to Claude Desktop, Cursor or any other MCP client:

```json
{
  "mcpServers": {
    "phonerisk": {
      "command": "npx",
      "args": ["-y", "phonerisk-mcp"],
      "env": { "RAPIDAPI_KEY": "YOUR_RAPIDAPI_KEY" }
    }
  }
}
```

Then ask: "Is +44 901 234 5678 safe to accept as a customer's phone number?"

## The risk score

`risk.score` answers one question: how likely is it that this number is not a real person's own phone? It is the plain sum of the weights below, capped at 100, and `risk.reasons` lists every weight that was added.

| Reason | Weight | Added when |
| --- | --- | --- |
| `invalid_number` | 100 | The number does not fit its country's numbering plan |
| `reserved_range` | 100 | The number is in a range kept for fiction and testing, such as US `555-01XX` |
| `disposable_number` | 80 | Listed as a public, disposable SMS inbox within the last year |
| `premium_rate` | 70 | Premium-rate line |
| `personal_number` | 50 | Follow-me number that hides its destination |
| `international_network` | 50 | A global range that belongs to no country, such as satellite phones |
| `disposable_number_old_listing` | 40 | Listed as a disposable inbox one to two years ago |
| `voip` | 40 | A range used only for internet telephony |
| `pager`, `voicemail` | 40 | Not a phone |
| `toll_free`, `shared_cost`, `uan` | 30 | A business line, not a personal phone |
| `unknown_line_type` | 20 | The kind of line cannot be determined |

| Score | Recommendation |
| --- | --- |
| 0 to 29 | `allow` |
| 30 to 69 | `review` |
| 70 to 100 | `block` |

More in [How the risk score works](docs/risk-score.md).

## Everything the API does

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

Every field is described in the [API reference](docs/README.md). There is also an [OpenAPI description](docs/openapi.json).

## What it cannot tell you

Answers come from numbering-plan data (Google's libphonenumber) and two public lists of disposable numbers. Nothing is sent to the phone network, which keeps lookups fast and private and has consequences worth knowing before you build on it:

- It cannot say whether a number is in service, reachable or roaming.
- It does not know who owns a number.
- `carrier` is the operator the range was first allocated to. A number moved to another network still shows the first one.
- US and Canadian numbers come back with the line type `fixed_or_mobile`, because mobile and landline numbers share the same ranges there.
- Disposable-number detection covers numbers on public lists, which is a small share of the inboxes in circulation.

A low risk score means nothing suspicious was found. It does not mean a number is safe.

## Guides

- [How to detect disposable phone numbers](docs/guides/detect-disposable-phone-numbers.md)
- [Check a phone number before you send it an SMS](docs/guides/check-phone-number-before-sms.md)
- [Switching from Numverify](docs/guides/numverify-alternative.md)
- [Replacing Vonage Number Insight](docs/guides/vonage-number-insight-alternative.md)
- [What a phone number tells you without calling it](docs/guides/what-a-phone-number-tells-you.md)

## Licence

The clients, the MCP server and the examples in this repository are released under the [MIT licence](LICENSE). The API is a paid service with its own terms on RapidAPI.
