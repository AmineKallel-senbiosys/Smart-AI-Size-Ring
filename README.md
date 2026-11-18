# AI Ring Size (Velia)

Web ring sizing for Velia: product page, online sizing modal (known size, kit, ring on screen, paper strip), optional camera / one-hand vision service, and optional Velio chat backend.

## Requirements

- **Node.js** 20+ (npm)
- **Python** 3.11+ (only if you use `onehand-service` or `velio`)

## Quick start (web app)

```bash
git clone https://github.com/AmineKallel-senbiosys/Smart-AI-Size-Ring.git
cd Smart-AI-Size-Ring

npm install
npm run dev
```

Open **http://localhost:3456**

That is enough for the Velia product page and the on-screen sizing flow.

## Optional: Python services

```bash
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
# source .venv/bin/activate

pip install -r requirements.txt
```

### One-hand / camera service

```bash
npm run onehand
# → http://127.0.0.1:4185
```

Models live in `onehand-service/models/`. Captured photos and validation CSVs stay local and are gitignored.

### Velio chat backend (optional)

1. Copy env file and set your OpenAI key:

```bash
cp .env.example .env
# edit .env → OPEN_AI_API_KEY=...
```

2. Start Velio:

```bash
npm run velio
# → http://127.0.0.1:8001
```

Knowledge base: `KB/velio_kb.yaml`.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Next.js app on port **3456** |
| `npm run dev:lan` | Same, bound to `0.0.0.0` (LAN) |
| `npm run build` | Production build |
| `npm start` | Serve production build on **3456** |
| `npm run onehand` | One-hand measurement service |
| `npm run velio` | Velio FastAPI chat (needs venv + `.env`) |
| `npm run tunnel` | ngrok to local 3456 (camera on phone) |

## Camera on a phone

Camera needs **https** (or localhost). Typical flow:

```bash
npm run dev
npm run tunnel
```

Open the https URL ngrok prints, or set `NEXT_PUBLIC_PUBLIC_URL` in `.env`.

## Project layout

```
src/                 Next.js app (PDP, sizing modal, scan, sizer)
public/velia/        Velia UI assets
onehand-service/     Node + Python vision worker
velio/               Optional FastAPI chat agent
KB/                  Velio knowledge base
requirements.txt     Python deps for optional services
```

## Notes

- Do not commit `.env` / `.env.local` (gitignored). Use `.env.example` as the template.
- Local measurement data under `onehand-service/data/` and `/outputs/` is ignored.
- Sizing logic targets Velia stock sizes **US 6 · 8 · 10 · 12**.
