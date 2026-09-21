/**
 * Attachment → vision input contract.
 *
 * DeepSeek V4.1 Flash accepts images natively, so CoreZ sends attached images
 * as real image input. The OpenCode Go gateway only reads SELF-CONTAINED data
 * URLs: a remote URL is rejected with HTTP 400 ("Failed to download image
 * from ..."), which fails the whole chat request. These tests make that rule
 * explicit so a future change cannot reintroduce the outage.
 */

import { describe, it, expect } from 'vitest';
import {
  MAX_VISION_IMAGES,
  attachmentKind,
  toMultimodalMessage,
  toVisionImagePart
} from '../worker/attachmentVision.js';

/** A 1x1 transparent PNG — enough to be a well-formed data URL. */
const DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';
const R2_URL = '/api/assets/user-upload_1716041183016.jpg';

describe('attachment vision', () => {
  describe('toVisionImagePart', () => {
    it('turns a data-URL thumb into real image input', () => {
      const part = toVisionImagePart({ type: 'image/png', thumb: DATA_URL });
      expect(part).toEqual({ type: 'image_url', image_url: { url: DATA_URL } });
    });

    it('NEVER sends an R2 asset URL as image input', () => {
      // The gateway cannot fetch remote images; sending one would 400 the whole
      // request. The URL must stay a text hint for markup instead.
      expect(toVisionImagePart({ type: 'image/jpeg', assetUrl: R2_URL })).toBeNull();
      expect(
        toVisionImagePart({ type: 'image/jpeg', assetUrl: `https://corez.pro${R2_URL}` })
      ).toBeNull();
    });

    it('rejects non-image data URLs and oversized thumbs', () => {
      expect(toVisionImagePart({ thumb: 'data:text/plain;base64,QQ==' })).toBeNull();
      expect(toVisionImagePart({ thumb: 'data:video/mp4;base64,QQ==' })).toBeNull();
      const huge = 'data:image/png;base64,' + 'A'.repeat(4 * 1024 * 1024 + 1);
      expect(toVisionImagePart({ thumb: huge })).toBeNull();
    });

    it('handles malformed attachments without throwing', () => {
      for (const bad of [null, undefined, {}, { thumb: 42 }, { thumb: null }]) {
        expect(toVisionImagePart(bad)).toBeNull();
      }
    });
  });

  describe('attachmentKind', () => {
    it('classifies by mime, defaulting to file', () => {
      expect(attachmentKind({ type: 'image/png' })).toBe('image');
      expect(attachmentKind({ type: 'VIDEO/mp4' })).toBe('video');
      expect(attachmentKind({ type: 'audio/mpeg' })).toBe('audio');
      expect(attachmentKind({ type: 'application/pdf' })).toBe('file');
      expect(attachmentKind({})).toBe('file');
    });
  });

  describe('toMultimodalMessage', () => {
    it('leaves a text-only message untouched', () => {
      const out = toMultimodalMessage({ role: 'user', content: 'hello' });
      expect(out).toEqual({ role: 'user', content: 'hello' });
    });

    it('passes the image to the model alongside the text', () => {
      const out = toMultimodalMessage({
        role: 'user',
        content: 'what is this?',
        attachments: [{ name: 'shot.png', type: 'image/png', thumb: DATA_URL }]
      });
      expect(Array.isArray(out.content)).toBe(true);
      expect(out.content[0].type).toBe('text');
      expect(out.content[0].text).toContain('what is this?');
      const image = out.content.find((c) => c.type === 'image_url');
      expect(image.image_url.url).toBe(DATA_URL);
    });

    it('still emits the R2 URL as a text hint, but never as image input', () => {
      const out = toMultimodalMessage({
        role: 'user',
        content: 'use this photo',
        attachments: [{ name: 'me.jpg', type: 'image/jpeg', assetUrl: R2_URL }]
      });
      // No vision part — that is the whole point.
      expect(Array.isArray(out.content)).toBe(false);
      expect(typeof out.content).toBe('string');
      expect(out.content).toContain('https://corez.pro/api/assets/user-upload_1716041183016.jpg');
      expect(out.content).not.toContain('image_url');
    });

    it('caps how many images ride on one request', () => {
      const attachments = Array.from({ length: MAX_VISION_IMAGES + 3 }, (_, i) => ({
        name: `shot-${i}.png`,
        type: 'image/png',
        thumb: DATA_URL
      }));
      const out = toMultimodalMessage({ role: 'user', content: 'many', attachments });
      const images = out.content.filter((c) => c.type === 'image_url');
      expect(images).toHaveLength(MAX_VISION_IMAGES);
    });

    it('mixes vision parts and URL hints in one request', () => {
      const out = toMultimodalMessage({
        role: 'user',
        content: 'compare',
        attachments: [
          { name: 'visible.png', type: 'image/png', thumb: DATA_URL },
          { name: 'remote.jpg', type: 'image/jpeg', assetUrl: R2_URL }
        ]
      });
      const images = out.content.filter((c) => c.type === 'image_url');
      expect(images).toHaveLength(1);
      expect(out.content[0].text).toContain('remote.jpg');
    });
  });
});
