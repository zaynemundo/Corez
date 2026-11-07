# Device spike helper for the CoreZ mobile client.
#
# Runs from the repository root. It never guesses: every stage reports exactly
# what it observed (authorized device, focused activity, visible UI labels,
# screenshots). Signing in must be done by a human on the phone, so the script
# is split into explicit stages:
#
#   powershell -ExecutionPolicy Bypass -File scripts/mobile/verify-device-spike.ps1
#   powershell ... -Stage install    # install + launch, wait for the login UI
#   powershell ... -Stage chat       # (after signing in) send "hello", stream, stop
#   powershell ... -Stage relaunch   # kill + relaunch, confirm the session survived
#   powershell ... -Stage signout    # open Settings, sign out, confirm login
#
# Evidence (screenshots and UI dumps) is written to .tools/spike/.
param(
    [ValidateSet('auto', 'install', 'chat', 'relaunch', 'signout')]
    [string]$Stage = 'auto',
    [switch]$AllowEmulator
)

$ErrorActionPreference = 'Continue'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$apk = Join-Path $repo 'mobile\build-artifacts\app-release.apk'
$outDir = Join-Path $repo '.tools\spike'
$adb = 'C:\Users\ASUS PC\AppData\Local\Android\Sdk\platform-tools\adb.exe'
$env:JAVA_HOME = Join-Path $repo '.tools\jdk-extract\jdk-25.0.5+8'
$buildTools = 'C:\Users\ASUS PC\AppData\Local\Android\Sdk\build-tools\37.0.0'
$apksigner = Join-Path $buildTools 'apksigner.bat'
$package = 'pro.corez.app'

function Write-Stage($message) { Write-Host "== $message" -ForegroundColor Cyan }

function Get-Devices {
    @(& $adb devices 2>$null | Select-Object -Skip 1 | Where-Object { $_ -match "`t" }) |
        ForEach-Object {
            $parts = $_ -split "`t"
            [pscustomobject]@{ Serial = $parts[0]; State = $parts[1].Trim() }
        }
}

function Get-Target {
    $devices = @(Get-Devices)
    if (-not $AllowEmulator) {
        $devices = @($devices | Where-Object { $_.Serial -notmatch '^emulator-' })
    }
    $ready = @($devices | Where-Object { $_.State -eq 'device' })
    if ($ready.Count -gt 0) { return $ready[0] }
    $unauthorized = @($devices | Where-Object { $_.State -eq 'unauthorized' })
    if ($unauthorized.Count -gt 0) {
        throw "Device $($unauthorized[0].Serial) is unauthorized. Accept the 'Allow USB debugging?' prompt on the phone and run again."
    }
    return $null
}

function Capture([string]$serial, [string]$name) {
    & $adb -s $serial shell screencap -p "/sdcard/$name.png" 2>$null
    & $adb -s $serial pull "/sdcard/$name.png" (Join-Path $outDir "$name.png") 2>$null | Out-Null
    & $adb -s $serial shell uiautomator dump "/sdcard/$name.xml" 2>$null | Out-Null
    & $adb -s $serial pull "/sdcard/$name.xml" (Join-Path $outDir "$name.xml") 2>$null | Out-Null
    Write-Host "evidence: $outDir\$name.png / .xml"
}

function Get-VisibleText([string]$serial) {
    & $adb -s $serial shell uiautomator dump /sdcard/ui.xml 2>$null | Out-Null
    & $adb -s $serial pull /sdcard/ui.xml (Join-Path $outDir 'last-ui.xml') 2>$null | Out-Null
    $xml = Get-Content (Join-Path $outDir 'last-ui.xml') -Raw -ErrorAction SilentlyContinue
    if (-not $xml) { return @() }
    $texts = foreach ($line in ($xml -replace '><', ">`n<" -split "`n")) {
        if ($line -match 'text="([^"]{1,160})"') {
            $value = $matches[1].Trim()
            if ($value) { $value }
        }
    }
    return @($texts)
}

function Get-FocusedActivity([string]$serial) {
    $line = & $adb -s $serial shell dumpsys activity activities 2>$null |
        Select-String -Pattern 'topResumedActivity' |
        Select-Object -First 1
    return ($line.Line -replace '.*u0\s+', '' -replace '\s+.*', '')
}

function Find-NodeCenter([string]$serial, [string]$needle) {
    & $adb -s $serial shell uiautomator dump /sdcard/ui.xml 2>$null | Out-Null
    & $adb -s $serial pull /sdcard/ui.xml (Join-Path $outDir 'last-ui.xml') 2>$null | Out-Null
    $xml = Get-Content (Join-Path $outDir 'last-ui.xml') -Raw -ErrorAction SilentlyContinue
    if (-not $xml) { return $null }
    foreach ($line in ($xml -replace '><', ">`n<" -split "`n")) {
        $bounds = $null
        if ($line -match 'bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"') {
            $bounds = @([int]$matches[1], [int]$matches[2], [int]$matches[3], [int]$matches[4])
        }
        $description = ''
        if ($line -match 'content-desc="([^"]*)"') { $description = $matches[1] }
        $label = ''
        if ($line -match 'text="([^"]*)"') { $label = $matches[1] }
        $found = (($description -and $description -like "*$needle*") -or
                  ($label -and $label -like "*$needle*"))
        if ($found -and $bounds) {
            return [pscustomobject]@{
                X = [int](($bounds[0] + $bounds[2]) / 2)
                Y = [int](($bounds[1] + $bounds[3]) / 2)
            }
        }
    }
    return $null
}

function Assert-SignedInUI([string]$serial) {
    $texts = Get-VisibleText $serial
    if ($texts -contains 'Sign in to your account' -or $texts -contains 'Logo') { return $false }
    return $true
}

