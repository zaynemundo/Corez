/**
 * CoreZ Zero-Dependency ZIP Archive Packager
 * Generates standard PKZIP (.zip) blobs for multi-page websites and project export.
 */

const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) {
    c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  crcTable[i] = c >>> 0;
}

export function computeCrc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    c = crcTable[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Creates a standard ZIP Blob containing multiple files.
 * @param {Array<{ name: string, content: string | Uint8Array }>} files
 * @returns {Blob}
 */
export function createZipBlob(files = []) {
  const encoder = new TextEncoder();
  const fileEntries = [];

  // Normalize files
  for (const file of files) {
    if (!file || !file.name) continue;
    const nameBytes = encoder.encode(file.name.replace(/^\/+/, ""));
    const contentBytes =
      typeof file.content === "string"
        ? encoder.encode(file.content)
        : file.content instanceof Uint8Array
          ? file.content
          : new Uint8Array(0);
    const crc = computeCrc32(contentBytes);
    fileEntries.push({
      nameBytes,
      contentBytes,
      crc,
      uncompressedSize: contentBytes.length,
      compressedSize: contentBytes.length,
    });
  }

  const parts = [];
  const centralDirParts = [];
  let currentOffset = 0;

  for (const entry of fileEntries) {
    const localHeaderOffset = currentOffset;

    // 1. Local file header (30 bytes + filename + data)
    const localHeader = new Uint8Array(30);
    const lv = new DataView(localHeader.buffer);
    lv.setUint32(0, 0x04034b50, true); // Local file header signature
    lv.setUint16(4, 20, true); // Version needed to extract (2.0)
    lv.setUint16(6, 0x0800, true); // Flags (UTF-8 filename)
    lv.setUint16(8, 0, true); // Compression method: 0 (store)
    lv.setUint16(10, 0x3000, true); // Last mod file time
    lv.setUint16(12, 0x5821, true); // Last mod file date (2024-01-01)
    lv.setUint32(14, entry.crc, true); // CRC-32
    lv.setUint32(18, entry.compressedSize, true); // Compressed size
    lv.setUint32(22, entry.uncompressedSize, true); // Uncompressed size
    lv.setUint16(26, entry.nameBytes.length, true); // File name length
    lv.setUint16(28, 0, true); // Extra field length

    parts.push(localHeader);
    parts.push(entry.nameBytes);
    parts.push(entry.contentBytes);

    currentOffset += 30 + entry.nameBytes.length + entry.contentBytes.length;

    // 2. Central directory file header (46 bytes + filename)
    const centralHeader = new Uint8Array(46);
    const cv = new DataView(centralHeader.buffer);
    cv.setUint32(0, 0x02014b50, true); // Central directory file header signature
    cv.setUint16(4, 20, true); // Version made by (2.0)
    cv.setUint16(6, 20, true); // Version needed to extract (2.0)
    cv.setUint16(8, 0x0800, true); // Flags (UTF-8 filename)
    cv.setUint16(10, 0, true); // Compression method: 0 (store)
    cv.setUint16(12, 0x3000, true); // Last mod file time
    cv.setUint16(14, 0x5821, true); // Last mod file date
    cv.setUint32(16, entry.crc, true); // CRC-32
    cv.setUint32(20, entry.compressedSize, true); // Compressed size
    cv.setUint32(24, entry.uncompressedSize, true); // Uncompressed size
    cv.setUint16(28, entry.nameBytes.length, true); // File name length
    cv.setUint16(30, 0, true); // Extra field length
    cv.setUint16(32, 0, true); // File comment length
    cv.setUint16(34, 0, true); // Disk number start
    cv.setUint16(36, 0, true); // Internal file attributes
    cv.setUint32(38, 0, true); // External file attributes
    cv.setUint32(42, localHeaderOffset, true); // Relative offset of local header

    centralDirParts.push(centralHeader);
    centralDirParts.push(entry.nameBytes);
  }

  const centralDirectoryOffset = currentOffset;
  let centralDirectorySize = 0;
  for (const part of centralDirParts) {
    centralDirectorySize += part.length;
    parts.push(part);
  }

  // 3. End of central directory record (22 bytes)
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true); // EOCD signature
  ev.setUint16(4, 0, true); // Number of this disk
  ev.setUint16(6, 0, true); // Disk where central directory starts
  ev.setUint16(8, fileEntries.length, true); // Number of central directory records on this disk
  ev.setUint16(10, fileEntries.length, true); // Total number of central directory records
  ev.setUint32(12, centralDirectorySize, true); // Size of central directory
  ev.setUint32(16, centralDirectoryOffset, true); // Offset of central directory
  ev.setUint16(20, 0, true); // Comment length

  parts.push(eocd);

  return new Blob(parts, { type: "application/zip" });
}
