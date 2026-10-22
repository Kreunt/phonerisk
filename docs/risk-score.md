<!-- Generated from the PhoneRisk site's documentation by tools/export_docs.py. Edit it there, not here. -->

# How the risk score works

> The risk score is a plain sum of published weights. Every weight, the thresholds for allow, review and block, worked examples, and what the score cannot see.

Every lookup returns a `risk` object. It answers one question: how likely is it that this number is not a real person's own phone? That is what you want to know before you accept a number at sign-up, send it a verification code or ship an order to it.

The score is not a model output. It is the sum of the weights listed below, capped at 100, so every point can be traced to something the lookup found.

## What comes back

```json
{
  "score": 70,
  "level": "high",
  "recommendation": "block",
  "reasons": [
    {
      "code": "premium_rate",
      "weight": 70,
      "description": "Premium-rate number: costly to reach and a common target of call and SMS revenue fraud"
    }
  ]
}
```

| Field | Meaning |
| --- | --- |
| `score` | 0 to 100. The sum of the weights in `reasons`, capped at 100. |
| `level` | `low`, `medium` or `high` |
| `recommendation` | `allow`, `review` or `block` |
| `reasons` | Every weight that was added, largest first. Empty when nothing was found. |

## The weights

| Reason code | Weight | Added when |
| --- | --- | --- |
| `invalid_number` | 100 | The number does not fit its country's numbering plan |
| `reserved_range` | 100 | The number is in a range kept for fiction and testing, never given to a subscriber: US `555-01XX` and the UK's TV-drama ranges |
| `disposable_number` | 80 | Listed as a public, disposable SMS inbox within the last year |
| `premium_rate` | 70 | Premium-rate line |
| `personal_number` | 50 | Follow-me number that forwards to a destination you cannot see |
| `international_network` | 50 | A global range that belongs to no country, such as satellite phones or `+800` |
| `disposable_number_old_listing` | 40 | Listed as a disposable inbox one to two years ago; it may have been reassigned since |
| `voip` | 40 | A range used only for internet telephony, where numbers are easy to get in bulk |
| `pager` | 40 | A pager, not a phone |
| `voicemail` | 40 | A voicemail access number, not a phone |
| `toll_free` | 30 | A business line, not a personal phone |
| `shared_cost` | 30 | A business line, not a personal phone |
| `uan` | 30 | A company access number |
| `unknown_line_type` | 20 | The number is valid, but the kind of line cannot be determined |

Two rules apply on top of the table:

- **Weights add up.** A premium-rate number in a reserved range collects 100 and 70, and the score is capped at 100.
- **Uncertain signals do not count.** A signal adds its weight only when its confidence is at least 0.5.

## From score to recommendation

| Score | `level` | `recommendation` |
| --- | --- | --- |
| 0 to 29 | `low` | `allow` |
| 30 to 69 | `medium` | `review` |
| 70 to 100 | `high` | `block` |

## Worked examples

These are real answers. You can reproduce each one in the [free checker](https://phonerisk.up.railway.app/).

| Number | What it is | Reasons | Score | Recommendation |
| --- | --- | --- | --- | --- |
| `+49 176 12345678` | German mobile | none | 0 | `allow` |
| `+49 30 123456` | Berlin landline | none | 0 | `allow` |
| `+1 800 234 5678` | US toll-free | `toll_free` 30 | 30 | `review` |
| `+44 56 1234 5678` | UK VoIP | `voip` 40 | 40 | `review` |
| `+44 70 1123 4567` | UK personal number | `personal_number` 50 | 50 | `review` |
| `+870 773 111 632` | Satellite phone | `international_network` 50 | 50 | `review` |
| `+44 901 234 5678` | UK premium rate | `premium_rate` 70 | 70 | `block` |
| `+800 1234 5678` | International freephone | `international_network` 50, `toll_free` 30 | 80 | `block` |
| `+1 202 555 0123` | Fictional US number | `reserved_range` 100 | 100 | `block` |
| `+49 0123 456789` | Not in the numbering plan | `invalid_number` 100 | 100 | `block` |

A landline scores 0. It is a real person's phone as far as the score is concerned. If you are about to send a text message, check `line_type` as well: see [Check a phone number before you send it an SMS](guides/check-phone-number-before-sms.md).

## Using the recommendation

```python
import requests

def phone_decision(number: str) -> str:
    response = requests.post(
        "https://phonerisk-api.p.rapidapi.com/api/v1/lookup",
        headers={
            "X-RapidAPI-Key": "YOUR_RAPIDAPI_KEY",
            "X-RapidAPI-Host": "phonerisk-api.p.rapidapi.com",
        },
        json={"number": number},
        timeout=10,
    )
    if response.status_code == 400:
        return "block"  # not a phone number at all
    response.raise_for_status()
    return response.json()["risk"]["recommendation"]
```

A reasonable way to act on the three answers:

- **`block`**: turn the number away and ask for another one. Say why in plain words, for example "This looks like a premium-rate number. Please enter your mobile number."
- **`review`**: accept the number but lean on something else, such as a confirmed email address, a lower limit for new accounts or a manual check.
- **`allow`**: carry on. Still confirm that the person holds the number, with a code, if that matters to you.

## Setting your own rules

The recommendation is a default. `reasons` gives you the parts, so you can decide differently where your product calls for it.

A tool sold to companies will meet toll-free and VoIP numbers that are perfectly legitimate. It can accept those and still refuse the rest:

```python
ACCEPTED = {"toll_free", "voip", "shared_cost", "uan"}

def acceptable(risk: dict) -> bool:
    remaining = sum(reason["weight"] for reason in risk["reasons"] if reason["code"] not in ACCEPTED)
    return remaining < 70
```

## What the score cannot see

- **Whether the number is in service.** The API never contacts the phone network. A disconnected number in a valid range scores 0.
- **Most disposable numbers.** Public lists hold a small share of the inboxes that exist, and none of the numbers rented out privately.
- **VoIP numbers in ordinary ranges.** Only ranges used for nothing but VoIP are recognised. In the US and Canada, mobile, landline and VoIP numbers all share the same ranges, so no US or Canadian number picks up line-type points.
- **Who is holding the phone.** SIM swaps, recent ports and stolen phones leave no trace in numbering-plan data.

A low score means nothing suspicious was found. It does not mean the number is safe. Use it to stop the cheap, obvious abuse before you spend money on a text message or a manual review, not as the only check you run.
