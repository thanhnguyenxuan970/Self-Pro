[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string] $Apk,
    [Parameter(Mandatory = $true)]
    [string] $ExpectedEndpoint
)

$ErrorActionPreference = 'Stop'
$productionHost = 'ebprkyplvqexzpwfasjq.supabase.co'

if ($env:HABI_BUILD_TARGET -ne 'staging') {
    throw 'STAGING_ENDPOINT_BLOCKED|HABI_BUILD_TARGET must be staging'
}

$expected = $ExpectedEndpoint.TrimEnd('/')
if (-not $expected) {
    throw 'STAGING_ENDPOINT_BLOCKED|expected staging endpoint is missing'
}

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead((Resolve-Path -LiteralPath $Apk))
try {
    $entry = $zip.GetEntry('assets/index.android.bundle')
    if ($null -eq $entry) {
        throw 'STAGING_ENDPOINT_BLOCKED|APK bundle is missing'
    }
    $reader = [System.IO.StreamReader]::new($entry.Open())
    try {
        $bundle = $reader.ReadToEnd()
    } finally {
        $reader.Dispose()
    }
} finally {
    $zip.Dispose()
}

if ($bundle -match [regex]::Escape($productionHost)) {
    throw 'STAGING_ENDPOINT_BLOCKED|APK contains the Self-Pro production host'
}

if (-not $bundle.Contains($expected)) {
    throw 'STAGING_ENDPOINT_BLOCKED|APK endpoint does not match EXPO_PUBLIC_SUPABASE_URL'
}

Write-Output 'STAGING_APK_ENDPOINT_OK'
