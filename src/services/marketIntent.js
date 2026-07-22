import { MARKET_ASSETS } from './marketCatalog.js';

const NUMBER_BODY_SOURCE = '(?:(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?|\\.\\d+)';
const NUMBER_SOURCE = `(?<![\\w.,+\\-−])(${NUMBER_BODY_SOURCE})`;
const QUOTE_SOURCE = '(?:prices?|quotes?|rates?|worth|costs?|values?)';
const RANGE_PATTERN = /\b(1d|1w|1m)\b/i;
const METAL_UNIT_SOURCE = '(?:grams?|g|kilograms?|kilos?|kg|troy\\s+ounces?|ounces?|oz)';
const STOCK_UNIT_SOURCE = '(?:units?|shares?)';
const CRYPTO_UNIT_SOURCE = '(?:units?|coins?)';
const SEPARATOR_SOURCE = '[\\s:–—-]';

const CURRENCY_TERMS = Object.freeze([
  { code: 'USD', source: '(?:USD|US\\s+dollars?|dollars?)' },
  { code: 'AED', source: '(?:AED|UAE\\s+dirhams?|dirhams?)' },
  { code: 'EUR', source: '(?:EUR|euros?)' },
  { code: 'GBP', source: '(?:GBP|British\\s+pounds?|pounds?\\s+sterling)' },
  { code: 'JPY', source: '(?:JPY|Japanese\\s+yen|yen)' }
]);

const NON_CURRENT_PATTERN = /\b(?:history|historical|market\s+cap|split|yesterday|ago|forecast|prediction|predict|future|tomorrow|news|explain|why|analy[sz]e|analysis|compare|each\s+year)\b|\bwhat\s+(?:was|were|did)\b/i;
const RELATIVE_TIME_PATTERN = /\b(?:last|next|previous|coming|past)\s+(?:\d+(?:\.\d+)?\s+)?(?:(?:mon|tues|wednes|thurs|fri|satur|sun)day|days?|weeks?|months?|quarters?|years?)\b|\b(?:in|after|within|over|for)\s+(?:a|an|\d+(?:\.\d+)?)\s+(?:days?|weeks?|months?|quarters?|years?)\b/i;
const WEEKDAY_PATTERN = /\b(?:mon|tues|wednes|thurs|fri|satur|sun)day\b/i;
const NAMED_DATE_PATTERN = /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\s+\d{1,2}\b|\b\d{1,2}\s+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\b/i;
const NUMERIC_DATE_PATTERN = /\b(?:19|20)\d{2}[-/]\d{1,2}(?:[-/]\d{1,2})?\b|\b\d{1,2}[-/]\d{1,2}[-/](?:19|20)\d{2}\b/i;
const TEMPORAL_YEAR_PATTERN = /\b(?:in|during|from|on|as\s+of|before|after|since|by)\s+(?:(?:19|20)\d{2}|(?:1,9|2,0)\d{2})\b/i;
const CREATION_PATTERN = /\b(?:build|create|design|develop|make)\b[^.!?]{0,120}\b(?:app|dashboard|website|widget|terminal|chart|graph|tool|alert|tracker|table)\b/i;
const MARKET_PRODUCT_PATTERN = /\b(?:prices?|quotes?|rates?|values?|costs?)\s+(?:alert|tracker|table|dashboard|widget|terminal)\b/i;
const PHYSICAL_PRODUCT_PATTERN = /\b(?:gold|silver)\s+(?:jewelry|jewellery|rings?|necklaces?|bracelets?)\b/i;
const STOCK_PRODUCT_PATTERN = /\b(?:prime|workspace|rtx|graphics?|cards?|gpus?|iphone|ipad|macbook|office|windows|models?|shipping|subscription|laptops?|phones?|devices?)\b/i;

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
}

function numericValue(value) {
  return Number(value.replaceAll(',', ''));
}

