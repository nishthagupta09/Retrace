"""
Incident Investigation Tools for Gemini Agent.

Defines the 3 predefined tools:
1. find_impact(service_name)
2. find_owner(service_name)
3. find_recent_changes(service_name)

Directly reuses the shared graph query layer (backend.app.services.graph_service)
without making redundant HTTP loops back to FastAPI.
"""

from typing import Dict, Any
import logging

from backend.app.services.graph_service import (
    fetch_service_impact,
    fetch_service_owner,
    fetch_service_recent_changes,
    ServiceNotFoundError,
    DatabaseQueryError,
)

logger = logging.getLogger(__name__)


def find_impact(service_name: str) -> Dict[str, Any]:
    """
    Find downstream dependency paths and health statuses for a given service.

    Args:
        service_name: The exact name of the service (e.g. 'WebFrontend', 'PaymentsAPI').

    Returns:
        A dictionary containing the service status and list of downstream paths with leaf service statuses.
    """
    if not isinstance(service_name, str) or not service_name.strip():
        return {
            "error": "Invalid argument: service_name must be a non-empty string",
            "service_name": service_name,
        }

    clean_name = service_name.strip()
    try:
        impact = fetch_service_impact(clean_name)
        return {
            "service_name": impact.service_name,
            "status": impact.service_status,
            "downstream_paths": [hop.model_dump() for hop in impact.downstream_paths],
        }
    except ServiceNotFoundError:
        return {
            "error": f"Service '{clean_name}' was not found in the incident graph.",
            "service_name": clean_name,
        }
    except DatabaseQueryError as e:
        logger.error(f"Database error in find_impact for {clean_name}: {e}")
        return {
            "error": "Database error while querying service impact",
            "service_name": clean_name,
        }


def find_owner(service_name: str) -> Dict[str, Any]:
    """
    Find the team responsible for a given service and contact metadata.

    Args:
        service_name: The exact name of the service (e.g. 'PaymentsAPI', 'APIGateway').

    Returns:
        A dictionary containing team name, Slack channel, and on-call responder.
    """
    if not isinstance(service_name, str) or not service_name.strip():
        return {
            "error": "Invalid argument: service_name must be a non-empty string",
            "service_name": service_name,
        }

    clean_name = service_name.strip()
    try:
        owner = fetch_service_owner(clean_name)
        return {
            "service_name": owner.service_name,
            "team_id": owner.team_id,
            "team_name": owner.team_name,
            "slack_channel": owner.slack_channel,
            "oncall_email": owner.oncall_email,
        }
    except ServiceNotFoundError:
        return {
            "error": f"Service '{clean_name}' or its owning team was not found in the incident graph.",
            "service_name": clean_name,
        }
    except DatabaseQueryError as e:
        logger.error(f"Database error in find_owner for {clean_name}: {e}")
        return {
            "error": "Database error while querying service owner",
            "service_name": clean_name,
        }


def find_recent_changes(service_name: str) -> Dict[str, Any]:
    """
    Find deployments and configuration changes associated with a service.

    Args:
        service_name: The exact name of the service (e.g. 'PaymentsAPI').

    Returns:
        A dictionary containing recent deployments with timestamps, versions, commits, and change descriptions.
    """
    if not isinstance(service_name, str) or not service_name.strip():
        return {
            "error": "Invalid argument: service_name must be a non-empty string",
            "service_name": service_name,
        }

    clean_name = service_name.strip()
    try:
        changes = fetch_service_recent_changes(clean_name)
        return {
            "service_name": changes.service_name,
            "changes": [c.model_dump() for c in changes.changes],
        }
    except ServiceNotFoundError:
        return {
            "error": f"Service '{clean_name}' was not found in the incident graph.",
            "service_name": clean_name,
        }
    except DatabaseQueryError as e:
        logger.error(f"Database error in find_recent_changes for {clean_name}: {e}")
        return {
            "error": "Database error while querying service recent changes",
            "service_name": clean_name,
        }


def find_active_incidents() -> Dict[str, Any]:
    """
    Find all active incidents and their directly affected services and statuses in FalkorDB.

    Returns:
        A dictionary containing the list of active incidents with affected services, statuses, and severities.
    """
    try:
        from backend.app.services.graph_service import fetch_all_incidents
        incidents = fetch_all_incidents()
        return {
            "incidents": [inc.model_dump() for inc in incidents],
            "total": len(incidents),
        }
    except Exception as e:
        logger.error(f"Database error in find_active_incidents: {e}")
        return {
            "error": f"Database error while querying active incidents: {e}",
            "incidents": [],
            "total": 0,
        }


# Map tool names to python callable functions
INVESTIGATION_TOOL_FUNCTIONS = {
    "find_active_incidents": find_active_incidents,
    "find_impact": find_impact,
    "find_owner": find_owner,
    "find_recent_changes": find_recent_changes,
}

# Declarable tool list for Gemini SDK
INVESTIGATION_TOOLS = [find_active_incidents, find_impact, find_owner, find_recent_changes]

# Declarable tool definitions in OpenAI/Groq compatible JSON schema
GROQ_TOOLS = [
    {
        "type": "function",
        "function": {
            "name": "find_active_incidents",
            "description": "Find all active incidents and their directly affected services and statuses in FalkorDB.",
            "parameters": {
                "type": "object",
                "properties": {},
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "find_impact",
            "description": "Find downstream dependency paths and health statuses for a given service.",
            "parameters": {
                "type": "object",
                "properties": {
                    "service_name": {
                        "type": "string",
                        "description": "The exact name of the service (e.g. 'WebFrontend', 'PaymentsAPI').",
                    },
                },
                "required": ["service_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "find_owner",
            "description": "Find the responsible engineering team and on-call contact metadata for a given service.",
            "parameters": {
                "type": "object",
                "properties": {
                    "service_name": {
                        "type": "string",
                        "description": "The exact name of the service (e.g. 'PaymentsAPI', 'APIGateway').",
                    },
                },
                "required": ["service_name"],
            },
        },
    },
    {
        "type": "function",
        "function": {
            "name": "find_recent_changes",
            "description": "Find recent deployments and configuration changes associated with a service.",
            "parameters": {
                "type": "object",
                "properties": {
                    "service_name": {
                        "type": "string",
                        "description": "The exact name of the service (e.g. 'PaymentsAPI').",
                    },
                },
                "required": ["service_name"],
            },
        },
    },
]

