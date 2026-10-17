"""
Retrace Incident Investigation Agent.

Orchestrates the multi-turn interaction with Google Gemini using the official
google-genai SDK, executing graph investigation tools and structuring the response.
"""

import json
from typing import List, Dict, Any, Optional
import logging

from backend.app.core.config import settings, Settings
from backend.app.models.schemas import ToolCallRecord, InvestigationResponse
from backend.app.agent.tools import (
    INVESTIGATION_TOOLS,
    INVESTIGATION_TOOL_FUNCTIONS,
    GROQ_TOOLS,
)
from backend.app.agent.prompts import INVESTIGATION_SYSTEM_INSTRUCTION

logger = logging.getLogger(__name__)

MAX_AGENT_TURNS = 5


class AgentConfigurationError(Exception):
    """Raised when the agent lacks required credentials or configuration."""
    pass


class AgentExecutionError(Exception):
    """Raised when model inference or tool dispatch encounters an unrecoverable error."""
    pass


class AgentQuotaExceededError(Exception):
    """Raised when the API returns a rate-limit or quota-exceeded error (e.g. HTTP 429)."""
    def __init__(self, message: str, retry_after_seconds: Optional[int] = None):
        super().__init__(message)
        self.message = message
        self.retry_after_seconds = retry_after_seconds


def get_groq_client(api_key: Optional[str] = None):
    """Instantiate and return the Groq client or OpenAI-compatible client."""
    current_settings = Settings()
    key = (api_key or current_settings.GROQ_API_KEY).strip()
    if not key or key == "your_groq_api_key_here":
        raise AgentConfigurationError(
            "GROQ_API_KEY is not configured. Please set a valid key in backend/.env"
        )
    try:
        from groq import Groq
        return Groq(api_key=key)
    except ImportError:
        # Fallback to httpx-based lightweight client or OpenAI SDK if groq library not yet installed
        raise AgentConfigurationError(
            "groq Python package is not installed. Please install 'groq>=0.11.0'."
        )


def get_gemini_client(api_key: Optional[str] = None):
    """Instantiate and return the official google-genai Client (legacy fallback)."""
    current_settings = Settings()
    key = (api_key or current_settings.GEMINI_API_KEY).strip()
    if not key or key == "your_gemini_api_key_here":
        raise AgentConfigurationError(
            "GEMINI_API_KEY is not configured. Please set a valid key in backend/.env"
        )
    from google import genai
    return genai.Client(api_key=key)


