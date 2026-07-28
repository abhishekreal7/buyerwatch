param(
  [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\backups')
)

$ErrorActionPreference = 'Stop'
$databaseUrl = $env:SUPABASE_DATABASE_URL
if ([string]::IsNullOrWhiteSpace($databaseUrl)) {
  throw 'Set SUPABASE_DATABASE_URL to the production pooler or direct Postgres URL.'
}
if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
  throw 'pg_dump is required. Install PostgreSQL client tools first.'
}

$resolvedRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory)
if (-not $resolvedOutput.StartsWith($resolvedRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
  throw "Backup output must remain inside the repository: $resolvedRoot"
}

New-Item -ItemType Directory -Path $resolvedOutput -Force | Out-Null
$timestamp = (Get-Date).ToUniversalTime().ToString('yyyyMMddTHHmmssZ')
$target = Join-Path $resolvedOutput "buyerwatch-$timestamp.dump"

& pg_dump `
  --dbname="$databaseUrl" `
  --format=custom `
  --compress=9 `
  --no-owner `
  --no-privileges `
  --file="$target"
if ($LASTEXITCODE -ne 0) {
  throw "pg_dump failed with exit code $LASTEXITCODE"
}

$hash = (Get-FileHash -Algorithm SHA256 -LiteralPath $target).Hash.ToLowerInvariant()
Write-Output "Backup created: $target"
Write-Output "SHA256: $hash"
