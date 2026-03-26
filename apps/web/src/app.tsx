import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import { AppShell } from "./components/layout/app-shell.js";
import { AssessmentFlowPage } from "./pages/assessment-flow.js";
import { AssessmentsPage } from "./pages/assessments.js";
import { ChatPage } from "./pages/chat.js";
import { HistoryPage } from "./pages/history.js";
import { HomePage } from "./pages/home.js";
import { JourneyPage } from "./pages/journey.js";
import { MoodPage } from "./pages/mood.js";
import { ObservabilityPage } from "./pages/observability.js";
import { ReportsPage } from "./pages/reports.js";
import { SettingsPage } from "./pages/settings.js";

export function App() {
  return (
    <BrowserRouter>
      <AppShell>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/chat/:sessionId" element={<ChatPage />} />
          <Route path="/assessments" element={<AssessmentsPage />} />
          <Route path="/assessments/:type" element={<AssessmentFlowPage />} />
          <Route path="/journey" element={<JourneyPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/mood" element={<MoodPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/observability" element={<ObservabilityPage />} />
          <Route path="/profile" element={<Navigate to="/settings" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  );
}
