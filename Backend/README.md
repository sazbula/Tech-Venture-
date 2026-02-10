# Contextify Backend MVP

Minimal FastAPI + SQLite service that queues stub review jobs for diffs. It is intentionally simple so the frontend can integrate while RLM, repo graphs, and GitHub ingestion are built later.

## Features
- Health check endpoint.
- Queue-based review jobs persisted in SQLite.
- Background task simulates processing and stores stubbed review output.
- Permissive CORS for easy local development.

## Quickstart
1. Install dependencies:
   ```bash
   pip install -r requirements.txt
   ```
2. Run the dev server from the `Backend` directory:
   ```bash
   uvicorn app.main:app --reload
   ```
3. Hit the API:
   - `GET /api/health`
   - `POST /api/reviews` with JSON `{ "diff_text": "..." }`
   - `GET /api/reviews/{review_id}`

## Data model
SQLite file lives at `app/reviews.db` (auto-created). Table `reviews` columns:
- `id` (UUID primary key)
- `status` (queued|running|done|failed)
- `progress`
- `created_at`
- `result_json` (stubbed result payload)
- `error`

## Notes
- The review engine is a stub located at `app/review_engine.py` and does not execute repository code.
- Tighten CORS and add auth, GitHub ingestion, RLM, and graph logic in future iterations.
