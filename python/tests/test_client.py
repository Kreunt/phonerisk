import json
import threading
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, HTTPServer

import pytest

from phonerisk import DEFAULT_HOST, NotAPhoneNumber, PhoneRisk, PhoneRiskError, RateLimited

LOOKUP = {"number": "+4917612345678", "valid": True, "e164": "+4917612345678", "risk": {"score": 0, "recommendation": "allow"}}


class Stub:
    """A local server that stands in for RapidAPI: keeps what it was sent, answers what the test tells it to."""

    def __init__(self):
        self.requests = []
        self.status = 200
        self.answer = LOOKUP
        stub = self

        class Handler(BaseHTTPRequestHandler):
            def _handle(self):
                length = int(self.headers.get("Content-Length") or 0)
                body = self.rfile.read(length)
                stub.requests.append({
                    "method": self.command,
                    "path": self.path,
                    "headers": {name.lower(): value for name, value in self.headers.items()},
                    "body": json.loads(body) if body else None,
                })
                answer = stub.answer(stub.requests[-1]) if callable(stub.answer) else stub.answer
                payload = answer if isinstance(answer, bytes) else json.dumps(answer).encode()
                self.send_response(stub.status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(payload)))
                self.end_headers()
                self.wfile.write(payload)

            do_GET = do_POST = _handle

            def log_message(self, *args):
                pass

        self.server = HTTPServer(("127.0.0.1", 0), Handler)
        self.url = f"http://127.0.0.1:{self.server.server_port}"
        threading.Thread(target=self.server.serve_forever, daemon=True).start()

    @property
    def last(self):
        return self.requests[-1]


@pytest.fixture
def stub():
    stub = Stub()
    yield stub
    stub.server.shutdown()
    stub.server.server_close()


@pytest.fixture
def client(stub):
    return PhoneRisk("test-key", base_url=stub.url)


def test_lookup(client, stub):
    assert client.lookup("+4917612345678") == LOOKUP
    assert stub.last["method"] == "POST"
    assert stub.last["path"] == "/api/v1/lookup"
    assert stub.last["body"] == {"number": "+4917612345678"}


def test_every_request_carries_the_rapidapi_headers(client, stub):
    client.lookup("+4917612345678")
    client.examples("DE")
    for request in stub.requests:
        assert request["headers"]["x-rapidapi-key"] == "test-key"
        assert request["headers"]["x-rapidapi-host"] == DEFAULT_HOST
        assert request["headers"]["user-agent"].startswith("phonerisk-python/")


def test_lookup_options(client, stub):
    when = datetime(2026, 10, 12, 9, 30, tzinfo=timezone.utc)
    client.lookup("0176 12345678", default_region="DE", dial_from="US", at=when, nocache=True)
    assert stub.last["path"] == "/api/v1/lookup?nocache=true"
    assert stub.last["body"] == {
        "number": "0176 12345678", "default_region": "DE", "dial_from": "US", "at": "2026-10-12T09:30:00+00:00",
    }
    client.lookup("+4917612345678", at="2026-10-12T09:30:00+02:00")
    assert stub.last["body"]["at"] == "2026-10-12T09:30:00+02:00"


def test_lookup_batch(client, stub):
    stub.answer = {"count": 2, "results": [LOOKUP, LOOKUP]}
    assert client.lookup_batch(["+4917612345678", "n/a"], default_region="DE")["count"] == 2
    assert stub.last["path"] == "/api/v1/lookup/batch"
    assert stub.last["body"] == {"numbers": ["+4917612345678", "n/a"], "default_region": "DE"}


@pytest.mark.parametrize("size", [0, 101])
def test_one_batch_has_a_size_limit(client, stub, size):
    with pytest.raises(ValueError, match="1 to 100"):
        client.lookup_batch(["+4917612345678"] * size)
    assert stub.requests == []


def test_lookup_many_sends_a_long_list_in_batches(client, stub):
    numbers = [f"+49176{index:08d}" for index in range(250)]
    stub.answer = lambda request: {
        "count": len(request["body"]["numbers"]),
        "results": [{"number": number} for number in request["body"]["numbers"]],
    }
    results = client.lookup_many(numbers, default_region="DE")
    assert [len(request["body"]["numbers"]) for request in stub.requests] == [100, 100, 50]
    assert [result["number"] for result in results] == numbers
    assert all(request["body"]["default_region"] == "DE" for request in stub.requests)
    assert client.lookup_many([]) == []


def test_extract(client, stub):
    stub.answer = {"count": 0, "truncated": False, "matches": []}
    client.extract("Call +49 176 12345678", default_region="DE")
    assert stub.last["path"] == "/api/v1/extract"
    assert stub.last["body"] == {"text": "Call +49 176 12345678", "default_region": "DE"}


