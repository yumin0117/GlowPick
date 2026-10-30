$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$env:GLOWPICK_MODE = 'live'
& "$PSScriptRoot\.venv\Scripts\python.exe" "$PSScriptRoot\app.py"
