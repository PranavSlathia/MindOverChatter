import { type FormEvent, useCallback, useEffect, useState } from "react";
import { Link } from "react-router";
import type { UserProfile } from "@/lib/api.js";
import { api } from "@/lib/api.js";
import { cn } from "@/lib/utils.js";

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

      {/* Tag display */}
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

      {/* Add input */}
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

export function ProfilePage() {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Form state
  const [displayName, setDisplayName] = useState("");
  const [goals, setGoals] = useState<string[]>([]);
  const [coreTraits, setCoreTraits] = useState<string[]>([]);
  const [patterns, setPatterns] = useState<string[]>([]);

  // Save state
  const [isSaving, setIsSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "success" | "error">("idle");
  const [saveError, setSaveError] = useState<string | null>(null);

  // Load profile on mount
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
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    fetchProfile();
    return () => {
      cancelled = true;
    };
  }, []);

  // Check if form has changed
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
      // Auto-dismiss success message
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

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-foreground/10 bg-background px-4 py-3 shadow-sm">
        <div>
          <h1 className="text-lg font-semibold leading-tight text-primary">Profile</h1>
          <p className="text-xs text-foreground/60">Manage your preferences</p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            to="/"
            className="rounded-lg border border-foreground/15 px-3 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:bg-foreground/5 hover:text-foreground"
            aria-label="Back to home"
          >
            Home
          </Link>
          <Link
            to="/chat"
            className="rounded-lg border border-foreground/15 px-3 py-1.5 text-xs font-medium text-foreground/70 transition-colors hover:bg-foreground/5 hover:text-foreground"
            aria-label="Back to chat"
          >
            Chat
          </Link>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-2xl px-4 py-6">
        {/* Loading state */}
        {isLoading && (
          <div className="flex h-64 items-center justify-center">
            <p className="text-sm text-foreground/50">Loading profile...</p>
          </div>
        )}

        {/* Error state */}
        {loadError && !isLoading && (
          <div className="flex h-64 flex-col items-center justify-center gap-3">
            <p className="text-sm text-destructive">{loadError}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-lg border border-foreground/15 px-4 py-2 text-xs font-medium text-foreground/70 transition-colors hover:bg-foreground/5 hover:text-foreground"
            >
              Retry
            </button>
          </div>
        )}

        {/* Profile form */}
        {!isLoading && !loadError && profile && (
          <div className="space-y-8">
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

            {/* Divider */}
            <hr className="border-foreground/10" />

            {/* Goals */}
            <TagList
              label="Goals"
              description="What you'd like to work towards"
              items={goals}
              placeholder="e.g., Better sleep, Less anxiety"
              onAdd={(v) => addToList("goals", v)}
              onRemove={(i) => removeFromList("goals", i)}
            />

            {/* Divider */}
            <hr className="border-foreground/10" />

            {/* Core Traits */}
            <TagList
              label="Core Traits"
              description="Key aspects of your personality"
              items={coreTraits}
              placeholder="e.g., Empathetic, Analytical"
              onAdd={(v) => addToList("coreTraits", v)}
              onRemove={(i) => removeFromList("coreTraits", i)}
            />

            {/* Divider */}
            <hr className="border-foreground/10" />

            {/* Patterns */}
            <TagList
              label="Patterns"
              description="Behavioral or thought patterns you've noticed"
              items={patterns}
              placeholder="e.g., Overthinking at night"
              onAdd={(v) => addToList("patterns", v)}
              onRemove={(i) => removeFromList("patterns", i)}
            />

            {/* Divider */}
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

              {/* Status feedback */}
              {saveStatus === "success" && (
                <output className="text-sm text-primary">Profile updated</output>
              )}
              {saveStatus === "error" && (
                <output className="text-sm text-destructive">
                  {saveError ?? "Failed to save"}
                </output>
              )}
            </div>

            {/* Member since */}
            <p className="text-xs text-foreground/40">
              Member since{" "}
              {new Date(profile.createdAt).toLocaleDateString(undefined, {
                year: "numeric",
                month: "long",
                day: "numeric",
              })}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
