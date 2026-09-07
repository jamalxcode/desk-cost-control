# Gulf tanker / ASBM OSINT capture watchlist

Purpose: catch future events like Kharg Iranian-tanker strike claims and @IranObserver0 three-tanker / ASBM spikes — before Jamal has to paste a link.

## Always capture when any of these fire
- Iranian tanker / NITC / Kharg / Bandar Abbas / Larak hit or strike claims
- US / CENTCOM strikes on Iranian oil tankers (any count)
- ASBM / anti-ship ballistic missile near-miss or launch toward US warships / escorts in Hormuz–Gulf
- Named hull + projectile/missile/drone in Hormuz, GoO, Kharg approaches, or Red Sea

## Priority X accounts (check posts + engagement)
- IranObserver0
- Tasnim / IRIB English lanes (via wires if X blocked)
- Major OSINT aggregators recirculating tanker/ASBM claims with high likes/RTs

## Keywords (X news + recent post counts)
`Kharg tanker`, `Iranian tanker strike`, `ASBM Hormuz`, `anti-ship ballistic`, `CENTCOM tanker`, `NITC hit`, `US missiles tanker Iran`

## What to do on hit
1. Append `store/incidents.jsonl` (include `post_ids` when from X)
2. Update related summary notes if commercial vs US-on-Iranian
3. Flash Acting CEO immediately (EARLY OSINT labeled) — CEO notifies Jamal
4. Do NOT wait for full corroboration; walk back only on formal deny

## Commercial tally rule
US-on-Iranian hulls: ledger yes, commercial 29-count no.
Iran/Houthi-on-commercial: ledger yes + tanker-hits-summary yes.


## Tit-for-tat tanker war frame (Jamal, 5 Sep 2026 ~17:41 KWT)
For EVERY incident record: vessel, who hit, who owns/operates, **hull side** (US/Western/GCC commercial vs Iran/NITC/shadow vs other), attacker side.
Canonical register: `store/tanker-war-register.json`

## Seizures (Jamal, 5 Sep ~17:44 KWT)
Ship seizures / boardings / forced diversions count as hostile actions in the tit-for-tat register — same fields as hits. Capture IRGC, US, and other seizures of tankers either direction.


## Priority X accounts (updated [5 Sep 20:54 Kuwait])
- IranObserver0
- **HormuzReport** (priority — ASBM / carrier / destroyer / tanker war; flash Acting CEO within minutes of new BREAKING)
- ClashReport / similar high-engagement Gulf OSINT when they name hulls or US warships

## Instant-flash triggers (do not wait for next cron)
- Any claim of ASBM / anti-ship missiles on US carrier, destroyer, or warships (Hormuz/GoO)
- Named Iranian or commercial tanker hit/seizure either direction
- Kuwait AD/sirens official or high-engagement cluster
