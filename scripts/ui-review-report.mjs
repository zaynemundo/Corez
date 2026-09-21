#!/usr/bin/env node
/**
 * Runs the Part 16 visual audit and writes one structured findings file per
 * captured scene to `review/findings/{scene}-review.json`, copying the audited
 * screenshots into `review/screenshots/` so the captures and the findings they
 * produced travel together (game-release-check collects both).
 *
 * Usage: node scripts/ui-review-report.mjs
 */

import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";

/** Human-readable scene descriptions for each captured screenshot. */
const SCENES = {
  "corez-desktop-1440": "desktop chat shell at 1440px",
  "corez-laptop-1024": "laptop chat shell at 1024px",
  "corez-tablet-768": "tablet chat shell at 768px",
  "corez-phone-390": "phone chat shell at 390px",
  "corez-thinking-laptop-1024": "thinking indicator state at 1024px",
};

const audit = JSON.parse(
  execFileSync(process.execPath, ["scripts/ui-visual-audit.mjs", "--json"], {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  }),
);

// Contract-level failures (declared tokens) apply to every scene because any
// scene can render the affected token pair.
const contractFindings = audit.review.findings.filter((f) => f.category === "contrast");

mkdirSync(join("review", "findings"), { recursive: true });
mkdirSync(join("review", "screenshots"), { recursive: true });

let written = 0;
for (const shot of audit.review.screenshots) {
  const key = basename(shot.file, ".png");
  const sceneFindings = audit.review.findings.filter((f) => f.file === shot.file);
  const findings = [...sceneFindings, ...contractFindings];

  const errors = findings.filter((f) => f.severity === "error").length;
  const warnings = findings.filter((f) => f.severity === "warning").length;

  const doc = {
    review: {
      scene: SCENES[key] || key,
      screenshot: shot.file,
      viewport: { width: shot.width, height: shot.height },
      art_direction_ref: "src/index.css (declared design contract)",
      art_direction_declared_file: "game-project/design/art-direction.json",
      art_direction_file_present: false,
      game_spec_file_present: false,
      reviewed_by: "game-visual-review (game-development Part 16)",
      method:
        "scripts/ui-visual-audit.mjs — 3x box reduction to cancel subpixel text " +
        "anti-aliasing, 8-neighbour erosion to reject 1px fringes, bounding-box " +
        "fill-density gate to reject scattered AA residue",
      timestamp: new Date().toISOString(),
      result: errors === 0 && warnings <= 3 ? "PASS" : "FAIL",
      metrics: {
        painted_pixels: shot.totalPixels,
        neutral_share: shot.neutralShare,
        chromatic_pixels_after_aa_reduction: shot.chromaticPixels,
      },
      findings,
      summary: { total: findings.length, errors, warnings, passes: 0 },
    },
  };

  writeFileSync(
    join("review", "findings", `${key}-review.json`),
    JSON.stringify(doc, null, 2) + "\n",
  );
  copyFileSync(shot.file, join("review", "screenshots", basename(shot.file)));
  written++;
}

writeFileSync(
  join("review", "findings", "visual-audit-summary.json"),
  JSON.stringify(audit, null, 2) + "\n",
);

console.log(
  `Wrote ${written} scene review file(s) + visual-audit-summary.json; ` +
    `${audit.review.findings.length} finding(s), result ${audit.review.result}.`,
);
