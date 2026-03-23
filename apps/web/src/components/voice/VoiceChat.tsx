/**
 * VoiceChat - Pipecat + Daily.co voice chat component.
 *
 * Attaches to the active chat session and manages the live voice transport.
 */

import { PipecatClient } from "@pipecat-ai/client-js";
import { DailyTransport } from "@pipecat-ai/daily-transport";
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import { API_BASE, api, type VoiceStartResponse } from "@/lib/api.js";

type VoiceState = "idle" | "connecting" | "connected" | "error";

export interface VoiceChatHandle {
  stop: (options?: { keepalive?: boolean }) => Promise<void>;
}

interface VoiceChatProps {
  sessionId: string;
  onRequestClose?: () => void | Promise<void>;
}

export const VoiceChat = forwardRef<VoiceChatHandle, VoiceChatProps>(function VoiceChat(
  { sessionId, onRequestClose },
  ref,
) {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [botSpeaking, setBotSpeaking] = useState(false);
  const [userTranscript, setUserTranscript] = useState("");
  const [botTranscript, setBotTranscript] = useState("");
  const clientRef = useRef<PipecatClient | null>(null);
  const voiceSessionIdRef = useRef<string | null>(null);
  const stopPromiseRef = useRef<Promise<void> | null>(null);
  const lifecycleTokenRef = useRef(0);

  const resetLocalVoiceState = useCallback(() => {
    setIsMuted(false);
    setBotSpeaking(false);
    setUserTranscript("");
    setBotTranscript("");
  }, []);

  const stopVoice = useCallback(
    async (options?: { keepalive?: boolean }) => {
      if (stopPromiseRef.current) {
        return stopPromiseRef.current;
      }

      lifecycleTokenRef.current += 1;
      const token = lifecycleTokenRef.current;

      stopPromiseRef.current = (async () => {
        const client = clientRef.current;
        const voiceSessionId = voiceSessionIdRef.current;

        clientRef.current = null;
        voiceSessionIdRef.current = null;

        if (voiceSessionId) {
          try {
            await api.stopVoice(voiceSessionId, { keepalive: options?.keepalive ?? false });
          } catch (err) {
            console.warn("[voice] Stop request failed:", err);
          }
        }

        if (client) {
          try {
            await client.disconnect();
          } catch (err) {
            console.warn("[voice] Disconnect failed:", err);
          }
        }

        if (token === lifecycleTokenRef.current) {
          setState("idle");
          resetLocalVoiceState();
        }
      })().finally(() => {
        if (stopPromiseRef.current) {
          stopPromiseRef.current = null;
        }
      });

      return stopPromiseRef.current;
    },
    [resetLocalVoiceState],
  );

  useImperativeHandle(
    ref,
    () => ({
      stop: (options) => stopVoice({ keepalive: options?.keepalive }),
    }),
    [stopVoice],
  );

  const startVoice = useCallback(async () => {
    if (!sessionId) {
      setError("Missing session");
      setState("error");
      return;
    }

    setState("connecting");
    setError(null);
    resetLocalVoiceState();

    try {
      lifecycleTokenRef.current += 1;
      const token = lifecycleTokenRef.current;

      // Resume AudioContext on user gesture to satisfy Chrome autoplay policy
      const audioCtx = new AudioContext();
      if (audioCtx.state === "suspended") {
        await audioCtx.resume();
        console.log("[voice] AudioContext resumed:", audioCtx.state);
      }
      // Close it — Daily creates its own, but this "unlocks" autoplay for the page
      await audioCtx.close();

      const transport = new DailyTransport();
      const client = new PipecatClient({
        transport,
        enableMic: true,
        enableCam: false,
        callbacks: {
          onConnected: () => {
            console.log("[voice] Connected to Daily room");
            setState("connected");
            // Track-level debugging: check if bot audio track exists
            try {
              const tracks = (client as unknown as { tracks: () => unknown }).tracks?.();
              console.log("[voice] Tracks after connect:", JSON.stringify(tracks, null, 2));
            } catch (e) {
              console.log("[voice] Could not read tracks:", e);
            }
          },
          onTrackStarted: ((track: unknown, participant: unknown) => {
            console.log("[voice] Track started:", { track, participant });
            // If this is a remote audio track, ensure it plays
            const p = participant as { local?: boolean };
            const t = track as MediaStreamTrack;
            if (!p?.local && t?.kind === "audio") {
              console.log("[voice] Remote audio track received — attaching to <audio> element");
              const audio = new Audio();
              audio.srcObject = new MediaStream([t]);
              audio.autoplay = true;
              audio.play().then(() => {
                console.log("[voice] Audio playback started successfully");
              }).catch((err) => {
                console.error("[voice] Audio playback failed:", err);
              });
            }
          }) as unknown as () => void,
          onTrackStopped: ((track: unknown, participant: unknown) => {
            console.log("[voice] Track stopped:", { track, participant });
          }) as unknown as () => void,
          onDisconnected: () => {
            console.log("[voice] Disconnected from Daily room");
            setState("idle");
          },
          onBotStartedSpeaking: () => {
            console.log("[voice] Bot started speaking");
            setBotSpeaking(true);
          },
          onBotStoppedSpeaking: () => {
            console.log("[voice] Bot stopped speaking");
            setBotSpeaking(false);
          },
          onUserTranscript: (data) => {
            const text = (data as { text?: string })?.text;
            console.log("[voice] User transcript:", text);
            if (text) setUserTranscript(text);
          },
          onBotTranscript: (data) => {
            const text = (data as { text?: string })?.text;
            console.log("[voice] Bot transcript:", text);
            if (text) setBotTranscript(text);
          },
          onError: (err) => {
            console.error("[voice] Error:", err);
            setError(String(err));
            setState("error");
          },
        },
      });

      clientRef.current = client;

      // Fetch voice start manually to capture voiceSessionId,
      // then connect the transport with the returned room credentials.
      const startRes = await fetch(`${API_BASE}/api/voice/start`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      if (!startRes.ok) {
        throw new Error(`Voice start failed: ${startRes.status}`);
      }
      const startData = (await startRes.json()) as VoiceStartResponse;
      voiceSessionIdRef.current = startData.voiceSessionId;

      if (token !== lifecycleTokenRef.current) {
        await stopVoice({ keepalive: true });
        return;
      }

      // Connect transport with room URL and token from backend
      await client.connect({
        url: startData.url,
        token: startData.token,
      });

      if (token !== lifecycleTokenRef.current) {
        await stopVoice({ keepalive: true });
        return;
      }
    } catch (err) {
      console.error("[voice] Start failed:", err);
      await stopVoice({ keepalive: true });
      const message = err instanceof Error ? err.message : "Failed to start voice";
      setError(message);
      setState("error");
    }
  }, [resetLocalVoiceState, sessionId, stopVoice]);

  const toggleMute = useCallback(() => {
    if (clientRef.current) {
      const newMuted = !isMuted;
      clientRef.current.enableMic(!newMuted);
      setIsMuted(newMuted);
    }
  }, [isMuted]);

  useEffect(() => {
    return () => {
      void stopVoice({ keepalive: true });
    };
  }, [stopVoice]);

  return (
    <div className="flex flex-col items-center gap-4 p-6">
      {/* Voice state indicator */}
      <div className="flex flex-col items-center gap-2">
        {state === "idle" && (
          <div className="text-sm text-foreground/40">Click to start voice chat</div>
        )}
        {state === "connecting" && (
          <div className="flex items-center gap-2 text-sm text-amber-600">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-amber-500" />
            Connecting...
          </div>
        )}
        {state === "connected" && (
          <div className="flex flex-col items-center gap-1">
            <div className="flex items-center gap-2 text-sm text-emerald-600">
              <span
                className={`inline-block h-2 w-2 rounded-full ${botSpeaking ? "animate-pulse bg-blue-500" : "bg-emerald-500"}`}
              />
              {botSpeaking ? "Speaking..." : "Listening..."}
            </div>
            {userTranscript && (
              <div className="max-w-xs text-center text-xs text-foreground/50">
                You: {userTranscript}
              </div>
            )}
            {botTranscript && (
              <div className="max-w-xs text-center text-xs text-primary/70">
                Bot: {botTranscript}
              </div>
            )}
          </div>
        )}
        {state === "error" && (
          <div className="text-sm text-red-600">{error || "Connection error"}</div>
        )}
      </div>

      {/* Controls */}
      <div className="flex items-center gap-3">
        {state === "idle" || state === "error" ? (
          <button
            type="button"
            onClick={startVoice}
            className="rounded-full bg-primary px-8 py-2.5 text-sm font-medium text-white transition-opacity hover:opacity-90"
          >
            Start Voice Chat
          </button>
        ) : (
          <>
            <button
              type="button"
              onClick={toggleMute}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${isMuted ? "bg-red-500 text-white hover:bg-red-600" : "border border-foreground/20 text-foreground/70 hover:bg-muted"}`}
            >
              {isMuted ? "Unmute" : "Mute"}
            </button>
            <button
              type="button"
              onClick={() => {
                void stopVoice();
              }}
              className="rounded-full bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
            >
              End Voice
            </button>
            {onRequestClose && (
              <button
                type="button"
                onClick={() => {
                  void onRequestClose();
                }}
                className="rounded-full border border-foreground/15 px-4 py-2 text-sm font-medium text-foreground/70 transition-colors hover:bg-muted"
              >
                Switch to text
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
});
