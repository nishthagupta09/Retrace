"""
Tests for Retrace Gemini Incident Investigation Agent.

Tests:
1. Tool execution: find_impact, find_owner, find_recent_changes against FalkorDB.
2. Tool error handling: invalid argument, nonexistent service.
3. Missing API key handling: AgentConfigurationError -> HTTP 503.
4. Request validation: empty/short question -> HTTP 422.
5. End-to-end agent investigation with mocked Gemini Client:
   - Tool call dispatch and loop execution.
   - Structured response formatting with verified_facts, hypotheses, tool trace, and next steps.
6. Model API error handling: AgentExecutionError -> HTTP 502.
"""

from unittest.mock import MagicMock, patch
import pytest
from starlette.testclient import TestClient
from google.genai import types

from backend.app.main import app
from backend.app.agent.tools import (
    find_impact,
    find_owner,
    find_recent_changes,
)
from backend.app.agent.investigator import (
    run_investigation,
    AgentConfigurationError,
    AgentExecutionError,
)

client = TestClient(app)


# ----------------------------------------------------
# 1. Tool Execution Tests (Direct Shared Graph Layer)
# ----------------------------------------------------
def test_tool_find_impact():
    """Verify find_impact returns structured dependency paths."""
    res = find_impact("WebFrontend")
    assert res["service_name"] == "WebFrontend"
    assert res["status"] == "degraded"
    assert len(res["downstream_paths"]) > 0
    leaf_names = [p["leaf_service"] for p in res["downstream_paths"]]
    assert "PaymentsAPI" in leaf_names


def test_tool_find_owner():
    """Verify find_owner returns team and on-call info."""
    res = find_owner("PaymentsAPI")
    assert res["service_name"] == "PaymentsAPI"
    assert res["team_name"] == "Checkout & Payments"
    assert res["oncall_email"] == "alice@company.com"


def test_tool_find_recent_changes():
    """Verify find_recent_changes returns deployments."""
    res = find_recent_changes("PaymentsAPI")
    assert res["service_name"] == "PaymentsAPI"
    assert len(res["changes"]) >= 1
    assert res["changes"][0]["version"] == "v2.4.1"


def test_tool_argument_validation():
    """Verify tools handle invalid or empty arguments safely."""
    res1 = find_impact("")
    assert "error" in res1
    assert "Invalid argument" in res1["error"]

    res2 = find_owner(None)  # type: ignore
    assert "error" in res2

    res3 = find_recent_changes("   ")
    assert "error" in res3


def test_tool_nonexistent_service():
    """Verify tools return graceful error message for unknown services."""
    res = find_impact("GhostService404")
    assert "error" in res
    assert "not found" in res["error"].lower()


# ----------------------------------------------------
# 2. Agent Unit & Integration Tests (Mocked Gemini)
# ----------------------------------------------------
def test_investigate_request_validation():
    """Verify POST /api/investigate rejects questions that are too short."""
    res = client.post("/api/investigate", json={"question": "no"})
    assert res.status_code == 422


def test_missing_api_key_returns_503():
    """Verify endpoint returns 503 when configured AI provider key is unset or missing."""
    with patch("backend.app.agent.investigator.Settings") as MockSettings:
        mock_settings_instance = MagicMock()
        mock_settings_instance.AI_PROVIDER = "groq"
        mock_settings_instance.GROQ_API_KEY = ""
        mock_settings_instance.GEMINI_API_KEY = ""
        mock_settings_instance.GROQ_MODEL = "llama-3.3-70b-versatile"
        MockSettings.return_value = mock_settings_instance

        res = client.post(
            "/api/investigate",
            json={"question": "Why is the Payments API failing?"},
        )
        assert res.status_code == 503
        assert "GROQ_API_KEY is not configured" in res.json()["detail"]


def test_settings_resolves_backend_env_file():
    """
    Verify settings loader reliably finds backend/.env regardless of CWD.
    Confirms key presence without logging, printing, or returning its value.
    """
    from backend.app.core.config import Settings, BACKEND_DIR, ENV_FILE
    
    assert ENV_FILE.name == ".env"
    assert ENV_FILE.is_file()
    assert ENV_FILE.parent == BACKEND_DIR
    
    fresh_settings = Settings()
    # Check that configured AI key (GROQ_API_KEY or GEMINI_API_KEY) is non-empty
    has_groq_key = bool(fresh_settings.GROQ_API_KEY and fresh_settings.GROQ_API_KEY != "your_groq_api_key_here")
    assert has_groq_key is True
    assert fresh_settings.AI_PROVIDER in ("groq", "gemini")


