import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

export class ContextEngine {
  constructor(cwd = process.cwd()) {
    this.cwd = cwd;
    this.inspectedFiles = new Set();
    this.modifiedFiles = new Set();
    this.executedTools = [];
    this.projectInfo = null;
    this.instructions = null;
  }

  inspectProject() {
    const pkgPath = path.join(this.cwd, 'package.json');
    let pkgData = {};
    if (fs.existsSync(pkgPath)) {
      try {
        pkgData = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      } catch (_e) {
        // Ignored
      }
    }

    let gitBranch = 'unknown';
    let gitStatus = '';
    try {
      gitBranch = execSync('git branch --show-current', { cwd: this.cwd, encoding: 'utf8' }).trim();
      gitStatus = execSync('git status --short', { cwd: this.cwd, encoding: 'utf8' }).trim();
    } catch (_e) {
      // Git unavailable or not a repo
    }

    this.projectInfo = {
      name: pkgData.name || path.basename(this.cwd),
      version: pkgData.version || '0.0.0',
      type: pkgData.type || 'commonjs',
      scripts: pkgData.scripts || {},
      dependencies: Object.keys(pkgData.dependencies || {}),
      devDependencies: Object.keys(pkgData.devDependencies || {}),
      gitBranch,
      gitStatusShort: gitStatus,
      cwd: this.cwd
    };

    return this.projectInfo;
  }

  loadInstructions() {
    const candidateFiles = ['COREZ.md', 'AGENTS.md', '.corez/instructions.md'];
    const loadedInstructions = [];

    for (const filename of candidateFiles) {
      const fullPath = path.join(this.cwd, filename);
      if (fs.existsSync(fullPath)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          loadedInstructions.push({ filename, content });
          this.recordInspectedFile(fullPath);
        } catch (_e) {
          // Ignored
        }
      }
    }

    this.instructions = loadedInstructions;
    return loadedInstructions;
  }

  recordInspectedFile(filePath) {
    if (!filePath) return;
    const rel = path.isAbsolute(filePath) ? path.relative(this.cwd, filePath) : filePath;
    this.inspectedFiles.add(rel);
  }

  recordModifiedFile(filePath) {
    if (!filePath) return;
    const rel = path.isAbsolute(filePath) ? path.relative(this.cwd, filePath) : filePath;
    this.modifiedFiles.add(rel);
  }

  recordToolExecution(toolName, args, result) {
    this.executedTools.push({
      toolName,
      args,
      status: result?.error ? 'error' : 'success',
      timestamp: new Date().toISOString()
    });
  }

  buildSystemContextPrompt() {
    const info = this.projectInfo || this.inspectProject();
    const instructions = this.instructions || this.loadInstructions();

    let prompt = `CoreZ Project Context:\n`;
    prompt += `- Workspace Root: ${info.cwd}\n`;
    prompt += `- Project Name: ${info.name}\n`;
    prompt += `- Git Branch: ${info.gitBranch}\n`;
    prompt += `- Dependencies: ${info.dependencies.slice(0, 10).join(', ')}${info.dependencies.length > 10 ? '...' : ''}\n`;
    prompt += `- Available Scripts: ${Object.keys(info.scripts).join(', ')}\n`;

    if (this.inspectedFiles.size > 0) {
      prompt += `- Inspected Files: ${Array.from(this.inspectedFiles).slice(0, 15).join(', ')}\n`;
    }
    if (this.modifiedFiles.size > 0) {
      prompt += `- Modified Files: ${Array.from(this.modifiedFiles).join(', ')}\n`;
    }

    if (instructions && instructions.length > 0) {
      prompt += `\nProject Rules & Instructions:\n`;
      for (const inst of instructions) {
        prompt += `--- Begin ${inst.filename} ---\n${inst.content.slice(0, 2000)}\n--- End ${inst.filename} ---\n`;
      }
    }

    return prompt;
  }
}
