$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
$env:GLOWPICK_MODE = 'mock'
& "$PSScriptRoot\.venv\Scripts\python.exe" "$PSScriptRoot\app.py"
