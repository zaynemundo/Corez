[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateNotNullOrEmpty()]
    [string]$Task,

    [Parameter()]
    [ValidateSet('Analysis', 'Implement', 'ReviewDiff')]
    [string]$Mode = 'Analysis',

    [Parameter()]
    [ValidateSet('web', 'headless', 'agy')]
    [string]$Profile = 'agy',

    [Parameter()]
    [string]$Patch,

    [Parameter()]
    [switch]$DumpConfig,

    [Parameter()]
    [switch]$Isolate,

    [Parameter()]
    [ValidateRange(1, 60)]
    [int]$TimeoutMinutes = 5,

    [Parameter()]
    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'

# --dump-config early exit (DSH parity: dsh --profile web --dump-config)
if ($DumpConfig) {
    $dumpScript = @"
import { ProfileRegistry } from './packages/agent-core/harness/ProfileRegistry.js';
import { HarnessContext } from './packages/agent-core/harness/HarnessContext.js';
const ctx = new HarnessContext({});
const reg = new ProfileRegistry({ context: ctx });
const rows = reg.compose('$Profile');
console.log(JSON.stringify({ profile: '$Profile', rows }, null, 2));
"@
    $tmpFile = Join-Path ([System.IO.Path]::GetTempPath()) "agy-dump-$([guid]::NewGuid().ToString('N')).mjs"
    Set-Content -Path $tmpFile -Value $dumpScript -Encoding UTF8
    try {
        node $tmpFile
        exit $LASTEXITCODE
    } finally {
        Remove-Item -Path $tmpFile -Force -ErrorAction SilentlyContinue
    }
}

if (-not (Get-Command agy -ErrorAction SilentlyContinue)) {
    throw 'AGY is not installed or is not available on PATH.'
}

