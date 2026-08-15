import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { classifyIntent, tokenize } from '../src/services/intentClassifier.js';
import { analyzePublicUserIntent } from '../src/services/aiService.js';
import {
  trainModel,
  classifyWithModel,
  tokenize as trainTokenize,
  validateDataset,
  INTENT_LABELS
} from '../scripts/train-intents.mjs';

const __filename = fileURLToPath(import.meta.url);
const ROOT = path.resolve(path.dirname(__filename), '..');

function loadDataset() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'data', 'intents-dataset.json'), 'utf8'));
}

function loadCommittedModel() {
  return JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'intent-classifier-model.json'), 'utf8'));
}

describe('intent tokenizer (v2)', () => {
  it('training and runtime tokenizers stay identical', () => {
    const samples = [
      'The snake game and the loop',
      'Rewrite this email to be more polite',
      'Why is serverless architecture popular for microservices?',
      'Fix my react component crash'
    ];
    for (const sample of samples) {
      expect(trainTokenize(sample)).toEqual(tokenize(sample));
    }
  });

  it('drops pure glue-word bigrams but keeps every unigram', () => {
    const tokens = tokenize('the snake game and the loop');
    expect(tokens).toContain('the');
    expect(tokens).toContain('and');
    expect(tokens).toContain('bi:the_snake');
    expect(tokens).toContain('bi:snake_game');
    expect(tokens).not.toContain('bi:and_the'); // both parts are stopwords
    expect(tokens).toContain('bi:the_loop');
  });

  it('caps token count at 512', () => {
    const words = Array.from({ length: 1000 }, (_, i) => `word${i}`).join(' ');
    expect(tokenize(words).length).toBeLessThanOrEqual(512);
  });
});

describe('intent training pipeline', () => {
  it('dataset validates to exactly 250 balanced entries', () => {
    const entries = loadDataset();
    const result = validateDataset(entries);
    expect(result.total).toBe(250);
    for (const label of INTENT_LABELS) {
      expect(result.counts[label].train).toBe(40);
      expect(result.counts[label].evaluation).toBe(10);
    }
  });

  it('training is byte-for-byte deterministic and bumps model metadata', () => {
    const entries = loadDataset();
    const model1 = trainModel(entries);
    const model2 = trainModel(entries);
    expect(JSON.stringify(model1)).toBe(JSON.stringify(model2));
    expect(model1.modelVersion).toBe('1.1.0');
    expect(model1.tokenizer).toBe('corez-intent-nfkc-unigram-bigram-v2');
    expect(model1.minConfidence).toBe(0.55);
    expect(model1.maxOovRatio).toBe(0.7);
  });

  it('committed model matches the dataset training digest', () => {
    const entries = loadDataset();
    const retrained = trainModel(entries);
    expect(retrained.trainingDataSha256).toBe(loadCommittedModel().trainingDataSha256);
  });
});

describe('committed model held-out evaluation', () => {
  it('achieves >= 0.95 raw accuracy and perfect accuracy on accepted entries', () => {
    const entries = loadDataset();
    const model = loadCommittedModel();
    const evalEntries = entries.filter((e) => e.split === 'evaluation');
    let correct = 0;
    for (const entry of evalEntries) {
      const result = classifyWithModel(entry.text, model);
      if (result.label === entry.label) correct += 1;
      // Any entry the runtime accepts MUST be classified correctly: an
      // accepted wrong label is served to the user as-is.
      if (result.accepted) {
        expect(result.label).toBe(entry.label);
      }
    }
    expect(correct / evalEntries.length).toBeGreaterThanOrEqual(0.95);
  });

  it('classifies the five canonical labels with accepted confidence', () => {
    const cases = [
      ['Create an invoice calculator I can use in the browser', 'app'],
      ['Why does this React effect keep rendering forever?', 'code-help'],
      ['Rewrite this launch email so it sounds confident', 'writing'],
      ['Explain database indexes in plain English', 'explanation'],
      ['I have a rough idea and need help deciding what to do', 'general']
    ];
    for (const [prompt, expected] of cases) {
      const result = classifyIntent(prompt);
      expect(result.label).toBe(expected);
      expect(result.accepted).toBe(true);
    }
  });

  it('rejects gibberish and short acknowledgments at the model gate', () => {
    expect(classifyIntent('foo bar baz completely unknown text tokens 9999').accepted).toBe(false);
    expect(classifyIntent('Awesome, thanks for the quick reply.').accepted).toBe(false);
  });
});

describe('analyzePublicUserIntent runtime routing', () => {
  it('routes why-is explanation questions via rules when the model gate rejects', () => {
    const result = analyzePublicUserIntent('Why is cloud serverless architecture popular for microservices?');
    expect(result.type).toBe('explanation');
    expect(['model', 'prompt-intelligence', 'rules']).toContain(result.source);
  });

  it('keeps acknowledgments and advice questions general', () => {
    expect(analyzePublicUserIntent('Awesome, thanks for the quick reply.').type).toBe('general');
    expect(analyzePublicUserIntent('How do I organize my daily task schedule effectively?').type).toBe('general');
  });

  it('resolves multi-intent prompts to the deliverable intent', () => {
    expect(analyzePublicUserIntent('explain React state and build a counter').type).toBe('app');
    expect(analyzePublicUserIntent('review this counter and explain why it breaks').type).toBe('code-help');
  });

  it('falls back to general for OOV and blank input', () => {
    expect(analyzePublicUserIntent('xyzzy qwerty random gibberish 12345').type).toBe('general');
    expect(analyzePublicUserIntent('   ').type).toBe('general');
  });
});