def test_agent_get_gemini_client_reads_key():
    """
    Verify get_gemini_client instantiates or raises appropriate AgentConfigurationError.
    """
    from backend.app.agent.investigator import get_gemini_client
    
    # When api_key is provided, get_gemini_client creates a client without error
    genai_client = get_gemini_client(api_key="mock_test_key_gemini")
    assert genai_client is not None



def test_agent_investigation_flow_with_mocked_gemini():
    """
    Test full multi-turn agent flow:
    Turn 1: Gemini decides to call find_impact and find_owner on PaymentsAPI.
    Turn 2: Gemini receives tool outputs and produces synthesis.
    """
    mock_client = MagicMock()

    # Turn 1: Model requests two function calls
    turn_1_candidate = types.Candidate(
        content=types.Content(
            role="model",
            parts=[
                types.Part.from_function_call(name="find_impact", args={"service_name": "PaymentsAPI"}),
                types.Part.from_function_call(name="find_owner", args={"service_name": "PaymentsAPI"}),
            ],
        )
    )
    turn_1_response = types.GenerateContentResponse(
        candidates=[turn_1_candidate],
    )

    # Turn 2: Model finishes with textual analysis
    turn_2_text = (
        "Based on graph analysis, PaymentsAPI is failing due to an unreachable database dependency "
        "PaymentsPostgresDB. The owning team is Checkout & Payments."
    )
    turn_2_candidate = types.Candidate(
        content=types.Content(
            role="model",
            parts=[types.Part.from_text(text=turn_2_text)],
        )
    )
    turn_2_response = types.GenerateContentResponse(
        candidates=[turn_2_candidate],
    )


    # Assign side effects to simulate turns 1 and 2
    mock_client.models.generate_content.side_effect = [
        turn_1_response,
        turn_2_response,
    ]

    response = run_investigation(
        question="What is the root cause of the PaymentsAPI failure?",
        client=mock_client,
    )

    assert response.question == "What is the root cause of the PaymentsAPI failure?"
    assert turn_2_text in response.answer
    assert len(response.tool_calls) == 2
    assert response.tool_calls[0].tool == "find_impact"
    assert response.tool_calls[1].tool == "find_owner"

    # Verify structured facts were parsed
    facts_str = " ".join(response.verified_facts)
    assert "PaymentsAPI" in facts_str
    assert "Checkout & Payments" in facts_str

    # Verify actionable next steps were extracted
    steps_str = " ".join(response.recommended_next_steps)
    assert "alice@company.com" in steps_str


def test_tool_find_active_incidents():
    """Verify find_active_incidents retrieves real incidents and affected services from FalkorDB."""
    from backend.app.agent.tools import find_active_incidents
    res = find_active_incidents()
    assert "incidents" in res
    assert res["total"] >= 1
    inc = next((i for i in res["incidents"] if i["id"] == "INC-8401"), None)
    assert inc is not None
    assert inc["severity"] == "SEV-1"
    affected = [s["name"] for s in inc["affected_services"]]
    assert "PaymentsAPI" in affected