# Profile validation mirrors DSH profile registry (web/headless/agy)
$validProfiles = @('web', 'headless', 'agy')
if ($Profile -notin $validProfiles) {
    throw "Unknown profile `"$Profile`". Available: $($validProfiles -join ', ')"
}

# Patch file validation (cordis.patch.json overlay)
if ($Patch) {
    if (-not (Test-Path $Patch)) {
        throw "Patch file not found: $Patch"
    }
    try {
        $null = Get-Content $Patch -Raw | ConvertFrom-Json
    } catch {
        throw "Patch file is not valid JSON: $Patch. $($_.Exception.Message)"
    }
}

if (-not $OutputPath) {
    $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $outputDirectory = Join-Path $PSScriptRoot '..\artifacts\mimo'
    $OutputPath = Join-Path $outputDirectory "mimo-$($Mode.ToLowerInvariant())-$timestamp.txt"
}

$resolvedOutputDirectory = Split-Path -Parent $OutputPath
if ($resolvedOutputDirectory) {
    New-Item -ItemType Directory -Path $resolvedOutputDirectory -Force | Out-Null
}

$agyMode = 'plan'
$effectiveTask = $Task

switch ($Mode) {
    'Analysis' {
        $effectiveTask = @"
You are MiMo V2.5, a subordinate specialist advising DeepSeek V4 Flash, the lead engineer and final decision-maker.
Analyse the bounded task below without modifying files or running commands that change state.
Return findings, evidence, risks, and recommendations for DeepSeek V4 Flash to review critically.

TASK:
$Task
"@
    }
    'Implement' {
        $agyMode = 'accept-edits'
        $effectiveTask = @"
You are MiMo V2.5, a subordinate specialist working on a task explicitly authorised by DeepSeek V4 Flash.
Modify only the files and scope named below. Do not access secrets, environment files, or credentials.
Report every file changed and every verification command run. Stop if the scope is ambiguous.

AUTHORISED TASK:
$Task
"@
    }
    'ReviewDiff' {
        if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
            throw 'Git is required for ReviewDiff mode.'
        }

        $changedPaths = @(& git diff --name-only HEAD --)
        if ($LASTEXITCODE -ne 0) {
            throw "Unable to list the current Git diff (git exit code $LASTEXITCODE)."
        }

        $sensitivePathPattern = '(^|[\\/])(\.env($|\.)|.*credentials?.*|.*secrets?.*|.*\.pem$|.*\.key$|.*\.pfx$|.*\.p12$)'
        $sensitivePaths = @($changedPaths | Where-Object { $_ -match $sensitivePathPattern })
        if ($sensitivePaths.Count -gt 0) {
            throw "Refusing to send a diff containing potentially sensitive paths to AGY: $($sensitivePaths -join ', ')"
        }

        $diff = (& git diff --no-ext-diff HEAD -- 2>&1 | Out-String)
        if ($LASTEXITCODE -ne 0) {
            throw "Unable to read the current Git diff (git exit code $LASTEXITCODE)."
        }
        if ([string]::IsNullOrWhiteSpace($diff)) {
            $diff = '[No tracked staged or unstaged changes are present.]'
        }

        $effectiveTask = @"
You are an independent code reviewer advising DeepSeek V4 Flash, the lead engineer and final decision-maker.
Review the supplied Git diff only. Do not modify files or run tools. Prioritise correctness, security,
regressions, missing tests, and maintainability. Cite affected files and explain actionable findings.

REVIEW FOCUS:
$Task

CURRENT GIT DIFF:
$diff
"@
    }
}

# DSH-lite: session log (model-visible => logged) - sidecar JSONL for replay
$sessionLogDir = Join-Path $PSScriptRoot '..\artifacts\sessions'
New-Item -ItemType Directory -Path $sessionLogDir -Force | Out-Null
$sessionId = "agy-$($Mode.ToLowerInvariant())-$(Get-Date -Format 'yyyyMMdd-HHmmss')-$([guid]::NewGuid().ToString('N').Substring(0,6))"
$sessionLogPath = Join-Path $sessionLogDir "$sessionId.jsonl"
# append turn/start + user/message durably before dispatch
$turnStart = @{ type = 'turn/start'; seq = 1; time = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); data = @{ turn = 1 } } | ConvertTo-Json -Compress
$sessionStart = @{ type = 'step/start'; seq = 2; time = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); data = @{ turn = 1; step = 1 } } | ConvertTo-Json -Compress
$userMsg = @{ type = 'user/message'; seq = 3; time = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); data = @{ role = 'user'; content = $effectiveTask }; surfaceOp = 'append' } | ConvertTo-Json -Compress
Set-Content -Path $sessionLogPath -Value "$turnStart`n$sessionStart`n$userMsg" -Encoding UTF8

$agyLogPath = Join-Path ([System.IO.Path]::GetTempPath()) "agy-cli-$([guid]::NewGuid().ToString('N')).log"
# DSH profile determines sandbox + tool composition; agy modes map to --mode plan/accept-edits
# --isolate mirrors dsh per-session isolate realm (session-specific capability set)
$agyArguments = @(
    '--log-file', $agyLogPath,
    '--mode', $agyMode,
    '--model', 'codex',
    '--sandbox',
    '--print-timeout', "$($TimeoutMinutes)m",
    '--print', $effectiveTask
)
if ($Isolate) {
    $agyArguments += @('--isolate', $sessionId)
}
if ($Patch) {
    $agyArguments += @('--patch', $Patch)
}

Write-Host "Delegating to MiMo V2.5 (via AGY + Codex) profile=$Profile mode=$Mode isolate=$Isolate Output: $OutputPath SessionLog: $sessionLogPath"
$agyOutput = @(& agy @agyArguments 2>&1 | Tee-Object -FilePath $OutputPath)
$agyExitCode = $LASTEXITCODE
$agyOutputText = $agyOutput -join [Environment]::NewLine

# append assistant result to session log (durable, reconstructable)
try {
    $assistSeq = 4
    $chunk = @{ type = 'assistant/chunk'; seq = $assistSeq; time = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); data = @{ turn = 1; step = 1; chunk = @{ type = 'text'; text = $agyOutputText.Substring(0, [Math]::Min(8000, $agyOutputText.Length)) } } } | ConvertTo-Json -Compress
    Add-Content -Path $sessionLogPath -Value $chunk -Encoding UTF8
    $assistMsg = @{ type = 'assistant/message'; seq = ($assistSeq+1); time = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); data = @{ turn = 1; step = 1; message = @{ role = 'assistant'; content = $agyOutputText } }; surfaceOp = 'append'; sourceEventSeqs = @($assistSeq) } | ConvertTo-Json -Compress
    Add-Content -Path $sessionLogPath -Value $assistMsg -Encoding UTF8
    $stepEnd = @{ type = 'step/end'; seq = ($assistSeq+2); time = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); data = @{ turn = 1; step = 1 } } | ConvertTo-Json -Compress
    Add-Content -Path $sessionLogPath -Value $stepEnd -Encoding UTF8
    $turnEnd = @{ type = 'turn/end'; seq = ($assistSeq+3); time = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds(); data = @{ turn = 1; reason = @{ kind = if ($agyExitCode -eq 0) { 'completed' } else { 'error' } } } } | ConvertTo-Json -Compress
    Add-Content -Path $sessionLogPath -Value $turnEnd -Encoding UTF8
} catch {
    # session log is best-effort; never obscure main result
}

if ($agyExitCode -ne 0) {
    throw "AGY failed with exit code $agyExitCode. Partial output was preserved at '$OutputPath'. SessionLog: $sessionLogPath"
}
if ([string]::IsNullOrWhiteSpace($agyOutputText) -or $agyOutputText -match 'no output produced') {
    throw "AGY did not produce a usable response. Output was preserved at '$OutputPath'. SessionLog: $sessionLogPath"
}

Write-Host "AGY completed. Review its output at: $OutputPath SessionLog: $sessionLogPath"
