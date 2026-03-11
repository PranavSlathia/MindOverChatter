import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useAudioRecorder } from "@/hooks/use-audio-recorder.js";
import { api } from "@/lib/api.js";
import { useServiceHealthStore } from "@/stores/service-health-store.js";

interface MessageInputProps {
  onSend: (text: string) => void;
  disabled: boolean;
  placeholder?: string;
}

export function MessageInput({
  onSend,
  disabled,
  placeholder = "Type a message...",
}: MessageInputProps) {
  const [value, setValue] = useState("");
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const whisperAvailable = useServiceHealthStore((s) => s.whisper.available);

  const {
    isRecording,
    audioBlob,
    startRecording,
    stopRecording,
    error: recorderError,
  } = useAudioRecorder();

  const adjustHeight = useCallback(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = "auto";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
    }
  }, []);

  const handleSubmit = useCallback(
    (e?: FormEvent) => {
      e?.preventDefault();
      const trimmed = value.trim();
      if (!trimmed || disabled) return;

      onSend(trimmed);
      setValue("");

      // Reset textarea height after clearing
      if (textareaRef.current) {
        textareaRef.current.style.height = "auto";
      }
    },
    [value, disabled, onSend],
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSubmit();
      }
    },
    [handleSubmit],
  );

  const handleMicClick = useCallback(async () => {
    setVoiceError(null);
    if (isRecording) {
      stopRecording();
    } else {
      await startRecording();
    }
  }, [isRecording, startRecording, stopRecording]);

  // When audioBlob is produced, send it for transcription
  // biome-ignore lint/correctness/useExhaustiveDependencies: audioBlob change triggers transcription
  useEffect(() => {
    if (!audioBlob) return;

    let cancelled = false;
    setIsTranscribing(true);
    setVoiceError(null);

    api
      .transcribe(audioBlob)
      .then((result) => {
        if (cancelled) return;
        if (result.text.trim()) {
          setValue((prev) => {
            const separator = prev.trim() ? " " : "";
            return prev + separator + result.text.trim();
          });
          // Adjust height after inserting transcription
          requestAnimationFrame(() => {
            adjustHeight();
          });
        }
      })
      .catch((err) => {
        if (cancelled) return;
        console.error("Transcription failed:", err);
        setVoiceError("Transcription failed. Please try again or type your message.");
      })
      .finally(() => {
        if (!cancelled) setIsTranscribing(false);
      });

    return () => {
      cancelled = true;
    };
  }, [audioBlob]);

  // Show recorder errors as voice errors
  useEffect(() => {
    if (recorderError) {
      setVoiceError(recorderError);
    }
  }, [recorderError]);

  // Clear voice error after 5 seconds
  useEffect(() => {
    if (!voiceError) return;
    const timer = setTimeout(() => setVoiceError(null), 5000);
    return () => clearTimeout(timer);
  }, [voiceError]);

  const micDisabled = disabled || isTranscribing || !whisperAvailable;

  const micTitle = !whisperAvailable
    ? "Voice input unavailable — service is offline"
    : isRecording
      ? "Stop recording"
      : "Start voice recording";

  return (
    <div className="border-t border-foreground/10 bg-background">
      {/* Voice error message */}
      {voiceError && (
        <div className="px-4 pt-2">
          <p className="text-xs text-destructive">{voiceError}</p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex items-end gap-2 px-4 py-3">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            adjustHeight();
          }}
          onKeyDown={handleKeyDown}
          placeholder={isTranscribing ? "Transcribing..." : placeholder}
          disabled={disabled || isTranscribing}
          rows={1}
          className="flex-1 resize-none rounded-xl border border-foreground/15 bg-white px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
          aria-label="Message input"
        />

        {/* Microphone button */}
        <button
          type="button"
          onClick={handleMicClick}
          disabled={micDisabled}
          className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full transition-all disabled:cursor-not-allowed disabled:opacity-40 ${
            isRecording
              ? "animate-pulse bg-destructive text-white"
              : "bg-foreground/10 text-foreground/60 hover:bg-foreground/15 hover:text-foreground/80"
          }`}
          aria-label={micTitle}
          title={micTitle}
        >
          {isTranscribing ? (
            <svg
              className="h-4 w-4 animate-spin"
              xmlns="http://www.w3.org/2000/svg"
              fill="none"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              {/* Microphone icon */}
              <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" x2="12" y1="19" y2="22" />
            </svg>
          )}
        </button>

        {/* Send button */}
        <button
          type="submit"
          disabled={disabled || !value.trim()}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="Send message"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5"
            aria-hidden="true"
          >
            <path d="M22 2 11 13" />
            <path d="M22 2 15 22 11 13 2 9Z" />
          </svg>
        </button>
      </form>
    </div>
  );
}
