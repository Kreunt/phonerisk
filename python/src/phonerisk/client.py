"""Client for the PhoneRisk API, which is served through RapidAPI."""
import json
import os
import socket
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional, Union

from .types import (
    BatchResult, CompareResult, ExamplesResult, ExtractResult, Lookup, ShortNumberResult, VanityResult,
)

__version__ = "0.1.0"

# Where RapidAPI serves the API
DEFAULT_HOST = "phonerisk-api.p.rapidapi.com"
# Most numbers the API takes in one batch request
MAX_BATCH = 100

When = Union[datetime, str, None]


class PhoneRiskError(Exception):
    """The API, or RapidAPI in front of it, did not answer the request.

    `status` is the HTTP status, or None when no answer arrived at all.
    """

    def __init__(self, status: Optional[int], detail: str):
        super().__init__(f"{status}: {detail}" if status else detail)
        self.status = status
        self.detail = detail


class NotAPhoneNumber(PhoneRiskError):
    """The input could not be read as a phone number (status 400).

    A number written without "+" needs default_region. A number that can be
    read but is not valid does not raise: it comes back with valid == False.
    """


class RateLimited(PhoneRiskError):
    """The quota or rate limit of the RapidAPI plan is used up (status 429)."""


def _detail(body: bytes) -> str:
    """The message of an error answer. The API sends {"detail": ...}, RapidAPI {"message": ...}."""
    try:
        data = json.loads(body)
    except ValueError:
        return body.decode("utf-8", "replace").strip()[:200] or "no details given"
    if isinstance(data, dict):
        detail = data.get("detail", data.get("message"))
        if isinstance(detail, str):
            return detail
        if isinstance(detail, list):
            # Validation errors: one entry per rejected field
            return "; ".join(
                f"{'.'.join(str(part) for part in entry.get('loc', [])[1:])}: {entry.get('msg', '')}".strip(": ")
                for entry in detail if isinstance(entry, dict)
            )
    return "no details given"


