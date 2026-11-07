/**
 * CoreZ shared logic.
 *
 * Import a subpath instead of the root in app code so a bundle only carries
 * what it uses:
 *   @corez_ai/shared/intent
 *   @corez_ai/shared/intent/userFacts
 *   @corez_ai/shared/artifacts
 *   @corez_ai/shared/i18n
 */
export * from "./intent/api.js";
export * from "./artifacts/index.js";
export * from "./i18n/index.js";
