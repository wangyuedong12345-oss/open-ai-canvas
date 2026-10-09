[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'

# Keep the existing local startup entry point, using independent background workers.
& (Join-Path $PSScriptRoot 'start-local-background.ps1')
