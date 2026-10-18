<#
.SYNOPSIS
    Removes the FocusbrewActivityTracker Windows service created by an earlier version.

.DESCRIPTION
    The tracker now runs in the user's session (see install-autostart.ps1). A service lives in
    Session 0 and cannot see the desktop, so it records nothing and also holds port 8765.
    Run this once, from an elevated PowerShell, before installing the autostart copy.
#>
#Requires -RunAsAdministrator

$ErrorActionPreference = 'Stop'
$name = 'FocusbrewActivityTracker'

try {
    $service = Get-Service -Name $name -ErrorAction SilentlyContinue
    if (-not $service) {
        Write-Host "Service '$name' is not installed. Nothing to do."
        exit 0
    }

    if ($service.Status -ne 'Stopped') {
        Stop-Service -Name $name -Force
        $service.WaitForStatus('Stopped', [TimeSpan]::FromSeconds(20))
    }

    & sc.exe delete $name | Out-Host
    if ($LASTEXITCODE -ne 0) { throw "sc.exe delete failed with exit code $LASTEXITCODE" }

    Write-Host "Service '$name' removed. The old database in C:\ProgramData\focusbrew is left in place."
    exit 0
}
catch {
    Write-Error $_.Exception.Message
    exit 1
}