def run_groq_investigation(
    question: str, client: Any = None
) -> InvestigationResponse:
    """
    Run an autonomous investigation loop using Groq and FalkorDB graph tools.
    1. Sends user question with system instructions and tools schema to Groq.
    2. Inspects model response for tool_calls.
    3. Executes each tool call against FalkorDB and appends tool messages.
    4. Repeats until model returns text answer or MAX_AGENT_TURNS is reached.
    5. Returns structured facts, hypotheses, tool calls trace, and next steps.
    """
    current_settings = Settings()
    if client is None:
        client = get_groq_client()

    model_name = current_settings.GROQ_MODEL or "llama-3.3-70b-versatile"
    executed_tools: List[ToolCallRecord] = []

    messages = [
        {"role": "system", "content": INVESTIGATION_SYSTEM_INSTRUCTION},
        {"role": "user", "content": question},
    ]

    final_text = ""
    turn_count = 0

    try:
        while turn_count < MAX_AGENT_TURNS:
            turn_count += 1
            logger.info(f"Groq agent turn {turn_count} requesting model: {model_name}")

            response = client.chat.completions.create(
                model=model_name,
                messages=messages,
                tools=GROQ_TOOLS,
                tool_choice="auto",
                temperature=0.2,
            )

            choice = response.choices[0]
            message = choice.message

            # Append assistant message to chat history
            messages.append(message)

            # Check if model requested tool calls
            tool_calls = getattr(message, "tool_calls", None)
            if not tool_calls:
                final_text = message.content or ""
                break

            # Execute tool calls and prepare tool responses
            for tool_call in tool_calls:
                func_name = tool_call.function.name
                func_args_str = tool_call.function.arguments or "{}"
                try:
                    func_args = json.loads(func_args_str) if isinstance(func_args_str, str) else (func_args_str or {})
                except Exception:
                    func_args = {}

                logger.info(f"Groq agent executing tool '{func_name}' with args: {func_args}")

                if func_name in INVESTIGATION_TOOL_FUNCTIONS:
                    tool_fn = INVESTIGATION_TOOL_FUNCTIONS[func_name]
                    try:
                        tool_result = tool_fn(**func_args)
                    except Exception as err:
                        tool_result = {"error": f"Error executing tool '{func_name}': {str(err)}"}
                else:
                    tool_result = {"error": f"Unknown tool '{func_name}' requested"}

                executed_tools.append(
                    ToolCallRecord(
                        tool=func_name,
                        arguments=func_args,
                        result=tool_result,
                    )
                )

                messages.append(
                    {
                        "role": "tool",
                        "tool_call_id": tool_call.id,
                        "name": func_name,
                        "content": json.dumps(tool_result),
                    }
                )

        if not final_text and turn_count >= MAX_AGENT_TURNS:
            final_text = "Investigation concluded following graph evidence traversal."

    except Exception as e:
        err_msg = str(e)
        logger.error(f"Groq API error during investigation: {err_msg}")

        # Check for Rate Limit / Quota Exceeded (HTTP 429)
        import re
        is_429 = (
            "429" in err_msg
            or "rate_limit_exceeded" in err_msg.lower()
            or "tokens per minute" in err_msg.lower()
            or "requests per minute" in err_msg.lower()
            or "quota" in err_msg.lower()
        )
        if is_429:
            retry_match = re.search(r"(?:try again in|retry after)\s+(\d+(?:\.\d+)?)\s*s", err_msg, re.IGNORECASE)
            retry_sec = int(float(retry_match.group(1))) if retry_match else None
            msg = (
                "AI incident investigations are temporarily unavailable due to Groq API rate limits. "
                "Graph Explorer and FalkorDB dependency queries remain fully operational."
            )
            if retry_sec:
                msg += f" Please retry in approximately {retry_sec} seconds."
            raise AgentQuotaExceededError(msg, retry_after_seconds=retry_sec) from e

        # Check for Invalid Key / Authentication error (HTTP 401)
        if "401" in err_msg or "invalid api key" in err_msg.lower():
            raise AgentConfigurationError(
                "Invalid GROQ_API_KEY. Please verify your Groq API key in backend/.env."
            ) from e

        # Check for Model not found / unavailable (HTTP 404 / 400)
        if "model_not_found" in err_msg.lower() or "does not exist" in err_msg.lower():
            raise AgentConfigurationError(
                f"Groq model '{model_name}' is unavailable or not accessible to this account."
            ) from e

        raise AgentExecutionError(f"Groq investigation execution error: {err_msg}") from e

    # Extract structured sections from the agent's response and tool calls
    facts, hypotheses, next_steps = _extract_investigation_insights(
        final_text, executed_tools
    )

    return InvestigationResponse(
        question=question,
        answer=final_text,
        verified_facts=facts,
        hypotheses=hypotheses,
        tool_calls=executed_tools,
        recommended_next_steps=next_steps,
    )


def run_gemini_investigation(
    question: str, client: Any = None
) -> InvestigationResponse:
    """Run investigation using Gemini SDK (fallback)."""
    from google import genai
    from google.genai import types

    current_settings = Settings()
    if client is None:
        client = get_gemini_client()

    model_name = current_settings.GEMINI_MODEL or "gemini-2.5-flash"
    executed_tools: List[ToolCallRecord] = []

    config = types.GenerateContentConfig(
        system_instruction=INVESTIGATION_SYSTEM_INSTRUCTION,
        tools=INVESTIGATION_TOOLS,
        automatic_function_calling=types.AutomaticFunctionCallingConfig(disable=True),
        temperature=0.2,
    )

    contents: List[types.Content] = [
        types.Content(
            role="user",
            parts=[types.Part.from_text(text=question)],
        )
    ]

    final_text = ""
    turn_count = 0

    try:
        while turn_count < MAX_AGENT_TURNS:
            turn_count += 1
            response = client.models.generate_content(
                model=model_name,
                contents=contents,
                config=config,
            )

            candidates = response.candidates or []
            if not candidates:
                raise AgentExecutionError("Gemini returned no candidates in response.")

            candidate = candidates[0]
            contents.append(candidate.content)

            function_calls = response.function_calls
            if not function_calls:
                final_text = response.text or ""
                break

            tool_response_parts: List[types.Part] = []
            for call in function_calls:
                func_name = call.name
                func_args = call.args or {}
                if func_name in INVESTIGATION_TOOL_FUNCTIONS:
                    tool_fn = INVESTIGATION_TOOL_FUNCTIONS[func_name]
                    try:
                        tool_result = tool_fn(**func_args)
                    except Exception as err:
                        tool_result = {"error": str(err)}
                else:
                    tool_result = {"error": f"Unknown tool '{func_name}'"}

                executed_tools.append(
                    ToolCallRecord(tool=func_name, arguments=func_args, result=tool_result)
                )
                tool_response_parts.append(
                    types.Part.from_function_response(
                        name=func_name,
                        response={"result": tool_result},
                    )
                )

            contents.append(types.Content(role="user", parts=tool_response_parts))

        if not final_text and response.text:
            final_text = response.text

    except Exception as e:
        err_msg = str(e)
        if "429" in err_msg or "RESOURCE_EXHAUSTED" in err_msg or "quota" in err_msg.lower():
            raise AgentQuotaExceededError(
                "AI incident investigations are temporarily unavailable due to Gemini API free-tier quota limits. "
                "Graph Explorer and FalkorDB dependency queries remain fully operational."
            ) from e
        raise AgentExecutionError(f"Gemini execution error: {err_msg}") from e

    facts, hypotheses, next_steps = _extract_investigation_insights(
        final_text, executed_tools
    )

    return InvestigationResponse(
        question=question,
        answer=final_text,
        verified_facts=facts,
        hypotheses=hypotheses,
        tool_calls=executed_tools,
        recommended_next_steps=next_steps,
    )


