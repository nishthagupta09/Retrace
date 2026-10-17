from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import logging

from backend.app.core.config import settings
from backend.app.db.falkordb_client import ping_falkordb
from backend.app.models.schemas import HealthResponse
from backend.app.api.endpoints import router as incident_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("retrace-backend")

app = FastAPI(
    title="Retrace Incident Investigation API",
    description="Backend API powering Retrace AI incident investigation agent and graph analytics",
    version="0.1.0",
)

# Enable CORS for local React development server
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse, tags=["system"])
def health_check():
    """Health endpoint reporting backend readiness, FalkorDB connectivity, and active model."""
    db_connected = ping_falkordb()
    # Read fresh settings
    from backend.app.core.config import Settings
    current_settings = Settings()
    return HealthResponse(
        status="ok" if db_connected else "degraded",
        environment=current_settings.ENVIRONMENT,
        database="connected" if db_connected else "disconnected",
        graph=current_settings.FALKORDB_GRAPH,
        ai_provider=current_settings.AI_PROVIDER,
        groq_model=current_settings.GROQ_MODEL,
        gemini_model=current_settings.GEMINI_MODEL,
    )


# Register API routers
app.include_router(incident_router)


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("backend.app.main:app", host="0.0.0.0", port=settings.PORT, reload=True)
