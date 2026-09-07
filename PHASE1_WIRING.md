# Phase 1 wiring log

When: 2026-09-04T10:19:18.163482+00:00
Backup: /home/box/agent-data/shared/desk-cost-control/backups/20260904T101918Z

- UPDATE Kuwait: 0 8 * * 0-4 -> 0 8 * * 0-4 (prompt slimmed)
- UPDATE Iran: 0 8 * * 0-4 -> 0 8 * * 0-4 (prompt slimmed)
- UPDATE Strait of Hormuz: 0 8 * * 0-4 -> 0 8 * * 0-4 (prompt slimmed)
- UPDATE Saudi: 0 8 * * 0-4 -> 5 8 * * 0-4 (prompt slimmed)
- UPDATE UAE: 0 8 * * 0-4 -> 5 8 * * 0-4 (prompt slimmed)
- UPDATE Bahrain: 0 8 * * 0-4 -> 5 8 * * 0-4 (prompt slimmed)
- UPDATE Oman: 0 8 * * 0-4 -> 5 8 * * 0-4 (prompt slimmed)
- CREATE Qatar 5 8 * * 0-4
- UPDATE Israel: 0 8 * * 0-4 -> 15 8 * * 0-4 (prompt slimmed)
- UPDATE Jordan: 0 8 * * 0-4 -> 15 8 * * 0-4 (prompt slimmed)
- UPDATE Lebanon: 0 8 * * 0-4 -> 15 8 * * 0-4 (prompt slimmed)
- UPDATE Syria: 0 8 * * 0-4 -> 15 8 * * 0-4 (prompt slimmed)
- UPDATE Egypt: 0 8 * * 0-4 -> 20 8 * * 0-4 (prompt slimmed)
- UPDATE Yemen: 0 8 * * 0-4 -> 20 8 * * 0-4 (prompt slimmed)
- UPDATE Sudan: 0 8 * * 0-4 -> 20 8 * * 0-4 (prompt slimmed)
- UPDATE Somalia: 0 8 * * 0-4 -> 20 8 * * 0-4 (prompt slimmed)
- UPDATE Libya: 0 8 * * 1-5 -> 20 8 * * 0-4 (prompt slimmed)
- UPDATE reporter Countries brief night: 0 20 * * * -> 30 20 * * *
- UPDATE reporter Countries brief noon: 0 12 * * * -> 30 12 * * *
- UPDATE reporter Countries brief morning: 0 8 * * * -> 30 8 * * *
- UPDATE Accounts: 47 8-19 * * 1-5 -> 45 7,15,19 * * 0-4

---

## Shared ledger (slim desk) — 2026-09-05

Seeded under `/home/box/agent-data/shared/desk-cost-control/`:

- `ledger/README.md` — path, what to write, who may write, silence, Acting CEO voice
- `ledger/SLIM_ORG.md` — leads, no Jamal DMs, flash CEO only
- `ledger/USAGE.md` — how to append one JSONL incident line
- `store/oil-diesel.json` — Fri 4 Sep 2026 baseline (AAA diesel $5.85, Brent $92.68, WTI $91.48, HO ~$4.59)
- `store/tanker-hits-summary.json` — 29 confirmed (+1 contested Ghazal); Kuwait-flag 3; Iran/IRGC 26 + Houthi 3; last_hit 31 Aug Sidr/Senegal
- `store/incidents.jsonl` — seeded canonical HIGH-confidence tanker hits (Barakah, Kaifan, Amzan, Al Salam II, Burgan, Sidr)

Desks: append one schema-valid JSON line per new incident; see `ledger/USAGE.md`.


## Phase 1 fix pass — 2026-09-06T09:27:54.616172+03:00
- UPDATE Iran: 0 8,14,20 * * * -> 0 8 * * 0-4 (Sun–Thu 08:00 only; removed daily 14/20 drift)
- UPDATE Accounts: prompt now ALWAYS writes morning/3× snap JSONL even on no-change; schedule unchanged 45 7,15,19 * * 0-4
- CONFIRM reporter packs stay OFF: countries-brief-morning/noon/night + cheap-mode + kuwait-kinetic-sitrep all enabled=false
- cost_mode: leave optimized (no legacy flip)


## Phase 1 morning-wave fix (executor) — 2026-09-06T09:29:58.844170+03:00
- UPDATE Accounts: schedule `45 7,15,19 * * 0-4` -> `45 7,15,19 * * *` (daily incl weekends; morning 07:45 mandatory JSONL write). Prompt refreshed; zombie Thu-03 running run cleared. Backup: `/home/box/agent-data/shared/desk-cost-control/backups/morningwave-fix-20260906T092958+0300`.
- CONFIRM Iran already `0 8 * * 0-4` (was drifted `0 8,14,20 * * *`; Sat 20:00 run was drift evidence). No further schedule change needed this pass.
- CONFIRM reporter packs STAY OFF (slim org / kinetic-only): countries-brief-morning `30 8 * * *` enabled=false; noon `30 12 * * *` enabled=false; night `30 20 * * *` enabled=false; cheap-mode-4h-status + kuwait-kinetic-sitrep also enabled=false.
- cost_mode remains optimized (no legacy flip).
- Rollback: restore automation.json from `/home/box/agent-data/shared/desk-cost-control/backups/morningwave-fix-20260906T092958+0300` or set Accounts back to `45 7,15,19 * * 0-4`.
