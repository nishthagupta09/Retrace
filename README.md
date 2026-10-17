# Retrace - AI-Powered Incident Investigation Agent

An incident root-cause analysis agent combining graph databases (FalkorDB), Groq API (`groq`), and an interactive incident dashboard.

---

## Architecture Overview

- **Frontend**: React + Vite + Tailwind CSS
- **Backend**: Python 3.11+ / FastAPI
- **Knowledge Graph**: FalkorDB (via Docker)
- **Intelligence**: Groq API (`llama-3.3-70b-versatile`) with Google Gemini fallback

---

## Directory Layout

```text
Retrace/
├── backend/                  # FastAPI backend
│   ├── app/
│   │   ├── api/              # API endpoints / route handlers
│   │   ├── core/             # Configuration & security settings
│   │   ├── db/               # FalkorDB client connection & driver
│   │   ├── models/           # Pydantic schemas and domain models
│   │   ├── agent/            # Gemini AI incident investigation agent & tools
│   │   └── main.py           # Application entrypoint
│   ├── requirements.txt      # Python dependencies
│   └── .env.example          # Sample environment variables
├── frontend/                 # React + Vite application
│   └── .gitkeep
├── graph/                    # Graph database definitions & migrations
│   ├── queries/              # Reusable OpenCypher queries
│   └── schema.md             # Graph schema documentation
├── data/
│   └── seed/                 # Incident seed data (logs, topology, traces)
├── docs/                     # Architecture, API design, workflows
├── docker-compose.yml        # FalkorDB service definition
├── .gitignore
└── README.md
```