function hasMalformedNumberSyntax(prompt) {
  if (/[+\-−](?=\d|\.\d)/.test(prompt)
    || /\b\d+(?:\.\d+)?e[+-]?\d+\b/i.test(prompt)
    || /\d\s*\/\s*\d/.test(prompt)
    || /(?:\d+\.\d*|\.\d+)\.\d+/.test(prompt)
    || /\b\d+\.(?=\s+[A-Za-z])/.test(prompt)) {
    return true;
  }
  for (const match of prompt.matchAll(/\d[\d,]*(?:\.\d+)?/g)) {
    if (match[0].includes(',') && !/^\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(match[0])) return true;
  }
  return false;
}

function aliasSource(asset, alias) {
  const escaped = escapeRegExp(alias);
  if (asset.assetClass === 'crypto' && ['bitcoin', 'ether'].includes(alias)) return `${escaped}s?`;
  return escaped;
}

function overlaps(left, right) {
  return left.start < right.end && right.start < left.end;
}

function assetMentions(prompt) {
  const candidates = [];
  for (const asset of MARKET_ASSETS) {
    for (const alias of asset.aliases) {
      const source = aliasSource(asset, alias);
      const pattern = new RegExp(`\\b${source}\\b`, 'gi');
      for (const match of prompt.matchAll(pattern)) {
        candidates.push({ asset, alias, source, start: match.index, end: match.index + match[0].length });
      }
    }
  }

  candidates.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  const mentions = [];
  for (const candidate of candidates) {
    if (!mentions.some((mention) => overlaps(mention, candidate))) mentions.push(candidate);
  }
  return mentions;
}

function targetCurrencies(prompt) {
  const targets = [];
  for (const term of CURRENCY_TERMS) {
    const pattern = new RegExp(`\\b(?:in|to|into)\\s+(${term.source})\\b`, 'gi');
    for (const match of prompt.matchAll(pattern)) {
      const text = match[1];
      const start = match.index + match[0].length - text.length;
      targets.push({ code: term.code, start, end: start + text.length });
    }
  }
  return targets.sort((a, b) => a.start - b.start);
}

function directCurrencyConversion(prompt) {
  const candidates = [];
  for (const from of CURRENCY_TERMS) {
    for (const to of CURRENCY_TERMS) {
      if (from.code === to.code) continue;
      const pattern = new RegExp(`(?<!\\S)(?:convert\\s+)?(?:${NUMBER_SOURCE}\\s+)?(${from.source})\\s*(/|to|in)\\s*(${to.source})\\b`, 'i');
      const match = prompt.match(pattern);
      if (!match) continue;
      const intentContext = prompt.slice(Math.max(0, match.index - 24), match.index + match[0].length + 24);
      const convertRequest = /\bconvert(?:ing|ed)?\b/i.test(intentContext);
      const hasIntent = match[1] !== undefined
        || match[3] === '/'
        || /\b(?:convert|conversion|rate|quote|price|worth|value|how\s+much)\b/i.test(intentContext);
      const amount = match[1] === undefined ? 1 : numericValue(match[1]);
      if (!hasIntent || (convertRequest && match[1] === undefined) || !Number.isFinite(amount) || amount <= 0) continue;
      const amountStart = match[1] === undefined
        ? null
        : match.index + match[0].indexOf(match[1]);
      candidates.push({
        request: {
          assetId: `fx-${from.code.toLowerCase()}`,
          symbol: `${from.code}/USD`,
          assetClass: 'forex',
          currency: to.code,
          amount,
          unit: 'unit',
          range: prompt.match(RANGE_PATTERN)?.[1]?.toUpperCase() || '1D',
          conversion: { from: from.code, to: to.code }
        },
        start: match.index,
        end: match.index + match[0].length,
        amountSpan: amountStart === null ? null : { start: amountStart, end: amountStart + match[1].length }
      });
    }
  }
  return candidates.sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start))[0] || null;
}

function hasExplicitTimeContext(prompt) {
  return NON_CURRENT_PATTERN.test(prompt)
    || RELATIVE_TIME_PATTERN.test(prompt)
    || WEEKDAY_PATTERN.test(prompt)
    || NAMED_DATE_PATTERN.test(prompt)
    || NUMERIC_DATE_PATTERN.test(prompt)
    || TEMPORAL_YEAR_PATTERN.test(prompt);
}

