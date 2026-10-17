# Retrace — AI-Powered Incident Investigation

Retrace is an AI-powered incident investigation system that helps engineers understand production failures by connecting incidents, services, dependencies, deployments, and team ownership in a graph database.

Instead of relying on isolated logs or manually searching across multiple systems, Retrace uses **FalkorDB as its central source of connected system context**. An AI investigator queries this graph through tools, gathers relevant evidence, forms hypotheses, and produces a structured investigation report with recommended next steps.

> **Project status:** Hackathon project and prototype. The included infrastructure data is synthetic and intended for demonstration, not production incident response.

## Hackathon Submission

**Project:** Retrace — AI-Powered Incident Investigation

**Track:** Agents That Act on Connected Data

Retrace uses FalkorDB to retrieve connected incident, service-dependency, deployment, and ownership context. An AI investigator uses this graph-backed evidence to generate hypotheses and recommended investigation steps.

## The Problem

When a production service fails, engineers need to answer several questions quickly:

- Which services and dependencies are affected?
- What changed shortly before the incident?
- Which team owns the failing component?
- What evidence supports a possible root cause?
- What should the responder investigate next?

These relationships are often spread across different systems. Investigating them manually takes time, particularly when one failure affects several dependent services.

## The Solution

Retrace combines graph-based system context with an AI investigation workflow.

- **Incident investigation:** Investigate an incident using connected service, deployment, and ownership information.
- **Dependency analysis:** Trace upstream and downstream relationships to understand potential impact.
- **Recent-change context:** Retrieve deployment information associated with affected services.
- **Ownership lookup:** Identify the team responsible for a service and its associated contact information.
- **Evidence-backed reports:** Separate facts retrieved from the graph from hypotheses that still require verification.
- **Recommended actions:** Generate investigation steps that help responders decide what to check next.
- **Graph Explorer:** Explore service topology, dependencies, health information, and team ownership visually.

Retrace generates investigative recommendations; it does not independently confirm a root cause or execute remediation actions.

## Architecture

```text
                  ┌──────────────────────┐
                  │    React + Vite      │
                  │      Frontend        │
                  └──────────┬───────────┘
                             │ HTTP / REST
                  ┌──────────▼───────────┐
                  │      FastAPI         │
                  │      Backend         │
                  └──────────┬───────────┘
                             │
                  ┌──────────▼───────────┐
                  │  AI Investigation    │
                  │   Groq + Tool Calls  │
                  └──────────┬───────────┘
                             │ Graph queries
                  ┌──────────▼───────────┐
                  │       FalkorDB       │
                  │ Incident Context     │
                  └──────────────────────┘
```

### Technology Stack

| Component | Technology |
|---|---|
| Frontend | React, Vite, Tailwind CSS |
| Backend | Python, FastAPI, Pydantic |
| AI provider | Groq API with tool calling |
| Graph database | FalkorDB |
| Graph query language | Cypher |
| API testing | Pytest, HTTPX |
| Local database setup | Docker Compose |

## Why FalkorDB?

FalkorDB is central to Retrace's investigation workflow, rather than serving only as a visualization layer.

The graph represents relationships between infrastructure components, incidents, deployments, and responsible teams. The investigator can query these relationships to retrieve context relevant to a failure.

For example, investigating a failing payment service can involve:

1. Retrieving the service's current health state.
2. Traversing its dependency relationships to identify affected components.
3. Looking up the team responsible for the service.
4. Retrieving recent deployment information.
5. Combining the returned evidence into an investigation report.

The graph allows these related facts to be retrieved through connected queries rather than relying exclusively on unstructured text passed to the language model.

## Graph Data Model

The prototype uses synthetic infrastructure data to demonstrate incident investigation.

The graph includes entities representing:

- **Services:** Infrastructure components, their health state, and dependencies.
- **Incidents:** Recorded incidents and their associated services.
- **Deployments:** Changes applied to services, including version and change descriptions.
- **Teams:** Groups responsible for maintaining services.

