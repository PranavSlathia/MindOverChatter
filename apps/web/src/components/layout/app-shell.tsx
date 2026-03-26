import { useLocation } from "react-router";
import { useSessionStore } from "@/stores/session-store.js";
import { BottomTabBar } from "./bottom-tab-bar.js";

interface AppShellProps {
  children: React.ReactNode;
}

const PAGE_TITLES: Record<string, { title: string; subtitle: string }> = {
  "/": { title: "MindOverChatter", subtitle: "Your Wellness Companion" },
  "/assessments": { title: "Assessments", subtitle: "Self-reflection tools and check-ins" },
  "/journey": { title: "Your Journey", subtitle: "Reflections, patterns, and progress" },
  "/reports": { title: "Clinical Report", subtitle: "Structured handoff for a human therapist" },
  "/history": { title: "Session History", subtitle: "Review past conversations" },
  "/mood": { title: "Mood Tracker", subtitle: "Track how you feel over time" },
  "/profile": { title: "Profile", subtitle: "Manage your preferences" },
  "/observability": { title: "Observability", subtitle: "Pipeline health and turn-level metrics" },
};

function getPageInfo(pathname: string): { title: string; subtitle: string } {
  if (PAGE_TITLES[pathname]) return PAGE_TITLES[pathname];
  // Assessment flow pages: /assessments/:type
  if (pathname.startsWith("/assessments/")) {
    return { title: "Assessment", subtitle: "Take your time with each question" };
  }
  return { title: "MindOverChatter", subtitle: "" };
}

export function AppShell({ children }: AppShellProps) {
  const location = useLocation();
  const sessionStatus = useSessionStore((s) => s.status);

  const isChatRoute = location.pathname.startsWith("/chat");
  const isSessionActive =
    isChatRoute && (sessionStatus === "active" || sessionStatus === "crisis_escalated");

  // Chat page manages its own header (ChatHeader component), so skip the top bar
  const showTopBar = !isChatRoute;
  const showBottomBar = !isSessionActive;

  const pageInfo = getPageInfo(location.pathname);

  return (
    <div className="flex min-h-screen flex-col bg-background text-foreground">
      {showTopBar && (
        <header className="border-b border-foreground/10 bg-background px-4 py-3 shadow-sm">
          <div className="mx-auto max-w-2xl">
            <h1 className="text-lg font-semibold leading-tight text-primary">{pageInfo.title}</h1>
            {pageInfo.subtitle && <p className="text-xs text-foreground/60">{pageInfo.subtitle}</p>}
          </div>
        </header>
      )}

      <div className="flex min-h-0 flex-1 flex-col">{children}</div>

      {showBottomBar && <BottomTabBar />}
    </div>
  );
}