def run_investigation(
    question: str, client: Any = None
) -> InvestigationResponse:
    """
    Main investigation entrypoint.
    Dispatches to Groq when configured, or Gemini as fallback.
    """
    if not question or not question.strip():
        raise ValueError("Investigation question cannot be empty")

    current_settings = Settings()
    # Check if Groq is requested/configured, or if custom client provided
    provider = (current_settings.AI_PROVIDER or "groq").lower()

    # If a custom Gemini client is passed (e.g. In unit tests), or provider is gemini
    if client is not None and hasattr(client, "models"):
        return run_gemini_investigation(question=question, client=client)

    if provider == "groq" or (current_settings.GROQ_API_KEY and not current_settings.GEMINI_API_KEY):
        return run_groq_investigation(question=question, client=client)
    else:
        # Gemini fallback
        return run_gemini_investigation(question=question, client=client)


def _extract_investigation_insights(
    text: str, tool_records: List[ToolCallRecord]
) -> tuple[List[str], List[str], List[str]]:
    """
    Extract verified facts from tool execution records and synthesize
    hypotheses and actionable next steps.
    """
    verified_facts: List[str] = []
    hypotheses: List[str] = []
    next_steps: List[str] = []

    for record in tool_records:
        res = record.result
        if not isinstance(res, dict) or "error" in res:
            continue

        if record.tool == "find_impact":
            srv = res.get("service_name")
            status = res.get("status")
            paths = res.get("downstream_paths", [])
            verified_facts.append(
                f"Service '{srv}' is currently in '{status}' status with {len(paths)} downstream dependency path(s)."
            )
            for p in paths:
                leaf = p.get("leaf_service")
                leaf_status = p.get("leaf_status")
                if leaf_status in ("failing", "unreachable", "degraded"):
                    verified_facts.append(
                        f"Downstream dependency '{leaf}' is '{leaf_status}' along path: {' -> '.join(p.get('path', []))}."
                    )

        elif record.tool == "find_owner":
            srv = res.get("service_name")
            team = res.get("team_name")
            slack = res.get("slack_channel")
            oncall = res.get("oncall_email")
            verified_facts.append(
                f"Service '{srv}' is owned by '{team}' (Slack: {slack}, On-Call: {oncall})."
            )
            next_steps.append(
                f"Page or notify on-call responder {oncall} in {slack} for service '{srv}'."
            )

        elif record.tool == "find_recent_changes":
            srv = res.get("service_name")
            changes = res.get("changes", [])
            if changes:
                for c in changes:
                    v = c.get("version")
                    ts = c.get("timestamp")
                    desc = c.get("description")
                    verified_facts.append(
                        f"Recent deployment {v} deployed to '{srv}' at {ts}: '{desc}'."
                    )
                    hypotheses.append(
                        f"Deployment {v} on '{srv}' altered configurations ('{desc}') shortly before degradation and is a primary suspect."
                    )
                    next_steps.append(
                        f"Review commit diff and evaluate rollback for deployment {v} on service '{srv}'."
                    )
            else:
                verified_facts.append(f"No recent deployments found for service '{srv}'.")

    # Add general fallback next step if empty
    if not next_steps:
        next_steps.append("Check application logs and health metrics for the affected services.")

    # Deduplicate while preserving order
    return (
        list(dict.fromkeys(verified_facts)),
        list(dict.fromkeys(hypotheses)),
        list(dict.fromkeys(next_steps)),
    )
