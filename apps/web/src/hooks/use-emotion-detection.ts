import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api.js";
import type { EmotionScores } from "@/stores/emotion-store.js";
import { useEmotionStore } from "@/stores/emotion-store.js";
import { useSessionStore } from "@/stores/session-store.js";

// Detection runs every 5 seconds (wellness context, not real-time)
const DETECTION_INTERVAL_MS = 5000;
const FACE_SIGNAL_WEIGHT = 0.3;

// Human.js is dynamically imported to avoid loading ~5MB in the main bundle
type HumanModule = typeof import("@vladmandic/human");

interface UseEmotionDetectionReturn {
  isActive: boolean;
  isSupported: boolean;
  isLoading: boolean;
  startError: string | null;
  dominantEmotion: string | null;
  rawScores: EmotionScores | null;
  startDetection: () => Promise<void>;
  stopDetection: () => void;
}

/** Check if the browser supports getUserMedia (camera access). */
function checkSupported(): boolean {
  return !!navigator.mediaDevices?.getUserMedia;
}

export function useEmotionDetection(): UseEmotionDetectionReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const isSupported = checkSupported();

  const { isDetectionActive, dominantEmotion, rawScores, setActive, setEmotion, reset } =
    useEmotionStore();

  const humanRef = useRef<InstanceType<Awaited<HumanModule>["Human"]> | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  /** Run a single detection cycle: detect face -> extract emotions -> POST scores. */
  const detectOnce = useCallback(async () => {
    const human = humanRef.current;
    const video = videoRef.current;
    if (!human || !video || video.readyState < 2) return;

    try {
      const result = await human.detect(video);
      const face = result.face?.[0];
      if (!face?.emotion || face.emotion.length === 0) return;

      // Find dominant emotion
      let maxScore = -1;
      let dominantLabel = "neutral";
      const scores: EmotionScores = {
        happy: 0,
        sad: 0,
        angry: 0,
        fearful: 0,
        disgusted: 0,
        surprised: 0,
        neutral: 0,
      };

      for (const e of face.emotion) {
        const key = e.emotion.toLowerCase();
        if (key in scores) {
          scores[key as keyof EmotionScores] = e.score;
        }
        if (e.score > maxScore) {
          maxScore = e.score;
          dominantLabel = e.emotion.toLowerCase();
        }
      }

      setEmotion(dominantLabel, scores);

      // Fire-and-forget POST — only if session is active
      const sessionId = useSessionStore.getState().sessionId;
      const status = useSessionStore.getState().status;
      if (sessionId && status === "active") {
        // PRIVACY: ONLY JSON scores are sent. ZERO image data.
        api
          .submitEmotion({
            sessionId,
            channel: "face",
            emotionLabel: dominantLabel,
            confidence: maxScore,
            signalWeight: FACE_SIGNAL_WEIGHT,
            rawScores: { ...scores },
          })
          .catch(() => {
            // Fire-and-forget: silently ignore POST failures
          });
      }
    } catch {
      // Detection errors are non-critical; skip this cycle
    }
  }, [setEmotion]);

  const startDetection = useCallback(async () => {
    if (isDetectionActive || !isSupported) return;
    setStartError(null);
    setIsLoading(true);

    try {
      // 1. Request webcam (user-initiated, never auto-requested)
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 320 }, height: { ideal: 240 } },
      });
      streamRef.current = stream;

      // 2. Create hidden video element to feed Human.js
      const video = document.createElement("video");
      video.srcObject = stream;
      video.playsInline = true;
      video.muted = true;
      await video.play();
      videoRef.current = video;

      // 3. Dynamic import Human.js (lazy chunk)
      const { Human } = await import("@vladmandic/human");
      const human = new Human({
        modelBasePath: "https://cdn.jsdelivr.net/npm/@vladmandic/human/models/",
        backend: "webgl",
        // Only enable face + emotion — disable everything else
        face: {
          enabled: true,
          detector: { enabled: true, rotation: false },
          mesh: { enabled: false },
          iris: { enabled: false },
          emotion: { enabled: true },
          description: { enabled: false },
        },
        body: { enabled: false },
        hand: { enabled: false },
        object: { enabled: false },
        gesture: { enabled: false },
        segmentation: { enabled: false },
      });

      // Pre-load the model
      await human.load();
      humanRef.current = human;

      setActive(true);

      // 4. Start detection interval
      intervalRef.current = setInterval(() => {
        detectOnce();
      }, DETECTION_INTERVAL_MS);

      // Run first detection immediately
      detectOnce();
    } catch (err) {
      let msg = "Could not start camera";
      if (err instanceof Error) {
        if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
          msg = "No camera found on this device";
        } else if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
          msg = "Camera access denied — check browser settings";
        } else if (err.name === "NotReadableError") {
          msg = "Camera is in use by another app";
        }
      }
      setStartError(msg);
      // Clean up partial state
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
        streamRef.current = null;
      }
    } finally {
      setIsLoading(false);
    }
  }, [isDetectionActive, isSupported, setActive, detectOnce]);

  // Auto-clear start error after 5 seconds
  useEffect(() => {
    if (!startError) return;
    const timer = setTimeout(() => setStartError(null), 5000);
    return () => clearTimeout(timer);
  }, [startError]);

  const stopDetection = useCallback(() => {
    // Clear interval
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Stop webcam tracks
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }

    // Remove hidden video element
    if (videoRef.current) {
      videoRef.current.pause();
      videoRef.current.srcObject = null;
      videoRef.current = null;
    }

    humanRef.current = null;
    reset();
  }, [reset]);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      if (streamRef.current) {
        for (const track of streamRef.current.getTracks()) {
          track.stop();
        }
      }
      if (videoRef.current) {
        videoRef.current.pause();
        videoRef.current.srcObject = null;
      }
    };
  }, []);

  return {
    isActive: isDetectionActive,
    isSupported,
    isLoading,
    startError,
    dominantEmotion,
    rawScores,
    startDetection,
    stopDetection,
  };
}
