# Seed Neon staging with the Prisma seed file (safe, idempotent upserts).
# Usage: pwsh -File scripts/seed-neon-staging.ps1
# Optional: set DATABASE_URL, DIRECT_URL, SEED_DEFAULT_PASSWORD, SEED_RUN_MIGRATE=1 beforehand.

$ErrorActionPreference = "Stop"

function Read-RequiredEnv([string]$Name, [string]$Prompt, [switch]$Secret) {
  $value = (Get-Item -Path "Env:$Name" -ErrorAction SilentlyContinue).Value
  if ($value) {
    return $value
  }

  if ($Secret) {
    $secure = Read-Host $Prompt -AsSecureString
    $plain = [Runtime.InteropServices.Marshal]::PtrToStringAuto(
      [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
    )
    Set-Item -Path "Env:$Name" -Value $plain
    return $plain
  }

  $entered = Read-Host $Prompt
  Set-Item -Path "Env:$Name" -Value $entered
  return $entered
}

# Ensure we're running from the repo root so relative paths work.
$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

# Required inputs (prompt if missing).
Read-RequiredEnv -Name "DATABASE_URL" -Prompt "Enter DATABASE_URL"
Read-RequiredEnv -Name "SEED_DEFAULT_PASSWORD" -Prompt "Enter SEED_DEFAULT_PASSWORD" -Secret

# Staging tenant defaults (can be overridden by pre-set env vars).
if (-not $env:SEED_DEMO_TENANT_SLUG) { $env:SEED_DEMO_TENANT_SLUG = "pilot-staging" }
if (-not $env:SEED_DEMO_TENANT_NAME) { $env:SEED_DEMO_TENANT_NAME = "Pilot Staging" }
if (-not $env:SEED_SECOND_TENANT_SLUG) { $env:SEED_SECOND_TENANT_SLUG = "acme-staging" }
if (-not $env:SEED_SECOND_TENANT_NAME) { $env:SEED_SECOND_TENANT_NAME = "Acme Staging" }
# Staging refresh is an explicit operation, so opt into non-sandbox seed + password overwrite.
$env:PRISMA_SEED_ALLOW_ANY_DB = "1"
$env:SEED_OVERWRITE_PASSWORDS = "1"

# Resolve effective seed emails to match prisma/seed.ts defaults (emails only, no secrets).
$seedOwnerEmail = if ($env:SEED_OWNER_EMAIL) { $env:SEED_OWNER_EMAIL } else { "owner@demo.local" }
$seedTutorEmail = if ($env:SEED_TUTOR_EMAIL) { $env:SEED_TUTOR_EMAIL } else { "tutor@demo.local" }
$seedParentEmail = if ($env:SEED_PARENT_EMAIL) { $env:SEED_PARENT_EMAIL } else { "parent@demo.local" }
# Log the effective tenant + user emails so operators can confirm the login targets post-seed.
Write-Host ("Seeding '{0}' (owner={1}, tutor={2}, parent={3})" -f $env:SEED_DEMO_TENANT_SLUG, $seedOwnerEmail, $seedTutorEmail, $seedParentEmail)

# Optional: run migrations first if SEED_RUN_MIGRATE is set.
if ($env:SEED_RUN_MIGRATE -match "^(1|true|yes)$") {
  if (-not $env:DIRECT_URL) { $env:DIRECT_URL = $env:DATABASE_URL }
  pnpm db:migrate:deploy
}

pnpm db:seed
