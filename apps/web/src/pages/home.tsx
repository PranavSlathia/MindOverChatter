import { Link } from "react-router";

export function HomePage() {
  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="text-center space-y-6">
        <h1 className="text-4xl font-semibold text-primary">MindOverChatter</h1>
        <p className="text-lg text-foreground/70">Your Wellness Companion</p>
        <Link
          to="/chat"
          className="inline-block rounded-lg bg-primary px-8 py-3 text-base font-medium text-white transition-opacity hover:opacity-90"
          aria-label="Start chatting"
        >
          Start Chatting
        </Link>
      </div>
    </div>
  );
}
