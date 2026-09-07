# Middle East Grok Bot Watch Desk — Cost Control & Cadence Optimization (P0)

Cost control, deduplication, triage routing, rolling state, and cadence management for Jamal Al Mutawa's Middle East Watch Desk (~16 regional country desks, reporter packs, accounts spend watch, writer emoji cards).

---

## 1. Problem & Context

The watch desk previously experienced severe cost inflation, rate limit stampedes, and operational friction caused by:
1. **08:00 AM Synchronized Stampede**: ~16 country desks simultaneously executed heavy X API pulls and Grok Bot LLM invocations every Sun–Thu at 08:00 Asia/Kuwait.
2. **Overlapping X Ingestion**: Identical posts and breaking claims were pulled and paid for independently across multiple desks.
3. **Prompt & Transcript Duplication**: Entire chat histories and duplicated system instructions were replayed on every run, causing massive token waste.
4. **No Shared Incident Store**: Desks had no common cross-desk ledger or deduplication mechanism for tracking ongoing events.
5. **Inconsistent Quiet-Day Policy**: Desks generated costly filler text ("No material developments detected") when regions were calm.
6. **Accounts Agent Overhead**: Hourly spend audits created unnecessary polling overhead.
7. **Missing Qatar Routine**: Qatar lacked a standing low-cost brief routine.

---

## 2. Architecture & Modules

This repository provides an offline, zero-live-side-effects TypeScript library delivering all P0 components:

```
desk-cost-control/
├── schemas/                       # Strict JSON Schemas
│   ├── incident.schema.json       # Canonical incident schema
│   ├── cluster.schema.json        # 6h spatio-temporal cluster schema
│   ├── seen-post.schema.json      # X post deduplication schema
│   ├── desk-state.schema.json     # Per-desk rolling state schema
│   └── desk-output.schema.json    # Strict desk JSON output schema
├── prompts/                       # Static cached prompt pack
│   ├── desk-ops.md                # Core instructions & silence policy
│   └── countries/                 # Thin country addenda (plain facts / JSON only)
│       ├── kuwait.md              # Kuwait defense, sirens, KWI/OKAC
│       ├── iran.md                # Iranian airspace, missile sites, IRGC
│       ├── hormuz.md              # Strait of Hormuz TSS, tankers
│       ├── gcc.md                 # GCC joint coordination stub
│       ├── levant.md              # Levant border arc stub
│       ├── red-sea.md             # Red Sea / Bab el-Mandeb stub
│       └── qatar.md               # Qatar cheap standing brief stub (gap fix)
├── config/                        # Stagger and spend cap specifications
│   ├── spend-caps.example.yaml    # Soft/hard spend caps & Accounts audit procedure
│   └── cron-stagger.example.yaml  # Staggered cron schedule (:00, :05, :15, :20, :30)
├── src/
│   ├── store/                     # Shared Incident Store & Deduplication
│   │   ├── dedupe.ts              # Post ID hash, normalization, SimHash, Jaccard
│   │   ├── cluster.ts             # Place + Type + 6h window clustering
│   │   ├── incident-store.ts      # Append-only JSONL writer & query engine
│   │   └── compact.ts             # Nightly compaction & deduplication helper
│   ├── triage/                    # Triage Router
│   │   ├── keywords.ts            # ALERT (never batched), BATCH, DROP patterns
│   │   ├── router.ts              # Triage engine with ambiguity escalation
│   │   └── audit-logger.ts        # DROP decision sampler & audit logger
│   ├── state/                     # Compact Rolling State
│   │   ├── rolling-state.ts       # Per-desk state management (load/save)
│   │   └── delta-digest.ts        # Delta generator (replaces chat history replay)
│   ├── batcher/                   # Non-Urgent Batcher
│   │   └── non-urgent-batcher.ts  # 15-30 min queue with instant ALERT bypass
│   └── writer/                    # Writer House Style Mapping
│       └── airspace-mapper.ts     # JSON -> emoji card mapper (no invented events)
├── docs/
│   └── IMPLEMENTATION_PLAN.md     # Phase 0 -> Phase 1 -> Phase 2 roadmap
└── test/                          # Unit test suite (Node 22 native test runner)
```

---

## 3. Core Functional Capabilities

### Shared Incident Store & Deduplication
- **Append-only JSONL**: Stores canonical incidents (`id`, `geo`, `type`, `severity`, `first_seen`, `last_seen`, `sources[]`, `desks[]`, `claim_fingerprint`, `post_ids[]`).
- **Deterministic Deduplication**: Computes SHA-256 hashes of X post IDs, normalizes claim text (stripping handles, URLs, emojis), and evaluates both 64-bit SimHash Hamming distance and token Jaccard similarity.
- **6-Hour Spatio-Temporal Clustering**: Groups multi-source reports into clusters by `place + type + 6h window`.
- **Nightly Store Compactor**: Merges incremental updates, updates `last_seen`, unions source handles, and prunes stale records.