def test_single_failing_service_ownership_investigation():
    """
    Verify investigation behavior for 'Which team owns the failing service and who is on call?':
    Turn 1: Gemini calls find_active_incidents to discover active incidents and services.
    Turn 2: Gemini calls find_owner on the single identified failing service ('PaymentsAPI').
    Turn 3: Gemini returns direct answer with owning team and on-call contact without clarification.
    """
    mock_client = MagicMock()

    turn_1_candidate = types.Candidate(
        content=types.Content(
            role="model",
            parts=[
                types.Part.from_function_call(name="find_active_incidents", args={}),
            ],
        )
    )
    turn_1_response = types.GenerateContentResponse(candidates=[turn_1_candidate])

    turn_2_candidate = types.Candidate(
        content=types.Content(
            role="model",
            parts=[
                types.Part.from_function_call(name="find_owner", args={"service_name": "PaymentsAPI"}),
            ],
        )
    )
    turn_2_response = types.GenerateContentResponse(candidates=[turn_2_candidate])

    turn_3_text = (
        "The single failing service is PaymentsAPI (status: failing). "
        "It is owned by Checkout & Payments, and the primary on-call contact is alice@company.com."
    )
    turn_3_candidate = types.Candidate(
        content=types.Content(
            role="model",
            parts=[types.Part.from_text(text=turn_3_text)],
        )
    )
    turn_3_response = types.GenerateContentResponse(candidates=[turn_3_candidate])

    mock_client.models.generate_content.side_effect = [
        turn_1_response,
        turn_2_response,
        turn_3_response,
    ]

    response = run_investigation(
        question="Which team owns the failing service and who is on call?",
        client=mock_client,
    )

    assert len(response.tool_calls) == 2
    assert response.tool_calls[0].tool == "find_active_incidents"
    assert response.tool_calls[1].tool == "find_owner"
    assert "Checkout & Payments" in response.answer
    assert "alice@company.com" in response.answer


def test_multiple_failing_services_asks_clarification():
    """
    Verify investigation behavior when multiple services are failing:
    If graph shows multiple failing services, the model explains ambiguity and asks for clarification.
    """
    mock_client = MagicMock()

    turn_1_candidate = types.Candidate(
        content=types.Content(
            role="model",
            parts=[
                types.Part.from_function_call(name="find_active_incidents", args={}),
            ],
        )
    )
    turn_1_response = types.GenerateContentResponse(candidates=[turn_1_candidate])

    turn_2_text = (
        "Multiple failing services were identified: PaymentsAPI and AuthService. "
        "Which service would you like to investigate?"
    )
    turn_2_candidate = types.Candidate(
        content=types.Content(
            role="model",
            parts=[types.Part.from_text(text=turn_2_text)],
        )
    )
    turn_2_response = types.GenerateContentResponse(candidates=[turn_2_candidate])

    mock_client.models.generate_content.side_effect = [
        turn_1_response,
        turn_2_response,
    ]

    response = run_investigation(
        question="Which team owns the failing service?",
        client=mock_client,
    )

    assert len(response.tool_calls) == 1
    assert response.tool_calls[0].tool == "find_active_incidents"
    assert "Multiple failing services" in response.answer


def test_agent_quota_error_returns_429():
    """Verify endpoint returns 429 with Retry-After header on quota exhaustion."""
    mock_client = MagicMock()
    mock_client.chat.completions.create.side_effect = Exception(
        "429 Resource has been exhausted (e.g. check quota). Please retry after 35s."
    )

    with patch("backend.app.agent.investigator.get_groq_client", return_value=mock_client):
        res = client.post(
            "/api/investigate",
            json={"question": "Which team owns the failing service?"},
        )
        assert res.status_code == 429
        assert "temporarily unavailable" in res.json()["detail"].lower() or "rate limits" in res.json()["detail"].lower()
        assert res.headers.get("retry-after") == "35"


def test_agent_api_model_error_returns_502():
    """Verify endpoint returns 502 when model call raises an unclassified API error."""
    mock_client = MagicMock()
    mock_client.chat.completions.create.side_effect = RuntimeError("Internal server connection failure")

    with patch("backend.app.agent.investigator.get_groq_client", return_value=mock_client):
        res = client.post(
            "/api/investigate",
            json={"question": "Why is the Payments API failing?"},
        )
        assert res.status_code == 502
        assert "execution error" in res.json()["detail"].lower()


# ----------------------------------------------------
# 3. Groq Agent Tests
# ----------------------------------------------------
def test_missing_groq_api_key_returns_503():
    """Verify endpoint returns 503 when GROQ_API_KEY is not configured."""
    with patch("backend.app.agent.investigator.Settings") as MockSettings:
        mock_settings_instance = MagicMock()
        mock_settings_instance.AI_PROVIDER = "groq"
        mock_settings_instance.GROQ_API_KEY = ""
        mock_settings_instance.GEMINI_API_KEY = ""
        MockSettings.return_value = mock_settings_instance

        res = client.post(
            "/api/investigate",
            json={"question": "Which team owns the failing service?"},
        )
        assert res.status_code == 503
        assert "GROQ_API_KEY is not configured" in res.json()["detail"]


