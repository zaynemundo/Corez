import model from "../data/intent-classifier-model.json" with { type: "json" };

// MUST stay byte-identical to scripts/train-intents.mjs tokenize(): the
// runtime classifier and the training pipeline share the same tokenizer so
// the committed model's vocabulary matches what runs in the browser.
const INTENT_STOPWORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "but",
  "if",
  "then",
  "else",
  "for",
  "with",
  "to",
  "of",
  "in",
  "on",
  "at",
  "by",
  "from",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "it",
  "its",
  "this",
  "that",
  "these",
  "those",
  "i",
  "you",
  "your",
  "we",
  "they",
  "he",
  "she",
  "me",
  "my",
  "mine",
  "our",
  "their",
  "them",
  "us",
  "as",
  "so",
  "do",
  "does",
  "did",
  "have",
  "has",
  "had",
  "will",
  "would",
  "can",
  "could",
  "should",
  "may",
  "might",
  "must",
  "not",
  "no",
  "yes",
  "up",
  "down",
  "out",
  "off",
  "over",
  "under",
  "again",
  "once",
  "here",
  "there",
  "when",
  "where",
  "why",
  "how",
  "all",
  "any",
  "both",
  "each",
  "few",
  "more",
  "most",
  "other",
  "some",
  "such",
  "only",
  "own",
  "same",
  "than",
  "too",
  "very",
  "just",
  "about",
  "into",
  "through",
  "during",
  "before",
  "after",
  "above",
  "below",
  "between",
  "per",
  "via",
  "please",
  "am",
  "im",
  "u",
  "ur",
  "dont",
  "cant",
  "wont",
  "ive",
  "ill",
  "lets",
  "em",
  "ya",
]);

export function tokenize(text) {
  if (typeof text !== "string") return [];
  const normalized = text.normalize("NFKC").toLowerCase();
  const wordMatches = normalized.match(/[a-z0-9]+(?:'[a-z0-9]+)*/g) || [];

  const unigrams = wordMatches;
  const bigrams = [];

  for (let i = 0; i < unigrams.length - 1; i++) {
    // Drop pure glue-word pairs ("the_and", "for_the"): noise with no class
    // signal that only dilutes the vocabulary (v2 tokenizer).
    if (
      INTENT_STOPWORDS.has(unigrams[i]) &&
      INTENT_STOPWORDS.has(unigrams[i + 1])
    )
      continue;
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
  if (!prompt || typeof prompt !== "string" || !prompt.trim()) {
    return {
      label: "general",
      confidence: 0,
      oovRatio: 0,
      accepted: false,
    };
  }

  const tokens = tokenize(prompt);
  if (tokens.length === 0) {
    return {
      label: "general",
      confidence: 0,
      oovRatio: 0,
      accepted: false,
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
  const maxOovRatio = model.maxOovRatio ?? 0.7;
  const accepted = maxProb >= minConfidence && oovRatio <= maxOovRatio;

  return {
    label: bestLabel,
    confidence: maxProb,
    oovRatio,
    accepted,
  };
}
