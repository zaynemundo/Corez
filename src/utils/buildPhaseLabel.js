/**
 * Human label for a creation-harness phase event.
 *
 * A build can legitimately run for minutes: the model reasons before its first
 * visible token, and the harness then verifies, repairs and reviews the
 * artifact. The stream itself is silent during most of that, so the label is
 * announced through the thinking indicator's live region - the row itself stays
 * just the animated dots. Unknown phases return an empty string so a new server
 * phase can never read a raw identifier aloud.
 *
 * The label is resolved through the interface dictionary (common.phase.*) so a
 * screen reader hears it in the chosen language. English stays the default for
 * callers outside the app; BUILD_PHASE_LABELS keeps the English strings that
 * describe the phases.
 */

import { translateCurrent } from "../i18n/dictionaries.js";

const PHASE_KEYS = Object.freeze({
  planning: "common.phase.planning",
  "swarm-planning": "common.phase.swarmPlanning",
  building: "common.phase.building",
  continuing: "common.phase.continuing",
  verifying: "common.phase.verifying",
  repairing: "common.phase.repairing",
  reviewing: "common.phase.reviewing",
  resuming: "common.phase.resuming",
  "waiting-for-build": "common.phase.waitingForBuild",
  retrying: "common.phase.retrying",
  done: "common.phase.done",
});

// English source strings, kept for reference and for tests that describe the
// phases the harness emits.
export const BUILD_PHASE_LABELS = Object.freeze({
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
  done: "Done.",
});

export function buildPhaseLabel(phase) {
  if (!phase || typeof phase !== "string") return "";
  const key = PHASE_KEYS[phase];
  if (!key) return "";
  return translateCurrent(key);
}
