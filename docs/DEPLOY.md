# FilmBench — production deployment (Sprint 25)

## Required environment variables

| Variable | Required in prod | Description |
|----------|------------------|-------------|
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `JWT_SECRET` | Yes | Strong random secret (≥ 32 chars) |
| `APP_ENV` | Yes | `production` |
| `NODE_ENV` | Yes | `production` |
| `CORS_ORIGIN` | Yes | Browser origin of the web app (e.g. `https://app.example.com`) |
| `NEXT_PUBLIC_API_URL` | Yes (web build) | Public API URL the browser calls |
| `POSTGRES_PASSWORD` | Yes (compose) | DB password when using bundled Postgres |
| `UPLOAD_DIR` | Recommended | Writable path for Excel uploads (Docker: `/data/uploads`) |
| `REPORTS_DIR` | Optional | Executive report files (defaults under uploads) |
| `JWT_ACCESS_TTL_MIN` | Optional | Default `15` |
| `JWT_REFRESH_TTL_DAYS` | Optional | Default `7` |
| `REDIS_URL` | Optional | Future job queue / cache |

Never commit `.env` with real secrets. Use `.env.production.example` as a template.

## Health checks

| Endpoint | Purpose | Success |
|----------|---------|---------|
| `GET /health/live` | Liveness — process up | Always `200` if API running |
| `GET /health/ready` | Readiness — DB + auth config | `200` when DB ok and `JWT_SECRET` set |
| `GET /v1/health/live` | Same (versioned) | |
| `GET /v1/health/ready` | Same (versioned) | |
| `GET /health` | Alias for **ready** | |

Kubernetes: use `/health/live` for liveness and `/health/ready` for readiness probes.

## Docker Compose (recommended for single server)

1. Copy env template:

   ```bash
   cp .env.production.example .env
   # Edit JWT_SECRET, POSTGRES_PASSWORD, NEXT_PUBLIC_API_URL, CORS_ORIGIN
   ```

2. Build and start:

   ```bash
   docker compose -f docker-compose.prod.yml up -d --build
   ```

   This runs: **postgres** → **migrate** (one-shot) → **api** → **web**.

3. Optional Redis:

   ```bash
   docker compose -f docker-compose.prod.yml --profile with-redis up -d
   ```

4. Open:

   - Web: `http://127.0.0.1:3000` (or `WEB_PORT`)
   - API: `http://127.0.0.1:4000/v1/health/ready`

5. Re-run migrations after pulling new SQL:

   ```bash
   docker compose -f docker-compose.prod.yml run --rm migrate
   ```

## Build images manually

```bash
docker build -f Dockerfile.api -t filmbench-api:latest .
docker build -f Dockerfile.migrate -t filmbench-migrate:latest .
docker build -f Dockerfile.web -t filmbench-web:latest \
  --build-arg NEXT_PUBLIC_API_URL=http://127.0.0.1:4000 .
```

## Kubernetes (sample manifests)

Files under `k8s/`:

1. `namespace.yaml`
2. `secret.example.yaml` → copy to `secret.yaml` and apply
3. `job-migrate.yaml` — run once per schema release
4. `deployment-api.yaml`, `service-api.yaml`
5. `deployment-web.yaml`, `service-web.yaml`
6. `ingress.yaml` — adjust hosts

```bash
kubectl apply -f k8s/namespace.yaml
kubectl apply -f k8s/secret.yaml
kubectl apply -f k8s/job-migrate.yaml
kubectl wait --for=condition=complete job/filmbench-db-migrate -n filmbench --timeout=120s
kubectl apply -f k8s/deployment-api.yaml -f k8s/service-api.yaml
kubectl apply -f k8s/deployment-web.yaml -f k8s/service-web.yaml
kubectl apply -f k8s/ingress.yaml
```

Tag and push images to your registry, then update `image:` fields in deployments.

## CI / CD

- **CI** (`.github/workflows/ci.yml`): lint, test, build, migrate on PR/push to `main`.
- **CD** (`.github/workflows/deploy.yml`): builds Docker images on `main` (artifact upload). Wire `docker push` to your registry when credentials are configured.

### Staging → production flow

1. Merge to `main` → CI passes.
2. Build images with `NEXT_PUBLIC_API_URL` and secrets per environment.
3. Run migrate job against staging DB → smoke test `/v1/health/ready`.
4. Promote same image tags to production → migrate job → rollout deployments.

## Logs

API emits one JSON object per line:

```json
{"ts":"...","level":"info","service":"filmbench-api","message":"api_listening","host":"0.0.0.0","port":4000}
```

Collect stdout from containers or Kubernetes pod logs.

## Local development (unchanged)

```bash
docker compose up -d          # postgres + redis only
npm run db:migrate
npm run dev:api
npm run dev:web
```
