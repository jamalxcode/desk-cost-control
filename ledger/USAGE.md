# How desks append one incident line

File: `/home/box/agent-data/shared/desk-cost-control/store/incidents.jsonl`  
Schema: `/home/box/agent-data/shared/desk-cost-control/schemas/incident.schema.json`  
Mode: **append-only** (never truncate or rewrite prior lines).

## Steps

1. Read `tanker-hits-summary.json` / recent `incidents.jsonl` so you do not double-count.
2. Build **one** JSON object with required fields.
3. Append **exactly one line** (no pretty-print newlines inside the object).
4. If it is a new confirmed commercial hull hit, also update `store/tanker-hits-summary.json`.
5. Flash Acting CEO only (slim org). Stay silent if nothing new.

## Example append (shell)

```bash
printf '%s\n' '{"id":"tanker-example-2026-09-05","geo":"Hormuz","type":"tanker_hit","severity":"alert","severity_tier":"ALERT","severity_level":"🔴","first_seen":"2026-09-05T06:00:00Z","last_seen":"2026-09-05T06:00:00Z","sources":["UKMTO"],"desks":["hormuz"],"claim_fingerprint":"tanker_hit|hormuz|example|2026-09-05","post_ids":[],"summary":"Example only — replace with real hull facts.","confidence":"HIGH","status":"OPEN"}' \
  >> /home/box/agent-data/shared/desk-cost-control/store/incidents.jsonl
```

## Field tips

- `id`: stable slug, e.g. `tanker-sidr-2026-08-31`.
- `type`: use `tanker_hit` for commercial hull strikes (schema allows free string).
- `severity` / `severity_tier`: kinetic hull hits → `alert` / `ALERT` (and `🔴` if using `severity_level`).
- `confidence`: `CONFIRMED` | `HIGH` | `MEDIUM` | `UNVERIFIED`.
- `claim_fingerprint`: normalized `type|geo|vessel|date` (or SimHash later) for dedupe.
- `post_ids`: X post ids when known; else `[]`.
- `summary`: ≤280 chars, plain facts, no house-style headers.

## Do not

- Invent hulls, casualties, or attackers beyond sources.
- Delete or edit earlier JSONL lines.
- DM Jamal; flash Acting CEO only.