function hasUnboundYear(prompt, amountSpan) {
  for (const match of prompt.matchAll(/\b(?:(?:19|20)\d{2}|(?:1,9|2,0)\d{2})\b/g)) {
    const span = { start: match.index, end: match.index + match[0].length };
    if (!amountSpan || span.start < amountSpan.start || span.end > amountSpan.end) return true;
  }
  return false;
}

function clauseFor(prompt, mention) {
  let start = mention.start;
  let end = mention.end;
  const isBoundary = (index) => {
    const character = prompt[index];
    if (character === '.'
      && /\d/.test(prompt[index + 1] || '')
      && (index === 0 || /[\s\d]/.test(prompt[index - 1]))) {
      return false;
    }
    return /[;.!?]/.test(character);
  };
  while (start > 0 && !isBoundary(start - 1)) start -= 1;
  while (end < prompt.length && !isBoundary(end)) end += 1;
  return { text: prompt.slice(start, end), start, end };
}

function unitSourceFor(asset) {
  if (asset.assetClass === 'metal') return METAL_UNIT_SOURCE;
  if (asset.assetClass === 'stock') return STOCK_UNIT_SOURCE;
  return CRYPTO_UNIT_SOURCE;
}

function metalUnitInQuantity(value) {
  const match = value.match(new RegExp(`${NUMBER_BODY_SOURCE}\\s*(${METAL_UNIT_SOURCE})\\b`, 'i'));
  if (!match) return null;
  const unit = match[1].toLowerCase().replace(/\s+/g, ' ');
  if (['g', 'gram', 'grams'].includes(unit)) return 'gram';
  if (['kg', 'kilo', 'kilos', 'kilogram', 'kilograms'].includes(unit)) return 'kilogram';
  return 'troy_ounce';
}

function amountFor(prompt, mention) {
  const asset = `\\b${mention.source}\\b`;
  const unit = unitSourceFor(mention.asset);
  const patterns = mention.asset.assetClass === 'metal'
    ? [
        new RegExp(`${NUMBER_SOURCE}\\s*${unit}\\s+(?:of\\s+)?${asset}`, 'i'),
        new RegExp(`${asset}${SEPARATOR_SOURCE}+(?:${QUOTE_SOURCE})\\s+for\\s+${NUMBER_SOURCE}\\s*${unit}\\b`, 'i'),
        new RegExp(`${QUOTE_SOURCE}\\s+(?:of|for)\\s+${NUMBER_SOURCE}\\s*${unit}\\s+(?:of\\s+)?${asset}`, 'i')
      ]
    : [
        new RegExp(`${NUMBER_SOURCE}\\s*(?:(?:${unit})\\s+(?:of\\s+)?)?${asset}(?:\\s+${unit})?`, 'i'),
        new RegExp(`${asset}${SEPARATOR_SOURCE}+(?:${QUOTE_SOURCE})\\s+for\\s+${NUMBER_SOURCE}\\s*${unit}\\b`, 'i'),
        new RegExp(`${QUOTE_SOURCE}\\s+(?:of|for)\\s+${NUMBER_SOURCE}\\s*${asset}(?:\\s+${unit})?`, 'i')
      ];

  const clause = clauseFor(prompt, mention);
  for (const pattern of patterns) {
    const match = clause.text.match(pattern);
    if (!match) continue;
    const numberOffset = match.index + match[0].indexOf(match[1]);
    const start = clause.start + numberOffset;
    return {
      value: numericValue(match[1]),
      span: { start, end: start + match[1].length },
      clause,
      unit: mention.asset.assetClass === 'metal' ? metalUnitInQuantity(match[0]) : null
    };
  }
  return { value: 1, span: null, clause, unit: null };
}

function hasUnboundQuantity(prompt, amountSpan) {
  const pattern = new RegExp(`${NUMBER_SOURCE}\\s*(?:${METAL_UNIT_SOURCE}|${STOCK_UNIT_SOURCE}|${CRYPTO_UNIT_SOURCE})\\b`, 'gi');
  for (const match of prompt.matchAll(pattern)) {
    const start = match.index + match[0].indexOf(match[1]);
    const end = start + match[1].length;
    if (!amountSpan || start !== amountSpan.start || end !== amountSpan.end) return true;
  }
  return false;
}

