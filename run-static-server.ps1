# run-static-server.ps1
#
# Convenience wrapper around .claude/serve.ps1 — starts the minimal
# static-file HttpListener on :8765 from the UI repo root so V8
# pages, the hub, and the standalone login.html all resolve.
#
# Pairs with the Valc repo's setup/run-mini-valc.ps1: same one-line
# start pattern, foreground process, Ctrl-C to stop.
#
# Required state:
#   - PowerShell 5.1+ (Windows ships it).
#   - Port 8765 free (the underlying script will fail to bind if
#     something's already on it).
#
# Override the port via:    $env:PORT = 9000; .\run-static-server.ps1
#
# (ASCII-only; PowerShell 5.1 reads scripts as cp1252.)

[CmdletBinding()]
param(
    [int]$Port = 8765
)

$ErrorActionPreference = 'Stop'

$repoRoot   = $PSScriptRoot
$serveScript = Join-Path $repoRoot '.claude\serve.ps1'

if (-not (Test-Path $serveScript)) {
    throw "serve.ps1 not found at $serveScript. The wrapper expects it relative to the UI repo root."
}

# Surface for the user — the .claude/serve.ps1 script is intentionally
# terse and chatty (one line on listen, one line per error), so its own
# output covers operational logging.
Write-Host ""
Write-Host "Static file server" -ForegroundColor Cyan
Write-Host ("=" * 50)
Write-Host "  Root: $repoRoot"
Write-Host "  URL : http://localhost:$Port/"
Write-Host "  E.g.: http://localhost:$Port/login.html"
Write-Host "        http://localhost:$Port/RRV8/inventory-reconciliation.html"
Write-Host ""
Write-Host "Ctrl-C to stop."
Write-Host ""

$env:PORT = $Port
& $serveScript
