# Contextify Backend MVP

FastAPI + SQLite backend that mirrors the React frontend contract: analyze a repo, queue a job, and serve graph + issues data (demo-backed for now).

## Features
- `POST /analyze` queues an analysis job (stubbed, completes fast).
- `GET /graph/{repo}/vis` returns graph nodes/edges in the shape the UI expects.
- `GET /graph/{repo}/issues` returns issue list for findings & drill-down.
- `GET /repos` lists analyzed repos (always includes `contextify-demo`).
- `GET /api/reviews/{id}` exposes raw job status/result if needed.
- Permissive CORS; SQLite persistence; background tasks keep the workflow.

## Quickstart
1) Install deps  
```bash
pip install -r requirements.txt
```
2) Run the server (from `Backend/`)  
```bash
uvicorn app.main:app --reload
```
3) Try it  
- Health: `GET /`  
- Analyze: `POST /analyze` with `{ "url": "https://github.com/org/repo" }`  
- Graph: `GET /graph/{repo}/vis`  
- Issues: `GET /graph/{repo}/issues`  
- Repos: `GET /repos`

## Data model (table `reviews`)
- `id` (UUID primary key)
- `repo_name`, `repo_url`
- `status` (queued|running|done|failed)
- `progress`
- `created_at`
- `node_count`, `edge_count`
- `result_json` (stores graph + issues payload)
- `error`

> On startup we auto-create/repair the table; old dev DBs may be dropped if columns are missing.

## Notes
- Analysis results are deterministic demo data from `app/demo_data.py` via `run_analysis`.
- Replace `run_analysis` with the real RLM + repo-graph pipeline later, keeping the same response shapes.
