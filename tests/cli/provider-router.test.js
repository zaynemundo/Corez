import { describe, expect, it } from 'vitest';
import {
  CorezError,
  MockProvider,
  ModelProviderRouter,
  OpenCodeGoProvider,
  OpenRouterProvider
} from '../../packages/agent-core/index.js';

describe('ModelProviderRouter', () => {
  it('fails closed when a live provider credential is missing', () => {
    const router = new ModelProviderRouter({ env: {} });
    expect(() => router.createProvider({ model: 'deepseek-v4-pro' })).toThrowError(CorezError);
    expect(() => router.createProvider({ model: 'deepseek-v4-pro' }))
      .toThrowError(expect.objectContaining({ code: 'AUTH_MISSING' }));
  });

  it('selects adapters by catalog provider', () => {
    expect(new ModelProviderRouter({ env: { OPENCODE_GO_API_KEY: 'x' } })
      .createProvider({ model: 'deepseek-v4-pro' })).toBeInstanceOf(OpenCodeGoProvider);
    expect(new ModelProviderRouter({ env: { OPENROUTER_API_KEY: 'x' } })
      .createProvider({ model: 'deepseek-v4-flash' })).toBeInstanceOf(OpenRouterProvider);
  });

  it('constructs simulation only when mock is explicit', () => {
    const router = new ModelProviderRouter({ env: {} });
    expect(router.createProvider({ model: 'deepseek-v4-pro', mock: true }))
      .toBeInstanceOf(MockProvider);
  });
});
