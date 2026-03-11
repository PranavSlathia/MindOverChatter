import { BrowserRouter, Route, Routes } from "react-router";
import { ChatPage } from "./pages/chat.js";
import { HistoryPage } from "./pages/history.js";
import { HomePage } from "./pages/home.js";
import { MoodPage } from "./pages/mood.js";

export function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-background text-foreground">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/chat" element={<ChatPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/mood" element={<MoodPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
