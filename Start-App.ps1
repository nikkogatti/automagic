$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$nodeCommand = Get-Command node -ErrorAction Stop
$nodePath = $nodeCommand.Source
& $nodePath -e "if (Number(process.versions.node.split('.')[0]) < 24) process.exit(1)"
if ($LASTEXITCODE -ne 0) { throw 'Install Node.js 24 or newer first.' }
if (-not (Test-Path -LiteralPath 'node_modules/vite/bin/vite.js')) { throw 'Dependencies are missing. Follow README.md setup steps.' }
if (-not (Test-Path -LiteralPath 'vendor/scryfall-connector-main/dist/index.js')) {
    & $nodePath 'vendor/scryfall-connector-main/node_modules/typescript/bin/tsc' -p 'vendor/scryfall-connector-main/tsconfig.json'
    if ($LASTEXITCODE -ne 0) { throw 'Connector build failed. Follow README.md setup steps.' }
}
& $nodePath 'node_modules/vite/bin/vite.js' build
if ($LASTEXITCODE -ne 0) { throw 'Frontend build failed.' }
& $nodePath 'server/index.mjs'