def test_compare(client, stub):
    stub.answer = {"match_type": "exact_match", "is_match": True}
    assert client.compare("+49 176 12345678", "0176 12345678", default_region="DE")["is_match"] is True
    assert stub.last["path"] == "/api/v1/compare"
    assert stub.last["body"] == {"first": "+49 176 12345678", "second": "0176 12345678", "default_region": "DE"}


def test_get_endpoints_encode_their_input(client, stub):
    client.vanity("+1 800 FLOWERS", default_region="US")
    assert stub.last["method"] == "GET"
    # A bare "+" in a URL would arrive as a space
    assert stub.last["path"] == "/api/v1/vanity?number=%2B1+800+FLOWERS&default_region=US"
    client.vanity("1-800-FLOWERS")
    assert stub.last["path"] == "/api/v1/vanity?number=1-800-FLOWERS"
    client.short_number("112", "DE")
    assert stub.last["path"] == "/api/v1/short-number?number=112&country=DE"
    client.examples("DE")
    assert stub.last["path"] == "/api/v1/examples/DE"
    client.examples("../health")
    assert stub.last["path"] == "/api/v1/examples/..%2Fhealth"


def test_input_that_is_not_a_phone_number(client, stub):
    stub.status = 400
    stub.answer = {"detail": "Invalid phone number format: use international format (+...) or pass default_region"}
    with pytest.raises(NotAPhoneNumber) as raised:
        client.lookup("hello")
    assert raised.value.status == 400
    assert "default_region" in raised.value.detail


def test_rejected_fields_are_named(client, stub):
    stub.status = 422
    stub.answer = {"detail": [{"loc": ["body", "default_region"], "msg": "Value error, unknown region code"}]}
    with pytest.raises(PhoneRiskError) as raised:
        client.lookup("+4917612345678", default_region="XX")
    assert raised.value.status == 422
    assert raised.value.detail == "default_region: Value error, unknown region code"


@pytest.mark.parametrize("status, message", [
    (401, "Invalid API key. Go to https://docs.rapidapi.com/docs/keys for more info."),
    (403, "You are not subscribed to this API."),
])
def test_key_problems_reported_by_rapidapi(client, stub, status, message):
    stub.status = status
    stub.answer = {"message": message}
    with pytest.raises(PhoneRiskError) as raised:
        client.lookup("+4917612345678")
    assert (raised.value.status, raised.value.detail) == (status, message)
    assert str(raised.value) == f"{status}: {message}"


def test_quota_used_up(client, stub):
    stub.status = 429
    stub.answer = {"message": "You have exceeded the MONTHLY quota for Requests on your current plan"}
    with pytest.raises(RateLimited) as raised:
        client.lookup("+4917612345678")
    assert raised.value.status == 429
    # One "except PhoneRiskError" catches everything the client raises
    assert isinstance(raised.value, PhoneRiskError)


def test_an_answer_that_is_not_json(client, stub):
    stub.answer = b"<html>Bad gateway</html>"
    with pytest.raises(PhoneRiskError, match="not JSON"):
        client.lookup("+4917612345678")
    stub.status = 502
    with pytest.raises(PhoneRiskError) as raised:
        client.lookup("+4917612345678")
    assert (raised.value.status, raised.value.detail) == (502, "<html>Bad gateway</html>")


def test_no_answer_at_all():
    client = PhoneRisk("test-key", base_url="http://127.0.0.1:9", timeout=2)
    with pytest.raises(PhoneRiskError) as raised:
        client.lookup("+4917612345678")
    assert raised.value.status is None
    assert "Could not reach" in raised.value.detail


def test_key_from_the_environment(stub, monkeypatch):
    monkeypatch.setenv("RAPIDAPI_KEY", "key-from-env")
    PhoneRisk(base_url=stub.url).lookup("+4917612345678")
    assert stub.last["headers"]["x-rapidapi-key"] == "key-from-env"
    monkeypatch.delenv("RAPIDAPI_KEY")
    with pytest.raises(ValueError, match="RAPIDAPI_KEY"):
        PhoneRisk()


def test_default_address(monkeypatch):
    monkeypatch.setenv("PHONERISK_BASE_URL", "http://127.0.0.1:1234/")
    assert PhoneRisk("test-key").base_url == "http://127.0.0.1:1234"
    monkeypatch.delenv("PHONERISK_BASE_URL")
    client = PhoneRisk("test-key")
    assert client.base_url == "https://phonerisk-api.p.rapidapi.com"
    assert PhoneRisk("test-key", host="other.p.rapidapi.com").base_url == "https://other.p.rapidapi.com"
