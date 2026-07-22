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
    ['NVIDIA stock price', 'nvidia', 'USD', 1, 'unit'],
    ['current gold value', 'gold', 'USD', 1, 'troy_ounce'],
    ['What is BTC trading at?', 'bitcoin', 'USD', 1, 'unit'],
    ['What are 2 BTC worth in GBP?', 'bitcoin', 'GBP', 2, 'unit'],
    ['Convert 2 BTC to EUR', 'bitcoin', 'EUR', 2, 'unit'],
    ['Silver price for 3 kilograms in JPY', 'silver', 'JPY', 3, 'kilogram'],
    ['What is the cost of 10 grams of gold?', 'gold', 'USD', 10, 'gram'],
    ['How much is gold worth today?', 'gold', 'USD', 1, 'troy_ounce']
  ])('normalizes %s', (prompt, assetId, currency, amount, unit) => {
    expect(parseMarketIntent(prompt)).toMatchObject({ assetId, currency, amount, unit });
  });

  it.each([
    ['BTC price 1W', 1, '1W'],
    ['Show me the gold price for portfolio 42', 1, '1D'],
    ['How much are 0.5 units of ETH worth?', 0.5, '1D']
  ])('only treats a syntactically tied number as quantity for %s', (prompt, amount, range) => {
    expect(parseMarketIntent(prompt)).toMatchObject({ amount, range });
  });

  it.each([
    ['How much are 1,000 BTC worth?', 'bitcoin', 1000, 'unit'],
    ['How much is .5 kg of gold worth?', 'gold', 0.5, 'kilogram'],
    ['What is 10g gold worth?', 'gold', 10, 'gram'],
    ['What is the cost of 10kg gold?', 'gold', 10, 'kilogram'],
    ['How much is 1,000kg gold worth?', 'gold', 1000, 'kilogram'],
    ['price of 2,024 AAPL shares', 'apple', 2024, 'unit'],
    ['How much are 2 BTC?', 'bitcoin', 2, 'unit']
  ])('parses complete positive numeric tokens in %s', (prompt, assetId, amount, unit) => {
    expect(parseMarketIntent(prompt)).toMatchObject({ assetId, amount, unit });
  });

  it.each([
    ['gold current price', 'gold'],
    ['BTC latest quote', 'bitcoin'],
    ['AAPL live price', 'apple']
  ])('supports a current modifier after the asset in %s', (prompt, assetId) => {
    expect(parseMarketIntent(prompt)).toMatchObject({ assetId });
  });

  it.each([
    ['What is the current price of NVIDIA?', 'nvidia'],
    ['Show me the latest price of Amazon', 'amazon'],
    ['price of Amazon stock', 'amazon']
  ])('accepts a stock quote without a product qualifier in %s', (prompt, assetId) => {
    expect(parseMarketIntent(prompt)).toMatchObject({ assetId });
  });

  it.each([
    ['BTC bitcoin price', 'bitcoin'],
    ['Bitcoin (BTC) price', 'bitcoin'],
    ['ETH ethereum quote', 'ethereum']
  ])('allows repeated aliases for one asset in %s', (prompt, assetId) => {
    expect(parseMarketIntent(prompt)).toMatchObject({ assetId });
  });

  it.each([
    ['Gold price, package weight kg', 1, 'troy_ounce'],
    ['Gold price for a kg package', 1, 'troy_ounce']
  ])('does not leak an unbound unit in %s', (prompt, amount, unit) => {
    expect(parseMarketIntent(prompt)).toMatchObject({ assetId: 'gold', amount, unit });
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
    ['How much is .5 USD in EUR?', 'USD', 'EUR'],
    ['.5 USD/EUR rate', 'USD', 'EUR'],
    ['.5 euros in dirhams', 'EUR', 'AED']
  ])('preserves a leading-decimal direct FX amount in %s', (prompt, from, to) => {
    expect(parseMarketIntent(prompt)).toMatchObject({
      assetId: `fx-${from.toLowerCase()}`,
      currency: to,
      amount: 0.5,
      conversion: { from, to }
    });
  });

  it.each([
    ['price of gold', 'gold', 'USD', 1, 'troy_ounce', '1D'],
    ['value of Ethereum in GBP', 'ethereum', 'GBP', 1, 'unit', '1D'],
    ['cost of 10g gold in EUR', 'gold', 'EUR', 10, 'gram', '1D'],
    ['price of BTC 1W', 'bitcoin', 'USD', 1, 'unit', '1W'],
    ['price of gold per ounce', 'gold', 'USD', 1, 'troy_ounce', '1D'],
    ['price of gold right now', 'gold', 'USD', 1, 'troy_ounce', '1D'],
    ['value of BTC right now', 'bitcoin', 'USD', 1, 'unit', '1D'],
    ['current price of gold right now', 'gold', 'USD', 1, 'troy_ounce', '1D'],
    ['price of NVIDIA right now', 'nvidia', 'USD', 1, 'unit', '1D']
  ])('allows only price-related trailing syntax in %s', (prompt, assetId, currency, amount, unit, range) => {
    expect(parseMarketIntent(prompt)).toMatchObject({ assetId, currency, amount, unit, range });
  });

  it('parses a direct fiat rate with an implicit unit amount', () => {
    expect(parseMarketIntent('What is the EUR to AED rate?')).toMatchObject({
      assetId: 'fx-eur',
      currency: 'AED',
      amount: 1,
      conversion: { from: 'EUR', to: 'AED' }
    });
  });

  it.each([
    ['Convert 2024 USD to EUR', 'fx-usd', 'EUR', 2024, 'unit'],
    ['price of 2024 AAPL shares', 'apple', 'USD', 2024, 'unit'],
    ['Gold price in British pounds', 'gold', 'GBP', 1, 'troy_ounce'],
    ['Silver price in Japanese yen', 'silver', 'JPY', 1, 'troy_ounce'],
    ['2 ETH to British pound', 'ethereum', 'GBP', 2, 'unit']
  ])('keeps amount and target-currency roles distinct for %s', (prompt, assetId, currency, amount, unit) => {
    expect(parseMarketIntent(prompt)).toMatchObject({ assetId, currency, amount, unit });
  });

  it('parses direct slash currency pairs', () => {
    expect(parseMarketIntent('EUR/AED rate')).toMatchObject({
      assetId: 'fx-eur',
      currency: 'AED',
      amount: 1,
      conversion: { from: 'EUR', to: 'AED' }
    });
  });

  it.each([
    ['BTC: price', 'bitcoin', 1],
    ['BTC-price', 'bitcoin', 1],
    ["BTC's price", 'bitcoin', 1],
    ['BTC’s price', 'bitcoin', 1],
    ['price: BTC', 'bitcoin', 1],
    ['What are 2 bitcoins worth?', 'bitcoin', 2],
    ['What are 2 ethers worth?', 'ethereum', 2]
  ])('accepts punctuation, possessives, and supported plurals in %s', (prompt, assetId, amount) => {
    expect(parseMarketIntent(prompt)).toMatchObject({ assetId, amount });
  });

  it.each([
    ['gold price', 'gold'], ['XAU quote', 'gold'], ['XAU/USD rate', 'gold'],
    ['silver price', 'silver'], ['XAG quote', 'silver'], ['XAG/USD rate', 'silver'],
    ['bitcoin price', 'bitcoin'], ['BTC quote', 'bitcoin'], ['BTC/USD rate', 'bitcoin'],
    ['ethereum price', 'ethereum'], ['ether quote', 'ethereum'], ['ETH price', 'ethereum'], ['ETH/USD rate', 'ethereum'],
    ['solana price', 'solana'], ['SOL quote', 'solana'], ['SOL/USD rate', 'solana'],
    ['Apple stock price', 'apple'], ['AAPL quote', 'apple'],
    ['NVIDIA price', 'nvidia'], ['NVDA quote', 'nvidia'],
    ['Tesla price', 'tesla'], ['TSLA quote', 'tesla'],
    ['Microsoft price', 'microsoft'], ['MSFT quote', 'microsoft'],
    ['Alphabet price', 'alphabet'], ['Google price', 'alphabet'], ['GOOGL quote', 'alphabet'],
    ['Amazon price', 'amazon'], ['AMZN quote', 'amazon'],
    ['USD rate', 'fx-usd'], ['US dollar rate', 'fx-usd'], ['dollar rate', 'fx-usd'],
    ['AED rate', 'fx-aed'], ['UAE dirham rate', 'fx-aed'], ['dirham rate', 'fx-aed'],
    ['EUR rate', 'fx-eur'], ['euro rate', 'fx-eur'],
    ['GBP rate', 'fx-gbp'], ['British pound rate', 'fx-gbp'], ['pound sterling rate', 'fx-gbp'],
    ['JPY rate', 'fx-jpy'], ['Japanese yen rate', 'fx-jpy'], ['yen rate', 'fx-jpy']
  ])('routes approved catalog alias in %s', (prompt, assetId) => {
    expect(parseMarketIntent(prompt)).toMatchObject({ assetId });
  });

  it.each([
    'Tell me about gold mining history',
    'Build a stock dashboard',
    'Create a gold price dashboard',
    'What is photosynthesis?',
    'Price of an unknownium token',
    'Apple stock split history',
    'Ethereum market cap',
    'gold market history',
    'What did gold cost in 1990?',
    'Apple stock price in 2020?',
    'Apple stock price in 2,024?',
    'Gold price on 07/21/2025?',
    'What was BTC worth yesterday?',
    'What was gold worth last Monday?',
    'Gold price next week',
    'BTC value next Friday',
    'Gold price in 1 month',
    'Gold price in a month',
    'BTC price for next 2 weeks',
    'AAPL price after 1 year',
    'AAPL price after a year',
    'ETH price on Monday',
    'Gold price on March 2',
    'Explain the price of gold jewelry',
    'How much gold is mined each year?',
    'Gold price; shipping is for 10 kg',
    'Gold price and shipping is for 10 kg',
    'gold and BTC price',
    'gold price vs silver price',
    'Gold and EUR/AED rate',
    'EUR/AED/GBP rate',
    'gold price alert',
    'gold price tracker',
    'gold value tracker',
    'gold price table',
    'Build a gold price chart',
    'price of gold jewelry',
    'price of apple',
    'How much gold is mined?',
    'How much BTC can be mined?',
    'How much can I earn mining BTC?',
    'How much does Amazon earn?',
    'Convert BTC report to PDF',
    'Convert gold image to PNG',
    'Convert Amazon price table to CSV',
    'Convert this BTC chart into an image',
    'Convert BTC to EUR',
    'Convert EUR to AED',
    'What are -3 BTC worth?',
    'What are +3 BTC worth?',
    'What are 1e3 BTC worth?',
    'What are −3 BTC worth?',
    'What are 1/2 BTC worth?',
    'What are 3.5.2 BTC worth?',
    'What are .5.6 BTC worth?',
    'What are 10. BTC worth?',
    'What are 0 BTC worth?',
    'What are 1,00 BTC worth?',
    'Gold price, package weight 10 kg',
    'Amazon Prime price',
    'price of Amazon Prime',
    'Google Workspace price',
    'price of NVIDIA RTX 5090',
    'NVIDIA graphics card price',
    'Tesla Model 3 price',
    'Apple iPhone price',
    'Microsoft Office price',
    'Amazon shipping price',
    'How much are 2 BTC mined?',
    'Convert 2 BTC report to EUR',
    'cloud service price for Amazon',
    'price of gold mining',
    'value of Ethereum gas',
    'cost of Bitcoin mining hardware',
    'price of Solana transactions',
    'price of gold mining in EUR',
    'price of gold mining right now',
    'value of Ethereum gas right now'
  ])('does not intercept %s', (prompt) => {
    expect(parseMarketIntent(prompt)).toBeNull();
  });
});
