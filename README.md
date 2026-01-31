# NHS Clinical Assistant (Prototype)

**Research and demonstration prototype only. Not for clinical use. Not a medical device.**

AI-assisted clinical assistant: guided patient intake, rule-based red flags and severity, and a one-page handoff for reception/clinicians. Built for evaluation and demos, not for live clinical decisions.

**GitHub → Replit:** Push this repo to GitHub, then in Replit use **Import from GitHub**. Set `DATABASE_URL` and `OPENAI_API_KEY` in Secrets. Run `npm run install:app` once, then `npm run db:push`; use the Run button (workflow runs the app from `Triag_RAG`).

---

## ⚠️ Release disclaimer

- **Do not use for real clinical decisions or live patient assessment.**  
- **Not validated for safety or accuracy.**  
- **Not registered or approved as a medical device.**  
- Suitable for: **demos, research, teaching, and internal evaluation** only.

By running or deploying this app you agree it is used only in that context.

---

## Quick start (run locally)

From the **repo root** (after cloning from GitHub):

```bash
cd Triag_RAG
cp .env.example .env   # edit .env with your DATABASE_URL and OPENAI_API_KEY
npm install
npm run db:push        # create/update DB tables (requires DATABASE_URL in .env)
npm run dev
```

Or from the root: `npm run install:app` then `npm run dev` (both use `Triag_RAG` under the hood).

Open `http://localhost:5000` (or the port shown). You need:

- **PostgreSQL** – set `DATABASE_URL` in `.env`
- **OpenAI API key** – set `OPENAI_API_KEY` in `.env`
- **Admin (optional)** – set `ADMIN_NAME` and `ADMIN_PASSWORD` to protect `/admin` and record &quot;Changed by [name]&quot; on name edits.

**Integration checklist (everything runs smooth):**
1. `npm install` in `Triag_RAG`
2. Set `DATABASE_URL` and `OPENAI_API_KEY` in `.env`
3. `npm run db:push` so tables (including `updated_at` / `updated_by` on submissions) exist
4. `npm run dev` — one process serves API + UI. For production: `npm run build` then `npm run start`

**What is the “AI score”?** There is no single numeric AI score. The app uses: **patient severity (0–10)**, **Rules Engine category** (Green/Amber/Red, primary), and **AI suggested category + AI confidence** (LOW/MED/HIGH) on the handoff. See [replit.md](./replit.md) for the full table.

See [replit.md](./replit.md) and [RELEASE.md](./RELEASE.md) for release steps and legal positioning.

---

## Deploy (release as a prototype)

You can “release” this as a **non-clinical** demo by hosting it and keeping the in-app and README disclaimers.

### Option 1: Replit

1. Push to GitHub, then in Replit: **Import from GitHub** and select the repo.
2. In Replit **Secrets**, set `DATABASE_URL` and `OPENAI_API_KEY` (e.g. Supabase Postgres URL + OpenAI key).
3. In the shell, run `npm run install:app` once, then `npm run db:push`. Use the **Run** button (workflow runs `cd Triag_RAG && npm run dev`).
4. Share the generated URL. Do **not** describe it as for real clinical use.

The `.replit` file wires run/build to the root `package.json`; the app lives in `Triag_RAG/`.

### Option 2: Railway / Render / Fly

1. **Database**: Create a Postgres instance and copy its URL into `DATABASE_URL`.
2. **Build**: From `Triag_RAG`, run `npm run build` (builds client + server).
3. **Run**: `npm run start` (serves from `dist/` and built client).
4. Set env vars: `DATABASE_URL`, `OPENAI_API_KEY`, and optionally `NODE_ENV=production`.

Point a domain at the app and keep the default disclaimers in the UI and this README.

### Option 3: Docker (self-host)

From `Triag_RAG`:

```bash
docker build -t triag-rag .
docker run -p 5000:5000 -e DATABASE_URL=postgresql://... -e OPENAI_API_KEY=sk-... triag-rag
```

Keep `DATABASE_URL` and `OPENAI_API_KEY` in the environment. The app listens on port 5000.

---

## What’s in the box

- **Patient flow**: One-question-at-a-time chat, emergency keyword detection, rule-based red flags.
- **Handoff**: One-page structured summary (presenting complaint, positives/negatives, red flags, severity, differentials, consultation focus) for reception/clinicians.
- **Deterministic severity**: Red/Amber/Green and red-flag triggers come from rules, not from the model.
- **RAG**: Optional retrieval over uploaded docs for clinician-facing explanations.
- **Safeguards**: Confidence thresholds, conversation checks, and divergence logging for extracted facts. See [replit.md](./replit.md) – **Reliability & anti-hallucination** and **Hallucination & accuracy**.

---

## Licence and liability

Code is provided as-is. Use only in line with the disclaimer above. No warranty; no liability for clinical or other use.
