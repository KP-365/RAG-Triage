# NHS Clinical Assistant

## Overview
An AI-assisted clinical assistant that helps patients get the right care at the right time. The application includes a patient-facing assessment interface and a clinician dashboard.

## Project Structure
```
Triag_RAG/
├── client/           # React frontend (Vite)
│   ├── src/
│   │   ├── components/  # UI components (Shadcn)
│   │   ├── pages/       # Page components
│   │   ├── hooks/       # React hooks
│   │   └── lib/         # Utilities
│   └── index.html
├── server/           # Express backend
│   ├── index.ts      # Server entry point
│   ├── routes.ts     # API routes
│   ├── storage.ts    # Database operations
│   ├── db.ts         # Database connection
│   └── lib/          # Business logic (RAG, rules)
├── shared/           # Shared types and schemas
│   └── schema.ts     # Drizzle ORM schemas
└── package.json
```

## Tech Stack
- Frontend: React 18, Vite, TailwindCSS, Shadcn UI
- Backend: Express.js, TypeScript
- Database: PostgreSQL with Drizzle ORM
- AI: OpenAI API (gpt-4o-mini)

## Running the Application
```bash
cd Triag_RAG
npm run dev      # Development server on port 5000
npm run build    # Build for production
npm run start    # Production server
```

## Database Commands
```bash
npm run db:push   # Push schema to database
npm run db:studio # Open Drizzle Studio
```

## Environment Variables
- `DATABASE_URL`: PostgreSQL connection string
- `OPENAI_API_KEY`: OpenAI API key for AI features
- `LOG_EXTRACTION_DIVERGENCE=1`: (optional) Log when LLM-extracted facts differ from deterministic state; useful for auditing and tuning.

## What is the “AI score”?

There is **no single numeric “AI score”**. The app uses:

| Term | Meaning |
|------|--------|
| **Severity (0–10)** | Patient-reported symptom severity during the chat (e.g. “7/10”). |
| **Rules Engine category** | Green / Amber / Red from the **rule-based** logic (deterministic). This is the **primary** category. |
| **AI suggested category** | Green / Amber / Red suggested by the model when building the handoff. Shown for context only. |
| **AI confidence** | LOW / MEDIUM / HIGH: how confident the model is in that suggestion. Shown next to “AI Suggestion” on the handoff. |

The “score” clinicians should rely on is the **Rules Engine** category. The **AI suggested** category + **AI confidence** are advisory only.

## Key Features
- Patient symptom assessment with AI chat interface
- AI-flagged concern levels (Red/Amber/Green) - for clinician review only
- Clinician dashboard for reviewing submissions with decision logging
- RAG-powered knowledge base for clinical decision support
- Document upload for clinical protocols

## Reliability & anti-hallucination

Fact extraction and handoff use these safeguards:

1. **Deterministic-first** – Chat state (parsed by the state machine) is turned into facts first; LLM extraction only adds or refines.
2. **Confidence thresholds** – Critical facts (e.g. severity, red-flag symptoms) need LLM confidence ≥ 70%; others ≥ 50%. See `CONFIDENCE_CRITICAL` / `CONFIDENCE_DEFAULT` in `server/lib/handoff.ts`.
3. **Conversation validation** – For critical non-boolean facts, the value must appear in the patient’s messages (e.g. severity number, onset phrase); otherwise the fact is dropped.
4. **Divergence logging** – When the LLM disagrees with the deterministic value for a fact, a warning is emitted if `NODE_ENV=development` or `LOG_EXTRACTION_DIVERGENCE=1`.

Red-flag and severity decisions remain rule-based; the model only influences extracted facts used as input to those rules.

## Hallucination & accuracy

**What we do to improve accuracy and limit hallucination**