The relationships encode dependencies, incident associations, deployments, and service ownership.

The repository's `graph/schema.md`, `graph/queries/sample_queries.cyp`, and `graph/seed_graph.py` contain the implementation-specific schema, representative queries, and seed data.

### Example Investigation Scenario

The synthetic scenario includes incident `INC-8401`, elevated HTTP 500 errors, a failing `PaymentsAPI`, an unreachable `PaymentsPostgresDB`, and deployment `dep-902` involving a connection-pool and timeout change.

Retrace can use the graph to connect these facts and propose the deployment as a possible contributing factor.

**Important:** Temporal proximity and graph relationships are evidence for investigation, not proof of causation. The proposed root cause must be verified against telemetry and other operational evidence.

## Project Structure

```text
Retrace/
├── backend/
│   ├── app/
│   │   ├── agent/          # AI investigation workflow and tools
│   │   ├── api/            # FastAPI endpoints
│   │   ├── core/           # Configuration
│   │   ├── db/             # FalkorDB client
│   │   ├── models/         # Request and response schemas
│   │   ├── services/       # Graph query and investigation services
│   │   └── main.py         # FastAPI application
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/             # Backend API client
│   │   └── components/      # UI and investigation components
│   └── package.json
├── graph/
│   ├── seed_graph.py        # Synthetic graph initialization
│   ├── verify_graph.py      # Graph verification
│   ├── schema.md            # Graph schema documentation
│   └── queries/
│       └── sample_queries.cyp
├── tests/
│   ├── test_api.py
│   └── test_agent.py
├── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md
```

## Getting Started

### Prerequisites

Install the following:

- Python 3.10 or a compatible version supported by the project's dependencies.
- Node.js and npm.
- Docker Desktop with Docker Compose.
- A Groq API key for live AI investigations.

