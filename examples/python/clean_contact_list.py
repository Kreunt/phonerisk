"""Clean a CSV of contacts: normalise every phone number and say which ones to keep.

Reads a CSV with a "phone" column and writes it back with four more columns:
e164, line_type, country and recommendation.

    RAPIDAPI_KEY=... python clean_contact_list.py contacts.csv cleaned.csv DE

The last argument is the country that numbers without a "+" belong to.
Numbers are sent 100 at a time, so 5,000 contacts take 50 requests.
"""
import csv
import sys

from phonerisk import PhoneRisk


def clean(source: str, target: str, default_region: str) -> None:
    with open(source, newline="", encoding="utf-8") as file:
        rows = list(csv.DictReader(file))
    if not rows:
        sys.exit(f"{source} has no rows")
    if "phone" not in rows[0]:
        sys.exit(f'{source} has no "phone" column')

    # An empty cell is not worth a lookup; the API would refuse an empty number
    filled = [row for row in rows if row["phone"].strip()]
    results = PhoneRisk().lookup_many([row["phone"] for row in filled], default_region=default_region)

    for row in rows:
        row.update(e164="", line_type="", country="", recommendation="")
    for row, result in zip(filled, results):
        row.update(
            e164=result["e164"] or "",
            line_type=result["line_type"]["value"] if result["line_type"] else "",
            country=result["country"]["value"] if result["country"] else "",
            recommendation=result["risk"]["recommendation"],
        )

    with open(target, "w", newline="", encoding="utf-8") as file:
        writer = csv.DictWriter(file, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)

    kept = sum(row["recommendation"] == "allow" for row in rows)
    print(f"{len(rows)} contacts, {kept} to keep, {len(rows) - kept} to review or drop -> {target}")


if __name__ == "__main__":
    if len(sys.argv) != 4:
        sys.exit(__doc__)
    clean(*sys.argv[1:])
