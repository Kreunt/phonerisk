"""Decide whether to accept a phone number at sign-up.

    RAPIDAPI_KEY=... python signup_check.py "+44 901 234 5678"
    RAPIDAPI_KEY=... python signup_check.py "0176 12345678" DE
"""
import sys
from typing import Optional, Tuple

from phonerisk import NotAPhoneNumber, PhoneRisk

client = PhoneRisk()


def check(number: str, default_region: Optional[str] = None) -> Tuple[bool, str]:
    """Whether to accept the number, and what to tell the person."""
    try:
        lookup = client.lookup(number, default_region=default_region)
    except NotAPhoneNumber:
        return False, "That does not look like a phone number. Include the country code, like +49 176 12345678."

    if not lookup["valid"]:
        return False, f"That number is not valid ({lookup['invalid_reason']}). Check it for typos."

    risk = lookup["risk"]
    if risk["recommendation"] == "block":
        # The first reason is the one with the most weight
        return False, f"This number cannot be used here: {risk['reasons'][0]['description']}."
    if risk["recommendation"] == "review":
        return True, f"Accepted, but worth a second look: {risk['reasons'][0]['description']}."
    return True, f"Accepted: {lookup['international_format']}, {lookup['line_type']['value']}, {lookup['country_name']}."


if __name__ == "__main__":
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    accepted, message = check(sys.argv[1], sys.argv[2] if len(sys.argv) > 2 else None)
    print("ACCEPT" if accepted else "REFUSE", "-", message)
