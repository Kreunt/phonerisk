"""Client for the PhoneRisk API: phone number validation, line type, carrier,
disposable-number detection and a 0-100 risk score.

    from phonerisk import PhoneRisk

    client = PhoneRisk("YOUR_RAPIDAPI_KEY")
    lookup = client.lookup("+4917612345678")
    print(lookup["risk"]["recommendation"])
"""
from .client import DEFAULT_HOST, MAX_BATCH, NotAPhoneNumber, PhoneRisk, PhoneRiskError, RateLimited, __version__
from .types import (
    BatchResult, CallingWindow, CompareResult, ExampleNumber, ExamplesResult, ExtractMatch, ExtractResult,
    LocalTime, Lookup, Risk, RiskReason, ShortNumberResult, Signal, VanityResult,
)

__all__ = [
    "PhoneRisk", "PhoneRiskError", "NotAPhoneNumber", "RateLimited", "DEFAULT_HOST", "MAX_BATCH", "__version__",
    "Lookup", "Signal", "Risk", "RiskReason", "LocalTime", "CallingWindow", "BatchResult", "ExtractResult",
    "ExtractMatch", "CompareResult", "VanityResult", "ExamplesResult", "ExampleNumber", "ShortNumberResult",
]
