#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ARTIFACTS_DIR="$(cd "$SCRIPT_DIR/../artifacts/mimo" 2>/dev/null && pwd || echo "$SCRIPT_DIR/../artifacts/mimo")"

MODE="Analysis"
TASK=""
TIMEOUT_MINUTES=5
OUTPUT_PATH=""
PROFILE="agy"
PATCH=""
DUMP_CONFIG="false"
ISOLATE="false"

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
        --profile)
            PROFILE="$2"; shift 2 ;;
        --patch)
            PATCH="$2"; shift 2 ;;
        --dump-config)
            DUMP_CONFIG="true"; shift 1 ;;
        --isolate)
            ISOLATE="true"; shift 1 ;;
        *)
            echo "ERROR: Unknown option '$1'. Usage: $0 --task <task> [--mode Analysis|Implement|ReviewDiff] [--profile web|headless|agy] [--patch <file>] [--dump-config] [--isolate] [--timeout <min>] [--output-path <path>]" >&2
            exit 1 ;;
    esac
done

# --dump-config early exit (DSH parity: dsh --profile web --dump-config)
if [[ "$DUMP_CONFIG" == "true" ]]; then
    node --input-type=module <<EOF
import { ProfileRegistry } from './packages/agent-core/harness/ProfileRegistry.js';
import { HarnessContext } from './packages/agent-core/harness/HarnessContext.js';
const ctx = new HarnessContext({});
const reg = new ProfileRegistry({ context: ctx });
const rows = reg.compose('$PROFILE');
console.log(JSON.stringify({ profile: '$PROFILE', rows }, null, 2));
EOF
    exit $?
fi

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

if [[ "$PROFILE" != "web" && "$PROFILE" != "headless" && "$PROFILE" != "agy" ]]; then
    echo "ERROR: Invalid profile '$PROFILE'. Must be web, headless, or agy." >&2
    exit 1
fi

if [[ -n "$PATCH" ]]; then
    if [[ ! -f "$PATCH" ]]; then
        echo "ERROR: Patch file not found: $PATCH" >&2
        exit 1
    fi
    if ! node -e "JSON.parse(require('fs').readFileSync(process.argv[1],'utf8'))" "$PATCH" 2>/dev/null; then
        echo "ERROR: Patch file is not valid JSON: $PATCH" >&2
        exit 1
    fi
fi

if [[ -z "$OUTPUT_PATH" ]]; then
    TIMESTAMP=$(date +%Y%m%d-%H%M%S)
    mkdir -p "$ARTIFACTS_DIR"
    OUTPUT_PATH="$ARTIFACTS_DIR/mimo-$(echo "$MODE" | tr '[:upper:]' '[:lower:]')-$TIMESTAMP.txt"
fi

OUTPUT_DIR=$(dirname "$OUTPUT_PATH")
mkdir -p "$OUTPUT_DIR"

# DSH-lite session log (append-only, model-visible => logged)
SESSION_LOG_DIR="$(cd "$SCRIPT_DIR/../artifacts/sessions" 2>/dev/null && pwd || echo "$SCRIPT_DIR/../artifacts/sessions")"
mkdir -p "$SESSION_LOG_DIR"
SESSION_ID="agy-$(echo "$MODE" | tr '[:upper:]' '[:lower:]')-$(date +%Y%m%d-%H%M%S)-$(head -c 3 /dev/urandom | od -An -tx1 | tr -d ' \n')"
SESSION_LOG_PATH="$SESSION_LOG_DIR/${SESSION_ID}.jsonl"
TS_MS=$(date +%s%3N 2>/dev/null || date +%s000)
# turn/start + step/start + user/message (surfaceOp append ensures deriveMessages fidelity)
printf '%s\n' "{\"type\":\"turn/start\",\"seq\":1,\"time\":$TS_MS,\"data\":{\"turn\":1}}" >> "$SESSION_LOG_PATH"
printf '%s\n' "{\"type\":\"step/start\",\"seq\":2,\"time\":$TS_MS,\"data\":{\"turn\":1,\"step\":1}}" >> "$SESSION_LOG_PATH"
# escape task for JSON (basic)
ESCAPED_TASK=$(printf '%s' "$TASK" | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null || printf '"%s"' "$TASK")
printf '%s\n' "{\"type\":\"user/message\",\"seq\":3,\"time\":$TS_MS,\"data\":{\"role\":\"user\",\"content\":$ESCAPED_TASK},\"surfaceOp\":\"append\"}" >> "$SESSION_LOG_PATH"

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

