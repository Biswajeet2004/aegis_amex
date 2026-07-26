# AEGIS-Gov

AEGIS-Gov is a zero-trust governance and interception system for autonomous financial agents. It evaluates every tool call before execution, enforces policy and budget limits, supports immediate revocation, and records tamper-evident audit events.

## Repository structure

- `app/` - Next.js operator dashboard, ready for Vercel
- `backend/` - FastAPI control plane, ready for Render
- `vercel.json` - frontend deployment configuration
- `render.yaml` - backend deployment configuration

## Local development

### Backend

```bash
cd backend
python -m venv .venv
.venv/Scripts/activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
```

Copy `backend/.env.example` to `backend/.env` if you want to change allowed origins, signing secret, or database location.

### Frontend

```bash
copy .env.example .env.local
npm install
npm run dev:vercel
```

Set `NEXT_PUBLIC_API_URL=http://localhost:8000` for a connected local demo. If the value is empty, the interface runs in self-contained demo mode.

## Deployment

1. Create a Render Blueprint from this repository. `render.yaml` provisions the FastAPI service.
2. Copy the Render service URL.
3. Import the repository into Vercel and set `NEXT_PUBLIC_API_URL` to the Render URL.
4. Set the Render `ALLOWED_ORIGINS` variable to the final Vercel URL.

## Demonstrated controls

- Hot-path kill switch, policy, and atomic spend checks
- Identity sidecar with short-lived mTLS-bound tokens
- Per-agent capabilities, budgets, and revocation
- Three-lines-of-defense operator roles
- Shadow-mode policy evaluation
- Weighted degraded-mode budget allocation
- Versioned schema validation and policy hot swapping
- Hash-chained audit records with evidence export
- Explicit MVP and production architecture boundaries
