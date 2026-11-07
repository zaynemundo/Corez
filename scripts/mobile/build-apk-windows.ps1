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
# It also prepares the rest of this environment's toolchain:
#   * a portable Temurin JDK 25 under .tools/ when JAVA_HOME is missing
#     (Gradle 9.4.1 supports JVM 17-26; JDK 27 is not supported yet);
#   * a newer Ninja (1.12+) in the SDK's CMake folder, because the Ninja
#     bundled with CMake 3.22.1 rejects >260-character object paths even when
#     Windows long paths are enabled;
#   * the NDK r27 libc++ workaround, injected by
#     mobile/plugins/withCmakeStlFix.js during `expo prebuild`.
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
$ProgressPreference = 'SilentlyContinue'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$tools = Join-Path $repo '.tools'
New-Item -ItemType Directory -Force $tools | Out-Null

function Get-PortableJdk {
    $extractRoot = Join-Path $tools 'jdk-extract'
    New-Item -ItemType Directory -Force $extractRoot | Out-Null
    $zip = Join-Path $tools 'jdk25.zip'
    if (-not (Test-Path $zip)) {
        Write-Host 'Downloading Temurin JDK 25...'
        Invoke-WebRequest -Uri 'https://api.adoptium.net/v3/binary/latest/25/ga/windows/x64/jdk/hotspot/normal/eclipse' -OutFile $zip -UseBasicParsing
    }
    if (-not (Get-ChildItem $extractRoot -Directory -ErrorAction SilentlyContinue)) {
        Expand-Archive -Path $zip -DestinationPath $extractRoot -Force
    }
    return (Get-ChildItem $extractRoot -Directory | Where-Object {
        Test-Path (Join-Path $_.FullName 'bin\java.exe')
    } | Select-Object -First 1).FullName
}

# 1. Locate (or provision) a supported JDK.
$jdk = $env:JAVA_HOME
if (-not $jdk -or -not (Test-Path (Join-Path $jdk 'bin\java.exe'))) {
    $jdk = Get-PortableJdk
}
if (-not $jdk) { throw 'No JDK found and the portable JDK download failed.' }

# 2. Locate the Android SDK.
$sdk = $env:ANDROID_HOME
if (-not $sdk) { $sdk = $env:ANDROID_SDK_ROOT }
if (-not $sdk) { $sdk = 'C:\Users\ASUS PC\AppData\Local\Android\Sdk' }
if (-not (Test-Path (Join-Path $sdk 'platform-tools'))) {
    throw "Android SDK not found at $sdk. Set ANDROID_HOME."
}

# 3. Ensure CMake's Ninja is new enough for long object paths.
$ninjaDir = Join-Path $sdk 'cmake\3.22.1\bin'
$ninja = Join-Path $ninjaDir 'ninja.exe'
if (Test-Path $ninja) {
    $ninjaVersion = (& $ninja --version 2>$null) -join ''
    if ($ninjaVersion -notmatch '^1\.(1[2-9]|[2-9])\b') {
        Write-Host "Upgrading Ninja ($ninjaVersion) for long-path support..."
        $cmakeZip = Join-Path $tools 'cmake-4.1.2-windows.zip'
        $cmakeExtract = Join-Path $tools 'cmake-4.1.2'
        if (-not (Test-Path $cmakeZip)) {
            Invoke-WebRequest -Uri 'https://dl.google.com/android/repository/cmake-4.1.2-windows.zip' -OutFile $cmakeZip -UseBasicParsing
        }
        if (-not (Test-Path $cmakeExtract)) {
            Expand-Archive -Path $cmakeZip -DestinationPath $cmakeExtract -Force
        }
        if (-not (Test-Path "$ninja.old")) { Copy-Item $ninja "$ninja.old" -Force }
        Copy-Item (Join-Path $cmakeExtract 'bin\ninja.exe') $ninja -Force
    }
}

Write-Host "JDK:          $jdk"
Write-Host "Android SDK:  $sdk"
Write-Host "Source repo:  $repo"
Write-Host "Build root:   $Destination"

# 4. Copy the mobile project and the shared package to the short path.
$mobileSource = Join-Path $repo 'mobile'
$sharedSource = Join-Path $repo 'packages\corez-shared'
$mobileDest = Join-Path $Destination 'mobile'
$sharedDest = Join-Path $Destination 'packages\corez-shared'
New-Item -ItemType Directory -Force $Destination | Out-Null

robocopy $mobileSource $mobileDest /E /XD node_modules android .expo dist-export build-artifacts /NFL /NDL /NJH /NJS /NP | Out-Null
robocopy $sharedSource $sharedDest /E /XD node_modules __tests__ /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit code $LASTEXITCODE" }

# 5. Install dependencies and build.
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
