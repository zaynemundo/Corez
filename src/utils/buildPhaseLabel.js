/**
 * Human label for a creation-harness phase event.
 *
 * A build can legitimately run for minutes: the model reasons before its first
 * visible token, and the harness then verifies, repairs and reviews the
 * artifact. The stream itself is silent during most of that, so the UI must say
 * which step is running instead of showing an unexplained spinner. Unknown
 * phases return an empty string so a new server phase can never render a raw
 * identifier to the user.
 */

const PHASE_LABELS = Object.freeze({
  planning: "Planning the build…",
  "swarm-planning": "Swarm planning…",
  building: "Building…",
  continuing: "Continuing the file…",
  verifying: "Verifying…",
  repairing: "Fixing what verification found…",
  reviewing: "Reviewing the result…",
  resuming: "Reconnecting — resuming your build…",
  "waiting-for-build": "Your build is still running…",
  retrying: "The AI service is busy — retrying…",
});

export function buildPhaseLabel(phase) {
  if (!phase || typeof phase !== "string") return "";
  return PHASE_LABELS[phase] || "";
}

export const BUILD_PHASE_LABELS = PHASE_LABELS;
