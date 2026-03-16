/**
 * VoiceChat — Pipecat + Daily.co voice chat component.
 *
 * Uses @pipecat-ai/client-js + @pipecat-ai/daily-transport to connect
 * to the MindOverChatter voice service (Pipecat bot) via Daily.co WebRTC.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { PipecatClient, RTVIEvent } from "@pipecat-ai/client-js";
import { DailyTransport } from "@pipecat-ai/daily-transport";
import { API_BASE } from "@/lib/api.js";

type VoiceState = "idle" | "connecting" | "connected" | "error";

export function VoiceChat() {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [botSpeaking, setBotSpeaking] = useState(false);
  const [userTranscript, setUserTranscript] = useState("");
  const [botTranscript, setBotTranscript] = useState("");
  const clientRef = useRef<PipecatClient | null>(null);

  const startVoice = useCallback(async () => {
    setState("connecting");
    setError(null);
    setUserTranscript("");
    setBotTranscript("");

    try {
      const transport = new DailyTransport();
      const client = new PipecatClient({
        transport,
        enableMic: true,
        enableCam: false,
        callbacks: {
          onConnected: () => {
            console.log("[voice] Connected");
            setState("connected");
          },
          onDisconnected: () => {
            console.log("[voice] Disconnected");
            setState("idle");
          },
          onBotStartedSpeaking: () => setBotSpeaking(true),
          onBotStoppedSpeaking: () => setBotSpeaking(false),
          onUserTranscript: (data) => {
            const text = (data as { text?: string })?.text;
            if (text) setUserTranscript(text);
          },
          onBotTranscript: (data) => {
            const text = (data as { text?: string })?.text;
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

      // Call the voice service directly (bypasses Hono proxy for lower latency)
      const VOICE_URL = "http://localhost:8005";
      await client.startBotAndConnect({
        endpoint: `${VOICE_URL}/start`,
        requestData: {
          system_prompt: "You are a warm wellness companion called MindOverChatter. Keep responses concise (2-3 sentences) for voice. Never claim to be a therapist.",
          moc_session_id: null,
        },
      });
    } catch (err) {
      console.error("[voice] Start failed:", err);
      const message = err instanceof Error ? err.message : "Failed to start voice";
      setError(message);
      setState("error");
    }
  }, []);

  const stopVoice = useCallback(async () => {
    if (clientRef.current) {
      try {
        await clientRef.current.disconnect();
      } catch {
        // Ignore
      }
    }
    clientRef.current = null;
    setState("idle");
  }, []);

  const toggleMute = useCallback(() => {
    if (clientRef.current) {
      const newMuted = !isMuted;
      clientRef.current.enableMic(!newMuted);
      setIsMuted(newMuted);
    }
  }, [isMuted]);

  useEffect(() => {
    return () => {
      if (clientRef.current) {
        try { clientRef.current.disconnect(); } catch { /* */ }
        clientRef.current = null;
      }
    };
  }, []);

  return (
    <div className="flex flex-col items-center gap-4 p-6">
      {/* Voice state indicator */}
      <div className="flex flex-col items-center gap-2">
        {state === "idle" && (
          <div className="text-sm text-foreground/40">
            Click to start voice chat
          </div>
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
              <span className={`inline-block h-2 w-2 rounded-full ${botSpeaking ? "animate-pulse bg-blue-500" : "bg-emerald-500"}`} />
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
          <div className="text-sm text-red-600">
            {error || "Connection error"}
          </div>
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
              onClick={stopVoice}
              className="rounded-full bg-red-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-600"
            >
              End Voice
            </button>
          </>
        )}
      </div>
    </div>
  );
}
