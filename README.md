# Validator traffic tools

Standalone scripts to:
- fetch validator update IDs from Canton JSON API
- fetch full transactions by updateId
- write CSV traffic metrics + JSONL
- filter to key tx types (merge/marker/dar/transfer)

## Setup

```bash
cd "validator-traffic-tools"
npm install
cp .env.example .env
```

Fill `.env`:
- `AUTH_URL`
- `CLIENT_ID`
- `CLIENT_SECRET`
- `AUDIENCE`

## Run

Fetch txs + write files:

```bash
npm run fetch
```

Outputs (in this folder):
- `tx_data.jsonl`
- `tx_traffic.csv`
- `tx_kb_data.csv`

Filter to the 4 types:

```bash
npm run filter:4types
```

Appends new 4-type rows to existing `tx_traffic_4types.csv`:

```bash
npm run append:4types
```

## Dashboard

Start local dashboard:

```bash
npm run dashboard
```

Open: `http://localhost:8080/dashboard`

The dashboard reads:
- `tx_traffic.csv`
- `tx_traffic_4types.csv`

## Deploy on Fly.io (always keep latest 500 rows)

This app runs a single process that:
- serves the dashboard
- refreshes data every `REFRESH_SECONDS` (default 300s)
- trims CSVs to the latest `MAX_ROWS` (default 500)

### 1) Install Fly CLI + login

```bash
fly auth login
```

### 2) Create app

From `validator-traffic-tools/`:

```bash
fly launch --no-deploy
```

### 3) Set secrets (DO NOT COMMIT THESE)

```bash
fly secrets set AUTH_URL="..." CLIENT_ID="..." CLIENT_SECRET="..." AUDIENCE="..." PARTY="..." LEDGER_URL="http://34.41.232.35:7575/api/json-api"
```

### 4) Deploy

```bash
fly deploy
```

### 5) Tune refresh/retention

```bash
fly secrets set REFRESH_SECONDS="300" MAX_ROWS="500"
```

## Free deploy (GitHub Pages + GitHub Actions)

This is the fastest free option:
- GitHub Pages hosts `validator-traffic-tools/public/`
- GitHub Actions refreshes CSVs every 15 minutes and keeps the latest 500 rows

### 1) Push to GitHub

Put this folder at the repo root, or keep it as `validator-traffic-tools/` in a mono-repo.

### 2) Add GitHub Actions secrets

Repo Settings → Secrets and variables → Actions → New repository secret:
- `AUTH_URL`
- `CLIENT_ID`
- `CLIENT_SECRET`
- `AUDIENCE`
- `PARTY`
- `LEDGER_URL`

### 3) Enable Pages

Repo Settings → Pages:
- Source: **Deploy from a branch**
- Branch: `main`
- Folder: `/validator-traffic-tools/public`

After the first workflow run, your dashboard will be at:
`https://<your-user>.github.io/<repo>/`


## Useful env vars

- `LEDGER_URL` (default)
- `PARTY` (validator party id)
- `INDEXER_BEGIN_EXCLUSIVE` (start offset)
- `INDEXER_TIP_BACKLOG` (default 5000)

