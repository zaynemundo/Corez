// Voice dictation for the chat composer, using the browser's MediaRecorder and
// Cloudflare Workers AI Whisper on the server.
//
// The microphone records a short clip and POSTs it to /api/transcribe. Unlike
// the old Web Speech path, audio does reach CoreZ/Cloudflare for inference; the
// clip is held in memory for the request and is not persisted.
//
// Failures are silent-but-honest: a browser without MediaRecorder or
// getUserMedia renders no microphone, and a refused permission ends the
// session instead of leaving a button that pretends to listen.

const MAX_RECORDING_MS = 120_000;
const MAX_AUDIO_BYTES = 8 * 1024 * 1024;

function recorderCtor() {
  if (typeof window === "undefined") return null;
  return window.MediaRecorder || null;
}

function mediaDevices() {
  if (typeof navigator === "undefined") return null;
  return navigator.mediaDevices || null;
}

export function isDictationSupported() {
  return Boolean(recorderCtor() && mediaDevices()?.getUserMedia);
}

/** Whisper language code for the interface language. */
export function dictationLanguage(language) {
  return language === "ar" ? "ar" : "en";
}

function preferredMimeType(Recorder) {
  const candidates = [
    "audio/webm;codecs=opus",
    "audio/webm",
    "audio/mp4",
    "audio/ogg;codecs=opus",
  ];
  try {
    return (
      candidates.find(
        (type) => !Recorder.isTypeSupported || Recorder.isTypeSupported(type),
      ) || ""
    );
  } catch {
    return "";
  }
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      resolve(result.slice(result.indexOf(",") + 1));
    };
    reader.onerror = () =>
      reject(reader.error || new Error("Could not read the recording."));
    reader.readAsDataURL(blob);
  });
}

/**
 * Start one recording session.
 *
 * @param {Object} options
 * @param {string} [options.language] Interface language id ("en"/"ar").
 * @param {(text: string) => void} [options.onTranscript] Final Whisper text.
 * @param {() => void} [options.onRecordingStop] Recording ended; transcription started.
 * @param {() => void} [options.onEnd] The session is completely finished.
 * @param {(error: string) => void} [options.onError] Recording/transcription failed.
 * @returns {Object|null} The live session, or null when unsupported.
 */
export function createDictationSession({
  language = "en",
  onTranscript,
  onRecordingStop,
  onEnd,
  onError,
} = {}) {
  const Recorder = recorderCtor();
  const devices = mediaDevices();
  if (!Recorder || !devices?.getUserMedia) return null;

  let stream = null;
  let recorder = null;
  let chunks = [];
  let timer = null;
  let started = false;
  let finished = false;
  let aborted = false;
  let fetchController = null;
  let requestTimer = null;

  const cleanupStream = () => {
    if (!stream) return;
    try {
      stream.getTracks?.().forEach((track) => {
        try {
          track.stop();
        } catch {
          /* already stopped */
        }
      });
    } catch {
      /* ignore */
    }
    stream = null;
  };

  const finish = () => {
    if (finished) return;
    finished = true;
    clearTimeout(timer);
    clearTimeout(requestTimer);
    timer = null;
    requestTimer = null;
    cleanupStream();
    onEnd?.();
  };

  const fail = (message) => {
    if (finished) return;
    aborted = true;
    onError?.(String(message || "dictation-failed"));
    finish();
  };

  const transcribe = async (blob) => {
    if (aborted) return;
    if (!blob || blob.size === 0) {
      fail("no-audio");
      return;
    }
    if (blob.size > MAX_AUDIO_BYTES) {
      fail("audio-too-large");
      return;
    }
    try {
      const audio = await blobToBase64(blob);
      if (aborted) return;
      fetchController = new AbortController();
      requestTimer = setTimeout(() => {
        try {
          fetchController?.abort();
        } catch {
          /* ignore */
        }
      }, 60_000);
      const response = await fetch("/api/transcribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audio,
          language: dictationLanguage(language),
        }),
        signal: fetchController.signal,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(
          typeof data?.error === "string"
            ? data.error
            : `Transcription failed (${response.status}).`,
        );
      }
      const text = String(data?.text || "").trim();
      if (text && !aborted) onTranscript?.(text);
    } catch (err) {
      if (!aborted) {
        fail(
          err?.name === "AbortError"
            ? "transcription-timeout"
            : err?.message || "transcription-failed",
        );
      }
    } finally {
      clearTimeout(requestTimer);
      requestTimer = null;
      fetchController = null;
      if (!aborted) finish();
    }
  };

  const stop = () => {
    if (finished || aborted) return;
    clearTimeout(timer);
    timer = null;

    if (!started) {
      // Permission prompt still open: there is no recorder to stop.
      aborted = true;
      finish();
      return;
    }

    onRecordingStop?.();
    try {
      if (recorder && recorder.state !== "inactive") {
        recorder.stop();
      } else if (!aborted) {
        transcribe(
          new Blob(chunks, {
            type: recorder?.mimeType || "audio/webm",
          }),
        );
      }
    } catch {
      fail("recorder-error");
    }
  };

  const abort = () => {
    if (aborted) return;
    aborted = true;
    clearTimeout(timer);
    clearTimeout(requestTimer);
    timer = null;
    requestTimer = null;
    try {
      fetchController?.abort();
    } catch {
      /* ignore */
    }
    fetchController = null;
    try {
      if (recorder && recorder.state !== "inactive") recorder.stop();
    } catch {
      /* ignore */
    }
    cleanupStream();
  };

  const start = async () => {
    try {
      stream = await devices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      if (aborted) {
        cleanupStream();
        return;
      }

      const mimeType = preferredMimeType(Recorder);
      recorder = new Recorder(stream, mimeType ? { mimeType } : undefined);
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
      };
      recorder.onerror = () => fail("recorder-error");
      recorder.onstop = () => {
        const type = recorder.mimeType || mimeType || "audio/webm";
        cleanupStream();
        if (!aborted) transcribe(new Blob(chunks, { type }));
      };

      started = true;
      recorder.start(250);
      timer = setTimeout(() => {
        if (finished || aborted || recorder?.state !== "recording") return;
        onRecordingStop?.();
        try {
          recorder.stop();
        } catch {
          fail("recorder-error");
        }
      }, MAX_RECORDING_MS);
    } catch (err) {
      fail(err?.name || "not-allowed");
    }
  };

  start();
  return { stop, abort };
}
