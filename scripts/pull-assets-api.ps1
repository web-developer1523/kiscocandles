# Downloads theme assets via Shopify Admin API (bypasses Google Cloud Storage).
# Use when "shopify theme pull" fails with "Error downloading content from URL"
# because storage.googleapis.com is blocked on your network.

param(
    [string]$Store = "kiskocandles.myshopify.com",
    [string]$ThemeId = "131912990829",
    [string]$OutputPath = (Join-Path $PSScriptRoot ".."),
    [string]$ApiVersion = "2026-04"
)

$ErrorActionPreference = "Stop"

function Get-ShopifyCliToken {
    param([string]$StoreDomain)

    $configPath = Join-Path $env:APPDATA "shopify-cli-kit-nodejs\Config\config.json"
    if (-not (Test-Path $configPath)) {
        throw "Shopify CLI session not found. Run: shopify auth login --store $StoreDomain"
    }

    $config = Get-Content $configPath -Raw | ConvertFrom-Json
    $sessionStore = $config.sessionStore | ConvertFrom-Json
    $accountId = $config.currentSessionId
    $account = $sessionStore.'accounts.shopify.com'.$accountId

    if (-not $account) {
        throw "No active Shopify CLI session. Run: shopify auth login --store $StoreDomain"
    }

    $token = $null
    foreach ($prop in $account.applications.PSObject.Properties) {
        if ($prop.Name -like "$StoreDomain-*") {
            $token = $prop.Value.accessToken
            break
        }
    }

    if (-not $token) {
        throw "No token for $StoreDomain. Run: shopify auth login --store $StoreDomain"
    }

    return $token
}

function Invoke-ShopifyApi {
    param(
        [string]$Uri,
        [string]$Token
    )

    $headers = @{ Authorization = "Bearer $Token" }
    return Invoke-RestMethod -Uri $Uri -Headers $headers -TimeoutSec 120 -Method Get
}

Write-Host "Fetching asset list from $Store (theme $ThemeId)..." -ForegroundColor Cyan

$token = Get-ShopifyCliToken -StoreDomain $Store
$baseUrl = "https://$Store/admin/api/$ApiVersion/themes/$ThemeId"
$assetList = Invoke-ShopifyApi -Uri "$baseUrl/assets.json" -Token $token
$assets = @($assetList.assets | Where-Object { $_.key.StartsWith("assets/") })

if ($assets.Count -eq 0) {
    Write-Host "No assets/ files found." -ForegroundColor Yellow
    exit 0
}

$assetsDir = Join-Path (Resolve-Path $OutputPath) "assets"
New-Item -ItemType Directory -Force -Path $assetsDir | Out-Null

$total = $assets.Count
$current = 0
$failed = @()

foreach ($asset in $assets) {
    $current++
    $key = $asset.key
    $relativePath = $key.Substring("assets/".Length)
    $localPath = Join-Path $assetsDir $relativePath
    $localDir = Split-Path $localPath -Parent

    if ($localDir -and -not (Test-Path $localDir)) {
        New-Item -ItemType Directory -Force -Path $localDir | Out-Null
    }

    Write-Progress -Activity "Downloading assets via Admin API" -Status $key -PercentComplete (($current / $total) * 100)

    try {
        $encodedKey = [uri]::EscapeDataString($key)
        $detail = Invoke-ShopifyApi -Uri "$baseUrl/assets.json?asset%5Bkey%5D=$encodedKey" -Token $token
        $item = $detail.asset

        if ($item.attachment) {
            [IO.File]::WriteAllBytes($localPath, [Convert]::FromBase64String($item.attachment))
        }
        elseif ($null -ne $item.value) {
            [IO.File]::WriteAllText($localPath, $item.value, [Text.UTF8Encoding]::new($false))
        }
        else {
            throw "Asset has no value or attachment"
        }
    }
    catch {
        $failed += $key
        Write-Host "  Failed: $key - $($_.Exception.Message)" -ForegroundColor Red
    }
}

Write-Progress -Activity "Downloading assets via Admin API" -Completed

if ($failed.Count -gt 0) {
    Write-Host "`nDownloaded $($total - $failed.Count)/$total assets. $($failed.Count) failed." -ForegroundColor Yellow
    exit 1
}

Write-Host "`nSuccessfully downloaded $total assets to $assetsDir" -ForegroundColor Green