| Area | Safeguard |
|------|-----------|
| **Facts** | Deterministic chat state is used first; LLM extraction only adds or refines. Critical facts (severity, red-flag symptoms) need confidence ≥ 70% and, when not yes/no, must appear in the patient’s text (`foundInConversation`). |
| **Severity & red flags** | Rule-based only. `rules_engine_category` and triggered red flags come from `evaluateTriage` / `evaluateRedFlags`; the model does not set these. |
| **Handoff narrative** | Handoff prompt requires “only include information from the provided facts and conversation; do not invent details.” Rules-engine category is primary; AI suggested category is secondary and advisory. |
| **Model & temperature** | `gpt-4o-mini`; temperature 0.1 for fact extraction, 0.2 for handoff generation to reduce randomness. |
| **Audit** | Set `LOG_EXTRACTION_DIVERGENCE=1` to log when extracted facts differ from deterministic state (dev/audit). |

**Remaining limits**

- Narrative fields (e.g. key positives, rationale, differentials) are still free-text from the model and can contain errors or invented detail if the model misreads the conversation.
- The app is **not validated** for clinical accuracy. Treat all AI output as advisory; clinical responsibility remains with the clinician.
- For the strictest control, rely on: (1) rules-engine category and red flags, (2) facts that passed confidence and conversation checks, (3) deterministic fields (e.g. presenting complaint from state) over model-written summaries where they overlap.

## Chat completion and hallucination metrics

**How many times chats complete** and **percentage of hallucinations** (as a proxy) are available from the admin metrics API.

- **Endpoint:** `GET /api/admin/metrics` (admin-only when `ADMIN_NAME` / `ADMIN_PASSWORD` are set).
- **Response:**
  - **chatCompletion:** `totalSessions`, `completed`, `active`, `escalated`, `completionRatePercentage` (completed ÷ total × 100).
  - **hallucinationProxy:** `extractionDivergenceCount` (total times the LLM disagreed with deterministic state on a fact), `sessionsWithAtLeastOneDivergence`, `hallucinationRatePercentage` (sessions with ≥1 divergence ÷ completed × 100). The “hallucination” proxy is the share of completed sessions where at least one extracted fact differed from the deterministic value; it does not measure free-text narrative errors.

Divergences are recorded whenever fact extraction runs and the LLM output disagrees with the deterministic state (see `extraction_divergences` and `storage.recordExtractionDivergence`). Run `npm run db:push` after pulling schema changes so the `extraction_divergences` table exists.

**How to test “how many times it finishes” and “how many times it hallucinates”**

1. Start the app: `cd Triag_RAG && npm run dev` (ensure `DATABASE_URL` and `OPENAI_API_KEY` are set).
2. Run the test script: `npm run test:metrics` (or `node script/test-metrics.mjs`). It runs 5 chat flows (start → name/age/sex/complaint → finish), then fetches `GET /api/admin/metrics` and prints completion counts and hallucination-proxy %.
3. Optional: set `NUM_CHATS=10` or `ADMIN_NAME`/`ADMIN_PASSWORD` if admin is required for `/api/admin/metrics`.

## Legal & Compliance Notes
**This is a clinician decision support tool, NOT an AI diagnostic system.**

### Patient-Facing Interface
- Shows neutral confirmation only - no severity category or AI assessment visible
- Includes mandatory disclaimer: "This form does not provide medical advice. Your responses will be reviewed by a clinician."

### Clinician-Facing Interface
- Disclaimer banner: "AI-generated decision support. Not a diagnosis. Final clinical responsibility rests with the clinician."
- Red flags/potential risk indicators are the most prominent element
- AI uses hedged language only: "consider", "may be consistent with", "factors to exclude"
- All AI output is structured in fixed order: concern level → risk indicators → considerations → possible conditions → next steps → factors that would change assessment

### Decision Logging
- Clinician decisions are logged with decision type: "accepted", "modified", or "overridden"
- Original AI-suggested level is preserved for audit trail
- Clinical rationale is required for all decisions

### Terminology
- "Risk Band" → "AI-flagged level of concern (for clinician review)"
- "Red Flags" → "Potential risk indicators"
- "Clinical explanation" → "Decision support summary"
- Possible conditions are labeled as "Non-exhaustive possible conditions (not a diagnosis)"
