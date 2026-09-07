# Phase 1 rollback

1. Set `cost_mode: legacy` in `/home/box/agent-data/shared/desk-cost-control/config/spend-caps.yaml` — desks follow legacy full-watch path.
2. Or restore automation.json from `/home/box/agent-data/shared/desk-cost-control/backups/20260904T101918Z/`.
3. Live desks were NOT deleted; only schedule + prompt changed.

Merged P0 code: https://github.com/jamalxcode/desk-cost-control (main @ 58cd52b)
