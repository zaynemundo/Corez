export async function* decodeSse(responseBody) {
  if (!responseBody?.getReader) {
    throw new TypeError('Expected a web ReadableStream response body.');
  }

  const reader = responseBody.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let dataLines = [];
  let done = false;

  const consumeLine = (line) => {
    if (line === '') {
      if (dataLines.length === 0) return null;
      const data = dataLines.join('\n');
      dataLines = [];
      return data;
    }

    if (line.startsWith(':')) return null;
    if (!line.startsWith('data:')) return null;

    dataLines.push(line.slice(5).replace(/^ /, ''));
    return null;
  };

  try {
    while (!done) {
      const { value, done: streamDone } = await reader.read();
      buffer += decoder.decode(value, { stream: !streamDone });

      let newlineIndex;
      while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
        const line = buffer.slice(0, newlineIndex).replace(/\r$/, '');
        buffer = buffer.slice(newlineIndex + 1);
        const data = consumeLine(line);
        if (data === null) continue;
        if (data === '[DONE]') {
          done = true;
          break;
        }
        yield data;
      }

      if (streamDone) break;
    }

    if (!done && buffer) {
      const data = consumeLine(buffer.replace(/\r$/, ''));
      if (data && data !== '[DONE]') yield data;
    }
    if (!done && dataLines.length > 0) {
      const data = dataLines.join('\n');
      if (data !== '[DONE]') yield data;
    }
  } finally {
    reader.releaseLock();
  }
}
