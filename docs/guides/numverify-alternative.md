<!-- Generated from the PhoneRisk site's documentation by tools/export_docs.py. Edit it there, not here. -->

# Switching from Numverify

> The PhoneRisk API has an endpoint that answers in Numverify's response format. What to change in your code, what behaves differently, and what you get on top.

If your code already calls Numverify, you can move to the PhoneRisk API without rewriting the part that reads the response. One endpoint returns the same ten fields under the same names. You change the URL and the way you authenticate, and the rest of the call stays.

## What changes in the request

| | Numverify | PhoneRisk API |
| --- | --- | --- |
| URL | `http://apilayer.net/api/validate` | `https://phonerisk-api.p.rapidapi.com/api/v1/numverify/validate` |
| Authentication | `access_key` query parameter | `X-RapidAPI-Key` and `X-RapidAPI-Host` headers |
| `number` | International digits, or national digits with `country_code` | The same. A leading `+` is also accepted |
| `country_code` | Two-letter code for national numbers | The same |
| `format`, `callback` | Pretty-printing and JSONP | Ignored |

Before:

```bash
curl "http://apilayer.net/api/validate?access_key=YOUR_ACCESS_KEY&number=4917612345678"
```

After:

```bash
curl "https://phonerisk-api.p.rapidapi.com/api/v1/numverify/validate?number=4917612345678" \
  -H "X-RapidAPI-Key: YOUR_RAPIDAPI_KEY" \
  -H "X-RapidAPI-Host: phonerisk-api.p.rapidapi.com"
```

## The response

```json
{
  "valid": true,
  "number": "4917612345678",
  "local_format": "017612345678",
  "international_format": "+4917612345678",
  "country_prefix": "+49",
  "country_code": "DE",
  "country_name": "Germany",
  "location": "Germany",
  "carrier": "O2",
  "line_type": "mobile"
}
```

An invalid number returns `valid: false`, empty strings for the text fields and `null` for `line_type`.

## What behaves differently

- **Errors use HTTP status codes.** A missing or malformed parameter is answered with status 422 and a `detail` message, and a key problem with 401 or 403. Numverify answers with status 200 and a body of the form `{"success": false, "error": {...}}`. If your code looks for `success`, add a check of the status code.
- **`line_type` uses a fixed set of values, with one gap.** The values are `mobile`, `landline`, `toll_free`, `premium_rate`, `paging`, `satellite` and `special_services`, which covers VoIP, shared-cost, personal and company numbers. For US and Canadian numbers it is `null`: mobile and landline numbers share the same ranges there, and this API does not guess.
- **`carrier` is the original operator.** It is filled for mobile ranges and names the operator the range was allocated to. A number that has been moved to another network still shows the first one.
- **`country_name` uses short English names**, such as `United States`, not `United States of America`.

## What you get beyond the compatible format

The compatibility endpoint exists to make the switch a one-line change. When you are ready, `POST /api/v1/lookup` returns the same facts and more:

- a **risk score** from 0 to 100 with an allow, review or block recommendation and the reason for every point, see [How the risk score works](../risk-score.md)
- **disposable-number detection** against public lists that are refreshed daily
- a **confidence and a source** for every fact, so you can tell a certain answer from a likely one
- **local time** where the number is based, with a calling-hours check
- **batch lookups** of 100 numbers per request, and **extraction** of numbers from free text
- normalised **E.164, national and international formats**, and a `tel:` link

The fields are described in the [API reference](../README.md).

## When this is not the right replacement

Like any service that works from numbering-plan data, this API answers without contacting the phone network. If you need to know whether a number is currently in service, which network it is on after a port, or who it belongs to, you need a provider that runs live network lookups, usually sold as HLR lookup, number portability lookup or caller-name lookup. Those cost more per request and are slower, and they answer a different question.

For checking that a number is well formed, finding out what kind of line it is and screening out numbers that should not be on a sign-up form, a numbering-plan lookup is the right tool. You can see what it returns for any number in the [free checker](https://phonerisk.up.railway.app/).
