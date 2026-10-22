<!-- Generated from the PhoneRisk site's documentation by tools/export_docs.py. Edit it there, not here. -->

# Check a phone number before you send it an SMS

> A verification text to a landline, a premium-rate line or a made-up number costs money and verifies nobody. What to check first, and what a number check cannot stop.

Sending a text message costs money whether or not anyone reads it. A sign-up form that texts every number typed into it pays for typos, landlines, made-up numbers and, in the worst case, for fraud aimed at the form itself.

A lookup before the send removes most of that. It takes one request, and it runs on numbering-plan data, so it is far cheaper than the message it saves.

## What goes wrong without a check

- **Typos and made-up numbers.** A number with a digit missing can never receive anything. Neither can `+1 202 555 0123`, which sits in a range kept for films.
- **Landlines.** In most countries a landline cannot receive a text. The person waits for a code that never arrives and leaves.
- **Premium-rate and special numbers.** Texting them can cost many times the normal price.
- **Disposable inboxes.** The code arrives, on a public web page that anyone can read.
- **SMS pumping.** Somebody scripts your form to request thousands of codes for numbers they earn money from. More on that [below](#sms-pumping).

## The checks, in order

Each one reads a field of the same lookup response.

| Question | Field | What to do |
| --- | --- | --- |
| Is it a phone number at all? | Status 400 | Ask the person to check the number |
| Is it valid? | `valid`, `invalid_reason` | If not, ask the person to correct it. `invalid_reason` says whether it is too short, too long or in an unused range |
| Can it receive a text? | `line_type.value` | See the table below |
| Is it a throwaway or fictional number? | `risk.recommendation` | Refuse on `block` |
| Is it in a country you serve? | `country.value` | Refuse countries you do not do business in |

### Line types and text messages

| `line_type.value` | Send a text? |
| --- | --- |
| `mobile` | Yes |
| `fixed_or_mobile` | Yes. This is every US and Canadian number; the two cannot be told apart there |
| `fixed_line` | No. Offer a voice call that reads the code out |
| `voip` | Your decision. Many VoIP numbers receive texts, and some belong to real customers |
| `toll_free`, `shared_cost`, `uan` | No. These are company lines |
| `premium_rate` | No |
| `pager`, `voicemail`, `personal_number` | No |
| `unknown` | Your decision |

One thing to know: the risk score alone is not enough here. It answers whether a number looks like a real person's own phone, and a landline is one, so a landline scores 0. Whether a text can arrive is a separate question, answered by `line_type`.

## The check in code

```python
import requests

API = "https://phonerisk-api.p.rapidapi.com/api/v1/lookup"
HEADERS = {
    "X-RapidAPI-Key": "YOUR_RAPIDAPI_KEY",
    "X-RapidAPI-Host": "phonerisk-api.p.rapidapi.com",
}
TEXTABLE = {"mobile", "fixed_or_mobile"}
COUNTRIES_WE_SERVE = {"DE", "AT", "CH"}

def before_sms(number: str, default_region: str | None = None) -> dict:
    """Decide whether to text a number. Returns the action and the number to send to."""
    body = {"number": number}
    if default_region:
        body["default_region"] = default_region
    response = requests.post(API, headers=HEADERS, json=body, timeout=10)
    if response.status_code == 400:
        return {"action": "ask_again", "why": "not a phone number"}
    response.raise_for_status()
    lookup = response.json()

    if not lookup["valid"]:
        return {"action": "ask_again", "why": lookup["invalid_reason"]}
    if lookup["risk"]["recommendation"] == "block":
        return {"action": "refuse", "why": lookup["risk"]["reasons"][0]["code"]}
    if lookup["country"] is None or lookup["country"]["value"] not in COUNTRIES_WE_SERVE:
        return {"action": "refuse", "why": "country not served"}

    line_type = lookup["line_type"]["value"]
    if line_type == "fixed_line":
        return {"action": "voice_call", "to": lookup["e164"]}
    if line_type not in TEXTABLE:
        return {"action": "refuse", "why": line_type}
    return {"action": "send_sms", "to": lookup["e164"]}
```

Send to `e164`, not to what the person typed. It is the same number in the one format every SMS provider accepts, and storing it means `0176 12345678` and `+49 176 12345678` are recognised as one number the next time.

## SMS pumping

SMS pumping, also called artificially inflated traffic, is fraud against anyone who sends verification texts. The attacker requests codes in bulk for numbers they profit from: premium-rate numbers, or ordinary-looking numbers on a network that shares its income from incoming messages with them. You pay for every message.

A number check helps with part of it:

- **Premium-rate numbers** are recognised by their range and refused.
- **Invalid and fictional numbers** never reach your SMS provider.
- **A country allow-list** removes much of the rest. Pumping tends to go to destinations with high message prices, which are often not the countries a product does business in. `country.value` gives you the country of every number.

It does not help with the remainder. A pumped number in an ordinary mobile range of a country you serve looks exactly like a customer. Against that you need limits that count:

- codes per phone number, per IP address and per session
- codes per number prefix: pumped numbers tend to be consecutive, so many requests for numbers that share their first digits are a strong sign
- the share of sent codes that are ever entered; a sudden drop means the codes are going to nobody

Most SMS providers also let you switch off countries you do not send to. Turn that on as well: it still works if a request slips past your own check.

## Other uses of the same lookup

- **Timing.** For reminders and marketing messages, `local_time.in_calling_window` says whether the message would arrive inside calling hours where the number is based, which is 08:00 to 21:00 in most places. Send `at` with a planned time to check in advance.
- **Cleaning a list.** `POST /api/v1/lookup/batch` takes 100 numbers per request. Run a contact list through it before a campaign and drop what cannot receive a text.
- **Duplicates.** `POST /api/v1/compare` tells whether two differently written numbers are the same.

Every field is described in the [API reference](../README.md), and the weights behind the recommendation in [How the risk score works](../risk-score.md).
