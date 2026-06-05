# Reliable theme pull for networks that block Google Cloud Storage.
#
# Root cause of "Error downloading content from URL" (theme.css):
#   shopify theme pull downloads assets from storage.googleapis.com, which is
#   blocked on some networks (firewalls, corporate VPNs, regional restrictions).
#
# This script:
#   1. Pulls Liquid/JSON/config files via Shopify CLI (uses myshopify.com API)
#   2. Pulls assets via Admin API (also uses myshopify.com, no GCS needed)
#
# Usage:
#   .\scripts\pull-theme.ps1              # live theme (default)
#   .\scripts\pull-theme.ps1 -Environment working
#   .\scripts\pull-theme.ps1 -TryCliAssets # attempt CLI asset pull if GCS is reachable

param(
    [string]$Environment = "live",
    [switch]$TryCliAssets
)

$ErrorActionPreference = "Stop"
$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")

# Prefer IPv4; avoids some Windows IPv6 routing issues with Google endpoints.
$env:NODE_OPTIONS = "--dns-result-order=ipv4first"

# Skip analytics calls that also timeout on restricted networks.
$env:SHOPIFY_CLI_NO_ANALYTICS = "1"

function Test-GcsReachable {
    try {
        $result = curl.exe -4 -sI --connect-timeout 8 "https://storage.googleapis.com" 2>&1
        return ($LASTEXITCODE -eq 0 -and $result -match "HTTP/")
    }
    catch {
        return $false
    }
}

function Get-ThemeConfig {
    param([string]$EnvName)

    $tomlPath = Join-Path $ProjectRoot "shopify.theme.toml"
    if (-not (Test-Path $tomlPath)) {
        throw "Missing shopify.theme.toml in project root."
    }

    $content = Get-Content $tomlPath -Raw
    $section = if ($EnvName -eq "default") { "environments.default" } else { "environments.$EnvName" }

    $store = if ($content -match "\[$section\][^\[]*store\s*=\s*`"([^`"]+)`"") { $Matches[1] } else { $null }
    $theme = if ($content -match "\[$section\][^\[]*theme\s*=\s*`"([^`"]+)`"") { $Matches[1] } else { $null }

    if (-not $store -or -not $theme) {
        throw "Environment '$EnvName' not found in shopify.theme.toml"
    }

    return @{ Store = $store; ThemeId = $theme }
}

Write-Host "=== Kisco Candles Theme Pull ===" -ForegroundColor Cyan
Write-Host "Environment: $Environment`n"

$config = Get-ThemeConfig -EnvName $Environment
$gcsOk = Test-GcsReachable

if ($gcsOk) {
    Write-Host "Network check: storage.googleapis.com is reachable." -ForegroundColor Green
}
else {
    Write-Host "Network check: storage.googleapis.com is BLOCKED." -ForegroundColor Yellow
    Write-Host "  Using Admin API fallback for assets (this is normal on restricted networks).`n"
}

# Step 1: Pull theme code (Liquid, JSON, config) via CLI
Write-Host "Step 1/2: Pulling theme code files..." -ForegroundColor Cyan
Push-Location $ProjectRoot
try {
    shopify theme pull -e $Environment -n `
        --only "config/*" `
        --only "layout/*" `
        --only "sections/*" `
        --only "templates/*" `
        --only "snippets/*" `
        --only "locales/*"

    if ($LASTEXITCODE -ne 0) {
        throw "Code pull failed (exit $LASTEXITCODE). Run: shopify auth login --store $($config.Store)"
    }
}
finally {
    Pop-Location
}

Write-Host "  Code files pulled successfully.`n" -ForegroundColor Green

# Step 2: Pull assets
if ($gcsOk -and $TryCliAssets) {
    Write-Host "Step 2/2: Pulling assets via Shopify CLI..." -ForegroundColor Cyan
    Push-Location $ProjectRoot
    try {
        shopify theme pull -e $Environment -n --only "assets/*"
        if ($LASTEXITCODE -eq 0) {
            Write-Host "`nTheme pull complete (CLI assets)." -ForegroundColor Green
            exit 0
        }
        Write-Host "  CLI asset pull failed, falling back to Admin API...`n" -ForegroundColor Yellow
    }
    finally {
        Pop-Location
    }
}
else {
    Write-Host "Step 2/2: Pulling assets via Admin API (GCS bypass)..." -ForegroundColor Cyan
}

& (Join-Path $PSScriptRoot "pull-assets-api.ps1") `
    -Store $config.Store `
    -ThemeId $config.ThemeId `
    -OutputPath $ProjectRoot

if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Write-Host "`nTheme pull complete." -ForegroundColor Green
Write-Host "  Store:  $($config.Store)"
Write-Host "  Theme:  $($config.ThemeId)"
Write-Host "  Path:   $ProjectRoot"