echo "Delegating to MiMo V2.5 (via AGY + Codex) profile=$PROFILE mode=$MODE isolate=$ISOLATE Output: $OUTPUT_PATH SessionLog: $SESSION_LOG_PATH" >&2

AGY_ARGS=(--log-file "$AGY_LOG_PATH" --mode "$AGY_MODE" --model "codex" --sandbox --print-timeout "${TIMEOUT_MINUTES}m" --print "$EFFECTIVE_TASK")
if [[ "$ISOLATE" == "true" ]]; then
    AGY_ARGS+=(--isolate "$SESSION_ID")
fi
if [[ -n "$PATCH" ]]; then
    AGY_ARGS+=(--patch "$PATCH")
fi

set +e
agy "${AGY_ARGS[@]}" 2>&1 | tee "$OUTPUT_PATH"
AGY_EXIT_CODE=$?
set -e

AGY_OUTPUT_TEXT=$(cat "$OUTPUT_PATH" 2>/dev/null || true)

# append assistant result to session log (best-effort, never hides main failure)
{
    TS2=$(date +%s%3N 2>/dev/null || date +%s000)
    ESCAPED_OUT=$(printf '%s' "$AGY_OUTPUT_TEXT" | head -c 8000 | python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' 2>/dev/null || printf '"%s"' "$AGY_OUTPUT_TEXT")
    printf '%s\n' "{\"type\":\"assistant/chunk\",\"seq\":4,\"time\":$TS2,\"data\":{\"turn\":1,\"step\":1,\"chunk\":{\"type\":\"text\",\"text\":$ESCAPED_OUT}}}" >> "$SESSION_LOG_PATH" || true
    printf '%s\n' "{\"type\":\"assistant/message\",\"seq\":5,\"time\":$TS2,\"data\":{\"turn\":1,\"step\":1,\"message\":{\"role\":\"assistant\",\"content\":$ESCAPED_OUT}},\"surfaceOp\":\"append\",\"sourceEventSeqs\":[4]}" >> "$SESSION_LOG_PATH" || true
    printf '%s\n' "{\"type\":\"step/end\",\"seq\":6,\"time\":$TS2,\"data\":{\"turn\":1,\"step\":1}}" >> "$SESSION_LOG_PATH" || true
    KIND="completed"; [[ $AGY_EXIT_CODE -ne 0 ]] && KIND="error"
    printf '%s\n' "{\"type\":\"turn/end\",\"seq\":7,\"time\":$TS2,\"data\":{\"turn\":1,\"reason\":{\"kind\":\"$KIND\"}}}" >> "$SESSION_LOG_PATH" || true
} || true

if [[ $AGY_EXIT_CODE -ne 0 ]]; then
    echo "ERROR: AGY failed with exit code $AGY_EXIT_CODE. Partial output was preserved at '$OUTPUT_PATH'. SessionLog: $SESSION_LOG_PATH" >&2
    rm -f "$AGY_LOG_PATH"
    exit "$AGY_EXIT_CODE"
fi

if [[ -z "$AGY_OUTPUT_TEXT" || "$AGY_OUTPUT_TEXT" == *"no output produced"* ]]; then
    echo "ERROR: AGY did not produce a usable response. Output was preserved at '$OUTPUT_PATH'. SessionLog: $SESSION_LOG_PATH" >&2
    rm -f "$AGY_LOG_PATH"
    exit 1
fi

rm -f "$AGY_LOG_PATH"
echo "AGY completed. Review its output at: $OUTPUT_PATH SessionLog: $SESSION_LOG_PATH" >&2
