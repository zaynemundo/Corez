import { describe, it, expect } from 'vitest';
import { sanitizeGameHtml, isTrustedGameMessage } from '../src/components/SecureGamePreview.jsx';
import { testGameHtml } from '../src/services/gamePipeline/gameTester.js';

describe('Secure Iframe & Automated Testing Bridge', () => {
  it('sanitizes unsafe JavaScript window location & cookie access', () => {
    const maliciousHtml = `
    <html>
      <head><title>Unsafe Game</title></head>
      <body>
        <script>
          window.top.location = 'https://malicious-site.com';
          const c = document.cookie;
          window.open('https://pop-up.com');
          window['open']('https://pop-up-2.com');
        </script>
      </body>
    </html>`;

    const sanitized = sanitizeGameHtml(maliciousHtml);
    expect(sanitized).not.toContain('window.top.location');
    expect(sanitized).not.toContain('document.cookie');
    expect(sanitized).toContain('window._blocked_top_loc');
    expect(sanitized).toContain('window._blocked_cookie');
    expect(sanitized).not.toContain("window['open'](");
  });

  it('accepts game handshake messages only from the sandboxed iframe', () => {
    const iframeWindow = {};
    const selfOrigin = 'https://corez.test';
    const sandboxed = { source: iframeWindow, origin: 'null' };
    const sameOrigin = { source: iframeWindow, origin: selfOrigin };
    const foreign = { source: iframeWindow, origin: 'https://evil.example' };
    const otherSource = { source: {}, origin: 'null' };

    expect(isTrustedGameMessage(sandboxed, iframeWindow, selfOrigin)).toBe(true);
    expect(isTrustedGameMessage(sameOrigin, iframeWindow, selfOrigin)).toBe(true);
    expect(isTrustedGameMessage(foreign, iframeWindow, selfOrigin)).toBe(false);
    expect(isTrustedGameMessage(otherSource, iframeWindow, selfOrigin)).toBe(false);
    expect(isTrustedGameMessage(sandboxed, null, selfOrigin)).toBe(false);
    expect(isTrustedGameMessage(null, iframeWindow, selfOrigin)).toBe(false);
  });

  it('runs automated DOM & script evaluation on valid game HTML', async () => {
    const validHtml = `<!DOCTYPE html>
    <html>
      <head><title>Test Game</title></head>
      <body>
        <canvas id="gameCanvas" width="960" height="540"></canvas>
        <script>
          const canvas = document.getElementById('gameCanvas');
          const ctx = canvas.getContext('2d');
          let x = 0;
          function gameLoop() {
            x++;
            requestAnimationFrame(gameLoop);
          }
          window.addEventListener('keydown', e => {});
          requestAnimationFrame(gameLoop);
        </script>
      </body>
    </html>`;

    const result = await testGameHtml(validHtml, { assets: [] }, { executeScripts: true });
    expect(result.passed).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('detects missing canvas and unapproved external scripts', async () => {
    const badHtml = `<!DOCTYPE html>
    <html>
      <head>
        <title>Bad Game</title>
        <script src="https://unapproved-cdn.com/bad.js"></script>
      </head>
      <body>
        <h1>No Canvas Here</h1>
      </body>
    </html>`;

    const result = await testGameHtml(badHtml, { assets: [] });
    expect(result.passed).toBe(false);
    expect(result.errors).toEqual(
      expect.arrayContaining([
        expect.stringContaining('No <canvas> element found'),
        expect.stringContaining('Security Warning: Unapproved external script')
      ])
    );
  });
});
