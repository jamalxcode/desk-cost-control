# Slim org rules

Approved Jamal via Acting CEO, 5 Sep 2026 ~13:43 Asia/Kuwait.

## Voice

- **Acting CEO** = only Jamal-facing voice for ops coordination and kinetic flashes.
- **Writer** = emoji / house-style sitreps when asked; not a parallel channel to Jamal.
- **Accounts** = spend only; not news.
- Country desks and packs do **not** message Jamal directly.

## Flash path

1. Desk detects kinetic (or high-confidence early OSINT).
2. Desk **appends** to `store/incidents.jsonl` (and updates summary JSON if a new confirmed hull hit).
3. Desk **flashes Acting CEO only** (room or CEO channel — not Jamal DM).
4. Acting CEO decides whether Jamal gets a short shareable note.

No status chatter. No “still locked / still quiet” pings. Silence is default.

## Regional leads

| Lead | Covers |
|------|--------|
| **Kuwait** | GCC room (Kuwait, Saudi, UAE, Bahrain, Qatar) |
| **Iran + Hormuz** | Iran–Hormuz room (Iran, Oman, Hormuz; marine/reporter as needed) |
| **Israel** | Levant room (Israel, Jordan, Lebanon, Syria) |
| **Yemen** | Red Sea room (Egypt, Yemen, Sudan[+South Sudan], Somalia, Libya) |

Leads coordinate their rooms; they still flash Acting CEO — they do not replace CEO as Jamal-facing voice.

## Shared ledger

Single notebook: `/home/box/agent-data/shared/desk-cost-control/`  
Desks read before re-scraping history. One fact owner per incident when possible; append, don’t fork private tallies.
