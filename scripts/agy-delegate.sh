#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARTIFACTS_DIR="$(cd "$SCRIPT_DIR/../artifacts/mimo" 2>/dev/null && pwd || echo "$SCRIPT_DIR/../artifacts/mimo")"

MODE="Analysis"
TASK=""
TIMEOUT_MINUTES=5
OUTPUT_PATH=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --mode)
            MODE="$2"; shift 2 ;;
        --task)
            TASK="$2"; shift 2 ;;
        --timeout)
            TIMEOUT_MINUTES="$2"; shift 2 ;;
        --output-path)
            OUTPUT_PATH="$2"; shift 2 ;;
        *)
            echo "ERROR: Unknown option '$1'. Usage: $0 --task <task> [--mode Analysis|Implement|ReviewDiff] [--timeout <min>] [--output-path <path>]" >&2
            exit 1 ;;
    esac
done

if [[ -z "$TASK" ]]; then
    echo "ERROR: --task is required." >&2
    exit 1
fi

if ! command -v agy &>/dev/null; then
    echo "ERROR: agy is not installed or not available on PATH." >&2
    exit 1
fi

if [[ "$MODE" != "Analysis" && "$MODE" != "Implement" && "$MODE" != "ReviewDiff" ]]; then
    echo "ERROR: Invalid mode '$MODE'. Must be Analysis, Implement, or ReviewDiff." >&2
    exit 1
fi

if [[ -z "$OUTPUT_PATH" ]]; then
    TIMESTAMP=$(date +%Y%m%d-%H%M%S)
    mkdir -p "$ARTIFACTS_DIR"
    OUTPUT_PATH="$ARTIFACTS_DIR/mimo-$(echo "$MODE" | tr '[:upper:]' '[:lower:]')-$TIMESTAMP.txt"
fi

OUTPUT_DIR=$(dirname "$OUTPUT_PATH")
mkdir -p "$OUTPUT_DIR"

AGY_MODE="plan"
EFFECTIVE_TASK="$TASK"

case "$MODE" in
    Analysis)
        EFFECTIVE_TASK="You are MiMo V2.5, a subordinate specialist advising DeepSeek V4 Flash, the lead engineer and final decision-maker.
Analyse the bounded task below without modifying files or running commands that change state.
Return findings, evidence, risks, and recommendations for DeepSeek V4 Flash to review critically.

TASK:
$TASK"
        ;;
    Implement)
        AGY_MODE="accept-edits"
        EFFECTIVE_TASK="You are MiMo V2.5, a subordinate specialist working on a task explicitly authorised by DeepSeek V4 Flash.
Modify only the files and scope named below. Do not access secrets, environment files, or credentials.
Report every file changed and every verification command run. Stop if the scope is ambiguous.

AUTHORISED TASK:
$TASK"
        ;;
    ReviewDiff)
        if ! command -v git &>/dev/null; then
            echo "ERROR: Git is required for ReviewDiff mode." >&2
            exit 1
        fi

        if ! CHANGED_PATHS=$(git diff --name-only HEAD 2>&1); then
            echo "ERROR: Unable to list the current Git diff (git exit code $?)." >&2
            exit 1
        fi

        SENSITIVE_PATHS=$(echo "$CHANGED_PATHS" | grep -E '(^|/)(\.env($|\.)|.*credentials?.*|.*secrets?.*|.*\.pem$|.*\.key$|.*\.pfx$|.*\.p12$)' || true)
        if [[ -n "$SENSITIVE_PATHS" ]]; then
            echo "ERROR: Refusing to send a diff containing potentially sensitive paths to AGY: $(echo "$SENSITIVE_PATHS" | tr '\n' ', ')" >&2
            exit 1
        fi

        DIFF=$(git diff --no-ext-diff HEAD 2>&1 || true)
        if [[ -z "$DIFF" || "$DIFF" == *"fatal:"* ]]; then
            DIFF="[No tracked staged or unstaged changes are present.]"
        fi

        EFFECTIVE_TASK="You are an independent code reviewer advising DeepSeek V4 Flash, the lead engineer and final decision-maker.
Review the supplied Git diff only. Do not modify files or run tools. Prioritise correctness, security,
regressions, missing tests, and maintainability. Cite affected files and explain actionable findings.

REVIEW FOCUS:
$TASK

CURRENT GIT DIFF:
$DIFF"
        ;;
esac

AGY_LOG_PATH=$(mktemp /tmp/agy-cli-XXXXXX.log 2>/dev/null || echo "/tmp/agy-cli-$$.log")

echo "Delegating to MiMo V2.5 (via AGY + Codex) in $MODE mode. Output: $OUTPUT_PATH" >&2

set +e
agy --log-file "$AGY_LOG_PATH" --mode "$AGY_MODE" --model "codex" --sandbox --print-timeout "${TIMEOUT_MINUTES}m" --print "$EFFECTIVE_TASK" 2>&1 | tee "$OUTPUT_PATH"
AGY_EXIT_CODE=$?
set -e

AGY_OUTPUT_TEXT=$(cat "$OUTPUT_PATH" 2>/dev/null || true)

if [[ $AGY_EXIT_CODE -ne 0 ]]; then
    echo "ERROR: AGY failed with exit code $AGY_EXIT_CODE. Partial output was preserved at '$OUTPUT_PATH'." >&2
    rm -f "$AGY_LOG_PATH"
    exit "$AGY_EXIT_CODE"
fi

if [[ -z "$AGY_OUTPUT_TEXT" || "$AGY_OUTPUT_TEXT" == *"no output produced"* ]]; then
    echo "ERROR: AGY did not produce a usable response. Output was preserved at '$OUTPUT_PATH'." >&2
    rm -f "$AGY_LOG_PATH"
    exit 1
fi

rm -f "$AGY_LOG_PATH"
echo "AGY completed. Review its output at: $OUTPUT_PATH" >&2
