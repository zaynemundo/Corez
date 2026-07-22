import { describe, expect, it } from 'vitest';
import { DISPLAY_CURRENCIES, findAssetByAlias } from '../src/services/marketCatalog.js';
import { parseMarketIntent } from '../src/services/marketIntent.js';

describe('market catalog', () => {
  it('resolves names and tickers to one canonical asset', () => {
    expect(findAssetByAlias('gold').id).toBe('gold');
    expect(findAssetByAlias('XAU').symbol).toBe('XAU/USD');
    expect(findAssetByAlias('nvidia').symbol).toBe('NVDA');
    expect(findAssetByAlias('unknown')).toBeNull();
  });

  it('uses the approved currency allowlist', () => {
    expect(DISPLAY_CURRENCIES).toEqual(['USD', 'AED', 'EUR', 'GBP', 'JPY']);
  });
});

describe('parseMarketIntent', () => {
  it.each([
    ['What is the price of gold?', 'gold', 'USD', 1, 'troy_ounce'],
    ['BTC price in AED', 'bitcoin', 'AED', 1, 'unit'],
    ['How much is 10 grams of gold in EUR?', 'gold', 'EUR', 10, 'gram'],
    ['AAPL quote', 'apple', 'USD', 1, 'unit'],
    ['NVIDIA stock price', 'nvidia', 'USD', 1, 'unit']
  ])('normalizes %s', (prompt, assetId, currency, amount, unit) => {
    expect(parseMarketIntent(prompt)).toMatchObject({ assetId, currency, amount, unit });
  });

  it('parses a direct fiat conversion without guessing an asset', () => {
    expect(parseMarketIntent('Convert 100 EUR to AED')).toEqual({
      assetId: 'fx-eur',
      symbol: 'EUR/USD',
      assetClass: 'forex',
      currency: 'AED',
      amount: 100,
      unit: 'unit',
      range: '1D',
      conversion: { from: 'EUR', to: 'AED' }
    });
  });

  it.each([
    'Tell me about gold mining history',
    'Build a stock dashboard',
    'What is photosynthesis?',
    'Price of an unknownium token'
  ])('does not intercept %s', (prompt) => {
    expect(parseMarketIntent(prompt)).toBeNull();
  });
});
