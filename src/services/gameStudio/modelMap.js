/**
 * CoreZ AI Game Studio Model Allocation Map
 * Centrally maps studio role categories to OpenCode Go models.
 */

export const DEFAULT_OPENCODE_GO_MODELS = Object.freeze({
  fast: 'opencode-go/deepseek-v4-flash',
  coding: 'opencode-go/deepseek-v4-flash',
  reasoning: 'opencode-go/deepseek-v4-flash',
  creative: 'opencode-go/deepseek-v4-flash',
  vision: 'opencode-go/deepseek-v4-flash',
  visionPro: 'opencode-go/deepseek-v4-flash',
  expensiveReviewer: 'opencode-go/deepseek-v4-flash'
});

export class GameStudioModelRegistry {
  constructor(customMap = {}) {
    this.modelMap = { ...DEFAULT_OPENCODE_GO_MODELS, ...customMap };
  }

  getModelForRoleCategory(category) {
    return this.modelMap[category] || this.modelMap.fast;
  }

  setModelForRoleCategory(category, modelId) {
    if (!modelId || !modelId.startsWith('opencode-go/')) {
      throw new Error(`Invalid model allocation: ${modelId}. Must be an opencode-go/* model.`);
    }
    this.modelMap[category] = modelId;
  }

  getAllAllocations() {
    return { ...this.modelMap };
  }
}

export const defaultModelRegistry = new GameStudioModelRegistry();
