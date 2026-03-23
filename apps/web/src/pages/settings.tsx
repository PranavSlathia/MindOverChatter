import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import type { CliStatusResponse, CliToolStatus, UserProfile } from "@/lib/api.js";
import { api } from "@/lib/api.js";
import { cn } from "@/lib/utils.js";
import { useServiceHealthStore } from "@/stores/service-health-store.js";

// ── TagList (migrated from profile.tsx) ──────────────────────────

type ListField = "goals" | "coreTraits" | "patterns";

interface TagListProps {
  label: string;
  description: string;
  items: string[];
  placeholder: string;
  onAdd: (value: string) => void;
  onRemove: (index: number) => void;
}

function TagList({ label, description, items, placeholder, onAdd, onRemove }: TagListProps) {
  const [inputValue, setInputValue] = useState("");

  function handleAdd(e: FormEvent) {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (trimmed && !items.includes(trimmed)) {
      onAdd(trimmed);
      setInputValue("");
    }
  }

  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium text-foreground">{label}</legend>
      <p className="text-xs text-foreground/60">{description}</p>

      {items.length > 0 && (
        <ul className="flex flex-wrap gap-2" aria-label={`${label} list`}>
          {items.map((item, index) => (
            <li
              key={item}
              className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-medium text-primary"
            >
              {item}
              <button
                type="button"
                onClick={() => onRemove(index)}
                className="ml-0.5 inline-flex h-4 w-4 items-center justify-center rounded-full text-primary/60 transition-colors hover:bg-primary/20 hover:text-primary"
                aria-label={`Remove ${item}`}
              >
                &times;
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="flex gap-2">
        <input
          type="text"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={placeholder}
          className="flex-1 rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground/40 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          aria-label={`Add new ${label.toLowerCase().replace(/s$/, "")}`}
        />
        <button
          type="submit"
          disabled={!inputValue.trim()}
          className="rounded-lg bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition-colors hover:bg-primary/20 disabled:cursor-not-allowed disabled:opacity-40"
        >
          Add
        </button>
      </form>
    </fieldset>
  );
}

// ── Section wrapper ──────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-foreground/10 bg-background p-5">
      <h2 className="mb-4 text-base font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

// ── Status dot ───────────────────────────────────────────────────

function StatusDot({ available }: { available: boolean }) {
  return (
    <span
      role="img"
      className={cn(
        "inline-block h-2.5 w-2.5 rounded-full",
        available ? "bg-primary" : "bg-destructive",
      )}
      aria-label={available ? "Available" : "Unavailable"}
    />
  );
}

// ── CLI badge ────────────────────────────────────────────────────

function CliBadge({ status }: { status: CliToolStatus }) {
  if (!status.installed) {
    return (
      <span className="inline-flex items-center rounded-full bg-foreground/10 px-2.5 py-0.5 text-xs font-medium text-foreground/50">
        Not installed
      </span>
    );
  }
  if (!status.loggedIn) {
    return (
      <span className="inline-flex items-center rounded-full bg-destructive/10 px-2.5 py-0.5 text-xs font-medium text-destructive">
        Not logged in
      </span>
    );
  }
  return (
    <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
      Logged in
    </span>
  );
}

// ── Profile Section ──────────────────────────────────────────────

function ProfileSection() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState("");
  const [goals, setGoals] = useState<string[]>([]);
  const [coreTraits, setCoreTraits] = useState<string[]>([]);
  const [patterns, setPatterns] = useState<string[]>([]);

  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchProfile() {
      setIsLoading(true);
      setLoadError(null);
      try {
        const data = await api.getUserProfile();
        if (!cancelled) {
          setProfile(data);
          setDisplayName(data.displayName ?? "");
          setGoals((data.goals ?? []) as string[]);
          setCoreTraits((data.coreTraits ?? []) as string[]);
          setPatterns((data.patterns ?? []) as string[]);
        }
      } catch (err) {
        console.error("Failed to fetch profile:", err);
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : "Failed to load profile");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  const hasChanges =
    profile !== null &&
    (displayName !== (profile.displayName ?? "") ||
      JSON.stringify(goals) !== JSON.stringify(profile.goals ?? []) ||
      JSON.stringify(coreTraits) !== JSON.stringify(profile.coreTraits ?? []) ||
      JSON.stringify(patterns) !== JSON.stringify(profile.patterns ?? []));

  const handleSave = useCallback(async () => {
    setIsSaving(true);
    setSaveStatus("idle");
    setSaveError(null);
    try {
      const updated = await api.updateUserProfile({
        displayName: displayName.trim() || null,
        goals,
        coreTraits,
        patterns,
      });
      setProfile(updated);
      setDisplayName(updated.displayName ?? "");
      setGoals((updated.goals ?? []) as string[]);
      setCoreTraits((updated.coreTraits ?? []) as string[]);
      setPatterns((updated.patterns ?? []) as string[]);
      setSaveStatus("success");
      setTimeout(() => setSaveStatus("idle"), 3000);
    } catch (err) {
      console.error("Failed to save profile:", err);
      setSaveStatus("error");
      setSaveError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setIsSaving(false);
    }
  }, [displayName, goals, coreTraits, patterns]);

  const addToList = useCallback((field: ListField, value: string) => {
    const setters: Record<ListField, React.Dispatch<React.SetStateAction<string[]>>> = {
      goals: setGoals,
      coreTraits: setCoreTraits,
      patterns: setPatterns,
    };
    setters[field]((prev) => [...prev, value]);
    setSaveStatus("idle");
  }, []);

  const removeFromList = useCallback((field: ListField, index: number) => {
    const setters: Record<ListField, React.Dispatch<React.SetStateAction<string[]>>> = {
      goals: setGoals,
      coreTraits: setCoreTraits,
      patterns: setPatterns,
    };
    setters[field]((prev) => prev.filter((_, i) => i !== index));
    setSaveStatus("idle");
  }, []);

  if (isLoading) {
    return (
      <Section title="Profile">
        <div className="flex h-32 items-center justify-center">
          <p className="text-sm text-foreground/50">Loading profile...</p>
        </div>
      </Section>
    );
  }

  if (loadError) {
    return (
      <Section title="Profile">
        <div className="flex h-32 flex-col items-center justify-center gap-3">
          <p className="text-sm text-destructive">{loadError}</p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg border border-foreground/15 px-4 py-2 text-xs font-medium text-foreground/70 transition-colors hover:bg-foreground/5 hover:text-foreground"
          >
            Retry
          </button>
        </div>
      </Section>
    );
  }

  if (!profile) return null;

  return (
    <Section title="Profile">
      <div className="space-y-6">
        {/* Display name */}
        <div className="space-y-2">
          <label htmlFor="display-name" className="block text-sm font-medium text-foreground">
            Display Name
          </label>
          <p className="text-xs text-foreground/60">How the app will address you</p>
          <input
            id="display-name"
            type="text"
            value={displayName}
            onChange={(e) => {
              setDisplayName(e.target.value);
              setSaveStatus("idle");
            }}
            placeholder="Enter your name"
            className="w-full max-w-sm rounded-lg border border-foreground/15 bg-background px-3 py-2 text-sm text-foreground placeholder:text-foreground/40 focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          />
        </div>

        <hr className="border-foreground/10" />

        <TagList
          label="Goals"
          description="What you'd like to work towards"
          items={goals}
          placeholder="e.g., Better sleep, Less anxiety"
          onAdd={(v) => addToList("goals", v)}
          onRemove={(i) => removeFromList("goals", i)}
        />

        <hr className="border-foreground/10" />

        <TagList
          label="Core Traits"
          description="Key aspects of your personality"
          items={coreTraits}
          placeholder="e.g., Empathetic, Analytical"
          onAdd={(v) => addToList("coreTraits", v)}
          onRemove={(i) => removeFromList("coreTraits", i)}
        />

        <hr className="border-foreground/10" />

        <TagList
          label="Patterns"
          description="Behavioral or thought patterns you've noticed"
          items={patterns}
          placeholder="e.g., Overthinking at night"
          onAdd={(v) => addToList("patterns", v)}
          onRemove={(i) => removeFromList("patterns", i)}
        />

        <hr className="border-foreground/10" />

        {/* Save section */}
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !hasChanges}
            className={cn(
              "rounded-lg px-6 py-2.5 text-sm font-medium transition-all",
              hasChanges
                ? "bg-primary text-white hover:opacity-90"
                : "bg-foreground/10 text-foreground/40 cursor-not-allowed",
              isSaving && "opacity-70 cursor-not-allowed",
            )}
          >
            {isSaving ? "Saving..." : "Save Changes"}
          </button>

          {saveStatus === "success" && (
            <output className="text-sm text-primary">Profile updated</output>
          )}
          {saveStatus === "error" && (
            <output className="text-sm text-destructive">{saveError ?? "Failed to save"}</output>
          )}
        </div>

        <p className="text-xs text-foreground/40">
          Member since{" "}
          {new Date(profile.createdAt).toLocaleDateString(undefined, {
            year: "numeric",
            month: "long",
            day: "numeric",
          })}
        </p>
      </div>
    </Section>
  );
}

// ── Service Health Section ───────────────────────────────────────

const SERVICE_LABELS: Record<string, string> = {
  whisper: "Whisper (STT)",
  emotion: "Emotion Analysis",
  tts: "Text-to-Speech",
  memory: "Memory (Mem0)",
  voice: "Voice Pipeline",
};

function ServiceHealthSection() {
  const { whisper, tts, emotion, memory, voice, lastCheckedAt, isChecking, checkHealth } =
    useServiceHealthStore();

  // Check on mount
  // biome-ignore lint/correctness/useExhaustiveDependencies: checkHealth is stable
  useEffect(() => {
    checkHealth();
  }, []);

  const services = [
    { key: "whisper", status: whisper },
    { key: "emotion", status: emotion },
    { key: "tts", status: tts },
    { key: "memory", status: memory },
    { key: "voice", status: voice },
  ];

  return (
    <Section title="Service Health">
      <div className="space-y-3">
        <ul className="space-y-2">
          {services.map(({ key, status }) => (
            <li key={key} className="flex items-center justify-between py-1">
              <span className="text-sm text-foreground/80">{SERVICE_LABELS[key] ?? key}</span>
              <div className="flex items-center gap-2">
                <StatusDot available={status.available} />
                <span className="text-xs text-foreground/50">
                  {status.available ? "Available" : "Unavailable"}
                </span>
              </div>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between border-t border-foreground/10 pt-3">
          <span className="text-xs text-foreground/40">
            {lastCheckedAt
              ? `Last checked ${new Date(lastCheckedAt).toLocaleTimeString()}`
              : "Not checked yet"}
          </span>
          <button
            type="button"
            onClick={checkHealth}
            disabled={isChecking}
            className="rounded-lg border border-foreground/15 px-3 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:bg-foreground/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isChecking ? "Checking..." : "Refresh"}
          </button>
        </div>
      </div>
    </Section>
  );
}

// ── CLI Authentication Section ───────────────────────────────────

const CLI_META: Record<string, { label: string; description: string; role: string }> = {
  claude: {
    label: "Claude",
    description: "Primary therapist (Sonnet) + safety validator (Haiku)",
    role: "Required",
  },
  gemini: {
    label: "Gemini",
    description: "Quality reviewer — probing depth + conversational quality",
    role: "Optional",
  },
  codex: {
    label: "Codex",
    description: "Framework reviewer — MI-OARS + skill adherence",
    role: "Optional",
  },
};

function CliAuthSection() {
  const [cliStatus, setCliStatus] = useState<CliStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loginMessage, setLoginMessage] = useState<{ tool: string; text: string; success: boolean } | null>(null);
  const [loginInProgress, setLoginInProgress] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await api.getCliStatus();
      setCliStatus(data);
    } catch (err) {
      console.error("Failed to fetch CLI status:", err);
      setError(err instanceof Error ? err.message : "Failed to check CLI status");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const handleLogin = useCallback(async (tool: "claude" | "gemini" | "codex") => {
    setLoginInProgress(tool);
    setLoginMessage(null);
    try {
      const result = await api.triggerCliLogin(tool);
      setLoginMessage({ tool, text: result.message, success: result.success });
      // Re-check status after a short delay to pick up the login
      if (result.success) {
        setTimeout(() => {
          fetchStatus();
        }, 3000);
      }
    } catch (err) {
      setLoginMessage({
        tool,
        text: err instanceof Error ? err.message : "Failed to start login",
        success: false,
      });
    } finally {
      setLoginInProgress(null);
    }
  }, [fetchStatus]);

  return (
    <Section title="AI Agent Team">
      <p className="text-xs text-foreground/50 -mt-1 mb-3">
        Claude is the main therapist. Gemini and Codex are optional parallel reviewers that grade each response.
      </p>

      {isLoading && !cliStatus && (
        <div className="flex h-20 items-center justify-center">
          <p className="text-sm text-foreground/50">Checking CLI tools...</p>
        </div>
      )}

      {error && !cliStatus && (
        <div className="flex h-20 flex-col items-center justify-center gap-2">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {cliStatus && (
        <div className="space-y-4">
          {(["claude", "gemini", "codex"] as const).map((tool) => {
            const status = cliStatus[tool];
            const meta = CLI_META[tool] ?? { label: tool, description: "", role: "Optional" };
            return (
              <div
                key={tool}
                className="rounded-lg border border-foreground/10 p-3 space-y-2"
              >
                <div className="flex items-start justify-between">
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-foreground/80">
                        {meta.label}
                      </span>
                      <span className={cn(
                        "text-[10px] font-medium px-1.5 py-0.5 rounded-full",
                        meta.role === "Required"
                          ? "bg-primary/10 text-primary"
                          : "bg-foreground/5 text-foreground/40",
                      )}>
                        {meta.role}
                      </span>
                    </div>
                    <span className="text-xs text-foreground/50">{meta.description}</span>
                  </div>
                  <CliBadge status={status} />
                </div>

                {/* Details when logged in */}
                {status.loggedIn && (
                  <div className="text-xs text-foreground/50 pl-0.5">
                    {status.email && <span>{status.email}</span>}
                    {status.email && status.model && <span> · </span>}
                    {status.model && <span>Model: {status.model}</span>}
                  </div>
                )}

                {/* Login action when not logged in */}
                {status.installed && !status.loggedIn && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleLogin(tool)}
                        disabled={loginInProgress === tool}
                        className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-white transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {loginInProgress === tool ? "Starting..." : "Login"}
                      </button>
                      <span className="text-[10px] text-foreground/40">
                        Opens browser for authentication
                      </span>
                    </div>
                    {loginMessage?.tool === tool && (
                      <output className={cn(
                        "block text-xs p-2 rounded-md",
                        loginMessage.success
                          ? "bg-primary/5 text-primary"
                          : "bg-destructive/5 text-destructive",
                      )}>
                        {loginMessage.text}
                      </output>
                    )}
                  </div>
                )}

                {/* Install instructions when not installed */}
                {!status.installed && (
                  <div className="space-y-2">
                    <p className="text-xs text-foreground/40">Not installed. Run in terminal:</p>
                    <code className="block text-xs bg-foreground/5 text-foreground/70 rounded-md px-3 py-2 font-mono select-all">
                      {status.loginCommand ?? `npm install -g ${tool}`}
                    </code>
                    <p className="text-xs text-foreground/40">
                      Then click "Check Status" below to verify.
                    </p>
                  </div>
                )}
              </div>
            );
          })}

          <div className="flex items-center justify-end border-t border-foreground/10 pt-3">
            <button
              type="button"
              onClick={fetchStatus}
              disabled={isLoading}
              className="rounded-lg border border-foreground/15 px-3 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:bg-foreground/5 hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
            >
              {isLoading ? "Checking..." : "Check Status"}
            </button>
          </div>
        </div>
      )}
    </Section>
  );
}

// ── Quick Links Section ──────────────────────────────────────────

function QuickLinksSection() {
  return (
    <Section title="Quick Links">
      <ul className="space-y-2">
        <li>
          <Link
            to="/observability"
            className="inline-flex items-center gap-2 text-sm text-primary hover:text-primary/80 transition-colors"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
            Observability Dashboard
          </Link>
          <p className="ml-6 text-xs text-foreground/50">
            Pipeline health, turn events, and alert feed
          </p>
        </li>
      </ul>
    </Section>
  );
}

// ── Settings Page ────────────────────────────────────────────────

export function SettingsPage() {
  return (
    <div>
      <div className="mx-auto max-w-2xl space-y-6 px-4 py-6">
        <h1 className="text-lg font-semibold text-foreground">Settings</h1>
        <ProfileSection />
        <ServiceHealthSection />
        <CliAuthSection />
        <QuickLinksSection />
      </div>
    </div>
  );
}
