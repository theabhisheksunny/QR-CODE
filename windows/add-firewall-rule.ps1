<#
.SYNOPSIS
    Adds a narrow inbound Windows Firewall rule so other devices on the local
    network can reach Universal QR Sharing. The application itself never calls
    this script automatically; it only detects likely LAN blocking and advises
    the user to run it.

.DESCRIPTION
    Creates a single INBOUND Allow rule for TCP on the given port, scoped to the
    Private network profile only. It never disables the firewall and never
    touches the Domain or Public profiles.

.PARAMETER Port
    The TCP port the application is listening on. Defaults to 8787. When the app
    selects a different runtime port (because 8787 was busy), pass that port.

.EXAMPLE
    # Run from an elevated PowerShell prompt:
    .\add-firewall-rule.ps1 -Port 8787
#>
[CmdletBinding()]
param(
    [ValidateRange(1, 65535)]
    [int]$Port = 8787
)

$ErrorActionPreference = 'Stop'
$ruleName = "Universal QR Sharing (TCP $Port, Private)"

Write-Host "Intended action:" -ForegroundColor Cyan
Write-Host "  - Add ONE inbound firewall rule." -ForegroundColor Cyan
Write-Host "  - Protocol : TCP" -ForegroundColor Cyan
Write-Host "  - Port     : $Port" -ForegroundColor Cyan
Write-Host "  - Profile  : Private only (Domain/Public untouched)" -ForegroundColor Cyan
Write-Host "  - Action   : Allow inbound" -ForegroundColor Cyan
Write-Host "  - The Windows Firewall is NOT disabled." -ForegroundColor Cyan
Write-Host ""

# Require elevation: creating firewall rules needs administrator rights.
$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Error "This script must be run from an elevated (Administrator) PowerShell session."
    exit 1
}

$existing = Get-NetFirewallRule -DisplayName $ruleName -ErrorAction SilentlyContinue
if ($existing) {
    Write-Host "A rule named '$ruleName' already exists. Nothing to do." -ForegroundColor Yellow
    exit 0
}

New-NetFirewallRule `
    -DisplayName $ruleName `
    -Description "Allow inbound LAN connections to Universal QR Sharing on TCP $Port." `
    -Direction Inbound `
    -Protocol TCP `
    -LocalPort $Port `
    -Profile Private `
    -Action Allow | Out-Null

Write-Host "Created inbound firewall rule '$ruleName'." -ForegroundColor Green
Write-Host "To remove it later, run:" -ForegroundColor DarkGray
Write-Host "  Remove-NetFirewallRule -DisplayName `"$ruleName`"" -ForegroundColor DarkGray
