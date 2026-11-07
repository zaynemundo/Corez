/**
 * Dictation lifecycle around expo-audio recording.
 *
 * v1 transcribes after the recording stops (Whisper), so the UI shows a
 * "Transcribing…" state instead of the web's live partial transcript.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";
import { MAX_DICTATION_MS, transcribeRecording } from "@/lib/dictation";
import { friendlyError } from "@/lib/errors";

export type DictationStatus = "idle" | "recording" | "transcribing";

interface UseDictationOptions {
  language: string;
  onTranscript: (text: string) => void;
  onError?: (message: string) => void;
}

export function useDictation({
  language,
  onTranscript,
  onError,
}: UseDictationOptions) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder);
  const [transcribing, setTranscribing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoStopRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startingRef = useRef(false);
  const mountedRef = useRef(true);

  const clearAutoStop = useCallback(() => {
    if (autoStopRef.current) {
      clearTimeout(autoStopRef.current);
      autoStopRef.current = null;
    }
  }, []);

  const reportError = useCallback(
    (message: string) => {
      setError(message);
      onError?.(message);
    },
    [onError],
  );

  const stopAndTranscribe = useCallback(async () => {
    clearAutoStop();
    const status = recorder.getStatus();
    if (!status.isRecording) return;
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) throw new Error("No recording was captured.");
      setTranscribing(true);
      const text = await transcribeRecording(uri, language);
      if (mountedRef.current) onTranscript(text);
    } catch (caught) {
      reportError(friendlyError(caught, "Dictation failed. Try again."));
    } finally {
      if (mountedRef.current) setTranscribing(false);
      // Restore normal playback behaviour after recording.
      void setAudioModeAsync({ allowsRecording: false }).catch(() => {});
    }
  }, [clearAutoStop, language, onTranscript, recorder, reportError]);

  const start = useCallback(async () => {
    if (startingRef.current || recorder.getStatus().isRecording) return;
    startingRef.current = true;
    setError(null);
    try {
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      if (!permission.granted) {
        throw new Error("Microphone permission is required for dictation.");
      }
      await setAudioModeAsync({
        playsInSilentMode: true,
        allowsRecording: true,
      });
      await recorder.prepareToRecordAsync();
      recorder.record();
      autoStopRef.current = setTimeout(() => {
        void stopAndTranscribe();
      }, MAX_DICTATION_MS);
    } catch (caught) {
      reportError(friendlyError(caught, "Could not start recording."));
    } finally {
      startingRef.current = false;
    }
  }, [recorder, reportError, stopAndTranscribe]);

  const toggle = useCallback(() => {
    if (transcribing) return;
    if (recorder.getStatus().isRecording) {
      void stopAndTranscribe();
    } else {
      void start();
    }
  }, [recorder, start, stopAndTranscribe, transcribing]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearAutoStop();
      try {
        if (recorder.getStatus().isRecording) void recorder.stop();
      } catch {
        // The recorder may already be released on unmount.
      }
    };
  }, [clearAutoStop, recorder]);

  const status: DictationStatus = recorderState.isRecording
    ? "recording"
    : transcribing
      ? "transcribing"
      : "idle";

  return {
    status,
    error,
    elapsedMs: recorderState.durationMillis || 0,
    toggle,
  };
}
