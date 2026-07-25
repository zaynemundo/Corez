import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const pkg = require('../../package.json');

export const styles = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  red: '\x1b[31m',
  magenta: '\x1b[35m',
  gray: '\x1b[90m',
};

export class TerminalUI {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
  }

  banner() {
    console.log(`\n${styles.bold}${styles.cyan}COREZ CODE CLI v${pkg.version}${styles.reset} ${styles.dim}— First-Party AI Coding Platform${styles.reset}\n`);
  }

  header(info = {}) {
    console.log(`${styles.bold}COREZ${styles.reset}`);
    console.log(`${styles.dim}Project ${styles.reset}  ${styles.bold}${info.project || 'CoreZ Workspace'}${styles.reset}`);
    console.log(`${styles.dim}Model   ${styles.reset}  ${styles.cyan}${info.model || 'DeepSeek V4 Pro'}${styles.reset}`);
    console.log(`${styles.dim}Mode    ${styles.reset}  ${info.mode || 'Agent'}`);
    console.log(`${styles.dim}Branch  ${styles.reset}  ${info.branch || 'main'}\n`);
  }

  status(symbol, text) {
    const color = symbol === '✓' ? styles.green : (symbol === '●' ? styles.cyan : styles.yellow);
    console.log(`${color}${symbol}${styles.reset} ${text}`);
  }

  info(text) {
    console.log(`${styles.cyan}ℹ${styles.reset} ${text}`);
  }

  note(text) {
    console.log(`${styles.dim}┃ ${text}${styles.reset}`);
  }

  success(text) {
    console.log(`${styles.green}✓${styles.reset} ${styles.bold}${text}${styles.reset}`);
  }

  warn(text) {
    console.log(`${styles.yellow}⚠${styles.reset} ${text}`);
  }

  error(text) {
    console.error(`\n${styles.red}${styles.bold}ERROR:${styles.reset} ${text}\n`);
  }

  logVerbose(text) {
    if (this.verbose) {
      console.log(`${styles.gray}[DEBUG] ${text}${styles.reset}`);
    }
  }

  divider() {
    console.log(`${styles.dim}──────────────────────────────────────────────────${styles.reset}`);
  }

  brief(summary = {}) {
    console.log(`\n${styles.bold}${styles.cyan}📋 POST-CODING EXECUTIVE BRIEF & SUMMARY${styles.reset}`);
    this.divider();
    if (summary.task) console.log(`${styles.dim}Task Prompt   ${styles.reset} : ${styles.bold}${summary.task}${styles.reset}`);
    if (summary.model) console.log(`${styles.dim}Model Used    ${styles.reset} : ${styles.cyan}${summary.model}${styles.reset}`);
    if (summary.stepsCount) console.log(`${styles.dim}Steps Executed ${styles.reset}: ${summary.stepsCount}`);
    if (summary.inspectedFiles && summary.inspectedFiles.length > 0) {
      console.log(`${styles.dim}Inspected     ${styles.reset} : ${summary.inspectedFiles.length} file(s) (${summary.inspectedFiles.slice(0, 4).join(', ')}${summary.inspectedFiles.length > 4 ? '...' : ''})`);
    }
    if (summary.modifiedFiles !== undefined) {
      const modCount = summary.modifiedFiles.length;
      const modText = modCount > 0
        ? `${styles.green}${modCount} file(s) modified (${summary.modifiedFiles.join(', ')})${styles.reset}`
        : `${styles.dim}None (Read-Only / No mutations)${styles.reset}`;
      console.log(`${styles.dim}Files Modified${styles.reset} : ${modText}`);
    }
    this.divider();
  }
}
