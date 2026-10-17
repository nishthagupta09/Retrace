from typing import Optional, List, Any
from pydantic import BaseModel, Field


# ----------------------------------------------------
# Health Check Models
# ----------------------------------------------------
class HealthResponse(BaseModel):
    status: str = Field(description="Overall backend status ('ok' or 'degraded')")
    environment: str = Field(description="Active environment")
    database: str = Field(description="FalkorDB connection status ('connected' or 'disconnected')")
    graph: str = Field(description="Target graph name")
    ai_provider: Optional[str] = Field(default="groq", description="Configured primary AI provider")
    groq_model: Optional[str] = Field(default=None, description="Configured Groq API model ID")
    gemini_model: Optional[str] = Field(default=None, description="Configured Gemini API model ID")


# ----------------------------------------------------
# Service & Incident Models
# ----------------------------------------------------
class AffectedService(BaseModel):
    name: str
    status: str
    tier: Optional[str] = None


class IncidentResponse(BaseModel):
    id: str
    title: str
    severity: str
    status: str
    started_at: Optional[str] = None
    affected_services: List[AffectedService] = []


class DependencyHop(BaseModel):
    path: List[str] = Field(description="Ordered list of service names in traversal path")
    leaf_service: str
    leaf_status: str


class ServiceImpactResponse(BaseModel):
    service_name: str
    service_status: str
    downstream_paths: List[DependencyHop] = []


class GraphTopologyNode(BaseModel):
    id: str
    name: str
    status: str
    tier: Optional[str] = None
    team_name: Optional[str] = None
    oncall_email: Optional[str] = None
    slack_channel: Optional[str] = None
    recent_changes_count: int = 0


class GraphTopologyEdge(BaseModel):
    from_node: str
    to_node: str
    type: str  # "DEPENDS_ON", "OWNS", "CHANGED"
    critical: Optional[bool] = None
    protocol: Optional[str] = None


class GraphTopologyResponse(BaseModel):
    nodes: List[GraphTopologyNode] = []
    edges: List[GraphTopologyEdge] = []
    teams: List[str] = []
    statuses: List[str] = []



# ----------------------------------------------------
# Team Ownership Models
# ----------------------------------------------------
class ServiceOwnerResponse(BaseModel):
    service_name: str
    team_id: str
    team_name: str
    slack_channel: Optional[str] = None
    oncall_email: Optional[str] = None


# ----------------------------------------------------
# Deployment Change Models
# ----------------------------------------------------
class DeploymentChange(BaseModel):
    id: str
    version: str
    commit: Optional[str] = None
    deployed_by: Optional[str] = None
    timestamp: str
    description: str


class ServiceRecentChangesResponse(BaseModel):
    service_name: str
    changes: List[DeploymentChange] = []


# ----------------------------------------------------
# Incident Agent Investigation Models
# ----------------------------------------------------
class ToolCallRecord(BaseModel):
    tool: str = Field(description="Name of the executed tool")
    arguments: dict = Field(description="Arguments passed to the tool")
    result: Any = Field(description="Output returned from the tool")


class InvestigationRequest(BaseModel):
    question: str = Field(
        ...,
        min_length=3,
        max_length=1000,
        description="Investigation prompt or question about an incident/service",
        examples=["Why is the Payments API failing and who is on call?"],
    )


class InvestigationResponse(BaseModel):
    question: str = Field(description="The original investigation query")
    answer: str = Field(description="Synthesis produced by the AI investigation agent")
    verified_facts: List[str] = Field(
        default=[],
        description="Graph-verified facts directly discovered during investigation",
    )
    hypotheses: List[str] = Field(
        default=[],
        description="Plausible inferences and hypotheses clearly separated from facts",
    )
    tool_calls: List[ToolCallRecord] = Field(
        default=[],
        description="Trace of tool calls executed against the graph during investigation",
    )
    recommended_next_steps: List[str] = Field(
        default=[],
        description="Actionable next steps for on-call responders",
    )


# ----------------------------------------------------
# System Graph Topology Models (Graph Explorer)
# ----------------------------------------------------
class GraphTopologyNode(BaseModel):
    id: str
    name: str
    status: str
    tier: Optional[str] = None
    team_name: Optional[str] = None
    oncall_email: Optional[str] = None
    slack_channel: Optional[str] = None
    recent_changes_count: int = 0


class GraphTopologyEdge(BaseModel):
    from_node: str
    to_node: str
    type: str = "DEPENDS_ON"
    protocol: Optional[str] = None
    critical: Optional[bool] = None


class GraphTopologyResponse(BaseModel):
    nodes: List[GraphTopologyNode] = []
    edges: List[GraphTopologyEdge] = []
    teams: List[str] = []
    statuses: List[str] = []

