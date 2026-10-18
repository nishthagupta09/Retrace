from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field
from pathlib import Path

# Resolve backend directory and repo root directory robustly
_CURRENT_DIR = Path(__file__).resolve().parent  # backend/app/core
_APP_DIR = _CURRENT_DIR.parent                   # backend/app
BACKEND_DIR = _APP_DIR.parent                   # backend
REPO_ROOT = BACKEND_DIR.parent                  # Retrace repo root

# Check candidate .env locations in order of priority:
# 1. backend/.env
# 2. repo_root/.env
def _find_env_file() -> Path:
    backend_env = BACKEND_DIR / ".env"
    if backend_env.is_file():
        return backend_env
    root_env = REPO_ROOT / ".env"
    if root_env.is_file():
        return root_env
    # Default fallback
    return backend_env

ENV_FILE = _find_env_file()


class Settings(BaseSettings):
    """Retrace Backend Application Settings."""

    ENVIRONMENT: str = Field(default="development")
    PORT: int = Field(default=8000)

    # FalkorDB Graph connection
    FALKORDB_URL: str = Field(default="")
    FALKORDB_HOST: str = Field(default="localhost")
    FALKORDB_PORT: int = Field(default=6380)
    FALKORDB_GRAPH: str = Field(default="retrace_incidents")

    # CORS settings for React Vite frontend
    CORS_ORIGINS: list[str] = Field(
        default=["http://localhost:5173", "http://127.0.0.1:5173"]
    )

    # AI Provider configuration: Groq (primary) and Google Gemini (fallback)
    GROQ_API_KEY: str = Field(default="")
    GROQ_MODEL: str = Field(default="llama-3.3-70b-versatile")
    AI_PROVIDER: str = Field(default="groq")  # 'groq' or 'gemini'

    # Google Gemini AI configuration (legacy fallback)
    GEMINI_API_KEY: str = Field(default="")
    GEMINI_MODEL: str = Field(default="gemini-2.5-flash")

    model_config = SettingsConfigDict(
        env_file=ENV_FILE,
        env_file_encoding="utf-8",
        extra="ignore",
    )


settings = Settings()