class PhoneRisk:
    """Looks phone numbers up.

        client = PhoneRisk("YOUR_RAPIDAPI_KEY")
        lookup = client.lookup("+4917612345678")
        lookup["risk"]["recommendation"]    # "allow", "review" or "block"

    The key is read from the RAPIDAPI_KEY environment variable when none is given.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        *,
        host: str = DEFAULT_HOST,
        timeout: float = 10.0,
        base_url: Optional[str] = None,
    ):
        self.api_key = api_key or os.environ.get("RAPIDAPI_KEY")
        if not self.api_key:
            raise ValueError("Pass your RapidAPI key, or set the RAPIDAPI_KEY environment variable")
        self.host = host
        self.timeout = timeout
        # base_url, or the PHONERISK_BASE_URL variable, is for tests and proxies;
        # RapidAPI itself is always reached over HTTPS at the host
        self.base_url = (base_url or os.environ.get("PHONERISK_BASE_URL") or f"https://{host}").rstrip("/")

    def lookup(
        self,
        number: str,
        *,
        default_region: Optional[str] = None,
        dial_from: Optional[str] = None,
        at: When = None,
        nocache: bool = False,
    ) -> Lookup:
        """Everything about one number.

        default_region: two-letter country code used to read a number written without "+".
        dial_from: country the number will be dialled from; fills dial_from_format.
        at: moment to work out local_time for; defaults to now.
        nocache: keep the request out of the API's cache.
        """
        return self._post("/api/v1/lookup", {"number": number, **_options(default_region, dial_from, at)}, nocache)

    def lookup_batch(
        self,
        numbers: Iterable[str],
        *,
        default_region: Optional[str] = None,
        dial_from: Optional[str] = None,
        at: When = None,
        nocache: bool = False,
    ) -> BatchResult:
        """Up to 100 numbers in one request. An entry that is not a phone number gets a result too, with
        invalid_reason "unparseable"."""
        numbers = list(numbers)
        if not 1 <= len(numbers) <= MAX_BATCH:
            raise ValueError(f"One batch takes 1 to {MAX_BATCH} numbers; use lookup_many for longer lists")
        return self._post("/api/v1/lookup/batch", {"numbers": numbers, **_options(default_region, dial_from, at)}, nocache)

    def lookup_many(
        self,
        numbers: Iterable[str],
        *,
        default_region: Optional[str] = None,
        dial_from: Optional[str] = None,
        at: When = None,
        nocache: bool = False,
    ) -> List[Lookup]:
        """Any number of numbers, sent 100 at a time. Results come back in input order.

        Each batch is one request against your plan's quota.
        """
        numbers = list(numbers)
        results: List[Lookup] = []
        for start in range(0, len(numbers), MAX_BATCH):
            batch = self.lookup_batch(
                numbers[start:start + MAX_BATCH],
                default_region=default_region, dial_from=dial_from, at=at, nocache=nocache,
            )
            results.extend(batch["results"])
        return results

    def extract(
        self,
        text: str,
        *,
        default_region: Optional[str] = None,
        dial_from: Optional[str] = None,
        at: When = None,
        nocache: bool = False,
    ) -> ExtractResult:
        """Find every valid phone number in a text and look each one up.

        Without default_region only numbers written in international format are found.
        """
        return self._post("/api/v1/extract", {"text": text, **_options(default_region, dial_from, at)}, nocache)

    def compare(self, first: str, second: str, *, default_region: Optional[str] = None) -> CompareResult:
        """Tell whether two differently written numbers are the same number."""
        return self._post("/api/v1/compare", {"first": first, "second": second, **_options(default_region)})

    def vanity(self, number: str, *, default_region: Optional[str] = None) -> VanityResult:
        """Turn the letters of a vanity number such as 1-800-FLOWERS into digits."""
        return self._get("/api/v1/vanity", {"number": number, "default_region": default_region})

    def examples(self, country: str) -> ExamplesResult:
        """Example numbers of every line type a country has, for tests and input placeholders."""
        return self._get(f"/api/v1/examples/{urllib.parse.quote(country, safe='')}", {})

    def short_number(self, number: str, country: str) -> ShortNumberResult:
        """Describe an emergency number or short code, such as 112, as dialled inside a country."""
        return self._get("/api/v1/short-number", {"number": number, "country": country})

    def _post(self, path: str, body: Dict[str, Any], nocache: bool = False) -> Any:
        return self._request("POST", path, {"nocache": "true"} if nocache else {}, body)

    def _get(self, path: str, query: Dict[str, Optional[str]]) -> Any:
        return self._request("GET", path, {key: value for key, value in query.items() if value is not None})

    def _request(self, method: str, path: str, query: Dict[str, str], body: Optional[Dict[str, Any]] = None) -> Any:
        url = self.base_url + path
        if query:
            url += "?" + urllib.parse.urlencode(query)
        headers = {
            "X-RapidAPI-Key": self.api_key,
            "X-RapidAPI-Host": self.host,
            "Accept": "application/json",
            "User-Agent": f"phonerisk-python/{__version__}",
        }
        data = None
        if body is not None:
            data = json.dumps(body).encode("utf-8")
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(url, data=data, headers=headers, method=method)

        try:
            with urllib.request.urlopen(request, timeout=self.timeout) as response:
                return json.loads(response.read())
        except urllib.error.HTTPError as error:
            detail = _detail(error.read())
            if error.code == 400:
                raise NotAPhoneNumber(400, detail) from None
            if error.code == 429:
                raise RateLimited(429, detail) from None
            raise PhoneRiskError(error.code, detail) from None
        except (urllib.error.URLError, socket.timeout, TimeoutError) as error:
            reason = getattr(error, "reason", error)
            raise PhoneRiskError(None, f"Could not reach {self.host}: {reason}") from None
        except ValueError:
            raise PhoneRiskError(None, f"{self.host} answered with something that is not JSON") from None


def _options(default_region: Optional[str] = None, dial_from: Optional[str] = None, at: When = None) -> Dict[str, str]:
    """The lookup options that were given, in the form the API takes them."""
    options = {"default_region": default_region, "dial_from": dial_from}
    if at is not None:
        options["at"] = at.isoformat() if isinstance(at, datetime) else at
    return {key: value for key, value in options.items() if value is not None}
