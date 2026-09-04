# Desk Cost Control & Cadence Optimization: Implementation Plan

## Overview
This document outlines the multi-phase deployment roadmap for Jamal Al Mutawa's Middle East Watch Desk cost control architecture. It details the transition from **Phase 0 (Core Library, Schemas, Triage & Cadence Control)** to **Phase 1 (Live Grok Bot Routine Wiring)** and **Phase 2 (Automated Fact-Check & Verification Gate)**.

---

## Phase 0: Foundations, Store, Triage & Budgets (CURRENT STATUS: COMPLETED)

The P0 deliverables establish the foundational offline libraries, schemas, rules, prompt packs, and cadence configurations without touching live production agents or incurring API costs.

### Delivered Deliverables in P0:
1. **Shared Incident Store (`src/store/`)**:
   - JSON Schemas & TypeScript definitions: `Incident`, `Cluster`, `SeenPost`.
   - Append-only file-based JSONL writer with atomic compaction (`compactIncidentStore`).
   - Deduplication: SHA-256 post ID hashing, claim normalization, SimHash 64-bit fingerprinting, and token Jaccard similarity.
   - 6-hour spatio-temporal clustering grouping reports by `geo + type + 6h window`.

2. **Triage Router (`src/triage/`)**:
   - Deterministic keyword and pattern evaluation (`DROP` | `BATCH` | `ALERT`).
   - Priority severity indicators: `🟢` (Drop/Quiet), `🟡` (Batch/Monitor), `🟠` (Elevated Alert), `🔴` (Critical Alert).
   - Non-batchable critical alert triggers: kinetic strikes, missiles, drone intercepts, mobilization, force movement, GPS jamming spikes, ADS-B dark clusters, airspace closures, Kuwait air defense/sirens, Hormuz tanker hit/seizure.
   - Ambiguity escalation protocol: Unresolved kinetic indicators escalate to `BATCH` or `ALERT`, never dropped silently.
   - `DropAuditLogger` for recording dropped content samples to JSONL for quality assurance.
   - Cheap classifier interface (`CheapClassifier`) hook for pluggable fallback.

3. **Compact Rolling State (`src/state/`)**:
   - Per-desk `state.json` storage managing `last_run_at`, `open_incidents`, `silence_streak`, `last_alert_at`, and `since_cursor`.
   - Delta digest generator (`produceDeltaDigest`) eliminating full chat history replay and reducing token consumption by >80%.

4. **Cached Static Prompt Pack (`prompts/`)**:
   - Shared operational instructions (`prompts/desk-ops.md`) enforcing X-first ingestion, silence-on-quiet policy, and source confidence ratings (`CONFIRMED`, `HIGH`, `MEDIUM`, `UNVERIFIED`).
   - Country addenda: `kuwait.md`, `iran.md`, `hormuz.md`, `gcc.md`, `levant.md`, `red-sea.md`, `qatar.md`.
   - House style isolation: 🟰 headers and emojis are strictly owned by the Writer agent; desks emit plain JSON facts only.

5. **Strict JSON Output & Token Budgets (`schemas/desk-output.schema.json`, `src/writer/`)**:
   - Strict output schema with length boundaries (`max_items: 5`, `max_summary_chars: 140`, `max_chars_per_item: 280`).
   - Writer mapper stub (`mapDeskOutputToAirspaceCard`) converting desk output into formatted emoji watch cards without hallucinations or invented events.

6. **Non-Urgent Batcher (`src/batcher/`)**:
   - Configurable 15–30 minute batch queue for monitoring items.
   - Instant bypass mechanism for all `ALERT` events.

7. **Spend Caps & Cron Stagger Configs (`config/`)**:
   - `config/spend-caps.example.yaml`: Soft/hard budget thresholds and Accounts agent audit procedure.
   - `config/cron-stagger.example.yaml`: Staggered wave execution resolving 08:00 AM stampede, reducing Accounts checks to 2–3x/day, and adding the missing Qatar standing brief stub.

---

## Phase 1: Live Routine Wiring & Grok Bot Integration (NEXT PHASE - Pending Jamal's Approval)

