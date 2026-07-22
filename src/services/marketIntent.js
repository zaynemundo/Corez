import { DISPLAY_CURRENCIES, MARKET_ASSETS } from './marketCatalog.js';

const REQUEST_WORDS = /\b(price|quote|rate|worth|cost|convert|conversion|how much)\b/i;
const MARKET_CONTEXT = /\b(stock|crypto|market|spot|forex|currency)\b/i;
const RANGE_PATTERN = /\b(1d|1w|1m)\b/i;
const NUMBER_PATTERN = /\b(\d+(?:\.\d+)?)\b/;
const GOLD_UNITS = [
  [/\b(?:grams?|g)\b/i, 'gram'],
  [/\b(?:kilograms?|kilos?|kg)\b/i, 'kilogram'],
  [/\b(?:troy ounces?|ounces?|oz)\b/i, 'troy_ounce']
];

function findMentionedAsset(prompt) {
  const lower = prompt.toLowerCase();
  return MARKET_ASSETS
    .flatMap((asset) => asset.aliases.map((alias) => ({ asset, alias })))
    .sort((a, b) => b.alias.length - a.alias.length)
    .find(({ alias }) => new RegExp(`\\b${alias.replace('/', '\\/').replace(/\s+/g, '\\s+')}\\b`, 'i').test(lower))?.asset || null;
}

function requestedCurrency(prompt, fallback = 'USD') {
  const matches = [...prompt.toUpperCase().matchAll(/\b(USD|AED|EUR|GBP|JPY)\b/g)].map((match) => match[1]);
  return matches.at(-1) || fallback;
}

export function parseMarketIntent(prompt) {
  const clean = String(prompt || '').trim();
  if (!clean || (!REQUEST_WORDS.test(clean) && !MARKET_CONTEXT.test(clean))) return null;

  const conversion = clean.match(/\b(?:convert\s+)?(\d+(?:\.\d+)?)\s*(USD|AED|EUR|GBP|JPY)\s+(?:to|in)\s+(USD|AED|EUR|GBP|JPY)\b/i);
  if (conversion) {
    const from = conversion[2].toUpperCase();
    const to = conversion[3].toUpperCase();
    if (!DISPLAY_CURRENCIES.includes(from) || !DISPLAY_CURRENCIES.includes(to)) return null;
    return { assetId: `fx-${from.toLowerCase()}`, symbol: `${from}/USD`, assetClass: 'forex', currency: to, amount: Number(conversion[1]), unit: 'unit', range: '1D', conversion: { from, to } };
  }

  const asset = findMentionedAsset(clean);
  if (!asset) return null;
  const explicitAmount = clean.match(NUMBER_PATTERN);
  const unit = asset.assetClass === 'metal'
    ? GOLD_UNITS.find(([pattern]) => pattern.test(clean))?.[1] || asset.defaultUnit
    : asset.defaultUnit;
  const range = clean.match(RANGE_PATTERN)?.[1]?.toUpperCase() || '1D';

  return {
    assetId: asset.id,
    symbol: asset.symbol,
    assetClass: asset.assetClass,
    currency: requestedCurrency(clean),
    amount: explicitAmount ? Number(explicitAmount[1]) : 1,
    unit,
    range,
    conversion: null
  };
}
