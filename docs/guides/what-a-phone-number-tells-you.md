<!-- Generated from the PhoneRisk site's documentation by tools/export_docs.py. Edit it there, not here. -->

# What a phone number tells you without calling it

> A phone number carries its country, the kind of line and often its first carrier in its digits. What can be read from them, how, and where the digits stop helping.

A phone number is not a random string. Its digits follow a plan that each country publishes, and that plan says which ranges are mobile phones, which are landlines in a given city, which are free to call and which cost extra. Read against those plans, a number gives up a surprising amount before anyone dials it.

It also has hard limits. The digits say what a number was issued as. They do not say whether it works today or who holds it.

## How a number is built

International numbers follow a standard called E.164: a country code of one to three digits, then a national number, at most 15 digits in all. `+49 176 12345678` is country code 49, Germany, followed by a national number whose first digits, 176, place it in a mobile range.

Every country's regulator decides how its national numbers are divided up and publishes the result as a numbering plan. Google collects these plans in an open-source library, [libphonenumber](https://github.com/google/libphonenumber), which is what most software uses to read them, the PhoneRisk API included.

## What the digits say

**Whether the number can exist.** Each country allows certain lengths and certain ranges. A number that is too short, too long or in a range nobody uses cannot be real, whatever else is true of it. This catches typos and made-up numbers.

**The country, and often the city.** The country code gives the country. For landlines, the next digits usually give an area: `+49 30` is Berlin, `+44 20` is London, `+1 415` is San Francisco.

**The kind of line.** Many countries keep mobile phones, landlines, free-to-call numbers and premium-rate numbers in separate ranges. German mobile numbers start with 15, 16 or 17; UK mobile numbers start with 07, and UK numbers starting with 09 are premium rate. This matters in practice: a landline usually cannot receive a text message, and a premium-rate number costs money to reach.

**The first carrier.** Regulators hand out mobile ranges to operators in blocks, so the range tells you which operator the number was first issued by. `+49 176` was issued to O2.

**The time zone.** Once you know the country or the city, you know the time zone, and so what time it is there right now.

**Whether it is fictional.** Some ranges are set aside for films, television and testing, and are never given to a subscriber: `555-0100` to `555-0199` in every US and Canadian area code, and a set of ranges the UK regulator publishes for drama. A number from one of them is valid on paper and belongs to nobody.

## What lists add

One useful fact is not in any numbering plan: whether a number is a public throwaway inbox. Websites publish numbers whose text messages anyone can read, and people use them to pass SMS verification without a phone of their own. Several projects collect those numbers into lists. Matching against the lists is exact for the numbers they hold, and silent about the many they do not.

## Where the digits stop helping

- **Is the number in service?** A valid number can be unassigned, disconnected or switched off. Only the phone network knows.
- **Who owns it?** Numbering plans hold no names.
- **Which carrier is it on now?** People keep their number when they change operator. The range still shows the first one.
- **Mobile or landline in North America.** The US, Canada and the other countries that share `+1` issue both kinds from the same ranges. The digits cannot tell them apart.
- **Internet telephony.** Some countries give VoIP numbers ranges of their own. Many do not, and there a VoIP number looks like any other.

The questions in this list need a live query to the network, sold as HLR lookup or number portability lookup. Those services charge per query and take longer. They are the right tool when you need to know that a specific number is reachable right now, and too much for checking a sign-up form.

## Reading a number in practice

One request to the PhoneRisk API returns everything above for a number:

```bash
curl -X POST "https://phonerisk-api.p.rapidapi.com/api/v1/lookup" \
  -H "X-RapidAPI-Key: YOUR_RAPIDAPI_KEY" \
  -H "X-RapidAPI-Host: phonerisk-api.p.rapidapi.com" \
  -H "Content-Type: application/json" \
  -d '{"number": "+4917612345678"}'
```

The parts of the answer that match the sections above:

```json
{
  "valid": true,
  "e164": "+4917612345678",
  "country_name": "Germany",
  "line_type": {"value": "mobile", "confidence": 1.0, "source": "libphonenumber"},
  "carrier": {"value": "O2", "confidence": 0.7, "source": "operator_prefix_db"},
  "timezones": {"value": ["Europe/Berlin"], "confidence": 1.0, "source": "libphonenumber"},
  "is_disposable": {"value": false, "confidence": 0.3, "source": "disposable_number_lists"},
  "is_reserved": null,
  "risk": {"score": 0, "level": "low", "recommendation": "allow", "reasons": []}
}
```

Each fact comes with a confidence. The carrier is 0.7, not 1.0, because the number may have moved to another operator. "Not disposable" is 0.3, because the lists are far from complete. The risk score adds the findings up into one number, and [How the risk score works](../risk-score.md) shows the sum.

## Library or API

If all you need is to check that a number is well formed and to store it in one format, use libphonenumber directly. It is free, it runs inside your program, and there are versions for most languages.

An API earns its place when you want more than the library holds or do not want to maintain it:

- numbering plans change every few weeks, and a hosted service is always current without a release of your own
- lists of disposable numbers, refreshed daily
- fictional ranges flagged
- one risk verdict with the reasons spelled out
- whole lists in one request, and numbers found in free text
- calling hours worked out for the place a number is based

You can try any number in the [free checker](https://phonerisk.up.railway.app/) to see what comes back.
