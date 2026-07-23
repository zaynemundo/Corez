/**
 * Integrated Game Generation Pipeline Orchestrator
 * Coordinates Intent Classification, Structured Manifest Validation, Parallel Asset & Skeleton Generation,
 * Permanent Storage, Code Synthesis, Automated Testing, and Repair Passes.
 */

import { parseAndValidateManifest, generateCorrectionPrompt } from './manifestSchema.js';
import { defaultAssetStorage } from './assetStorage.js';
import { validateAsset, generateAssetRepairPrompt } from './assetValidator.js';
import { buildAssetRegistry, generatePreloaderScript } from './assetRegistry.js';
import { generateEngineSkeleton } from './engineSkeleton.js';
import { testGameHtml, generateRepairPrompt } from './gameTester.js';
import { PipelineJobTracker, PIPELINE_STAGES } from './pipelineTracker.js';
import { AgentSwarmOrchestrator } from './swarm/agentSwarmOrchestrator.js';

export class GamePipelineOrchestrator {
  constructor(options = {}) {
    this.aiClient = options.aiClient; // function (prompt, options) => Promise<string>
    this.fluxClient = options.fluxClient; // function (prompt) => Promise<string url>
    this.storage = options.storage || defaultAssetStorage;
    this.swarmOrchestrator = new AgentSwarmOrchestrator({
      aiClient: this.aiClient,
      fluxClient: this.fluxClient,
      storage: this.storage
    });
  }

  async runSwarmPipeline(userPrompt, options = {}) {
    return this.swarmOrchestrator.executeSwarmJob(userPrompt, options);
  }

