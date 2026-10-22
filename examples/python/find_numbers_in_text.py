"""Find every phone number in a text, such as an email or a support ticket.

    RAPIDAPI_KEY=... python find_numbers_in_text.py DE < ticket.txt

The argument is the country that numbers without a "+" belong to. Leave it out
and only numbers in international format are found.
"""
import sys

from phonerisk import PhoneRisk

if __name__ == "__main__":
    text = sys.stdin.read()
    region = sys.argv[1] if len(sys.argv) > 1 else None
    found = PhoneRisk().extract(text, default_region=region)

    for match in found["matches"]:
        print(
            f"{match['start']:>5}-{match['end']:<5} {match['number']!r:24} -> {match['e164']:16} "
            f"{match['line_type']['value']:12} {match['risk']['recommendation']}"
        )
    if found["truncated"]:
        print("The text holds more numbers than one request returns; split it and run again.")