You can obtain a Groq API key from the [Groq Console](https://console.groq.com/).

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_GITHUB_USERNAME/Retrace.git
cd Retrace
```

Replace `YOUR_GITHUB_USERNAME` with the repository owner's GitHub username.

### 2. Start FalkorDB

From the repository root:

```bash
docker compose up -d falkordb
```

The current local configuration maps host port `6380` to FalkorDB's container port `6379`, avoiding a conflict with a Redis service already using the default port.

Verify the container is running:

```bash
docker compose ps
```

### 3. Configure the backend

Create a local environment file at `backend/.env` using `.env.example` as a reference. If the example file is located at the repository root, copy it into the backend directory and adjust its values as necessary.

Configure the required variables:

```dotenv
ENVIRONMENT=development
PORT=8000

FALKORDB_HOST=localhost
FALKORDB_PORT=6380
FALKORDB_GRAPH=retrace_incidents

AI_PROVIDER=groq
GROQ_API_KEY=your_groq_api_key
GROQ_MODEL=your_verified_groq_model_id

CORS_ORIGINS=["http://localhost:5173","http://127.0.0.1:5173"]
```

Replace the model placeholder with a model available to your Groq account that supports tool calling.

Do not commit `backend/.env` or share your API key. For remote deployments, use the hosting platform's environment-variable settings and the actual database connection details.

### 4. Install backend dependencies

Run these commands from the repository root:

```bash
python -m venv .venv
```

Activate the environment on Windows PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
```

On macOS or Linux:

```bash
source .venv/bin/activate
```

Install the dependencies:

```bash
python -m pip install -r backend/requirements.txt
```

### 5. Seed the graph

From the repository root, run:

```bash
python graph/seed_graph.py
```

Then verify the graph:

```bash
python graph/verify_graph.py
```

These scripts initialize and inspect the synthetic graph data. Run them against the intended database, especially when using a remote instance. Do not seed or reset a shared graph without checking the script's behavior first.

### 6. Start the backend

From the repository root:

```bash
python -m uvicorn backend.app.main:app --reload --port 8000
```

The API should be available at `http://localhost:8000`.

Interactive API documentation is available at:

`http://localhost:8000/docs`

### 7. Start the frontend

Open a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Open the local Vite URL, normally:

`http://localhost:5173`

The frontend uses `VITE_API_URL` to configure the backend API base URL. If unset, it defaults to `http://localhost:8000`.

For local development, make sure the frontend URL is included in the backend's `CORS_ORIGINS` setting.

## API Overview

The backend exposes endpoints for service and incident context, including:

| Endpoint | Purpose |
|---|---|
| `GET /health` | Check backend health |
| `GET /api/incidents` | Retrieve active incidents |
| `GET /api/services/{service_name}/impact` | Retrieve service impact information |
| `GET /api/services/{service_name}/owner` | Look up service ownership |
| `GET /api/services/{service_name}/recent-changes` | Retrieve recent service changes |
| `POST /api/investigate` | Run an AI-assisted investigation |

The application also exposes a graph topology endpoint used by Graph Explorer. For exact request and response schemas, consult the FastAPI documentation at `/docs`.

## Running Tests

From the repository root, activate your Python virtual environment and run:

```bash
python -m pytest tests/ -v
```

Build the frontend:

```bash
cd frontend
npm run build
```

The build command generates the production frontend in `frontend/dist`.

Tests should be run locally before pushing changes. Live Groq integration tests may require API credentials and network access, whereas ordinary unit tests should mock external provider calls where appropriate.

## Deployment

Retrace can be deployed as three independently configured components:

1. **FalkorDB Cloud** — graph database.
2. **Render Web Service** — FastAPI backend.
3. **Render Static Site** — React/Vite frontend.

### Backend deployment

The backend start command for a compatible hosting environment is:

```bash
uvicorn backend.app.main:app --host 0.0.0.0 --port $PORT
```

Configure the Groq credentials, verified model ID, FalkorDB connection settings, graph name, and allowed frontend origins using the hosting platform's environment settings.

The remote database client must support the authentication and TLS configuration required by the chosen database plan. Verify these requirements before deployment.

### Frontend deployment

Build the frontend with:

```bash
npm ci
npm run build
```

Configure the following build-time variable with the deployed backend's URL:

```dotenv
VITE_API_URL=https://YOUR-BACKEND-URL
```

Replace the placeholder with the actual backend URL. Rebuild the frontend after changing this value.

### Free-tier limitations

Free hosting may impose cold starts, usage limits, or restrictions on database persistence, backups, and transport security. These limitations should be verified against the current plans before deployment.

The prototype uses synthetic data and is intended for demonstration. Do not store sensitive production infrastructure information or credentials in the public demo.

Deployment URLs will be added here after the services are deployed and verified.

- **Live demo:** Pending deployment
- **Backend API:** Pending deployment
- **API documentation:** Pending deployment

## Security and Responsible Use

- Never commit API keys, passwords, private keys, or real `.env` files.
- Use environment variables for secrets.
- Restrict production CORS origins to the deployed frontend.
- Treat graph-derived evidence and AI-generated hypotheses as different categories.
- Verify recommended remediation steps before executing them.
- Do not use the synthetic prototype as an authoritative production incident-management system.

## AI-Assistance Disclosure

AI coding assistants were used during the development process for implementation support, debugging, documentation, and refinement. The project is intended to be reviewed and tested by its developers before use.

## Future Improvements

Potential extensions include:

- Integration with real observability and deployment data sources.
- More advanced dependency-impact analysis.
- Stronger evaluation of investigation accuracy and evidence traceability.
- Persistent investigation history and incident comparisons.
- Additional automated tests for provider failures and graph-query edge cases.

## License

No license has been specified yet. A license should be added before inviting external reuse or contributions.

## Author

**Nishtha Gupta** — Developer of Retrace, an AI-powered incident investigation system built with FalkorDB, FastAPI, React, and Groq.

- GitHub: [@nishthagupta09](https://github.com/nishthagupta09)
- LinkedIn: [nishtha-gupta](https://www.linkedin.com/in/nishtha-gupta-09b731326/)

