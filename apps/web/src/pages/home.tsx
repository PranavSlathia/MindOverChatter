import { Link } from "react-router";

export function HomePage() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="space-y-6 text-center">
        <h1 className="text-4xl font-semibold text-primary">MindOverChatter</h1>
        <p className="text-lg text-foreground/70">Your Wellness Companion</p>
        <div className="flex flex-col items-center gap-3">
          <Link
            to="/chat"
            className="inline-block rounded-lg bg-primary px-8 py-3 text-base font-medium text-white transition-opacity hover:opacity-90"
            aria-label="Start chatting"
          >
            Start Chatting
          </Link>
          <Link
            to="/journey"
            className="text-sm font-medium text-foreground/50 transition-colors hover:text-primary"
            aria-label="View your journey"
          >
            Your Journey
          </Link>
          <Link
            to="/history"
            className="text-sm font-medium text-foreground/50 transition-colors hover:text-primary"
            aria-label="View session history"
          >
            Session History
          </Link>
          <Link
            to="/mood"
            className="text-sm font-medium text-foreground/50 transition-colors hover:text-primary"
            aria-label="Track your mood"
          >
            Mood Tracker
          </Link>
          <Link
            to="/profile"
            className="text-sm font-medium text-foreground/50 transition-colors hover:text-primary"
            aria-label="View your profile"
          >
            Profile
          </Link>
        </div>
      </div>
    </div>
  );
}
