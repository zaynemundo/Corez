// Deterministic repair of common AI-generated HTML corruption.
// Canonical implementation lives in packages/agent-core/scaffolding/htmlRepair.js.
export {
  stripJunkAfterDocumentEnd,
  repairMalformedHtml,
} from "../../packages/agent-core/scaffolding/htmlRepair.js";
