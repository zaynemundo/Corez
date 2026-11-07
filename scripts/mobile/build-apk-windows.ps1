# Builds a CoreZ debug (or release) APK on Windows.
#
# Why this script exists: Android's native modules (react-native-worklets,
# react-native-screens, reanimated, ...) compile C++ through CMake/Ninja, and
# CMake mirrors the absolute source path inside .cxx/CMakeFiles. Under a deep
# OneDrive path (this repo lives under "C:\Users\ASUS PC\OneDrive\Documents\
# Codex Agent\...") that exceeds the Windows 260-character limit and Ninja
# fails with `mkdir(...): No such file or directory`. Building from a short
# path copy avoids it.
#
# Usage (from the repository root):
#   powershell -ExecutionPolicy Bypass -File scripts/mobile/build-apk-windows.ps1
#   powershell -ExecutionPolicy Bypass -File scripts/mobile/build-apk-windows.ps1 -Variant release
param(
    [string]$Destination = 'C:\czbuild',
    [ValidateSet('debug', 'release')]
    [string]$Variant = 'debug'
)

$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path

# 1. Locate a supported JDK (Gradle 9.4.1 runs on JVM 17-26; JDK 27 is not supported yet).
$jdk = $env:JAVA_HOME
if (-not $jdk -or -not (Test-Path (Join-Path $jdk 'bin\java.exe'))) {
    $portable = Get-ChildItem (Join-Path $repo '.tools\jdk-extract') -Directory -ErrorAction SilentlyContinue |
        Where-Object { Test-Path (Join-Path $_.FullName 'bin\java.exe') } |
        Select-Object -First 1
    $jdk = $portable.FullName
}
if (-not $jdk) {
    throw 'No JDK found. Install JDK 25 and set JAVA_HOME, or unpack a portable Temurin JDK under .tools\jdk-extract\.'
}

# 2. Locate the Android SDK.
$sdk = $env:ANDROID_HOME
if (-not $sdk) { $sdk = $env:ANDROID_SDK_ROOT }
if (-not $sdk) { $sdk = 'C:\Users\ASUS PC\AppData\Local\Android\Sdk' }
if (-not (Test-Path (Join-Path $sdk 'platform-tools'))) {
    throw "Android SDK not found at $sdk. Set ANDROID_HOME."
}

Write-Host "JDK:          $jdk"
Write-Host "Android SDK:  $sdk"
Write-Host "Source repo:  $repo"
Write-Host "Build root:   $Destination"

# 3. Copy the mobile project and the shared package to the short path.
$mobileSource = Join-Path $repo 'mobile'
$sharedSource = Join-Path $repo 'packages\corez-shared'
$mobileDest = Join-Path $Destination 'mobile'
$sharedDest = Join-Path $Destination 'packages\corez-shared'
New-Item -ItemType Directory -Force $Destination | Out-Null

robocopy $mobileSource $mobileDest /E /XD node_modules android .expo dist-export build-artifacts /NFL /NDL /NJH /NJS /NP | Out-Null
robocopy $sharedSource $sharedDest /E /XD node_modules __tests__ /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit code $LASTEXITCODE" }

# 4. Install dependencies and build.
$env:JAVA_HOME = $jdk
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$env:Path = "$jdk\bin;$env:Path"

Push-Location $mobileDest
try {
    if (-not (Test-Path (Join-Path $mobileDest 'node_modules'))) {
        npm ci --no-fund --no-audit
        if ($LASTEXITCODE -ne 0) { throw 'npm ci failed.' }
    }
    npx expo prebuild --platform android --no-install
    if ($LASTEXITCODE -ne 0) { throw 'expo prebuild failed.' }

    Push-Location (Join-Path $mobileDest 'android')
    try {
        $task = if ($Variant -eq 'release') { 'assembleRelease' } else { 'assembleDebug' }
        .\gradlew.bat $task --console=plain
        if ($LASTEXITCODE -ne 0) { throw "gradlew $task failed." }
    }
    finally { Pop-Location }

    $apkDir = Join-Path $mobileDest "android\app\build\outputs\apk\$Variant"
    $apk = Get-ChildItem $apkDir -Filter '*.apk' -ErrorAction SilentlyContinue |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
    if (-not $apk) { throw "No APK produced under $apkDir" }

    $artifactDir = Join-Path $mobileSource 'build-artifacts'
    New-Item -ItemType Directory -Force $artifactDir | Out-Null
    $artifact = Join-Path $artifactDir $apk.Name
    Copy-Item $apk.FullName $artifact -Force

    Write-Host ''
    Write-Host "APK:    $($apk.FullName)"
    Write-Host "Copied: $artifact"
}
finally {
    Pop-Location
}
