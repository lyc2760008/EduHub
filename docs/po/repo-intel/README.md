# Repo Intelligence Pack (EduHub)

This folder is a deterministic, evidence-first planning pack for PO and delivery leads.

- Scope: route capabilities, write-path inventory, current-state deltas, and duplicate-work risk.
- Canonical comparison target: `docs/po/current-state.md`.
- Source-of-truth rule: every claim must map to code evidence (`path` + `symbol`).

## Contents

- `docs/po/repo-intel/capability-matrix.md`
  - Route/endpoint capability map (sorted lexicographically)
  - Data mutation map grouped by model/table
  - Access control/RBAC/tenant enforcement summary
- `docs/po/repo-intel/current-state-deltas.md`
  - Implemented in code but missing/ambiguous in `current-state.md`
  - Claims in `current-state.md` that code cannot confirm
  - Implementation inconsistencies/duplicates
- `docs/po/repo-intel/duplication-risk.md`
  - High-risk duplicate proposal areas (grounded in code + PO docs)
  - Safe next-step zones
- `docs/po/repo-intel/repo-intel.json`
  - Machine-readable export for tooling

## Regeneration

1. Refresh baseline generated state doc:
- `pnpm docs:state`

2. Re-scan routes and write sites (same scan basis used for this pack):
- `docs/po/repo-intel/.scan.json` (local scan artifact)

3. Rebuild all pack files from the refreshed scan + curated delta/risk review against:
- `docs/po/current-state.md`
- `docs/po/current-state.generated.md`
- `src/app/**`, `src/lib/**`, `prisma/schema.prisma`

## Evidence Rules

- Every capability/mutation claim must include:
  - file path
  - symbol/function/handler name
  - note on whether it is explicit (`@state.capabilities`) or inferred
- Inference is allowed only when code shape is explicit (for example: route segment + HTTP method) and must be tagged as inferred.
- No behavior is documented as implemented unless code evidence is present.
- No secrets: env var names only.
