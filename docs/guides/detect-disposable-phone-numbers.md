<!-- Generated from the PhoneRisk site's documentation by tools/export_docs.py. Edit it there, not here. -->

# How to detect disposable phone numbers

> Disposable numbers let anyone pass SMS verification without owning a phone. How detection works, what it misses, and how to check a number with one API call.

A disposable phone number is a number whose text messages anyone can read. Websites publish a list of numbers and show every message that arrives on them, for free and without an account. People use them to receive a sign-up code without giving a number of their own.

For the service that sent the code, the number is worthless: it verified nobody, and whoever opens the inbox next can use it to reset the account's password.

## Three kinds of throwaway number

They are detected in different ways, so it helps to tell them apart.

| Kind | How it works | Can a lookup detect it? |
| --- | --- | --- |
| Public inbox | A website shows the messages of a shared number to everyone | Yes, when the number is on a published list |
| Rented number | A paid service gives one customer a number for a few minutes | Rarely. The numbers are private and change constantly |
| VoIP number | An app or provider issues a number that is not tied to a SIM card | Only where the country keeps VoIP in ranges of its own |

No check catches all three. A lookup removes the cheapest and most common kind, the public inbox, and gives you a signal about the third.

## How detection works

**Lists of known inbox numbers.** Several projects collect the numbers that inbox websites publish. Matching a number against these lists is exact: a listed number is a disposable number, or was one recently. The weakness is coverage. The lists hold a small share of the inboxes that exist, and inbox sites rotate their numbers.

**The age of a listing.** Inbox numbers are handed back to the operator and later given to ordinary subscribers. A number that was listed three years ago probably belongs to somebody by now, so a careful check lets old listings fade out.

**The line type.** Some countries keep internet-telephony numbers in ranges of their own. A number in such a range is VoIP for certain. In the United States and Canada there are no such ranges: mobile, landline and VoIP numbers look the same.

**Your own data.** The strongest signals are on your side: ten accounts on one number, a burst of sign-ups from one prefix, a number whose code is entered within a second of sending. No lookup API can see those.

## Check a number with the PhoneRisk API

One request returns the list match, the line type and a combined risk verdict.

```bash
curl -X POST "https://phonerisk-api.p.rapidapi.com/api/v1/lookup" \
  -H "X-RapidAPI-Key: YOUR_RAPIDAPI_KEY" \
  -H "X-RapidAPI-Host: phonerisk-api.p.rapidapi.com" \
  -H "Content-Type: application/json" \
  -d '{"number": "+33612345678"}'
```

The parts of the answer that matter here, for a number that was on a list when this page was written:

```json
{
  "e164": "+33612345678",
  "line_type": {"value": "mobile", "confidence": 1.0, "source": "libphonenumber"},
  "is_voip": {"value": false, "confidence": 0.6, "source": "libphonenumber"},
  "is_disposable": {"value": true, "confidence": 0.7, "source": "ip1sms_disposable_list"},
  "risk": {
    "score": 80,
    "level": "high",
    "recommendation": "block",
    "reasons": [
      {
        "code": "disposable_number",
        "weight": 80,
        "description": "Listed as a public, disposable SMS inbox"
      }
    ]
  }
}
```

Notice that the line type is `mobile`. Many inbox sites run on ordinary SIM cards, which is why the line type alone would have let this number through.

### What `is_disposable` means

The API checks two public lists and downloads them again every day: [Castle's list](https://github.com/castle/disposable-phone-numbers) of the 1,000 numbers most active in sign-up abuse, and the community-maintained [iP1SMS list](https://github.com/iP1SMS/disposable-phone-numbers), which records when each number was listed.

| Listing | `value` | `confidence` | Effect on the risk score |
| --- | --- | --- | --- |
| On the Castle list | `true` | 0.9 | `disposable_number`, 80 points, `block` |
| On the iP1SMS list, listed within the last year | `true` | 0.7 | `disposable_number`, 80 points, `block` |
| Listed one to two years ago | `true` | 0.5 | `disposable_number_old_listing`, 40 points, `review` |
| Listed more than two years ago | `false` | 0.3 | none |
| Not listed | `false` | 0.3 | none |

A `false` comes with a confidence of 0.3 on purpose. "Not on the lists" is weak evidence, and the API says so instead of reporting a confident "clean".

## Use it at sign-up

```python
import requests

API = "https://phonerisk-api.p.rapidapi.com/api/v1/lookup"
HEADERS = {
    "X-RapidAPI-Key": "YOUR_RAPIDAPI_KEY",
    "X-RapidAPI-Host": "phonerisk-api.p.rapidapi.com",
}

def check_signup_number(number: str) -> tuple[bool, str]:
    """Whether to accept the number, and what to tell the person if not."""
    response = requests.post(API, headers=HEADERS, json={"number": number}, timeout=10)
    if response.status_code == 400:
        return False, "That does not look like a phone number."
    response.raise_for_status()
    lookup = response.json()

    if not lookup["valid"]:
        return False, "That number is not valid. Check it for typos."
    disposable = lookup["is_disposable"]
    if disposable["value"] and disposable["confidence"] >= 0.7:
        return False, "Temporary numbers cannot be used here. Enter your own number."
    if lookup["risk"]["recommendation"] == "block":
        return False, "That number cannot be used here. Enter your mobile number."
    return True, ""
```

The same check in JavaScript, for a Node.js server:

```javascript
async function checkSignupNumber(number) {
  const response = await fetch("https://phonerisk-api.p.rapidapi.com/api/v1/lookup", {
    method: "POST",
    headers: {
      "X-RapidAPI-Key": process.env.RAPIDAPI_KEY,
      "X-RapidAPI-Host": "phonerisk-api.p.rapidapi.com",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ number }),
  });
  if (response.status === 400) return { ok: false, why: "not a phone number" };
  if (!response.ok) throw new Error(`Lookup failed with status ${response.status}`);

  const lookup = await response.json();
  const disposable = lookup.is_disposable;
  if (!lookup.valid) return { ok: false, why: lookup.invalid_reason };
  if (disposable.value && disposable.confidence >= 0.7) return { ok: false, why: "disposable number" };
  if (lookup.risk.recommendation === "block") return { ok: false, why: lookup.risk.reasons[0].code };
  return { ok: true };
}
```

Run the check on your server, before you send the verification code. That way a refused number costs you nothing.

## What a lookup will not catch

- **Inboxes that are on no list.** New inbox sites and fresh numbers appear daily.
- **Privately rented numbers.** They are never published, so no list can hold them.
- **VoIP numbers in the US and Canada.** Every North American number comes back as `fixed_or_mobile`. Telling a Google Voice number from a mobile there takes carrier data that numbering plans do not contain.

Treat the lookup as the first filter and keep a second one that needs no outside data:

- Allow one account per phone number.
- Limit how many codes you send to one number, one IP address and one number prefix per hour.
- Review accounts whose number was listed as disposable a year or two ago before granting anything valuable.

## Common questions

**Is every VoIP number disposable?** No. Many people and most companies use VoIP lines as their normal phone. The API reports VoIP separately, as `line_type` and `is_voip`, and gives it 40 risk points, which leads to `review`, not `block`.

**Should I block on `is_disposable` alone?** For a listing with a confidence of 0.7 or higher, yes. For 0.5, the number may have been reassigned to an ordinary subscriber, so ask for a second factor instead of refusing.

**Can I get the full list?** The two source lists are public and linked above. The API adds the age rule, the daily refresh and the other checks around it.

You can try any number in the [free checker](https://phonerisk.up.railway.app/) before writing code.
