/**
 * Attachment → message conversion contract for a text-only model.
 *
 * Muse Spark 1.3 Contributor has no vision input on the OpenCode Go gateway,
 * so attachments must reach the model as metadata only (kind, name, size,
 * authoritative R2 URL) and no image_url part may ever be built. Stored
 * multimodal content is flattened to text for the same reason. These tests
 * make that rule explicit so a future change cannot silently reintroduce
 * pixel input the model cannot consume (an unsupported image part risks a
 * 400 that fails the whole request).
 */

import { describe, it, expect } from 'vitest';
import {
  attachmentKind,
  toMultimodalMessage
} from '../worker/attachmentVision.js';

/** A 1x1 transparent PNG — enough to be a well-formed data URL. */
const DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';
const R2_URL = '/api/assets/user-upload_1716041183016.jpg';

describe('attachment vision', () => {
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

    it('NEVER sends image input, even for a data-URL thumb', () => {
      const out = toMultimodalMessage({
        role: 'user',
        content: 'what is this?',
        attachments: [{ name: 'shot.png', type: 'image/png', thumb: DATA_URL }]
      });
      // Content stays a plain string; no image_url part, no pixel data.
      expect(typeof out.content).toBe('string');
      expect(out.content).not.toContain('image_url');
      expect(out.content).not.toContain('base64');
      expect(out.content).toContain('shot.png');
    });

    it('emits the authoritative R2 URL as a text hint', () => {
      const out = toMultimodalMessage({
        role: 'user',
        content: 'use this photo',
        attachments: [{ name: 'me.jpg', type: 'image/jpeg', assetUrl: R2_URL }]
      });
      expect(typeof out.content).toBe('string');
      expect(out.content).toContain('https://corez.pro/api/assets/user-upload_1716041183016.jpg');
      expect(out.content).not.toContain('image_url');
    });

    it('treats video and audio as metadata only', () => {
      const out = toMultimodalMessage({
        role: 'user',
        content: 'clip',
        attachments: [{ name: 'demo.mp4', type: 'video/mp4', assetUrl: R2_URL }]
      });
      expect(out.content).toContain('Attached video "demo.mp4"');
      expect(out.content).not.toContain('image_url');
    });

    it('flattens stored multimodal content to its text parts', () => {
      const out = toMultimodalMessage({
        role: 'user',
        content: [
          { type: 'text', text: 'compare these' },
          { type: 'image_url', image_url: { url: DATA_URL } }
        ]
      });
      expect(out.content).toBe('compare these');
      expect(out.content).not.toContain('base64');
    });

    it('mentions extracted file content without inlining it', () => {
      const out = toMultimodalMessage({
        role: 'user',
        content: 'summarise',
        attachments: [{ name: 'notes.txt', type: 'text/plain', content: 'secret document body' }]
      });
      expect(out.content).toContain('notes.txt');
      expect(out.content).not.toContain('secret document body');
    });

    it('handles malformed attachments without throwing', () => {
      for (const bad of [null, undefined, {}, { thumb: 42 }, { thumb: null }, { assetUrl: 7 }]) {
        expect(() =>
          toMultimodalMessage({ role: 'user', content: 'x', attachments: [bad] })
        ).not.toThrow();
      }
    });
  });
});
