import { type FormEvent, type KeyboardEvent, useCallback, useRef, useState } from "react";

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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

  return (
    <form
      onSubmit={handleSubmit}
      className="flex items-end gap-3 border-t border-foreground/10 bg-background px-4 py-3"
    >
      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          adjustHeight();
        }}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        disabled={disabled}
        rows={1}
        className="flex-1 resize-none rounded-xl border border-foreground/15 bg-white px-4 py-2.5 text-sm text-foreground placeholder:text-foreground/40 focus:border-primary focus:outline-none disabled:cursor-not-allowed disabled:opacity-50"
        aria-label="Message input"
      />
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
  );
}