def test_groq_agent_rate_limit_error_returns_429():
    """Verify Groq rate limit errors (429) return HTTP 429 with Retry-After header."""
    mock_client = MagicMock()
    mock_client.chat.completions.create.side_effect = Exception(
        "Error code: 429 - {'error': {'message': 'Rate limit reached for model llama-3.3-70b-versatile. Please try again in 22s.', 'type': 'tokens_per_minute'}}"
    )

    with patch("backend.app.agent.investigator.get_groq_client", return_value=mock_client):
        res = client.post(
            "/api/investigate",
            json={"question": "Which team owns the failing service?"},
        )
        assert res.status_code == 429
        assert "rate limits" in res.json()["detail"].lower()
        assert res.headers.get("retry-after") == "22"


def test_groq_agent_invalid_key_returns_503():
    """Verify Groq invalid API key returns HTTP 503 with helpful detail."""
    mock_client = MagicMock()
    mock_client.chat.completions.create.side_effect = Exception(
        "Error code: 401 - {'error': {'message': 'Invalid API Key', 'type': 'invalid_request_error'}}"
    )

    with patch("backend.app.agent.investigator.get_groq_client", return_value=mock_client):
        res = client.post(
            "/api/investigate",
            json={"question": "Which team owns the failing service?"},
        )
        assert res.status_code == 503
        assert "Invalid GROQ_API_KEY" in res.json()["detail"]


def test_groq_agent_investigation_multi_turn_flow():
    """
    Verify full multi-turn agent flow with Groq format:
    Turn 1: Groq requests tool call find_active_incidents.
    Turn 2: Groq receives incident data and requests find_owner for PaymentsAPI.
    Turn 3: Groq produces final textual answer.
    """
    mock_client = MagicMock()

    # Tool call 1 mock
    mock_tool_call_1 = MagicMock()
    mock_tool_call_1.id = "call_abc123"
    mock_tool_call_1.function.name = "find_active_incidents"
    mock_tool_call_1.function.arguments = "{}"

    mock_msg_turn_1 = MagicMock()
    mock_msg_turn_1.content = None
    mock_msg_turn_1.tool_calls = [mock_tool_call_1]

    mock_resp_1 = MagicMock()
    mock_resp_1.choices = [MagicMock(message=mock_msg_turn_1)]

    # Tool call 2 mock
    mock_tool_call_2 = MagicMock()
    mock_tool_call_2.id = "call_def456"
    mock_tool_call_2.function.name = "find_owner"
    mock_tool_call_2.function.arguments = '{"service_name": "PaymentsAPI"}'

    mock_msg_turn_2 = MagicMock()
    mock_msg_turn_2.content = None
    mock_msg_turn_2.tool_calls = [mock_tool_call_2]

    mock_resp_2 = MagicMock()
    mock_resp_2.choices = [MagicMock(message=mock_msg_turn_2)]

    # Final turn
    final_text = (
        "The single failing service identified in the graph is PaymentsAPI. "
        "It is owned by Checkout & Payments, with on-call responder alice@company.com."
    )
    mock_msg_turn_3 = MagicMock()
    mock_msg_turn_3.content = final_text
    mock_msg_turn_3.tool_calls = None

    mock_resp_3 = MagicMock()
    mock_resp_3.choices = [MagicMock(message=mock_msg_turn_3)]

    mock_client.chat.completions.create.side_effect = [
        mock_resp_1,
        mock_resp_2,
        mock_resp_3,
    ]

    from backend.app.agent.investigator import run_groq_investigation
    response = run_groq_investigation(
        question="Which team owns the failing service and who is on call?",
        client=mock_client,
    )

    assert len(response.tool_calls) == 2
    assert response.tool_calls[0].tool == "find_active_incidents"
    assert response.tool_calls[1].tool == "find_owner"
    assert "Checkout & Payments" in response.answer
    assert "alice@company.com" in response.answer

    # Verify verified facts
    facts_str = " ".join(response.verified_facts)
    assert "PaymentsAPI" in facts_str
    assert "Checkout & Payments" in facts_str
