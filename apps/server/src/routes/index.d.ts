declare const app: import("hono/hono-base").HonoBase<import("hono/types").BlankEnv, import("hono/types").BlankSchema | import("hono/types").MergeSchemaPath<{
    "/health": {
        $get: {
            input: {};
            output: any;
            outputFormat: "json";
            status: import("hono/utils/http-status").ContentfulStatusCode;
        };
    };
}, "/"> | import("hono/types").MergeSchemaPath<{
    "/": {
        $get: {
            input: {
                query: {
                    limit?: string | string[] | undefined;
                    offset?: string | string[] | undefined;
                };
            };
            output: {
                sessions: {
                    id: string;
                    status: "active" | "completed" | "crisis_escalated";
                    startedAt: string;
                    endedAt: string | null;
                    summary: string | null;
                }[];
                limit: number;
                offset: number;
            };
            outputFormat: "json";
            status: import("hono/utils/http-status").ContentfulStatusCode;
        };
    };
} & {
    "/": {
        $post: {
            input: {};
            output: {
                sessionId: string;
                status: "active" | "completed" | "crisis_escalated";
                startedAt: string;
            };
            outputFormat: "json";
            status: 201;
        };
    };
} & {
    "/:id/messages": {
        $get: {
            input: {
                param: {
                    id: string;
                };
            };
            output: {
                error: "SESSION_NOT_FOUND";
                message: string;
            };
            outputFormat: "json";
            status: 404;
        } | {
            input: {
                param: {
                    id: string;
                };
            };
            output: {
                messages: {
                    id: string;
                    role: "user" | "assistant";
                    content: string;
                    createdAt: string;
                }[];
                limit: number;
                truncated: boolean;
            };
            outputFormat: "json";
            status: import("hono/utils/http-status").ContentfulStatusCode;
        };
    };
} & {
    "/:id/messages": {
        $post: {
            input: {
                json: {
                    text: string;
                };
            } & {
                param: {
                    id: string;
                };
            };
            output: {
                error: "SESSION_NOT_FOUND";
                message: string;
            };
            outputFormat: "json";
            status: 404;
        } | {
            input: {
                json: {
                    text: string;
                };
            } & {
                param: {
                    id: string;
                };
            };
            output: {
                error: "SESSION_ENDED";
                message: string;
            };
            outputFormat: "json";
            status: 409;
        } | {
            input: {
                json: {
                    text: string;
                };
            } & {
                param: {
                    id: string;
                };
            };
            output: {
                userMessageId: string;
                assistantMessageId: string;
                crisis: true;
                response: string;
            };
            outputFormat: "json";
            status: import("hono/utils/http-status").ContentfulStatusCode;
        } | {
            input: {
                json: {
                    text: string;
                };
            } & {
                param: {
                    id: string;
                };
            };
            output: {
                userMessageId: string;
                crisis: false;
            };
            outputFormat: "json";
            status: import("hono/utils/http-status").ContentfulStatusCode;
        };
    };
} & {
    "/:id/events": {
        $get: {
            input: {
                param: {
                    id: string;
                };
            };
            output: {};
            outputFormat: string;
            status: import("hono/utils/http-status").StatusCode;
        };
    };
} & {
    "/:id/end": {
        $post: {
            input: {
                json: {
                    reason?: string | undefined;
                };
            } & {
                param: {
                    id: string;
                };
            };
            output: {
                error: "SESSION_NOT_FOUND";
                message: string;
            };
            outputFormat: "json";
            status: 404;
        } | {
            input: {
                json: {
                    reason?: string | undefined;
                };
            } & {
                param: {
                    id: string;
                };
            };
            output: {
                error: "SESSION_ENDED";
                message: string;
            };
            outputFormat: "json";
            status: 409;
        } | {
            input: {
                json: {
                    reason?: string | undefined;
                };
            } & {
                param: {
                    id: string;
                };
            };
            output: {
                sessionId: string;
                status: "completed";
                endedAt: string;
            };
            outputFormat: "json";
            status: import("hono/utils/http-status").ContentfulStatusCode;
        };
    };
}, "/api/sessions"> | import("hono/types").MergeSchemaPath<{
    "/": {
        $post: {
            input: {
                json: {
                    sessionId: string;
                    type: "relationship" | "phq9" | "gad7" | "iss_sleep" | "panic_screener" | "trauma_gating" | "functioning" | "substance_use";
                    answers: number[];
                    parentAssessmentId?: string | undefined;
                };
            };
            output: {
                error: "SESSION_NOT_FOUND";
                message: string;
            };
            outputFormat: "json";
            status: 404;
        } | {
            input: {
                json: {
                    sessionId: string;
                    type: "relationship" | "phq9" | "gad7" | "iss_sleep" | "panic_screener" | "trauma_gating" | "functioning" | "substance_use";
                    answers: number[];
                    parentAssessmentId?: string | undefined;
                };
            };
            output: {
                error: "SESSION_ENDED";
                message: string;
            };
            outputFormat: "json";
            status: 409;
        } | {
            input: {
                json: {
                    sessionId: string;
                    type: "relationship" | "phq9" | "gad7" | "iss_sleep" | "panic_screener" | "trauma_gating" | "functioning" | "substance_use";
                    answers: number[];
                    parentAssessmentId?: string | undefined;
                };
            };
            output: {
                assessmentId: string;
                totalScore: number;
                severity: "minimal" | "mild" | "moderate" | "moderately_severe" | "severe";
                nextScreener: "relationship" | "phq9" | "gad7" | "iss_sleep" | "panic_screener" | "trauma_gating" | "functioning" | "substance_use" | null;
            };
            outputFormat: "json";
            status: 201;
        };
    };
}, "/api/assessments"> | import("hono/types").MergeSchemaPath<{
    "/": {
        $post: {
            input: {
                json: {
                    sessionId: string;
                    channel: "text" | "voice" | "face";
                    emotionLabel: string;
                    confidence: number;
                    signalWeight: number;
                    messageId?: string | undefined;
                    rawScores?: Record<string, number> | undefined;
                    prosodyData?: {
                        pitch_mean: number;
                        pitch_std: number;
                        energy_mean: number;
                        speaking_rate: number;
                        energy_std?: number | undefined;
                        mfcc_summary?: number[] | undefined;
                    } | undefined;
                };
            };
            output: {
                id: string;
                createdAt: string;
            };
            outputFormat: "json";
            status: 201;
        };
    };
}, "/api/emotions"> | import("hono/types").MergeSchemaPath<{
    "/": {
        $post: {
            input: {
                json: {
                    valence: number;
                    arousal: number;
                    source: "user_input" | "ai_inferred" | "assessment";
                    sessionId?: string | undefined;
                };
            };
            output: {
                id: string;
                valence: number;
                arousal: number;
                source: "user_input" | "ai_inferred" | "assessment";
                createdAt: string;
            };
            outputFormat: "json";
            status: 201;
        };
    };
} & {
    "/": {
        $get: {
            input: {};
            output: {
                entries: {
                    id: string;
                    valence: number;
                    arousal: number;
                    source: "user_input" | "ai_inferred" | "assessment";
                    sessionId: string | null;
                    createdAt: string;
                }[];
            };
            outputFormat: "json";
            status: import("hono/utils/http-status").ContentfulStatusCode;
        };
    };
}, "/api/mood-logs"> | import("hono/types").MergeSchemaPath<{
    "/": {
        $get: {
            input: {};
            output: {
                id: string;
                displayName: string | null;
                coreTraits: import("hono/utils/types").JSONValue;
                patterns: import("hono/utils/types").JSONValue;
                goals: import("hono/utils/types").JSONValue;
                createdAt: string;
                updatedAt: string;
            };
            outputFormat: "json";
            status: import("hono/utils/http-status").ContentfulStatusCode;
        };
    };
} & {
    "/": {
        $patch: {
            input: {
                json: {
                    displayName?: string | null | undefined;
                    coreTraits?: string[] | undefined;
                    patterns?: string[] | undefined;
                    goals?: string[] | undefined;
                };
            };
            output: {
                id: string;
                displayName: string | null;
                coreTraits: import("hono/utils/types").JSONValue;
                patterns: import("hono/utils/types").JSONValue;
                goals: import("hono/utils/types").JSONValue;
                createdAt: string;
                updatedAt: string;
            };
            outputFormat: "json";
            status: import("hono/utils/http-status").ContentfulStatusCode;
        };
    };
}, "/api/user"> | import("hono/types").MergeSchemaPath<{
    "/transcribe": {
        $post: {
            input: {};
            output: {};
            outputFormat: "json";
            status: import("hono/utils/http-status").ContentfulStatusCode;
        };
    };
} & {
    "/tts": {
        $post: {
            input: {
                json: {
                    text: string;
                    voice?: "af_heart" | "af_bella" | "af_nicole" | "af_sarah" | "af_sky" | "am_adam" | "am_michael" | "bf_emma" | "bf_isabella" | "bm_george" | "bm_lewis" | undefined;
                };
            };
            output: {};
            outputFormat: string;
            status: import("hono/utils/http-status").StatusCode;
        };
    };
}, "/api">, "/", "/">;
export type AppType = typeof app;
export { app };
//# sourceMappingURL=index.d.ts.map