$ErrorActionPreference = "Stop"
$node = (Get-Command node -ErrorAction Stop).Source
& $node (Join-Path $PSScriptRoot "sync-menu-assets.mjs")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