function isAmbiguousApple(prompt, mention) {
  if (mention.asset.id !== 'apple' || mention.alias !== 'apple') return false;
  const suffix = prompt.slice(mention.end, mention.end + 20);
  return !/^(?:['’]s)?[\s:–—-]+(?:stock|shares?)\b/i.test(suffix);
}

function hasQuoteSyntax(prompt, mention) {
  const asset = `\\b${mention.source}\\b`;
  const qualifier = '(?:current|latest|live|stock|shares?|crypto|market|spot)';
  const quantity = `(?:${NUMBER_SOURCE}\\s*(?:(?:${METAL_UNIT_SOURCE}|${STOCK_UNIT_SOURCE}|${CRYPTO_UNIT_SOURCE})\\s+)?(?:of\\s+)?)?`;
  const forward = new RegExp(`${asset}(?:['’]s)?[)\\]]?${SEPARATOR_SOURCE}*(?:${qualifier}${SEPARATOR_SOURCE}+){0,2}${QUOTE_SOURCE}\\b`, 'i');
  const reverse = new RegExp(`\\b${QUOTE_SOURCE}(?:\\s+(?:of|for)\\s+|\\s*[:–—-]\\s*)${quantity}${asset}`, 'i');
  const trading = new RegExp(`${asset}${SEPARATOR_SOURCE}+(?:is${SEPARATOR_SOURCE}+)?trading${SEPARATOR_SOURCE}+at\\b`, 'i');
  return forward.test(prompt) || reverse.test(prompt) || trading.test(prompt);
}

function hasDisallowedReverseSubject(prompt, mention) {
  const clause = clauseFor(prompt, mention);
  const relativeStart = mention.start - clause.start;
  const before = clause.text.slice(0, relativeStart);
  const after = clause.text.slice(relativeStart + (mention.end - mention.start));
  const quantity = `(?:${NUMBER_SOURCE}\\s*(?:(?:${METAL_UNIT_SOURCE}|${STOCK_UNIT_SOURCE}|${CRYPTO_UNIT_SOURCE})\\s+)?(?:of\\s+)?)?`;
  const reversePrefix = new RegExp(`\\b${QUOTE_SOURCE}(?:\\s+(?:of|for)\\s+|\\s*[:–—-]\\s*)${quantity}$`, 'i');
  if (!reversePrefix.test(before)) return false;

  const currency = CURRENCY_TERMS.map((term) => term.source).join('|');
  const unit = `(?:${METAL_UNIT_SOURCE}|${STOCK_UNIT_SOURCE}|${CRYPTO_UNIT_SOURCE})`;
  const allowedToken = `(?:['’]s|stock|shares?|(?:in|to)\\s+(?:${currency})|(?:per\\s+)?${unit}|current|latest|live|spot|today|right\\s+now|now|please|1d|1w|1m)`;
  return !new RegExp(`^(?:\\s+${allowedToken})*\\s*$`, 'i').test(after);
}

function hasHowMuchQuantityConstruction(prompt, mention, amount) {
  if (!amount.span) return false;
  const howMuch = /\bhow\s+much\b/i.exec(prompt);
  if (!howMuch || amount.span.start <= howMuch.index + howMuch[0].length) return false;
  const between = prompt.slice(howMuch.index + howMuch[0].length, amount.span.start).trim();
  if (!/^(?:(?:is|are|would|for)\s*)?$/i.test(between)) return false;

  const currency = CURRENCY_TERMS.map((term) => term.source).join('|');
  const after = prompt.slice(mention.end, amount.clause.end).trim();
  const allowedSuffix = new RegExp(`^(?:(?:units?|shares?|coins?)\\s*)?(?:(?:in|to)\\s+(?:${currency}))?(?:\\s+(?:today|now|please))?$`, 'i');
  return allowedSuffix.test(after);
}

function hasAssetConversionSyntax(prompt, mention, amount, target) {
  if (!amount.span || !target || target.start <= mention.end) return false;
  const between = prompt.slice(mention.end, target.start);
  return /^\s*(?:(?:units?|shares?|coins?)\s+)?(?:to|in|into)\s+$/i.test(between);
}

function hasCurrentIntent(prompt, mention, amount, target) {
  const quoteSyntax = hasQuoteSyntax(prompt, mention);
  if (/\bconvert(?:ing|ed)?\b/i.test(prompt)) return hasAssetConversionSyntax(prompt, mention, amount, target);
  if (/\bhow\s+much\b/i.test(prompt)) return quoteSyntax || hasHowMuchQuantityConstruction(prompt, mention, amount);
  if (quoteSyntax) return true;
  return hasAssetConversionSyntax(prompt, mention, amount, target);
}

function hasProductQualifiedStock(prompt, mention) {
  if (mention.asset.assetClass !== 'stock') return false;
  if (STOCK_PRODUCT_PATTERN.test(prompt)) return true;

  const clause = clauseFor(prompt, mention);
  const relativeStart = mention.start - clause.start;
  const before = clause.text.slice(0, relativeStart);
  const after = clause.text.slice(relativeStart + (mention.end - mention.start));
  if (!new RegExp(QUOTE_SOURCE, 'i').test(before) || new RegExp(QUOTE_SOURCE, 'i').test(after)) return false;

  const quoteMatches = [...before.matchAll(new RegExp(QUOTE_SOURCE, 'gi'))];
  const leading = before.slice(0, quoteMatches.at(-1).index).replace(/\s+/g, ' ').trim().toLowerCase();
  const allowedLeading = /^(?:(?:what is|what's|how much is|show me|give me|tell me|get|check)\s+)?(?:the\s+)?(?:current|latest|live)?$/i;
  if (!allowedLeading.test(leading)) return true;

  const currency = CURRENCY_TERMS.map((term) => term.source).join('|');
  const allowedSuffix = new RegExp(`^(?:['’]s)?(?:\\s+(?:stock|shares?))?(?:\\s+(?:current|latest|live|today|right\\s+now|now|please|1d|1w|1m))*(?:\\s+(?:in|to)\\s+(?:${currency}))?\\s*$`, 'i');
  return !allowedSuffix.test(after);
}

function requestedUnit(asset, amount) {
  if (asset.assetClass !== 'metal') return asset.defaultUnit;
  return amount.unit || asset.defaultUnit;
}

function hasRejectedContext(prompt) {
  return CREATION_PATTERN.test(prompt)
    || MARKET_PRODUCT_PATTERN.test(prompt)
    || PHYSICAL_PRODUCT_PATTERN.test(prompt);
}

export function parseMarketIntent(prompt) {
  const clean = String(prompt || '').trim();
  if (!clean || hasMalformedNumberSyntax(clean) || hasExplicitTimeContext(clean) || hasRejectedContext(clean)) return null;

  const directFx = directCurrencyConversion(clean);
  if (directFx) {
    const outsideAsset = assetMentions(clean).some((mention) => !overlaps(mention, directFx));
    if (!outsideAsset && !hasUnboundYear(clean, directFx.amountSpan)) return directFx.request;
    return null;
  }

  const targets = targetCurrencies(clean);
  const mentions = assetMentions(clean).filter((mention) => !targets.some((target) => overlaps(mention, target)));
  const assetIds = new Set(mentions.map((mention) => mention.asset.id));
  if (assetIds.size !== 1) return null;

  const target = targets.at(-1) || null;
  let selected = null;
  for (const mention of mentions) {
    if (isAmbiguousApple(clean, mention)
      || hasProductQualifiedStock(clean, mention)
      || hasDisallowedReverseSubject(clean, mention)) {
      continue;
    }
    const amount = amountFor(clean, mention);
    if (!Number.isFinite(amount.value)
      || amount.value <= 0
      || hasUnboundYear(clean, amount.span)
      || hasUnboundQuantity(clean, amount.span)
      || !hasCurrentIntent(clean, mention, amount, target)) {
      continue;
    }
    selected = { mention, amount };
    break;
  }
  if (!selected) return null;

  const { mention, amount } = selected;
  const asset = mention.asset;
  return {
    assetId: asset.id,
    symbol: asset.symbol,
    assetClass: asset.assetClass,
    currency: target?.code || 'USD',
    amount: amount.value,
    unit: requestedUnit(asset, amount),
    range: clean.match(RANGE_PATTERN)?.[1]?.toUpperCase() || '1D',
    conversion: null
  };
}
