import { describe, it, expect } from 'vitest';
import { sanitizeGameHtml } from '../src/components/SecureGamePreview.jsx';
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
        </script>
      </body>
    </html>`;

    const sanitized = sanitizeGameHtml(maliciousHtml);
    expect(sanitized).not.toContain('window.top.location');
    expect(sanitized).not.toContain('document.cookie');
    expect(sanitized).toContain('window._blocked_top_loc');
    expect(sanitized).toContain('window._blocked_cookie');
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

    const result = await testGameHtml(validHtml, { assets: [] });
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
