# Registers focusbrew-tracker.exe as the FocusbrewActivityTracker Windows service.
# Run from an elevated PowerShell (Run as administrator).
#
#   .\install-service.ps1 -ExePath "D:\Projetos\focusbrew\src-tauri-service\target\release\focusbrew-tracker.exe"
#
# Auto-start with Windows, running as LocalService (no user login needed).

#Requires -RunAsAdministrator

param(
    [Parameter(Mandatory = $true)]
    [string]$ExePath
)

$ErrorActionPreference = 'Stop'
$name = 'FocusbrewActivityTracker'

if (-not (Test-Path -LiteralPath $ExePath)) {
    throw "Binary not found: $ExePath"
}
$resolved = (Resolve-Path -LiteralPath $ExePath).Path

if (Get-Service -Name $name -ErrorAction SilentlyContinue) {
    Write-Host "Service '$name' already exists; updating its binary path and account."
    & sc.exe config $name "binPath=" "`"$resolved`"" "obj=" "NT AUTHORITY\LocalService" | Out-Host
} else {
    & sc.exe create $name "binPath=" "`"$resolved`"" "start=" auto "obj=" "NT AUTHORITY\LocalService" "DisplayName=" "focusbrew Activity Tracker" | Out-Host
}
if ($LASTEXITCODE -ne 0) {
    throw "sc.exe failed with exit code $LASTEXITCODE"
}

& sc.exe description $name "Tracks app usage and idle time for focusbrew" | Out-Host

$service = Get-Service -Name $name
if ($service.Status -ne 'Running') {
    Start-Service -Name $name
}

Get-Service -Name $name | Format-Table Name, Status, StartType -AutoSize
