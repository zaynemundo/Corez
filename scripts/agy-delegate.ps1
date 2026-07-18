[CmdletBinding()]
param(
    [Parameter(Mandatory = $true, Position = 0)]
    [ValidateNotNullOrEmpty()]
    [string]$Task,

    [Parameter()]
    [ValidateSet('Analysis', 'Implement', 'ReviewDiff')]
    [string]$Mode = 'Analysis',

    [Parameter()]
    [ValidateRange(1, 60)]
    [int]$TimeoutMinutes = 5,

    [Parameter()]
    [string]$OutputPath
)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command agy -ErrorAction SilentlyContinue)) {
    throw 'AGY is not installed or is not available on PATH.'
}

if (-not $OutputPath) {
    $timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $outputDirectory = Join-Path $PSScriptRoot '..\artifacts\agy'
    $OutputPath = Join-Path $outputDirectory "agy-$($Mode.ToLowerInvariant())-$timestamp.txt"
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
You are a subordinate specialist advising Codex, the lead engineer and final decision-maker.
Analyse the bounded task below without modifying files or running commands that change state.
Return findings, evidence, risks, and recommendations for Codex to review critically.

TASK:
$Task
"@
    }
    'Implement' {
        $agyMode = 'accept-edits'
        $effectiveTask = @"
You are a subordinate specialist working on a task explicitly authorised by Codex.
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
You are an independent code reviewer advising Codex, the lead engineer and final decision-maker.
Review the supplied Git diff only. Do not modify files or run tools. Prioritise correctness, security,
regressions, missing tests, and maintainability. Cite affected files and explain actionable findings.

REVIEW FOCUS:
$Task

CURRENT GIT DIFF:
$diff
"@
    }
}

$agyLogPath = Join-Path ([System.IO.Path]::GetTempPath()) "agy-cli-$([guid]::NewGuid().ToString('N')).log"
$agyArguments = @(
    '--log-file', $agyLogPath,
    '--mode', $agyMode,
    '--sandbox',
    '--print-timeout', "$($TimeoutMinutes)m",
    '--print', $effectiveTask
)

Write-Host "Delegating to AGY in $Mode mode. Output: $OutputPath"
$agyOutput = @(& agy @agyArguments 2>&1 | Tee-Object -FilePath $OutputPath)
$agyExitCode = $LASTEXITCODE
$agyOutputText = $agyOutput -join [Environment]::NewLine

if ($agyExitCode -ne 0) {
    throw "AGY failed with exit code $agyExitCode. Partial output was preserved at '$OutputPath'."
}
if ([string]::IsNullOrWhiteSpace($agyOutputText) -or $agyOutputText -match 'no output produced') {
    throw "AGY did not produce a usable response. Output was preserved at '$OutputPath'."
}

Write-Host "AGY completed. Review its output at: $OutputPath"
