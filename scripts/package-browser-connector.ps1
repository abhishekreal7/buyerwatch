$ErrorActionPreference = 'Stop'
$workspace = Split-Path -Parent $PSScriptRoot
$source = Join-Path $workspace 'browser-connector'
$destination = Join-Path $workspace 'public\buyerwatch-reddit-connector.zip'

if (-not (Test-Path -LiteralPath $source -PathType Container)) {
  throw 'browser-connector source directory is missing'
}
$temporary = Join-Path $workspace 'tmp\buyerwatch-reddit-connector.zip'
New-Item -ItemType Directory -Path (Split-Path -Parent $temporary) -Force | Out-Null
if (Test-Path -LiteralPath $temporary) {
  Remove-Item -LiteralPath $temporary -Force
}
Compress-Archive -Path (Join-Path $source '*') -DestinationPath $temporary -CompressionLevel Optimal
Move-Item -LiteralPath $temporary -Destination $destination -Force
Write-Output $destination
