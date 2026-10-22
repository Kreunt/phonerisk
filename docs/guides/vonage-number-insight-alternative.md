<!-- Generated from the PhoneRisk site's documentation by tools/export_docs.py. Edit it there, not here. -->

# Replacing Vonage Number Insight

> Vonage retires Number Insight on 4 February 2027. Which Number Insight fields the PhoneRisk API replaces, which it cannot, and how the fields map.

Vonage has announced that Number Insight will be retired on 4 February 2027, and points customers to its Identity Insights API as the successor. The date is on [Vonage's Number Insight overview](https://developer.vonage.com/en/number-insight/overview), and Vonage publishes its own [transition guide](https://developer.vonage.com/en/identity-insights/guides/number-insights-transition).

If you use Number Insight to validate and format numbers and to find out what kind of line they are, the PhoneRisk API can take over. If you use it to ask the mobile network about a number, it cannot. This page shows where the line runs.

## What it replaces and what it does not

| Number Insight level | Replaced? | Why |
| --- | --- | --- |
| Basic | Yes | Validation, formats and country all come from the numbering plan |
| Standard | In part | Line type and original carrier are covered. The current carrier of a ported number is not |
| Advanced | No | Roaming and reachability take a live query to the mobile network, which this API does not make |

## How the fields map

Number Insight fields on the left, the fields of `POST /api/v1/lookup` on the right.

| Number Insight | PhoneRisk API |
| --- | --- |
| `status`, `status_message` | The HTTP status, plus `valid` and `invalid_reason` |
| `international_format_number` | `e164`, with a leading `+` |
| `national_format_number` | `national_format` |
| `country_code` | `country.value` |
| `country_name` | `country_name` |
| `country_prefix` | `calling_code` |
| `country_code_iso3` | Not provided |
| `request_id`, `request_price`, `remaining_balance`, `refund_price` | Do not apply |
| `original_carrier.name` | `carrier.value`, for mobile ranges |
| `original_carrier.country` | `country.value` |
| `original_carrier.network_type` | `line_type.value`, see the next table |
| `original_carrier.network_code` | Not provided |
| `current_carrier.*`, `ported` | Not available. They need a live portability lookup |
| `caller_identity`, `caller_name` | Not provided |
| `roaming`, `reachable`, `lookup_outcome` | Not available. They need a live network query |
| `valid_number` | `valid`, which checks the numbering plan and not the network |

### Line types

| Vonage `network_type` | `line_type.value` |
| --- | --- |
| `mobile` | `mobile` |
| `landline` | `fixed_line` |
| `landline_premium` | `premium_rate` |
| `landline_tollfree` | `toll_free` |
| `virtual` | `voip` |
| `pager` | `pager` |
| `unknown` | `unknown`, or `fixed_or_mobile` for US and Canadian numbers |

## The same request, before and after

Number Insight Basic:

```bash
curl "https://api.nexmo.com/ni/basic/json?api_key=YOUR_KEY&api_secret=YOUR_SECRET&number=4917612345678"
```

PhoneRisk API:

```bash
curl -X POST "https://phonerisk-api.p.rapidapi.com/api/v1/lookup" \
  -H "X-RapidAPI-Key: YOUR_RAPIDAPI_KEY" \
  -H "X-RapidAPI-Host: phonerisk-api.p.rapidapi.com" \
  -H "Content-Type: application/json" \
  -d '{"number": "+4917612345678"}'
```

## Other differences

- **One key instead of a key and a secret.** Requests carry the `X-RapidAPI-Key` and `X-RapidAPI-Host` headers.
- **Pricing is per plan.** Number Insight Standard and Advanced are charged per request, and each response reports the price. Here a plan covers a number of requests per month.
- **Every fact has a confidence and a source.** `line_type`, `carrier`, `country` and the other signals are objects of the form `{"value": ..., "confidence": 0.7, "source": "..."}`.
- **There is more in the answer.** Number Insight had no risk verdict, no disposable-number detection, no flag for fictional number ranges, no local time, no batch lookup and no extraction of numbers from text. These are described in the [API reference](../README.md).

## If you rely on Advanced

Reachability, roaming and current-carrier data come from the mobile network, and only a provider with access to it can supply them. Look for services described as HLR lookup or number portability lookup, or follow Vonage's own path to Identity Insights.

If your integration calls Advanced but only reads the formatted number and the line type, run a few of your numbers through the [free checker](https://phonerisk.up.railway.app/) and compare the answers with what you get today.
