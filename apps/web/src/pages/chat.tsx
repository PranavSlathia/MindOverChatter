import { HELPLINES } from "@moc/shared";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { AssessmentWidget } from "@/components/chat/assessment-widget.js";
import { CBTThoughtRecordWidget } from "@/components/chat/cbt-thought-record-widget.js";
import { ChatHeader } from "@/components/chat/chat-header.js";
import {
  CrisisBanner,
  MessageBubble,
  StreamingBubble,
  ThinkingBubble,
} from "@/components/chat/message-bubble.js";
import { MessageInput } from "@/components/chat/message-input.js";
import { VoiceChat, type VoiceChatHandle } from "@/components/voice/VoiceChat.js";
import { useServiceHealth } from "@/hooks/use-service-health.js";
import { API_BASE, api } from "@/lib/api.js";
import { useEmotionStore } from "@/stores/emotion-store.js";
import { useServiceHealthStore } from "@/stores/service-health-store.js";
import { useSessionStore } from "@/stores/session-store.js";

export function ChatPage() {
  const { sessionId: urlSessionId } = useParams<{ sessionId?: string }>();
  const navigate = useNavigate();

  const {
    sessionId,
    status,
    messages,
    isThinking,
    isStreaming,
    isEnding,
    streamingContent,
    isCrisis,
    crisisResponse,
    activeAssessment,
    setSessionId,
    setStatus,
    addMessage,
    setMessages,
    setConnected,
    setThinking,
    setStreaming,
    setEnding,
    appendStreamingContent,
    clearStreamingContent,
    setCrisis,
    startAssessment,
    completeAssessment,
    dismissAssessment,
    reset,
  } = useSessionStore();

  const setEmotionFromSSE = useEmotionStore((s) => s.setEmotion);
  const voiceAvailable = useServiceHealthStore((s) => s.voice.available);
  const [voiceMode, setVoiceMode] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<
    "connected" | "reconnecting" | "disconnected"
  >("connected");
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const voiceChatRef = useRef<VoiceChatHandle | null>(null);
  const voiceFlushResolverRef = useRef<(() => void) | null>(null);
  const voiceFlushTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const MAX_RECONNECT_ATTEMPTS = 5;
  const VOICE_FLUSH_TIMEOUT_MS = 5000;

  // Poll service health (whisper, TTS) every 60s so buttons reflect availability
  useServiceHealth();

  const eventSourceRef = useRef<EventSource | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamingMessageIdRef = useRef<string | null>(null);

  // Scroll to bottom on new messages or streaming content
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps are intentional scroll triggers
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent, isCrisis, activeAssessment, isThinking, isEnding]);

  const loadSessionMessages = useCallback(
    async (sid: string) => {
      const messagesResult = await api.getSessionMessages(sid);
      setMessages(
        messagesResult.messages.map((m) => ({
          id: m.id,
          role: m.role as "user" | "assistant",
          content: m.content,
          createdAt: m.createdAt,
        })),
      );
    },
    [setMessages],
  );

  const resolveVoiceFlush = useCallback(() => {
    if (voiceFlushTimeoutRef.current) {
      clearTimeout(voiceFlushTimeoutRef.current);
      voiceFlushTimeoutRef.current = null;
    }
    const resolve = voiceFlushResolverRef.current;
    voiceFlushResolverRef.current = null;
    resolve?.();
  }, []);

  const waitForVoiceFlush = useCallback(() => {
    if (!voiceMode) return Promise.resolve();

    return new Promise<void>((resolve) => {
      resolveVoiceFlush();
      voiceFlushResolverRef.current = resolve;
      voiceFlushTimeoutRef.current = setTimeout(() => {
        voiceFlushTimeoutRef.current = null;
        const pendingResolve = voiceFlushResolverRef.current;
        voiceFlushResolverRef.current = null;
        pendingResolve?.();
      }, VOICE_FLUSH_TIMEOUT_MS);
    });
  }, [resolveVoiceFlush, voiceMode]);

  // Connect SSE for a given session
  const connectSSE = useCallback(
    (sid: string) => {
      // Close any existing connection
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
      }

      const es = api.subscribeToEvents(sid);
      eventSourceRef.current = es;

      es.addEventListener("open", () => {
        setConnected(true);
        reconnectAttemptsRef.current = 0;
        setConnectionStatus("connected");
      });

      es.addEventListener("ai.thinking", () => {
        setThinking(true);
      });

      es.addEventListener("ai.chunk", (event) => {
        try {
          const data = JSON.parse(event.data) as { content: string };
          setThinking(false);
          if (!streamingMessageIdRef.current) {
            streamingMessageIdRef.current = crypto.randomUUID();
            setStreaming(true);
          }
          appendStreamingContent(data.content);
        } catch {
          // Ignore parse errors
        }
      });

      es.addEventListener("ai.response_complete", (event) => {
        const accumulated = useSessionStore.getState().streamingContent;
        let messageId = streamingMessageIdRef.current ?? crypto.randomUUID();
        let content = accumulated;

        try {
          const data = JSON.parse(event.data) as {
            messageId?: string;
            content?: string;
          };
          if (data.messageId) messageId = data.messageId;
          if (data.content) content = data.content;
        } catch {
          // Use accumulated streaming content
        }

        if (content) {
          addMessage({
            id: messageId,
            role: "assistant",
            content,
            createdAt: new Date().toISOString(),
          });
        }
        // Clean up streaming state
        streamingMessageIdRef.current = null;
        setThinking(false);
        setStreaming(false);
        clearStreamingContent();
      });

      es.addEventListener("ai.error", (event) => {
        try {
          const data = JSON.parse(event.data) as { error: string };
          addMessage({
            id: crypto.randomUUID(),
            role: "assistant",
            content: `Something went wrong: ${data.error}. Please try again.`,
            createdAt: new Date().toISOString(),
          });
        } catch {
          addMessage({
            id: crypto.randomUUID(),
            role: "assistant",
            content: "Something went wrong. Please try again.",
            createdAt: new Date().toISOString(),
          });
        }
        streamingMessageIdRef.current = null;
        setThinking(false);
        setStreaming(false);
        clearStreamingContent();
      });

      es.addEventListener("session.crisis", (event) => {
        try {
          const data = JSON.parse(event.data) as {
            message?: string;
            helplines?: Array<{
              name: string;
              number: string;
              country: string;
            }>;
          };
          setCrisis({
            message:
              data.message ??
              "It sounds like you may be going through a really difficult time. Please reach out to one of these helplines -- trained counselors are available 24/7.",
            helplines: data.helplines ?? [...HELPLINES],
          });
        } catch {
          setCrisis({
            message:
              "It sounds like you may be going through a really difficult time. Please reach out to one of these helplines -- trained counselors are available 24/7.",
            helplines: [...HELPLINES],
          });
        }
        streamingMessageIdRef.current = null;
        setThinking(false);
        setStreaming(false);
        clearStreamingContent();
      });

      es.addEventListener("session.ending", () => {
        // Server is running the critical summary hook — show "Wrapping up" UI
        setEnding(true);
      });

      es.addEventListener("session.ended", () => {
        // Summary complete — transition to fully ended state
        setThinking(false);
        setEnding(false);
        setStatus("completed");
      });

      es.addEventListener("voice.transcript_persisted", () => {
        void loadSessionMessages(sid)
          .catch((err) => {
            console.error("Failed to refresh transcript after voice persistence:", err);
          })
          .finally(() => {
            resolveVoiceFlush();
          });
      });

      es.addEventListener("assessment.start", (event) => {
        try {
          const data = JSON.parse(event.data) as { assessmentType: string };
          if (data.assessmentType) {
            startAssessment({ assessmentType: data.assessmentType });
          }
        } catch {
          // Ignore parse errors
        }
      });

      es.addEventListener("assessment.complete", (event) => {
        try {
          const data = JSON.parse(event.data) as {
            assessmentId: string;
            severity: string;
            nextScreener: string | null;
          };
          completeAssessment({
            assessmentId: data.assessmentId,
            severity: data.severity,
            nextScreener: data.nextScreener,
          });
          // Auto-trigger next screener in the assessment chain
          if (data.nextScreener) {
            startAssessment({
              assessmentType: data.nextScreener,
              parentAssessmentId: data.assessmentId,
            });
          } else {
            // No next screener — dismiss the widget after a brief delay
            // so the user sees the completion state
            setTimeout(() => dismissAssessment(), 3000);
          }
        } catch {
          // Ignore parse errors
        }
      });

      es.addEventListener("emotion.ai_detected", (event) => {
        try {
          const data = JSON.parse(event.data) as {
            emotionLabel: string;
            confidence: number;
            channel: string;
          };
          if (data.emotionLabel) {
            setEmotionFromSSE(data.emotionLabel, {
              happy: 0,
              sad: 0,
              angry: 0,
              fearful: 0,
              disgusted: 0,
              surprised: 0,
              neutral: 0,
              [data.emotionLabel]: data.confidence ?? 1,
            });
          }
        } catch {
          // Ignore parse errors
        }
      });

      es.onerror = () => {
        setConnected(false);
        es.close();
        eventSourceRef.current = null;

        // Don't reconnect if session is ended
        const currentStatus = useSessionStore.getState().status;
        if (currentStatus !== "active") return;

        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS) {
          const delay = Math.min(1000 * 2 ** reconnectAttemptsRef.current, 30000);
          reconnectAttemptsRef.current += 1;
          setConnectionStatus("reconnecting");
          reconnectTimeoutRef.current = setTimeout(() => {
            connectSSE(sid);
          }, delay);
        } else {
          setConnectionStatus("disconnected");
        }
      };

      return es;
    },
    [
      setConnected,
      setThinking,
      setStreaming,
      setEnding,
      appendStreamingContent,
      clearStreamingContent,
      addMessage,
      setCrisis,
      setStatus,
      startAssessment,
      completeAssessment,
      dismissAssessment,
      setEmotionFromSSE,
      loadSessionMessages,
      resolveVoiceFlush,
    ],
  );

  useEffect(() => {
    let cancelled = false;

    // Reset store when navigating to a new/different session
    reset();

    async function initSession() {
      if (urlSessionId) {
        // Resume an existing session
        try {
          const result = await api.resumeSession(urlSessionId);
          if (cancelled) return;
          setSessionId(result.sessionId);
          setStatus("active");
          await loadSessionMessages(urlSessionId);
          if (cancelled) return;
          connectSSE(result.sessionId);
        } catch (err) {
          if (cancelled) return;
          console.error("Failed to resume session:", err);
          addMessage({
            id: crypto.randomUUID(),
            role: "assistant",
            content:
              "Unable to resume this session. It may have been deleted or the server is unavailable.",
            createdAt: new Date().toISOString(),
          });
        }
      } else {
        // Check for an existing active session before creating a new one
        try {
          const recent = await api.getSessions(5, 0);
          const active = recent.sessions.find((s) => s.status === "active");
          if (active) {
            if (!cancelled) navigate(`/chat/${active.id}`, { replace: true });
            return;
          }
        } catch {
          // Silently continue — if the check fails, just create a new session
        }

        // No active session found — create a new one
        try {
          const result = await api.createSession();
          if (cancelled) return;
          navigate(`/chat/${result.sessionId}`, { replace: true });
        } catch (err) {
          if (cancelled) return;
          console.error("Failed to create session:", err);
          addMessage({
            id: crypto.randomUUID(),
            role: "assistant",
            content:
              "Unable to start a session. Please make sure the server is running and try refreshing the page.",
            createdAt: new Date().toISOString(),
          });
        }
      }
    }

    initSession();

    return () => {
      cancelled = true;
      eventSourceRef.current?.close();
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      resolveVoiceFlush();
    };
  }, [
    urlSessionId,
    navigate,
    addMessage,
    setSessionId,
    setStatus,
    loadSessionMessages,
    connectSSE,
    reset,
    resolveVoiceFlush,
  ]);

  const stopVoiceAndClose = useCallback(
    async (options?: { closeMode?: boolean; keepalive?: boolean; waitForFlush?: boolean }) => {
      if (!voiceMode) {
        if (options?.closeMode) setVoiceMode(false);
        return;
      }

      const flushPromise =
        options?.waitForFlush === false ? Promise.resolve() : waitForVoiceFlush();

      await voiceChatRef.current?.stop({ keepalive: options?.keepalive });
      await flushPromise;

      if (options?.closeMode ?? true) {
        setVoiceMode(false);
      }
    },
    [voiceMode, waitForVoiceFlush],
  );

  // Beforeunload: best-effort session end via beacon
  useEffect(() => {
    const handleBeforeUnload = () => {
      const sid = useSessionStore.getState().sessionId;
      const st = useSessionStore.getState().status;
      if (sid && st === "active") {
        if (voiceMode) {
          void voiceChatRef.current?.stop({ keepalive: true });
          return;
        }
        const url = `${API_BASE}/api/sessions/${sid}/end`;
        navigator.sendBeacon(
          url,
          new Blob([JSON.stringify({ reason: "beforeunload" })], {
            type: "application/json",
          }),
        );
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [voiceMode]);

  useEffect(() => {
    if (!voiceMode) return;
    if (status !== "active" || !voiceAvailable) {
      void stopVoiceAndClose({ closeMode: true });
    }
  }, [voiceMode, status, voiceAvailable, stopVoiceAndClose]);

  const handleSendMessage = useCallback(
    async (text: string) => {
      if (!sessionId || status !== "active") return;

      // Optimistically add user message
      const userMsgId = crypto.randomUUID();
      addMessage({
        id: userMsgId,
        role: "user",
        content: text,
        createdAt: new Date().toISOString(),
      });

      try {
        await api.sendMessage(sessionId, text);
      } catch (err) {
        console.error("Failed to send message:", err);
        addMessage({
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Failed to send your message. Please try again.",
          createdAt: new Date().toISOString(),
        });
      }
    },
    [sessionId, status, addMessage],
  );

  const handleEndSession = useCallback(async () => {
    if (!sessionId) return;

    try {
      await stopVoiceAndClose({ closeMode: true });
      await api.endSession(sessionId, "user_ended");
      setStatus("completed");
    } catch (err) {
      console.error("Failed to end session:", err);
    } finally {
      // Rescue: if the SSE connection dropped before session.ended arrived,
      // clear isEnding here so the UI never stays stuck on "Wrapping up…".
      setEnding(false);
      eventSourceRef.current?.close();
    }
  }, [sessionId, setStatus, setEnding, stopVoiceAndClose]);

  const handleNewSession = useCallback(async () => {
    eventSourceRef.current?.close();
    await stopVoiceAndClose({ closeMode: true });
    reset();
    // Re-create session
    api
      .createSession()
      .then((result) => {
        navigate(`/chat/${result.sessionId}`, { replace: true });
      })
      .catch((err) => {
        console.error("Failed to create new session:", err);
        addMessage({
          id: crypto.randomUUID(),
          role: "assistant",
          content: "Unable to start a new session. Please try refreshing the page.",
          createdAt: new Date().toISOString(),
        });
      });
  }, [reset, navigate, addMessage, stopVoiceAndClose]);

  const handleRetryConnection = useCallback(() => {
    if (!sessionId) return;
    reconnectAttemptsRef.current = 0;
    setConnectionStatus("reconnecting");
    connectSSE(sessionId);
  }, [sessionId, connectSSE]);

  const inputDisabled = isStreaming || isEnding || status === "completed";

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background">
      <ChatHeader status={status} onEndSession={handleEndSession} />

      {connectionStatus === "reconnecting" && (
        <div
          className="flex items-center justify-center gap-2 border-b border-foreground/10 bg-yellow-50 px-4 py-2 text-xs text-yellow-800"
          role="status"
          aria-live="polite"
        >
          <span className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-yellow-400 border-t-yellow-800" />
          Reconnecting...
        </div>
      )}
      {connectionStatus === "disconnected" && (
        <div
          className="flex items-center justify-center gap-2 border-b border-foreground/10 bg-red-50 px-4 py-2 text-xs text-red-800"
          role="alert"
        >
          Connection lost.
          <button
            type="button"
            onClick={handleRetryConnection}
            className="font-medium underline hover:no-underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Messages area */}
      <main className="flex-1 overflow-y-auto px-4 py-4" role="log" aria-label="Chat messages">
        <div className="mx-auto flex max-w-2xl flex-col gap-3">
          {/* Welcome message for empty state */}
          {messages.length === 0 && !isStreaming && status === "active" && (
            <div className="py-12 text-center">
              <p className="text-sm text-foreground/50">
                Start a conversation whenever you are ready.
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <MessageBubble key={msg.id} message={msg} />
          ))}

          {isThinking && !isStreaming && <ThinkingBubble />}
          {isStreaming && <StreamingBubble content={streamingContent} />}

          {activeAssessment &&
            (activeAssessment.assessmentType === "cbt_thought_record" ? (
              <CBTThoughtRecordWidget />
            ) : (
              <AssessmentWidget
                assessmentType={activeAssessment.assessmentType}
                parentAssessmentId={activeAssessment.parentAssessmentId}
              />
            ))}

          {isCrisis && crisisResponse && <CrisisBanner crisisResponse={crisisResponse} />}

          {/* Session ending — summary in progress */}
          {isEnding && (
            <div className="my-4 flex items-center justify-center gap-2 rounded-lg border border-foreground/10 bg-muted/30 px-4 py-3 text-sm text-foreground/50">
              <span className="inline-block h-3.5 w-3.5 animate-spin rounded-full border-2 border-foreground/20 border-t-primary" />
              Wrapping up your session…
            </div>
          )}

          {/* Session ended state */}
          {status === "completed" && (
            <div className="my-6 rounded-xl border border-foreground/10 bg-muted/50 p-5 text-center">
              <p className="mb-2 text-sm font-medium text-foreground/70">Session ended</p>
              <button
                type="button"
                onClick={handleNewSession}
                className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                aria-label="Start a new session"
              >
                Start New Session
              </button>
              <div className="mt-3 flex items-center justify-center gap-4">
                <Link
                  to="/journey"
                  className="text-xs font-medium text-foreground/50 transition-colors hover:text-primary"
                >
                  View Your Journey
                </Link>
                <Link
                  to="/history"
                  className="text-xs font-medium text-foreground/50 transition-colors hover:text-primary"
                >
                  Session History
                </Link>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input area — voice or text mode */}
      {voiceMode ? (
        <div className="border-t border-foreground/10 bg-muted/30">
          <VoiceChat
            ref={voiceChatRef}
            sessionId={sessionId ?? ""}
            onRequestClose={() => stopVoiceAndClose({ closeMode: true })}
          />
        </div>
      ) : (
        <div className="relative">
          <MessageInput
            onSend={handleSendMessage}
            disabled={inputDisabled}
            placeholder={status === "completed" ? "Session has ended" : "Type a message..."}
          />
          {status === "active" && voiceAvailable && (
            <button
              type="button"
              onClick={() => setVoiceMode(true)}
              className="absolute right-16 top-1/2 -translate-y-1/2 rounded-full p-2 text-foreground/40 transition-colors hover:bg-muted hover:text-foreground/70"
              aria-label="Switch to voice chat"
              title="Voice chat"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <title>Voice chat</title>
                <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                <line x1="12" x2="12" y1="19" y2="22" />
              </svg>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
