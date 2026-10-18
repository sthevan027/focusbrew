<#
.SYNOPSIS
    Installs focusbrew-tracker for the current user: it starts at logon, in the user's session.

.DESCRIPTION
    The tracker must run in the interactive session. A Windows service lives in Session 0, where
    GetForegroundWindow returns NULL, so a service records nothing.

    What this does (no administrator rights needed):
      1. stops the installed copy, if running;
      2. copies the binary to <InstallDir> (default %LOCALAPPDATA%\focusbrew\bin);
      3. restricts <DataDir> (default %LOCALAPPDATA%\focusbrew) to this user, SYSTEM and Administrators;
      4. registers HKCU\Software\Microsoft\Windows\CurrentVersion\Run so it starts at logon;
      5. starts it and waits for /api/health.

    -Uninstall removes the Run entry and stops the process. Collected data is kept.

.EXAMPLE
    .\install-autostart.ps1 -ExePath "D:\Projetos\focusbrew\src-tauri-service\target\release\focusbrew-tracker.exe"

.EXAMPLE
    .\install-autostart.ps1 -Uninstall
#>
[CmdletBinding()]
param(
    [string]$ExePath,
    [string]$InstallDir = (Join-Path $env:LOCALAPPDATA 'focusbrew\bin'),
    [string]$DataDir = (Join-Path $env:LOCALAPPDATA 'focusbrew'),
    [string]$RunValueName = 'FocusbrewTracker',
    [int]$Port = 8765,
    [int]$HealthTimeoutSec = 20,
    [switch]$SkipRegistry,
    [switch]$NoStart,
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
$target = Join-Path $InstallDir 'focusbrew-tracker.exe'

function Stop-InstalledTracker {
    # Only the copy installed under $InstallDir; a dev build running elsewhere is left alone.
    $running = Get-Process -Name 'focusbrew-tracker' -ErrorAction SilentlyContinue |
        Where-Object { $_.Path -and ($_.Path -ieq $target) }
    foreach ($process in $running) {
        Stop-Process -Id $process.Id -Force
        $process.WaitForExit(10000) | Out-Null
    }
}

function Restrict-ToCurrentUser([string]$Path) {
    # Drop inherited entries, then grant only this user, SYSTEM and Administrators (by SID,
    # so it works on any Windows language). Nothing here is writable by other accounts.
    $me = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
    & icacls.exe $Path /inheritance:r /grant:r "*${me}:(OI)(CI)F" '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null
    if ($LASTEXITCODE -ne 0) { throw "icacls failed on $Path (exit $LASTEXITCODE)" }
}

function Wait-ForHealth {
    $deadline = (Get-Date).AddSeconds($HealthTimeoutSec)
    while ((Get-Date) -lt $deadline) {
        try {
            $health = Invoke-RestMethod -Uri "http://127.0.0.1:$Port/api/health" -TimeoutSec 2
            if ($health.status -eq 'ok') { return $true }
        } catch { Start-Sleep -Milliseconds 500 }
    }
    return $false
}

try {
    Stop-InstalledTracker

    if ($Uninstall) {
        if (Get-ItemProperty -Path $runKey -Name $RunValueName -ErrorAction SilentlyContinue) {
            Remove-ItemProperty -Path $runKey -Name $RunValueName -ErrorAction Stop
        }
        Write-Host "Autostart removed. Data kept in $DataDir."
        exit 0
    }

    if (-not $ExePath) { throw 'Pass -ExePath with the built focusbrew-tracker.exe.' }
    if (-not (Test-Path -LiteralPath $ExePath)) { throw "Binary not found: $ExePath" }

    New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
    New-Item -ItemType Directory -Force -Path $DataDir | Out-Null
    Restrict-ToCurrentUser $DataDir
    if ((Resolve-Path $InstallDir).Path -notlike "$((Resolve-Path $DataDir).Path)*") {
        Restrict-ToCurrentUser $InstallDir
    }

    Copy-Item -LiteralPath $ExePath -Destination $target -Force

    if (-not $SkipRegistry) {
        Set-ItemProperty -Path $runKey -Name $RunValueName -Value "`"$target`""
    }

    if (-not $NoStart) {
        Start-Process -FilePath $target -WindowStyle Hidden
        if (-not (Wait-ForHealth)) {
            throw "The tracker did not answer on 127.0.0.1:$Port within ${HealthTimeoutSec}s. See $DataDir\tracker.log."
        }
    }

    Write-Host "Installed: $target"
    if (-not $SkipRegistry) { Write-Host "Starts at logon via $runKey\$RunValueName" }
    exit 0
}
catch {
    Write-Error $_.Exception.Message
    exit 1
}
