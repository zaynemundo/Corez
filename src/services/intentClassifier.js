import model from '../data/intent-classifier-model.json' with { type: 'json' };

export function tokenize(text) {
  if (typeof text !== 'string') return [];
  const normalized = text.normalize('NFKC').toLowerCase();
  const wordMatches = normalized.match(/[a-z0-9]+(?:'[a-z0-9]+)*/g) || [];

  const unigrams = wordMatches;
  const bigrams = [];

  for (let i = 0; i < unigrams.length - 1; i++) {
    bigrams.push(`bi:${unigrams[i]}_${unigrams[i + 1]}`);
  }

  const tokens = [...unigrams, ...bigrams];
  return tokens.slice(0, 512);
}

function roundToFixed(num, decimals = 12) {
  const factor = Math.pow(10, decimals);
  return Math.round(num * factor) / factor;
}

export function classifyIntent(prompt) {
  if (!prompt || typeof prompt !== 'string' || !prompt.trim()) {
    return {
      label: 'general',
      confidence: 0,
      oovRatio: 0,
      accepted: false
    };
  }

  const tokens = tokenize(prompt);
  if (tokens.length === 0) {
    return {
      label: 'general',
      confidence: 0,
      oovRatio: 0,
      accepted: false
    };
  }

  const vocabSet = new Set(model.vocabulary);
  let oovCount = 0;
  for (const token of tokens) {
    if (!vocabSet.has(token)) {
      oovCount++;
    }
  }

  const oovRatio = roundToFixed(oovCount / tokens.length, 4);

  const scores = {};
  for (const label of model.labels) {
    let score = model.logPriors[label];
    for (const token of tokens) {
      if (vocabSet.has(token) && model.tokenLogLikelihoods[token]) {
        score += model.tokenLogLikelihoods[token][label];
      }
    }
    scores[label] = score;
  }

  let maxScore = -Infinity;
  for (const label of model.labels) {
    if (scores[label] > maxScore) maxScore = scores[label];
  }

  let expSum = 0;
  const expScores = {};
  for (const label of model.labels) {
    const val = Math.exp(scores[label] - maxScore);
    expScores[label] = val;
    expSum += val;
  }

  let bestLabel = model.labels[0];
  let maxProb = -1;

  for (const label of model.labels) {
    const prob = roundToFixed(expScores[label] / expSum, 6);
    if (prob > maxProb) {
      maxProb = prob;
      bestLabel = label;
    }
  }

  const minConfidence = model.minConfidence ?? 0.55;
  const maxOovRatio = model.maxOovRatio ?? 0.70;
  const accepted = maxProb >= minConfidence && oovRatio <= maxOovRatio;

  return {
    label: bestLabel,
    confidence: maxProb,
    oovRatio,
    accepted
  };
}
