from fastapi import APIRouter, HTTPException, Path
from typing import List
import logging

from backend.app.models.schemas import (
    IncidentResponse,
    ServiceImpactResponse,
    ServiceOwnerResponse,
    ServiceRecentChangesResponse,
    InvestigationRequest,
    InvestigationResponse,
    GraphTopologyResponse,
)
from backend.app.services.graph_service import (
    fetch_all_incidents,
    fetch_service_impact,
    fetch_service_owner,
    fetch_service_recent_changes,
    fetch_system_topology,
    ServiceNotFoundError,
    DatabaseQueryError,
)
from backend.app.agent.investigator import (
    run_investigation,
    AgentConfigurationError,
    AgentExecutionError,
    AgentQuotaExceededError,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api", tags=["incidents-and-services"])


@router.get("/incidents", response_model=List[IncidentResponse])
def get_active_incidents():
    """Return all incidents and their directly affected services."""
    try:
        return fetch_all_incidents()
    except DatabaseQueryError as e:
        logger.error(f"Error fetching incidents: {e}")
        raise HTTPException(
            status_code=500, detail="Database failure fetching incidents"
        )


@router.get("/services/{service_name}/impact", response_model=ServiceImpactResponse)
def get_service_impact(
    service_name: str = Path(..., min_length=1, max_length=100, description="Service name")
):
    """Return downstream dependency paths and service statuses for a given service."""
    try:
        return fetch_service_impact(service_name)
    except ServiceNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except DatabaseQueryError as e:
        logger.error(f"Error fetching service impact for '{service_name}': {e}")
        raise HTTPException(
            status_code=500, detail="Database failure evaluating service impact"
        )


@router.get("/services/{service_name}/owner", response_model=ServiceOwnerResponse)
def get_service_owner(
    service_name: str = Path(..., min_length=1, max_length=100, description="Service name")
):
    """Return the team responsible for a given service with available contact channels."""
    try:
        return fetch_service_owner(service_name)
    except ServiceNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except DatabaseQueryError as e:
        logger.error(f"Error fetching service owner for '{service_name}': {e}")
        raise HTTPException(
            status_code=500, detail="Database failure fetching service owner"
        )


@router.get(
    "/services/{service_name}/recent-changes",
    response_model=ServiceRecentChangesResponse,
)
def get_service_recent_changes(
    service_name: str = Path(..., min_length=1, max_length=100, description="Service name")
):
    """Return deployments and configuration changes associated with the service."""
    try:
        return fetch_service_recent_changes(service_name)
    except ServiceNotFoundError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except DatabaseQueryError as e:
        logger.error(f"Error fetching recent changes for '{service_name}': {e}")
        raise HTTPException(
            status_code=500, detail="Database failure fetching service changes"
        )


@router.post("/investigate", response_model=InvestigationResponse)
def investigate_incident(request: InvestigationRequest):
    """
    Run an autonomous AI incident investigation using Gemini and FalkorDB graph tools.
    """
    try:
        return run_investigation(question=request.question)
    except AgentConfigurationError as e:
        logger.warning(f"Agent configuration error: {e}")
        raise HTTPException(status_code=503, detail=str(e))
    except AgentQuotaExceededError as e:
        logger.warning(f"Agent quota exceeded: {e}")
        headers = {}
        if getattr(e, "retry_after_seconds", None):
            headers["Retry-After"] = str(e.retry_after_seconds)
        raise HTTPException(status_code=429, detail=str(e), headers=headers)
    except AgentExecutionError as e:
        logger.error(f"Agent execution failure: {e}")
        raise HTTPException(status_code=502, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    except Exception as e:
        logger.error(f"Unexpected investigation error: {e}")
        raise HTTPException(status_code=500, detail=f"Investigation failed: {str(e)}")



@router.get("/graph/topology", response_model=GraphTopologyResponse)
def get_system_topology():
    """Return all services, their metadata, and active dependency relationships."""
    try:
        return fetch_system_topology()
    except DatabaseQueryError as e:
        logger.error(f"Error fetching system topology: {e}")
        raise HTTPException(status_code=500, detail="Database failure fetching topology")


