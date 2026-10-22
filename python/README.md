# phonerisk

Python client for the [PhoneRisk API](https://rapidapi.com/daimaileri20/api/phonerisk-api). One call validates a phone number and tells you how risky it looks: line type, carrier, country, local time, whether it is a known disposable number, and a risk score from 0 to 100 with the reason behind every point.

The client has no dependencies and works on Python 3.9 and newer.

## Install

```bash
pip install phonerisk
```

You need a RapidAPI key. Subscribe to a plan on the [PhoneRisk API listing](https://rapidapi.com/daimaileri20/api/phonerisk-api) to get one.

## Quick start

```python
from phonerisk import PhoneRisk

client = PhoneRisk("YOUR_RAPIDAPI_KEY")   # or set the RAPIDAPI_KEY environment variable

lookup = client.lookup("+4917612345678")

lookup["valid"]                    # True
lookup["e164"]                     # "+4917612345678"
lookup["line_type"]["value"]       # "mobile"
lookup["carrier"]["value"]         # "O2"
lookup["country_name"]             # "Germany"
lookup["risk"]["score"]            # 0
lookup["risk"]["recommendation"]   # "allow", "review" or "block"
```

A number written without `+` needs the country it belongs to:

```python
client.lookup("0176 12345678", default_region="DE")
```

## Decide at sign-up

```python
from phonerisk import NotAPhoneNumber, PhoneRisk

client = PhoneRisk()

def accept(number: str) -> bool:
    try:
        lookup = client.lookup(number)
    except NotAPhoneNumber:
        return False                      # not a phone number at all
    return lookup["risk"]["recommendation"] != "block"
```

`block` covers numbers that are invalid, fictional, premium-rate or listed as disposable SMS inboxes. `review` covers numbers that are unusual for a person's own phone, such as VoIP and toll-free lines. Every point of the score comes with a reason:

```python
for reason in client.lookup("+44 901 234 5678")["risk"]["reasons"]:
    print(reason["weight"], reason["code"], reason["description"])
# 70 premium_rate Premium-rate number: costly to reach and a common target of call and SMS revenue fraud
```

## Everything the client does

| Method | What it does |
| --- | --- |
| `lookup(number)` | Everything about one number |
| `lookup_batch(numbers)` | Up to 100 numbers in one request |
| `lookup_many(numbers)` | A list of any length, sent 100 at a time |
| `extract(text)` | Find and look up every phone number in a text |
| `compare(first, second)` | Tell whether two differently written numbers are the same |
| `vanity(number)` | Turn `1-800-FLOWERS` into digits |
| `examples(country)` | Example numbers of every line type a country has |
| `short_number(number, country)` | Describe an emergency number or short code |

The lookup methods take the same options:

| Option | Meaning |
| --- | --- |
| `default_region` | Two-letter country code used to read a number written without `+` |
| `dial_from` | Country the number will be dialled from; fills `dial_from_format` |
| `at` | A `datetime` or ISO 8601 string to work out `local_time` for; defaults to now |
| `nocache` | `True` keeps the request out of the API's cache |

### Clean a contact list

```python
numbers = ["+4917612345678", "0176 12345678", "n/a", "+1 202 555 0123"]

for number, result in zip(numbers, client.lookup_many(numbers, default_region="DE")):
    print(number, "->", result["e164"], result["risk"]["recommendation"])
# +4917612345678 -> +4917612345678 allow
# 0176 12345678 -> +4917612345678 allow
# n/a -> None block
# +1 202 555 0123 -> +12025550123 block
```

### Find numbers in text

```python
found = client.extract("Call +49 176 12345678 or 030 123456 after five.", default_region="DE")
for match in found["matches"]:
    print(match["number"], match["e164"], match["line_type"]["value"])
# +49 176 12345678 +4917612345678 mobile
# 030 123456 +4930123456 fixed_line
```

## What comes back

Methods return the API's JSON as plain dictionaries. The package ships type hints (`Lookup`, `Risk`, `Signal` and others), so editors can complete the keys.

Most facts are signals: a dictionary with `value`, `confidence` (0 to 1) and `source`, or `None` when nothing is known.

```python
lookup["line_type"]      # {"value": "mobile", "confidence": 1.0, "source": "libphonenumber"}
lookup["is_disposable"]  # {"value": False, "confidence": 0.3, "source": "disposable_number_lists"}
```

A number that can be read but is not valid does not raise. It comes back with `valid` set to `False`, an `invalid_reason` and a risk score of 100.

## Errors

| Exception | When |
| --- | --- |
| `NotAPhoneNumber` | The input cannot be read as a phone number (status 400) |
| `RateLimited` | The quota or rate limit of your plan is used up (status 429) |
| `PhoneRiskError` | Everything else, including the two above. `status` holds the HTTP status, or `None` when no answer arrived; `detail` holds the message |

```python
from phonerisk import PhoneRiskError, RateLimited

try:
    lookup = client.lookup(number)
except RateLimited:
    ...  # back off, or let the number through unchecked
except PhoneRiskError as error:
    print(error.status, error.detail)
```

Requests time out after 10 seconds. Change that with `PhoneRisk(timeout=3)`.

## What the API cannot tell you

Answers come from numbering-plan data and public lists of disposable numbers. Nothing is sent to the phone network, so the API cannot say whether a number is switched on, who owns it or which carrier it moved to. US and Canadian numbers come back with the line type `fixed_or_mobile`, because both kinds share the same ranges there. A low risk score means nothing suspicious was found, not that the number is safe.

## Links

- [Documentation](https://phonerisk.up.railway.app/docs)
- [Free phone risk checker](https://phonerisk.up.railway.app/)
- [Plans and API keys](https://rapidapi.com/daimaileri20/api/phonerisk-api)
- [Source, the JavaScript client and the MCP server](https://github.com/Kreunt/phonerisk)