### Triage Router (DROP | BATCH | ALERT)
- **ALERT (Immediate Bypass, Never Batched)**:
  - Strikes, missile launches, drone intercepts, mobilization, force movements, GPS jamming spikes, ADS-B dark clusters, airspace closures, Kuwait air defense/sirens, Hormuz tanker hit/seizure.
- **BATCH (Queued 15–30 min)**: Diplomatic warnings, military drills, official communiques, shipping cautions.
- **DROP (Filtered & Logged)**: Pure rhetoric cheerleading, crypto spam, historical essays, lifestyle chatter.
- **Ambiguity Escalation**: Any ambiguous text containing security signals automatically escalates to `BATCH` or `ALERT`—**never** silently dropped. All drops are logged to `drop-audit.jsonl` for audit sampling.

### Pre-LLM Ingest Gate CLI
- **CLI Gate (`bin/ingest_gate.ts`)**: Fast Phase-0 gate executed prior to expensive LLM or deep X pulls.
  ```bash
  # Run gate CLI
  npm run gate -- --post-ids "189384729103847582" --claim "Air defense active over Bubiyan" --text "Sirens sounding in Kuwait"
  ```
  - Reads `--post-ids`, `--claim`, `--text`, optional `--fingerprint`, optional `--store`.
  - Evaluates duplicate post IDs and claim Jaccard token similarity ($\ge 0.72$).
  - Evaluates alert keywords (`missile|asbm|strike|siren|intercept|sunk|seizure|kinetic|explosion|ballistic|ukmto|centcom|kuwait ad`).
  - Automatically appends DROP / BATCH-known records to `drop-audit.jsonl`.
  - Emits single JSON result: `{"decision":"DROP"|"BATCH"|"ALERT","reason":"...","matched_ids":[...],"sim":0.0}`.

### Compact Rolling State & Delta Digests
- Replaces expensive full chat history replay with `DeltaDigest.prompt_input`.
- Injects only:
  - New incidents observed since `last_run_at`.
  - Updated reports on existing incidents.
  - Silence declaration when nothing material occurred (incrementing `silence_streak`).

### House Style Isolation & Strict JSON Output
- **Desks output JSON only**: Desks emit clean structured facts complying with `schemas/desk-output.schema.json` without emojis or formatting.
- **Writer Agent owns house style**: The Writer maps desk JSON into official `🟰` headers and emoji cards (`src/writer/airspace-mapper.ts`). No live events are hallucinated or invented.

---

## 4. How to Run Tests & Build

### Prerequisites
- Node.js 20+ (Node 22 LTS recommended)
- npm

### Installation & Execution
```bash
# Install dependencies
npm install

# Run unit tests
npm test

# Run Pre-LLM Ingest Gate example
npm run gate -- --post-ids "189384729103847582" --text "Sirens sounding in Kuwait"

# Run TypeScript typecheck
npm run typecheck

# Build TypeScript to JavaScript (dist/)
npm run build
```

---

## 5. Wiring into Grok Bot (Post-Approval Procedure for Acting CEO)

> **IMPORTANT**: In accordance with P0 hard constraints, no live system connections, API calls, or agent workflow modifications have been made.

When **Jamal Al Mutawa** approves live deployment:
1. **Review & Approve**: Review PR diff, test results, and [`docs/IMPLEMENTATION_PLAN.md`](docs/IMPLEMENTATION_PLAN.md).
2. **Mount Persistent Volume**: Point `IncidentStore` and `DeskStateManager` to `/var/data/desk-store/`.
3. **Deploy Staggered Cron**: Apply `config/cron-stagger.example.yaml` to cron schedulers (distributing waves from 08:00 to 08:30 Asia/Kuwait).
4. **Deploy System Prompts**: Copy `prompts/desk-ops.md` and country addenda to desk agent configurations.
5. **Switch Accounts Spend Watch**: Transition Accounts agent from hourly checks to 3x/day audits (07:45, 15:45, 23:45 Asia/Kuwait).

---

## 6. Rollback Mechanism

If unexpected issues arise in live operations, immediate rollback can be executed without code changes:
- In `config/spend-caps.example.yaml`, set:
  ```yaml
  cost_mode: "legacy"
  ```
- This triggers legacy pass-through mode, disabling delta digests and batching constraints while preserving standard prompt execution.
