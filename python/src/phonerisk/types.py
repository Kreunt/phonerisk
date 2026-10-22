"""The shape of the API's answers, for editors and type checkers.

The client returns the JSON the API sent, as plain dictionaries. These types
describe the keys; nothing is converted or validated at run time.
"""
from typing import Any, Dict, List, Optional, TypedDict


class Signal(TypedDict):
    """One fact about a number, with how sure the API is and where the fact came from."""

    value: Any
    # 0 to 1
    confidence: float
    source: str


class RiskReason(TypedDict):
    code: str
    # Points this reason adds to the score
    weight: int
    description: str


class Risk(TypedDict):
    # 0 to 100: the sum of the reason weights, capped
    score: int
    # "low", "medium" or "high"
    level: str
    # "allow", "review" or "block"
    recommendation: str
    reasons: List[RiskReason]


class CallingWindow(TypedDict):
    # Local 24-hour times, such as "08:00" and "21:00"
    start: str
    end: str
    # "us_federal", "us_state_TX", ... or "default"
    rule: str


class LocalTime(TypedDict):
    # None when the number's prefix covers time zones that currently differ
    time: Optional[str]
    utc_offsets: List[str]
    calling_window: CallingWindow
    # None when the possible time zones disagree
    in_calling_window: Optional[bool]


class Lookup(TypedDict):
    """Everything the API knows about one number. Signals are None when nothing is known."""

    number: str
    valid: bool
    possible: bool
    invalid_reason: Optional[str]
    # None only in batch results, for an entry that is not a phone number at all
    e164: Optional[str]
    national_format: Optional[str]
    international_format: Optional[str]
    rfc3966: Optional[str]
    dial_from_format: Optional[str]
    calling_code: Optional[int]
    national_number: Optional[str]
    country_name: Optional[str]
    country: Optional[Signal]
    carrier: Optional[Signal]
    line_type: Optional[Signal]
    location: Optional[Signal]
    timezones: Optional[Signal]
    local_time: Optional[LocalTime]
    is_voip: Optional[Signal]
    is_disposable: Optional[Signal]
    is_reserved: Optional[Signal]
    risk: Risk


class BatchResult(TypedDict):
    count: int
    # One result per number, in the order they were sent
    results: List[Lookup]


class ExtractMatch(Lookup):
    # Character positions of the match in the text; "number" is the matched text
    start: int
    end: int


class ExtractResult(TypedDict):
    count: int
    # True when the text holds more numbers than one response carries
    truncated: bool
    matches: List[ExtractMatch]


class CompareResult(TypedDict):
    # "exact_match", "nsn_match", "short_nsn_match" or "no_match"
    match_type: str
    # True for exact_match and nsn_match
    is_match: bool
    first_e164: Optional[str]
    second_e164: Optional[str]


class VanityResult(TypedDict):
    number: str
    # The input with letters replaced by their keypad digits
    digits: str
    e164: Optional[str]


class ExampleNumber(TypedDict):
    e164: str
    national: str
    international: str


class ExamplesResult(TypedDict):
    country: str
    country_name: Optional[str]
    calling_code: int
    # Line type -> a correctly formed number of that type
    examples: Dict[str, ExampleNumber]
    invalid_example: Optional[str]


class ShortNumberResult(TypedDict):
    number: str
    country: str
    valid: bool
    possible: bool
    is_emergency: bool
    connects_to_emergency: bool
    # "toll_free", "standard_rate", "premium_rate" or "unknown"
    cost: str
    is_carrier_specific: bool
    is_sms_service: bool
