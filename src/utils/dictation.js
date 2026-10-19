// Voice dictation for the chat composer, on the browser's own speech
// recognition (Web Speech API).
//
// The interface ships a microphone button only where the API exists, and every
// failure path is silent-but-honest: a browser without support renders no
// button at all, and a refused permission stops dictation instead of leaving a
// button that pretends to listen. Nothing here is a hosted service — the
// browser does the recognition locally, so no audio reaches Corez.

/** The browser's speech recognition constructor, or null when unsupported. */
function speechRecognitionCtor() {
  if (typeof window === "undefined") return null;
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

export function isDictationSupported() {
  return Boolean(speechRecognitionCtor());
}

/** Recognition language for an interface language ("en" -> "en-US"). */
export function dictationLanguage(language) {
  return language === "ar" ? "ar-SA" : "en-US";
}

/**
 * Start one dictation session.
 *
 * @param {Object} options
 * @param {string} [options.language] Interface language id.
 * @param {(result: {finalText: string, interimText: string}) => void} [options.onTranscript]
 *   Called on every recognition event with the whole session's final text plus
 *   the sentence still being spoken. The caller decides how that maps onto the
 *   composer — this module never writes to the input itself.
 * @param {() => void} [options.onEnd] The session stopped (user, silence or error).
 * @param {(error: string) => void} [options.onError] Recognition reported a
 *   failure ("not-allowed", "no-speech", "network", ...).
 * @returns {Object|null} The live session, or null when unsupported/refused.
 */
export function createDictationSession({
  language = "en",
  onTranscript,
  onEnd,
  onError,
} = {}) {
  const Ctor = speechRecognitionCtor();
  if (!Ctor) return null;

  const recognition = new Ctor();
  recognition.lang = dictationLanguage(language);
  // Continuous + interim results is what makes this read as dictation: the
  // words appear as they are spoken and the session survives a pause.
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.maxAlternatives = 1;

  let finalText = "";
  let stopped = false;

  recognition.onresult = (event) => {
    let interimText = "";
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const result = event.results[i];
      const text = result?.[0]?.transcript || "";
      if (result?.isFinal) finalText += text;
      else interimText += text;
    }
    onTranscript?.({ finalText, interimText });
  };
  recognition.onerror = (event) => {
    stopped = true;
    onError?.(String(event?.error || "dictation-failed"));
  };
  recognition.onend = () => {
    stopped = true;
    onEnd?.();
  };

  try {
    recognition.start();
  } catch {
    // start() throws when a session is already running; that is not a failure
    // the user needs to see, it just means there is nothing new to start.
    return null;
  }

  return {
    stop() {
      if (stopped) return;
      stopped = true;
      try {
        recognition.stop();
      } catch {
        /* already stopped */
      }
    },
    abort() {
      stopped = true;
      try {
        recognition.abort();
      } catch {
        /* already stopped */
      }
    },
  };
}
