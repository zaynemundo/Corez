import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { validateDataset, evaluate, INTENT_LABELS } from './train-intents.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

function runEvaluator() {
  const datasetPath = path.join(ROOT_DIR, 'data', 'intents-dataset.json');
  const modelPath = path.join(ROOT_DIR, 'src', 'data', 'intent-classifier-model.json');

  if (!fs.existsSync(datasetPath)) {
    console.error(`Dataset not found at ${datasetPath}`);
    process.exit(1);
  }

  if (!fs.existsSync(modelPath)) {
    console.error(`Model artifact not found at ${modelPath}`);
    process.exit(1);
  }

  const entries = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
  const model = JSON.parse(fs.readFileSync(modelPath, 'utf8'));

  validateDataset(entries);

  const trainEntries = entries.filter((e) => e.split === 'train');
  const sortedTrainEntries = [...trainEntries].sort((a, b) => a.id.localeCompare(b.id));
  const currentTrainSha = crypto
    .createHash('sha256')
    .update(JSON.stringify(sortedTrainEntries), 'utf8')
    .digest('hex');

  if (currentTrainSha !== model.trainingDataSha256) {
    console.error('Mismatch between dataset training SHA-256 and model trainingDataSha256!');
    process.exit(1);
  }

  const evalResult = evaluate(model, entries);

  console.log('=== Local Intent Classifier Evaluation Report ===');
  console.log(`Evaluated: ${evalResult.totalEvaluated} held-out examples`);
  console.log(`Overall Accuracy: ${(evalResult.accuracy * 100).toFixed(1)}%`);
  console.log(`Macro F1 Score:   ${evalResult.macroF1.toFixed(4)}\n`);

  console.log('--- Confusion Matrix (Actual \\ Predicted) ---');
  const header = ['Actual \\ Pred', ...INTENT_LABELS].map((s) => s.padStart(13)).join(' | ');
  console.log(header);
  console.log('-'.repeat(header.length));

  for (const actual of INTENT_LABELS) {
    const row = [actual.padStart(13)];
    for (const pred of INTENT_LABELS) {
      row.push(String(evalResult.matrix[actual][pred]).padStart(13));
    }
    console.log(row.join(' | '));
  }

  console.log('\n--- Per-Class Performance ---');
  const classHeader = ['Class', 'Precision', 'Recall', 'F1 Score'].map((s) => s.padStart(13)).join(' | ');
  console.log(classHeader);
  console.log('-'.repeat(classHeader.length));

  for (const label of INTENT_LABELS) {
    const stats = evalResult.perClass[label];
    const row = [
      label.padStart(13),
      stats.precision.toFixed(4).padStart(13),
      stats.recall.toFixed(4).padStart(13),
      stats.f1.toFixed(4).padStart(13)
    ];
    console.log(row.join(' | '));
  }

  console.log('\n--- Metric Gates ---');
  console.log(`Accuracy >= 0.90:         ${evalResult.accuracy >= 0.90 ? 'PASS' : 'FAIL'} (${evalResult.accuracy})`);
  console.log(`Macro F1 >= 0.88:         ${evalResult.macroF1 >= 0.88 ? 'PASS' : 'FAIL'} (${evalResult.macroF1})`);
  console.log(
    `App Recall >= 0.90:       ${evalResult.perClass.app.recall >= 0.90 ? 'PASS' : 'FAIL'} (${evalResult.perClass.app.recall})`
  );
  console.log(
    `Code-Help Recall >= 0.90: ${evalResult.perClass['code-help'].recall >= 0.90 ? 'PASS' : 'FAIL'} (${evalResult.perClass['code-help'].recall})`
  );

  const summary = {
    accuracy: evalResult.accuracy,
    macroF1: evalResult.macroF1,
    appRecall: evalResult.perClass.app.recall,
    codeHelpRecall: evalResult.perClass['code-help'].recall,
    passed: evalResult.passed
  };

  console.log('\nSUMMARY_JSON:' + JSON.stringify(summary));

  if (!evalResult.passed) {
    console.error('\nEvaluation failed metric gates!');
    process.exit(1);
  }
}

runEvaluator();
