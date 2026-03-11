import { HELPLINES } from "@moc/shared";
import { useCallback, useEffect, useRef } from "react";
import { useParams } from "react-router";
import { AssessmentWidget } from "@/components/chat/assessment-widget.js";
import { ChatHeader } from "@/components/chat/chat-header.js";
import { CrisisBanner, MessageBubble, StreamingBubble } from "@/components/chat/message-bubble.js";
import { MessageInput } from "@/components/chat/message-input.js";
import { api } from "@/lib/api.js";
import { useEmotionStore } from "@/stores/emotion-store.js";
import { useSessionStore } from "@/stores/session-store.js";

export function ChatPage() {
  const { sessionId: urlSessionId } = useParams<{ sessionId?: string }>();

  const {
    sessionId,
    status,
    messages,
    isStreaming,
    streamingContent,
    isCrisis,
    crisisResponse,
    sessionSummary,
    activeAssessment,
    setSessionId,
    setStatus,
    addMessage,
    setMessages,
    setConnected,
    setStreaming,
    appendStreamingContent,
    clearStreamingContent,
    setCrisis,
    setSessionSummary,
    startAssessment,
    completeAssessment,
    reset,
  } = useSessionStore();

  const setEmotionFromSSE = useEmotionStore((s) => s.setEmotion);

  const eventSourceRef = useRef<EventSource | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamingMessageIdRef = useRef<string | null>(null);

  // Scroll to bottom on new messages or streaming content
  // biome-ignore lint/correctness/useExhaustiveDependencies: deps are intentional scroll triggers
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, streamingContent, isCrisis, activeAssessment]);

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
      });

      es.addEventListener("ai.chunk", (event) => {
        try {
          const data = JSON.parse(event.data) as { content: string };
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
        setStreaming(false);
        clearStreamingContent();
      });

      es.addEventListener("session.ended", (event) => {
        try {
          const data = JSON.parse(event.data) as { summary?: string };
          if (data.summary) {
            setSessionSummary(data.summary);
          }
        } catch {
          // Ignore parse errors
        }
        setStatus("completed");
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
      };

      return es;
    },
    [
      setConnected,
      setStreaming,
      appendStreamingContent,
      clearStreamingContent,
      addMessage,
      setCrisis,
      setStatus,
      setSessionSummary,
      startAssessment,
      completeAssessment,
      setEmotionFromSSE,
    ],
  );

  // Create or resume session on mount
  // biome-ignore lint/correctness/useExhaustiveDependencies: urlSessionId drives init, store actions are stable
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

          // Load existing messages
          const messagesResult = await api.getSessionMessages(urlSessionId);
          if (cancelled) return;
          setMessages(
            messagesResult.messages.map((m) => ({
              id: m.id,
              role: m.role as "user" | "assistant",
              content: m.content,
              createdAt: m.createdAt,
            })),
          );

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
        // Create a new session
        try {
          const result = await api.createSession();
          if (cancelled) return;
          setSessionId(result.sessionId);
          setStatus("active");
          connectSSE(result.sessionId);
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
    };
  }, [urlSessionId]);

  // Beforeunload: best-effort session end via beacon
  useEffect(() => {
    const handleBeforeUnload = () => {
      const sid = useSessionStore.getState().sessionId;
      const st = useSessionStore.getState().status;
      if (sid && st === "active") {
        const url = `${import.meta.env.VITE_API_URL || "http://localhost:3000"}/api/sessions/${sid}/end`;
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
  }, []);

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
      await api.endSession(sessionId, "user_ended");
      setStatus("completed");
    } catch (err) {
      console.error("Failed to end session:", err);
    }
    eventSourceRef.current?.close();
  }, [sessionId, setStatus]);

  const handleNewSession = useCallback(() => {
    eventSourceRef.current?.close();
    reset();
    // Re-create session
    api
      .createSession()
      .then((result) => {
        setSessionId(result.sessionId);
        setStatus("active");
        connectSSE(result.sessionId);
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
  }, [reset, setSessionId, setStatus, connectSSE, addMessage]);

  const inputDisabled = isStreaming || status === "completed";

  return (
    <div className="flex h-screen flex-col bg-background">
      <ChatHeader status={status} onEndSession={handleEndSession} />

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

          {isStreaming && <StreamingBubble content={streamingContent} />}

          {activeAssessment && (
            <AssessmentWidget
              assessmentType={activeAssessment.assessmentType}
              parentAssessmentId={activeAssessment.parentAssessmentId}
            />
          )}

          {isCrisis && crisisResponse && <CrisisBanner crisisResponse={crisisResponse} />}

          {/* Session ended state */}
          {status === "completed" && (
            <div className="my-6 rounded-xl border border-foreground/10 bg-muted/50 p-5 text-center">
              <p className="mb-2 text-sm font-medium text-foreground/70">Session ended</p>
              {sessionSummary && (
                <p className="mb-4 text-xs leading-relaxed text-foreground/50">{sessionSummary}</p>
              )}
              <button
                type="button"
                onClick={handleNewSession}
                className="rounded-lg bg-primary px-5 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                aria-label="Start a new session"
              >
                Start New Session
              </button>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </main>

      {/* Input area */}
      <MessageInput
        onSend={handleSendMessage}
        disabled={inputDisabled}
        placeholder={
          status === "completed"
            ? "Session has ended"
            : "Type a message..."
        }
      />
    </div>
  );
}
