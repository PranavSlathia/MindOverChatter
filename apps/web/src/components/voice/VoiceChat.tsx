/**
 * VoiceChat — Daily.co WebRTC voice chat component.
 *
 * Connects to the MindOverChatter voice service (Pipecat bot) via Daily.co.
 * Handles:
 * - Starting/stopping voice sessions
 * - Joining Daily rooms
 * - Audio state (mic, speaker)
 * - Voice session UI (listening indicator, controls)
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

type VoiceState = "idle" | "connecting" | "connected" | "error";

interface VoiceSessionInfo {
  roomUrl: string;
  token: string;
  sessionId: string;
}

export function VoiceChat() {
  const [state, setState] = useState<VoiceState>("idle");
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const callFrameRef = useRef<any>(null);
  const sessionRef = useRef<VoiceSessionInfo | null>(null);

  // Start a voice session
  const startVoice = useCallback(async () => {
    setState("connecting");
    setError(null);

    try {
      // 1. Request voice session from backend
      const resp = await fetch("/api/voice/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!resp.ok) {
        const err = await resp.json().catch(() => ({ message: resp.statusText }));
        throw new Error(err.message || `HTTP ${resp.status}`);
      }

      const data = await resp.json();
      const session: VoiceSessionInfo = {
        roomUrl: data.room_url,
        token: data.token,
        sessionId: data.session_id,
      };
      sessionRef.current = session;

      // 2. Dynamically import Daily.co SDK (avoid SSR issues)
      const DailyIframe = await import("@daily-co/daily-js");
      const daily = DailyIframe.default;

      // 3. Create call frame (audio-only, no video)
      const callFrame = daily.createCallObject({
        audioSource: true,
        videoSource: false,
      });
      callFrameRef.current = callFrame;

      // 4. Set up event handlers
      callFrame.on("joined-meeting", () => {
        setState("connected");
      });

      callFrame.on("left-meeting", () => {
        setState("idle");
        cleanup();
      });

      callFrame.on("error", (ev: any) => {
        console.error("[voice] Daily error:", ev);
        setError(ev?.errorMsg || "Connection error");
        setState("error");
      });

      // Track when bot starts/stops speaking for visual feedback
      callFrame.on("participant-updated", (ev: any) => {
        // Could track bot speaking state here for UI indicators
      });

      // 5. Join the Daily room
      await callFrame.join({ url: session.roomUrl, token: session.token });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to start voice";
      setError(message);
      setState("error");
    }
  }, []);

  // Stop voice session
  const stopVoice = useCallback(async () => {
    cleanup();
    setState("idle");
  }, []);

  // Toggle mute
  const toggleMute = useCallback(() => {
    if (callFrameRef.current) {
      const newMuted = !isMuted;
      callFrameRef.current.setLocalAudio(!newMuted);
      setIsMuted(newMuted);
    }
  }, [isMuted]);

  // Cleanup Daily.co call
  const cleanup = useCallback(() => {
    if (callFrameRef.current) {
      try {
        callFrameRef.current.leave();
        callFrameRef.current.destroy();
      } catch {
        // Ignore cleanup errors
      }
      callFrameRef.current = null;
    }
    sessionRef.current = null;
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return (
    <div className="flex flex-col items-center gap-4 p-6">
      {/* Voice state indicator */}
      <div className="flex flex-col items-center gap-2">
        {state === "idle" && (
          <div className="text-muted-foreground text-sm">
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
          <div className="flex items-center gap-2 text-sm text-emerald-600">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
            Listening...
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
          <Button
            onClick={startVoice}
            size="lg"
            className="rounded-full bg-emerald-600 px-8 hover:bg-emerald-700"
          >
            Start Voice Chat
          </Button>
        ) : (
          <>
            <Button
              onClick={toggleMute}
              variant={isMuted ? "destructive" : "outline"}
              size="sm"
              className="rounded-full"
            >
              {isMuted ? "Unmute" : "Mute"}
            </Button>
            <Button
              onClick={stopVoice}
              variant="destructive"
              size="sm"
              className="rounded-full"
            >
              End Voice
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
