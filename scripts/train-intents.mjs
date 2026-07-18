import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

export const INTENT_LABELS = ['app', 'code-help', 'explanation', 'general', 'writing'];

export function validateDataset(entries) {
  if (!Array.isArray(entries)) {
    throw new Error('Dataset must be an array.');
  }

  if (entries.length !== 250) {
    throw new Error(`Dataset must contain exactly 250 entries, found ${entries.length}.`);
  }

  const ids = new Set();
  const texts = new Set();
  const counts = {};

  for (const label of INTENT_LABELS) {
    counts[label] = { train: 0, evaluation: 0 };
  }

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    if (!entry || typeof entry !== 'object') {
      throw new Error(`Entry at index ${i} is invalid.`);
    }

    const keys = Object.keys(entry).sort();
    const expectedKeys = ['id', 'label', 'split', 'text'];
    if (JSON.stringify(keys) !== JSON.stringify(expectedKeys)) {
      throw new Error(`Entry ${entry.id || i} has invalid keys: ${keys.join(',')}`);
    }

    const { id, text, label, split } = entry;

    if (typeof id !== 'string' || !id.trim()) {
      throw new Error(`Entry at index ${i} has invalid or blank id.`);
    }
    if (ids.has(id)) {
      throw new Error(`Duplicate entry id found: ${id}`);
    }
    ids.add(id);

    if (typeof text !== 'string' || !text.trim()) {
      throw new Error(`Entry ${id} has blank text.`);
    }
    const normText = text.trim().toLowerCase();
    if (texts.has(normText)) {
      throw new Error(`Duplicate entry text found: "${text}"`);
    }
    texts.add(normText);

    if (!INTENT_LABELS.includes(label)) {
      throw new Error(`Invalid label "${label}" in entry ${id}. Must be one of ${INTENT_LABELS.join(', ')}.`);
    }

    if (split !== 'train' && split !== 'evaluation') {
      throw new Error(`Invalid split "${split}" in entry ${id}. Must be "train" or "evaluation".`);
    }

    counts[label][split]++;
  }

  for (const label of INTENT_LABELS) {
    if (counts[label].train !== 40 || counts[label].evaluation !== 10) {
      throw new Error(
        `Class "${label}" must have 40 train and 10 evaluation entries. Got ${counts[label].train} train, ${counts[label].evaluation} evaluation.`
      );
    }
  }

  return { total: entries.length, counts };
}

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

export function trainModel(entries) {
  const trainEntries = entries.filter((e) => e.split === 'train');

  // Compute canonical SHA-256 of training data
  const sortedTrainEntries = [...trainEntries].sort((a, b) => a.id.localeCompare(b.id));
  const canonicalTrainJson = JSON.stringify(sortedTrainEntries);
  const trainingDataSha256 = crypto.createHash('sha256').update(canonicalTrainJson, 'utf8').digest('hex');

  // Count document frequencies per feature
  const docFreq = {};
  const classDocCounts = {};
  const classFeatureCounts = {};
  const classTotalTokens = {};

  for (const label of INTENT_LABELS) {
    classDocCounts[label] = 0;
    classFeatureCounts[label] = {};
    classTotalTokens[label] = 0;
  }

  for (const entry of sortedTrainEntries) {
    const label = entry.label;
    classDocCounts[label]++;
    const tokens = tokenize(entry.text);
    const uniqueTokensInDoc = new Set(tokens);

    for (const token of uniqueTokensInDoc) {
      docFreq[token] = (docFreq[token] || 0) + 1;
    }

    for (const token of tokens) {
      classFeatureCounts[label][token] = (classFeatureCounts[label][token] || 0) + 1;
      classTotalTokens[label]++;
    }
  }

  // Filter features with document frequency < 2
  const vocabulary = Object.keys(docFreq)
    .filter((token) => docFreq[token] >= 2)
    .sort();

  const totalTrainDocs = trainEntries.length;
  const numClasses = INTENT_LABELS.length;
  const logPriors = {};

  for (const label of INTENT_LABELS) {
    const prior = (classDocCounts[label] + 1) / (totalTrainDocs + numClasses);
    logPriors[label] = roundToFixed(Math.log(prior));
  }

  const tokenLogLikelihoods = {};
  const vocabSize = vocabulary.length;

  for (const token of vocabulary) {
    tokenLogLikelihoods[token] = {};
    for (const label of INTENT_LABELS) {
      const count = classFeatureCounts[label][token] || 0;
      // Laplace smoothing alpha = 1
      const prob = (count + 1) / (classTotalTokens[label] + vocabSize);
      tokenLogLikelihoods[token][label] = roundToFixed(Math.log(prob));
    }
  }

  const model = {
    schemaVersion: 1,
    modelVersion: '1.0.0',
    algorithm: 'multinomial-naive-bayes',
    tokenizer: 'corez-intent-nfkc-unigram-bigram-v1',
    alpha: 1,
    labels: [...INTENT_LABELS].sort(),
    vocabulary,
    classDocumentCounts: classDocCounts,
    logPriors,
    tokenLogLikelihoods,
    minConfidence: 0.55,
    maxOovRatio: 0.7,
    trainingDataSha256
  };

  return model;
}

