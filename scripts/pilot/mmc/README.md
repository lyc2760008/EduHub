<!-- MMC pilot runbook for setup/import scripts (idempotent, allowlist-only). -->
# MMC Pilot Scripts (Spring 2026)

These scripts provision the MMC Education Calgary pilot tenant, catalog, groups, and sessions, plus an **allowlist-only** import for parents/students. They are idempotent and safe to re-run.

## Safety Rules
- **Allowlist required** for imports; the script hard-fails if `allowlist.txt` is missing or empty.
- Scripts are **idempotent** (re-running should not duplicate records).
- **No UI changes**; these are ops scripts only.
- **Exclude dates** reduce total sessions (no auto make-up).

## Prereqs
- Set required env vars (especially `DATABASE_URL`). See `docs/ops/env-vars.md`.
- Ensure the Excel file is present at `scripts/pilot/mmc/Student Record.xlsx` or pass `--xlsxPath`.

## Setup Script (Tenant + Catalog + Groups + Sessions)

Default (staging or production with explicit `DATABASE_URL`):
```bash
pnpm pilot:mmc:setup-spring-2026 -- \
  --tenantSlug mmc \
  --tenantName "MMC Education Calgary" \
  --centerName "MMC Calgary" \
  --timeZone "America/Edmonton" \
  --termStart "2026-02-09" \
  --occurrences 18
```

Dry run (prints actions, no writes):
```bash
pnpm pilot:mmc:setup-spring-2026 -- --dryRun
```

Optional exclude dates:
```bash
pnpm pilot:mmc:setup-spring-2026 -- --excludeDatesFile scripts/pilot/mmc/exclude-dates.txt
```

Optional teacher mapping (override tutor assignments):
```bash
pnpm pilot:mmc:setup-spring-2026 -- --teacherMappingFile scripts/pilot/mmc/teacher-mapping.json
```

### Teacher Mapping Format
`teacher-mapping.json` supports program and/or group overrides:
```json
{
  "programs": {
    "singapore-math": "mmceducationcalgary@gmail.com",
    "writing": "nicolemacarthur@mywic.ca",
    "english-lsrw": "hanka.ilott@gmail.com"
  },
  "groups": {
    "wr-g6-7-mon-1800": "nicolemacarthur@mywic.ca",
    "wr-g11-12-mon-1800": "mmceducationcalgary@gmail.com"
  }
}
```

Only the three MMC teacher emails are accepted; mapping to other emails hard-fails. Use this to resolve overlap conflicts (two writing groups share the same time by default).

## Import Script (Allowlist Only)

Default:
```bash
pnpm pilot:mmc:import-students-parents -- \
  --tenantSlug mmc \
  --xlsxPath "scripts/pilot/mmc/Student Record.xlsx" \
  --sheetName "????" \
  --allowlistPath "scripts/pilot/mmc/allowlist.txt"
```

Dry run:
```bash
pnpm pilot:mmc:import-students-parents -- --dryRun
```

### Allowlist Format (Mandatory)
`allowlist.txt`:
- One email per line
- `#` comments allowed

### Enrollment Overrides (Recommended for Accuracy)
Create `scripts/pilot/mmc/enrollments.json` (or pass `--enrollmentsPath`).

Format:
```json
{
  "_comment": "Map parent email -> student name -> group codes",
  "parent@example.com": {
    "Student Name": ["sm-g2-tue-1830", "en-g2-3-fri-1745"]
  }
}
```

If `enrollments.json` exists, **only** students with explicit mappings are enrolled. Others are reported in warnings.

### Conservative Auto-Enroll (When No Overrides)
If `enrollments.json` is **not** present, the script auto-enrolls only these Singapore Math groups:
- K/G1 -> `sm-kg1-mon-1630`
- G2 -> `sm-g2-tue-1830`
- G4 -> `sm-g4-thu-1630`
- G8 -> `sm-g8-tue-1930`

All other students are reported for manual enrollment mapping.

## Exclude Dates Format
`exclude-dates.txt`:
```
# One local date per line (America/Edmonton)
2026-02-16
2026-04-10
```

## Notes
- Flora Fan is set to the **Admin** role (single-role membership); she is still assigned as Singapore Math tutor in groups/sessions.
- Re-run scripts safely; they upsert by tenant slug, center name, program/level names, and group names.