  async runPipeline(userPrompt, options = {}) {
    const tracker = new PipelineJobTracker(options.jobId, userPrompt);
    const signal = options.signal;

    try {
      // 1. Intent Classification Stage
      tracker.transitionTo(PIPELINE_STAGES.CLASSIFYING_INTENT, 'Classifying user intent');
      
      // 2. Structured Game Planning Stage
      tracker.transitionTo(PIPELINE_STAGES.PLANNING_GAME, 'Generating structured game manifest');
      const planningPrompt = `You are a Lead Game Architect. Analyze this request and output ONLY a valid JSON object matching the required Game Pipeline schema:

{
  "gameSpec": {
    "title": "Short title",
    "genre": "arcade|platformer|puzzle|shooter|word",
    "mechanics": ["mechanic 1", "mechanic 2"],
    "controls": { "ArrowLeft": "Move Left", "Space": "Jump" },
    "entities": ["Player", "Enemy"],
    "winCondition": "Reach score 100",
    "loseCondition": "Lives reach 0",
    "difficultyCurve": ["Easy", "Medium", "Hard"]
  },
  "artDirection": {
    "style": "8-bit retro pixel art",
    "palette": ["#1a1c2c", "#f4b41b", "#e43b44", "#2ce8f5"],
    "camera": "side-view|top-down|fixed",
    "renderingRules": ["shape-rendering=crispEdges", "imageSmoothingEnabled=false"]
  },
  "assetManifest": {
    "assets": [
      {
        "id": "background",
        "type": "background",
        "prompt": "8-bit pixel art retro dungeon backdrop, NES palette, crisp pixel grid",
        "width": 960,
        "height": 540,
        "transparent": false
      },
      {
        "id": "player",
        "type": "player",
        "prompt": "8-bit pixel art knight sprite, isolated on transparent background, crisp outline",
        "width": 64,
        "height": 64,
        "transparent": true
      }
    ]
  }
}

User Game Request: "${userPrompt}"`;

      let rawManifestResponse = await this.aiClient(planningPrompt, { signal });
      let manifestResult = parseAndValidateManifest(rawManifestResponse);

      // Manifest Validation Repair Attempt if needed
      if (!manifestResult.success) {
        tracker.addError(manifestResult.error);
        const correctionPrompt = generateCorrectionPrompt(manifestResult);
        rawManifestResponse = await this.aiClient(correctionPrompt, { signal });
        manifestResult = parseAndValidateManifest(rawManifestResponse);
        if (!manifestResult.success) {
          throw new Error(`Game Manifest validation failed twice: ${manifestResult.error}`);
        }
      }

      const manifest = manifestResult.manifest;
      tracker.setManifest(manifest);

      // 3. Parallel Execution: Asset Generation & Engine Skeleton
      tracker.transitionTo(PIPELINE_STAGES.GENERATING_ASSETS, 'Generating visual assets and engine skeleton');

      // 3a. Generate Engine Skeleton asynchronously
      const engineSkeletonPromise = Promise.resolve().then(() => {
        tracker.transitionTo(PIPELINE_STAGES.BUILDING_ENGINE, 'Building asset-independent engine skeleton');
        return generateEngineSkeleton(manifest.gameSpec);
      });

      // 3b. Generate FLUX Visual Assets
      const assetsMap = {};
      const assetList = manifest.assetManifest.assets || [];

      for (const assetDef of assetList) {
        let attempts = 0;
        let success = false;
        let lastError = null;

        while (attempts < 2 && !success) {
          attempts++;
          try {
            const promptToUse = attempts === 1
              ? assetDef.prompt
              : generateAssetRepairPrompt(assetDef, [lastError]);

            const tempUrl = await this.fluxClient(promptToUse, { signal });
            
            // Persist to storage
            tracker.transitionTo(PIPELINE_STAGES.PROCESSING_ASSETS, `Persisting asset "${assetDef.id}"`);
            const storedInfo = await this.storage.fetchAndPersistAsset(
              tracker.job.jobId,
              assetDef.id,
              tempUrl,
              assetDef.transparent ? 'image/png' : 'image/png'
            );

            // Asset Validation
            const valResult = validateAsset(assetDef, {
              ...storedInfo,
              width: assetDef.width,
              height: assetDef.height,
              hasAlpha: assetDef.transparent
            });

            if (!valResult.valid) {
              lastError = valResult.errors.join('; ');
              tracker.addError(`Asset "${assetDef.id}" validation error: ${lastError}`);
            } else {
              assetsMap[assetDef.id] = {
                ...assetDef,
                ...storedInfo
              };
              tracker.recordAssetCompleted(assetDef.id, assetsMap[assetDef.id]);
              success = true;
            }
          } catch (err) {
            lastError = err.message;
            tracker.addError(`Asset generation failed for "${assetDef.id}": ${err.message}`);
          }
        }

        if (!success) {
          console.warn(`Asset "${assetDef.id}" failed generation. Procedural fallback will be used.`);
        }
      }

      const engineSkeleton = await engineSkeletonPromise;

      // 4. Final Code Synthesis with Asset Registry
      tracker.transitionTo(PIPELINE_STAGES.SYNTHESIS_GAME, 'Synthesizing complete game with asset registry');
      const assetRegistryObj = buildAssetRegistry(assetsMap);
      const preloaderScriptSnippet = generatePreloaderScript(assetRegistryObj);

      const synthesisPrompt = `You are a Lead Game Developer. Synthesize the complete, production-ready, runnable single-file HTML game for:

Game Title: "${manifest.gameSpec.title}"
Genre: "${manifest.gameSpec.genre}"
Win Condition: "${manifest.gameSpec.winCondition}"
Lose Condition: "${manifest.gameSpec.loseCondition}"

You MUST include this exact Asset Registry and Preloader Script:
\`\`\`javascript
${preloaderScriptSnippet}
\`\`\`

Engine Skeleton Reference:
\`\`\`html
${engineSkeleton}
\`\`\`

Instructions:
1. Combine the HTML layout, canvas rendering loop, input handling, and Web Audio sounds.
2. Ensure canvas rendering calls \`configurePixelArtCanvas(ctx)\` and sets \`ctx.imageSmoothingEnabled = false\`.
3. Preload all assets using \`loadAllAssets()\`, showing loading progress, and start the game loop inside the resolved \`.then()\`.
4. Output ONLY the complete runnable HTML document wrapped inside a single \`\`\`html ... \`\`\` code block.`;

      let synthesizedHtmlResponse = await this.aiClient(synthesisPrompt, { signal });
      let extractedHtml = this.extractHtmlFromResponse(synthesizedHtmlResponse) || engineSkeleton;

      // 5. Automated Browser Testing & Repair Passes
      tracker.transitionTo(PIPELINE_STAGES.TESTING_GAME, 'Running automated browser testing');
      let testResult = await testGameHtml(extractedHtml, manifest.assetManifest);

      while (!testResult.passed && tracker.incrementRepairAttempt()) {
        tracker.transitionTo(PIPELINE_STAGES.REPAIRING_GAME, `Repair pass #${tracker.job.repairAttempts}`);
        const repairPrompt = generateRepairPrompt(userPrompt, extractedHtml, testResult);
        synthesizedHtmlResponse = await this.aiClient(repairPrompt, { signal });
        const repairedHtml = this.extractHtmlFromResponse(synthesizedHtmlResponse);
        if (repairedHtml) extractedHtml = repairedHtml;
        testResult = await testGameHtml(extractedHtml, manifest.assetManifest);
      }

      if (!testResult.passed) {
        tracker.addError(`Game completed with unresolved test warnings: ${testResult.errors.join('; ')}`);
      }

      tracker.complete(extractedHtml);
      return {
        job: tracker.job,
        html: extractedHtml
      };
    } catch (err) {
      tracker.fail(err.message);
      throw err;
    }
  }

  extractHtmlFromResponse(response) {
    if (!response) return null;
    const match = response.match(/```(?:html)?\s*([\s\S]*?)```/i);
    if (match && match[1].trim()) {
      return match[1].trim();
    }
    if (response.includes('<!DOCTYPE html>') || response.includes('<html')) {
      return response.trim();
    }
    return null;
  }
}
