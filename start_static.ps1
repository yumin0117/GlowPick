$ErrorActionPreference = 'Stop'
Push-Location -LiteralPath $PSScriptRoot
try {
  node scripts/dev-static.mjs
} finally {
  Pop-Location
}
