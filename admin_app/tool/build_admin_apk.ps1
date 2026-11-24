# Builds the private admin APK with the gateway admin token baked in.
#
# The admin app is distributed privately, so the token is passed at compile time
# instead of asking the operator to paste it on every install:
#
#   flutter build apk --debug --dart-define=YOUPI_ADMIN_TOKEN=<token>
#
# The token itself stays in server/.env and is never committed.
$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$envFile = Join-Path $root 'server\.env'
if (-not (Test-Path $envFile)) {
    throw "Missing $envFile"
}

$token = ((Get-Content $envFile | Where-Object { $_ -match '^ADMIN_TOKEN=' }) -replace '^ADMIN_TOKEN=', '').Trim()
if ([string]::IsNullOrWhiteSpace($token)) {
    throw 'ADMIN_TOKEN is not configured in server/.env'
}

Push-Location (Join-Path $root 'admin_app')
try {
    flutter build apk --debug --dart-define=YOUPI_ADMIN_TOKEN=$token
} finally {
    Pop-Location
}
