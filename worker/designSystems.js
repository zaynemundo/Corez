/**
 * Design systems, re-exported for the Worker.
 *
 * This file used to be a second, hand-maintained copy of the engine in
 * `packages/agent-core/designSystems/`. The two had already drifted -- the
 * anti-slop wording differed in four places and the quality standards named
 * different specifics -- so a fix applied to one silently missed the other, and
 * the per-build variation added to the package was invisible to the swarm,
 * which is the one caller that imports from here.
 *
 * The Worker bundles `packages/agent-core` directly (see `providerChain.js`,
 * which imports `../packages/agent-core/providers/modelIds.js`), so there is
 * nothing to gain from the copy and a whole class of bug to lose.
 */

export * from "../packages/agent-core/designSystems/index.js";