New-Item -ItemType Directory -Force $outDir | Out-Null
if (-not (Test-Path $apk)) { throw "Release APK not found at $apk. Build it first." }
if (-not (Test-Path $adb)) { throw "adb not found at $adb." }

if ($Stage -eq 'auto') {
    $target = Get-Target
    if (-not $target) {
        Write-Host 'No authorized physical device.' -ForegroundColor Yellow
        Write-Host 'Connect the phone, enable USB debugging, choose File transfer, accept the RSA prompt.'
        Write-Host 'Then run: powershell -ExecutionPolicy Bypass -File scripts/mobile/verify-device-spike.ps1 -Stage install'
        exit 2
    }
    Write-Host "device: $($target.Serial)"
    & $adb -s $target.Serial shell getprop ro.product.model
    exit 0
}

$target = Get-Target
if (-not $target) { throw 'No authorized device (physical). Pass -AllowEmulator to use an AVD.' }
$serial = $target.Serial
Write-Host "device: $serial ($(& $adb -s $serial shell getprop ro.product.model))"

switch ($Stage) {
    'install' {
        Write-Stage 'install and launch'
        # apksigner writes Java warnings to stderr; do not let those trip the
        # terminating error preference.
        $previousPreference = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        if (Test-Path $apksigner) {
            try {
                & $apksigner verify --print-certs $apk 2>&1 |
                    Select-String -Pattern 'Signer: certificate DN' |
                    Select-Object -First 1 |
                    ForEach-Object { Write-Host $_.Line }
            } catch {
                Write-Host 'apksigner signature check skipped.'
            }
        }
        $ErrorActionPreference = $previousPreference
        & $adb -s $serial install -r $apk 2>&1 | Select-Object -Last 2
        & $adb -s $serial shell am start -n "$package/.MainActivity" 2>&1 | Select-Object -Last 1
        Start-Sleep -Seconds 15
        Write-Host "focused: $(Get-FocusedActivity $serial)"
        $texts = Get-VisibleText $serial
        Write-Host "labels: $($texts -join ' | ')"
        Capture $serial '01-login'
        if ($texts -match 'Sign in to your account') {
            Write-Host 'Login screen reached. Sign in on the phone, then run -Stage chat.' -ForegroundColor Green
        } else {
            Write-Host 'Could not confirm the login screen; inspect the evidence.' -ForegroundColor Yellow
        }
    }
    'chat' {
        Write-Stage 'send hello, verify streaming and Stop'
        if (-not (Assert-SignedInUI $serial)) { throw 'Still on the login screen. Sign in on the phone first.' }
        $input = Find-NodeCenter $serial 'Ask Corez'
        if ($input) { & $adb -s $serial shell input tap $input.X $input.Y; Start-Sleep -Milliseconds 500 }
        & $adb -s $serial shell input text 'hello'
        Start-Sleep -Milliseconds 500
        Capture $serial '02-composed'
        $send = Find-NodeCenter $serial 'Send'
        if (-not $send) { throw 'Send control not found in the UI dump.' }
        & $adb -s $serial shell input tap $send.X $send.Y
        Start-Sleep -Seconds 4
        Capture $serial '03-streaming'
        $stop = Find-NodeCenter $serial 'Stop'
        $texts = Get-VisibleText $serial
        if ($stop) {
            Write-Host 'Stop control present (stream active).' -ForegroundColor Green
            & $adb -s $serial shell input tap $stop.X $stop.Y
            Start-Sleep -Seconds 2
            Capture $serial '04-stopped'
        } else {
            Write-Host 'No Stop control found after 4s; the answer may have completed already.' -ForegroundColor Yellow
        }
    }
    'relaunch' {
        Write-Stage 'kill and relaunch; the session must survive'
        & $adb -s $serial shell am force-stop $package
        Start-Sleep -Seconds 2
        & $adb -s $serial shell am start -n "$package/.MainActivity" 2>&1 | Select-Object -Last 1
        Start-Sleep -Seconds 15
        $texts = Get-VisibleText $serial
        Write-Host "focused: $(Get-FocusedActivity $serial)"
        Write-Host "labels: $($texts -join ' | ')"
        Capture $serial '05-relaunch'
        if ($texts -match 'Sign in to your account') {
            Write-Host 'Session did NOT survive (login screen after relaunch).' -ForegroundColor Red
        } else {
            Write-Host 'Session restored: app relaunched outside the login screen.' -ForegroundColor Green
        }
    }
    'signout' {
        Write-Stage 'sign out from Settings'
        if (-not (Assert-SignedInUI $serial)) { throw 'Already on the login screen; nothing to sign out.' }
        $settings = Find-NodeCenter $serial 'Settings'
        if ($settings) {
            & $adb -s $serial shell input tap $settings.X $settings.Y
            Start-Sleep -Seconds 3
        } else {
            Write-Host 'Settings control not found; opening the route directly.' -ForegroundColor Yellow
            & $adb -s $serial shell am start -a android.intent.action.VIEW -d "corez://settings" $package 2>&1 | Select-Object -Last 1
            Start-Sleep -Seconds 3
        }
        $signOut = Find-NodeCenter $serial 'Sign out'
        if (-not $signOut) { throw 'Sign out control not found in Settings.' }
        & $adb -s $serial shell input tap $signOut.X $signOut.Y
        Start-Sleep -Seconds 3
        $texts = Get-VisibleText $serial
        Write-Host "labels: $($texts -join ' | ')"
        Capture $serial '06-signed-out'
        if ($texts -match 'Sign in to your account') {
            Write-Host 'Signed out: login screen is back.' -ForegroundColor Green
        } else {
            Write-Host 'Sign out not confirmed; inspect the screenshot.' -ForegroundColor Yellow
        }
    }
}
