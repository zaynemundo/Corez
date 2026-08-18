import { describe, it, expect } from 'vitest';
import { createZipBlob, computeCrc32 } from '../src/utils/zipPackager.js';

describe('Zero-Dependency ZIP Packager', () => {
  it('computes accurate CRC-32 checksums', () => {
    const encoder = new TextEncoder();
    const data = encoder.encode('123456789');
    const crc = computeCrc32(data);
    // Standard CRC-32 of ASCII "123456789" is 0xCBF43926 (3421780262)
    expect(crc).toBe(0xCBF43926);
  });

  it('generates a valid ZIP Blob containing multiple HTML pages', async () => {
    const files = [
      { name: 'index.html', content: '<!DOCTYPE html><html><body><h1>Home</h1><a href="about.html">About</a></body></html>' },
      { name: 'about.html', content: '<!DOCTYPE html><html><body><h1>About</h1><a href="contact.html">Contact</a></body></html>' },
      { name: 'contact.html', content: '<!DOCTYPE html><html><body><h1>Contact</h1><a href="index.html">Home</a></body></html>' }
    ];

    const blob = createZipBlob(files);
    expect(blob).toBeTruthy();
    expect(blob.type).toBe('application/zip');
    expect(blob.size).toBeGreaterThan(100);

    const buffer = await blob.arrayBuffer();
    const view = new DataView(buffer);

    // Verify first local header magic signature PK\x03\x04
    expect(view.getUint32(0, true)).toBe(0x04034b50);

    // Verify End of Central Directory magic signature PK\x05\x06 at the end
    const last22Offset = buffer.byteLength - 22;
    expect(view.getUint32(last22Offset, true)).toBe(0x06054b50);
    // 3 files recorded
    expect(view.getUint16(last22Offset + 8, true)).toBe(3);
    expect(view.getUint16(last22Offset + 10, true)).toBe(3);
  });

  it('handles empty or special path filenames safely', () => {
    const files = [
      { name: '/index.html', content: '<h1>Home</h1>' },
      { name: '///sub/about.html', content: '<h1>About</h1>' }
    ];

    const blob = createZipBlob(files);
    expect(blob.size).toBeGreaterThan(0);
  });
});