export function classifyWithModel(text, model) {
  const tokens = tokenize(text);
  if (tokens.length === 0) {
    return {
      label: 'general',
      confidence: 0,
      oovRatio: 0,
      accepted: false,
      scores: {}
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

  // Softmax normalization
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

  const probabilities = {};
  let bestLabel = model.labels[0];
  let maxProb = -1;

  for (const label of model.labels) {
    const prob = roundToFixed(expScores[label] / expSum, 6);
    probabilities[label] = prob;
    if (prob > maxProb) {
      maxProb = prob;
      bestLabel = label;
    }
  }

  const accepted = maxProb >= model.minConfidence && oovRatio <= model.maxOovRatio;

  return {
    label: bestLabel,
    confidence: maxProb,
    oovRatio,
    accepted,
    probabilities
  };
}

export function evaluate(model, entries) {
  const evalEntries = entries.filter((e) => e.split === 'evaluation');

  const matrix = {};
  const perClass = {};

  for (const actual of INTENT_LABELS) {
    matrix[actual] = {};
    for (const pred of INTENT_LABELS) {
      matrix[actual][pred] = 0;
    }
  }

  let correctCount = 0;

  for (const entry of evalEntries) {
    const res = classifyWithModel(entry.text, model);
    const actual = entry.label;
    const predicted = res.label;

    matrix[actual][predicted]++;
    if (actual === predicted) {
      correctCount++;
    }
  }

  const accuracy = roundToFixed(correctCount / evalEntries.length, 4);
  let f1Sum = 0;

  for (const label of INTENT_LABELS) {
    let tp = matrix[label][label];
    let fn = 0;
    let fp = 0;

    for (const other of INTENT_LABELS) {
      if (other !== label) {
        fn += matrix[label][other];
        fp += matrix[other][label];
      }
    }

    const precision = tp + fp > 0 ? roundToFixed(tp / (tp + fp), 4) : 0;
    const recall = tp + fn > 0 ? roundToFixed(tp / (tp + fn), 4) : 0;
    const f1 = precision + recall > 0 ? roundToFixed((2 * precision * recall) / (precision + recall), 4) : 0;

    perClass[label] = { precision, recall, f1, tp, fp, fn };
    f1Sum += f1;
  }

  const macroF1 = roundToFixed(f1Sum / INTENT_LABELS.length, 4);

  const passed =
    accuracy >= 0.9 &&
    macroF1 >= 0.88 &&
    perClass.app.recall >= 0.9 &&
    perClass['code-help'].recall >= 0.9;

  return {
    totalEvaluated: evalEntries.length,
    accuracy,
    macroF1,
    perClass,
    matrix,
    passed
  };
}

function runCLI() {
  const datasetPath = path.join(ROOT_DIR, 'data', 'intents-dataset.json');
  const targetModelPath = path.join(ROOT_DIR, 'src', 'data', 'intent-classifier-model.json');

  if (!fs.existsSync(datasetPath)) {
    console.error(`Dataset file not found at ${datasetPath}`);
    process.exit(1);
  }

  const rawData = fs.readFileSync(datasetPath, 'utf8');
  const entries = JSON.parse(rawData);

  const isValidateOnly = process.argv.includes('--validate-only');

  const validationResult = validateDataset(entries);

  if (isValidateOnly) {
    console.log('Dataset validation successful!');
    console.log(`Total entries: ${validationResult.total}`);
    for (const label of INTENT_LABELS) {
      console.log(
        `${label} train=${validationResult.counts[label].train} evaluation=${validationResult.counts[label].evaluation}`
      );
    }
    process.exit(0);
  }

  const model = trainModel(entries);
  const evalResult = evaluate(model, entries);

  if (!evalResult.passed) {
    console.error('Training failed metric gates!', JSON.stringify(evalResult, null, 2));
    process.exit(1);
  }

  // Determinism check: train a second time in memory and assert identical JSON
  const model2 = trainModel(entries);
  const json1 = JSON.stringify(model, null, 2);
  const json2 = JSON.stringify(model2, null, 2);

  if (json1 !== json2) {
    console.error('Determinism error: consecutive model training produced non-identical JSON output.');
    process.exit(1);
  }

  // Atomic write
  const tmpPath = `${targetModelPath}.tmp`;
  fs.mkdirSync(path.dirname(targetModelPath), { recursive: true });
  fs.writeFileSync(tmpPath, json1, 'utf8');
  fs.renameSync(tmpPath, targetModelPath);

  console.log(`Successfully trained and committed intent classifier model to ${targetModelPath}`);
  console.log(`Accuracy: ${evalResult.accuracy}, Macro F1: ${evalResult.macroF1}`);
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith('train-intents.mjs')) {
  runCLI();
}
