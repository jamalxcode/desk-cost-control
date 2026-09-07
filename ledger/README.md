# Shared notebook (ledger)

Plain-English rules for every desk. Read this before writing anything.

## Where it lives

Root: `/home/box/agent-data/shared/desk-cost-control/`

| Path | What it is |
|------|------------|
| `store/incidents.jsonl` | Append-only incident log (one JSON object per line). Schema: `schemas/incident.schema.json`. |
| `store/tanker-hits-summary.json` | Rolling commercial-hit tally (counts, flags, attackers, last hit). |
| `store/oil-diesel.json` | Latest oil/diesel baseline (AAA diesel, Brent, WTI, HO). |
| `store/drop-audit.jsonl` | DROP triage samples only — not for kinetic facts. |
| `ledger/SLIM_ORG.md` | Who talks to whom (slim org). |
| `ledger/USAGE.md` | How to append one incident line. |

## What to write

Write **only material kinetic / maritime-security facts** that other desks need to share:

- Confirmed or high-confidence tanker / commercial hull hits
- Air-defense engagements, intercepts, official sirens, named strikes
- UKMTO / JMIC / company / wire products that change the shared picture

Each incident line must match `schemas/incident.schema.json` (required: `id`, `geo`, `type`, `severity`, `first_seen`, `last_seen`, `sources`, `desks`, `claim_fingerprint`, `post_ids`). Prefer `severity_tier` / `severity_level` and `confidence` / `status` / `summary` when known.

Update `tanker-hits-summary.json` or `oil-diesel.json` only when you have fresh primary numbers — do not invent hulls or prices.

## Who may write

- **Country / theater desks** (and marine/reporter packs): append incidents for their lane; flash Acting CEO on kinetic.
- **Acting CEO**: may correct, merge notes, or seed baselines; is the only Jamal-facing voice for ledger-driven alerts.
- **Writer / Accounts**: do not own the ledger; Writer formats sitreps from facts; Accounts watches spend.

Do not rewrite history in place. **Append** new lines. If a prior line was wrong, append a clarifying update (new `id` or same fingerprint with later `last_seen`) rather than deleting.

## Silence rules

- Default is **silence**.
- No quiet-day filler. No “all clear” status spam. No locked-room chatter to Jamal.
- Ping / write only for **kinetic** (confirmed or high-confidence early OSINT) or significant oil/diesel moves / new confirmed hull hits per standing routines.
- Contested attribution stays labeled contested; do not double-count late-identified hulls.

## Jamal-facing voice

**Acting CEO is the only Jamal-facing voice** for desk coordination and kinetic flashes drawn from this ledger.

- Desks do **not** DM Jamal.
- Desks flash **Acting CEO only**.
- Writer may style a shareable card when Acting CEO asks; Accounts speaks only on spend.

See `ledger/SLIM_ORG.md` for leads and room map.