*Prerequisite: Secondary explicit approval from Jamal Al Mutawa (Acting CEO / Desk Lead).*

### Objectives
Wire the tested P0 libraries into live Grok Bot cron routines, agent execution contexts, and persistent storage volumes.

### Step-by-Step Implementation:
1. **Shared Volume Mounting**:
   - Mount persistent shared volume `/var/data/desk-store/` accessible across all Grok Bot desk workers.
   - Point `IncidentStore`, `DeskStateManager`, and `DropAuditLogger` to the shared volume.

2. **Cron Cadence Migration**:
   - Replace legacy 08:00 AM simultaneous trigger with the staggered schedule in `config/cron-stagger.example.yaml`:
     - **08:00 Asia/Kuwait**: Kuwait, Iran, Strait of Hormuz
     - **08:05 Asia/Kuwait**: GCC, Qatar stub
     - **08:15 Asia/Kuwait**: Levant
     - **08:20 Asia/Kuwait**: Red Sea & Bab el-Mandeb
     - **08:30 / 12:30 / 20:30 Asia/Kuwait**: Reporter synthesis rollups
   - Reconfigure Accounts agent audit schedule from hourly to 3x daily (07:45, 15:45, 23:45 Asia/Kuwait).

3. **Grok Bot Agent Pipeline Wiring**:
   - Replace full prompt injection with static system prompt pack (`prompts/desk-ops.md` + country addendum).
   - Ingest new X posts via local triage and deduplication layer before invoking xAI/Grok APIs:
     ```
     Raw X Stream → Dedupe (Post ID + SimHash) → TriageRouter
          ├── DROP  → Log to drop-audit.jsonl (Zero LLM tokens spent)
          ├── BATCH → Enqueue in NonUrgentBatcher (Flushed on 20-min cycle)
          └── ALERT → Immediate LLM validation & instant alert broadcast
     ```
   - Supply delta digest (`DeltaDigest.prompt_input`) instead of historical transcripts.

4. **Writer Agent Output Formatting**:
   - Connect Writer agent to consume `DeskOutput` JSON events and produce formatted emoji cards for Telegram/Slack distribution.

5. **Telemetry & Verification**:
   - Measure 7-day token spend and API billing vs baseline.
   - Monitor DROP audit logs to verify zero false negatives on critical kinetic alerts.

---

## Phase 2: Fact-Check Gate & Multi-Source Verification (FUTURE PHASE)

### Objectives
Introduce automated multi-source corroboration, cross-desk corroboration matrix, and automated confidence scoring before alerts are promoted to the broadcast tier.

### Target Capabilities:
1. **Cross-Desk Corroboration Engine**:
   - When multiple desks (e.g. Iran Desk + Hormuz Desk + GCC Desk) report corroborating signals within the 6-hour cluster window, automatically elevate confidence label from `UNVERIFIED` / `MEDIUM` to `HIGH` / `CONFIRMED`.

2. **Automated Source Credibility Ledger**:
   - Maintain historical accuracy scores for primary OSINT handles, official ministries, and wire services.
   - Require >= 2 independent high-reputation sources for kinetic strike claims unless accompanied by verified radar/ADS-B transponder telemetry.

3. **Dispute & Contradiction Resolution**:
   - Detect conflicting reports (e.g. claim of intercept vs claim of impact).
   - Format dispute flags into delta digest: `[DISPUTE DETECTED: Source A reports interception; Source B reports impact at 08:12 UTC]`.

4. **Automated Archival & Historical Search Index**:
   - Transition file-based JSONL compaction to SQLite / DuckDB / vector storage for sub-second historical research while retaining append-only simplicity.

---

## Rollback & Safety Mechanisms

- **Emergency Rollback (`cost_mode: legacy`)**:
  - Setting `cost_mode: "legacy"` in `spend-caps.yaml` instantly bypasses deduplication and delta digest constraints, falling back to original direct prompt ingestion without system disruption.
- **Fail-Safe Alert Delivery**:
  - The `ALERT` triage pathway has no dependencies on network batching or external classifiers. All kinetic keywords immediately trigger high-priority processing.
