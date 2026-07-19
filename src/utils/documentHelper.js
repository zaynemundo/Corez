/**
 * Document Helper Utility for Corez
 * Parses user input documents (text, pdf, markdown, code, json, csv, etc.)
 */

export function formatFileSize(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function readDocumentFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = (e) => {
      let content = e.target.result || '';
      // Clean up non-printable characters for text reading if needed
      if (typeof content === 'string') {
        // Limit max text length per file to prevent memory crash (e.g. 500k chars)
        if (content.length > 500000) {
          content = content.slice(0, 500000) + '\n...[Content truncated for length]';
        }
      } else {
        content = '[Binary or unreadable document content]';
      }

      resolve({
        id: 'doc-' + Date.now() + '-' + Math.random().toString(36).substring(2, 7),
        name: file.name,
        size: formatFileSize(file.size),
        rawSize: file.size,
        type: file.type || 'application/octet-stream',
        text: content
      });
    };

    reader.onerror = (err) => {
      reject(err);
    };

    // If file is text, json, csv, code, xml, html, md, or pdf text fallback
    reader.readAsText(file);
  });
}
