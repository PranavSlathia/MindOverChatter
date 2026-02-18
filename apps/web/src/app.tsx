import { BrowserRouter, Route, Routes } from "react-router";
import { HomePage } from "./pages/home.js";

export function App() {
  return (
    <BrowserRouter>
      <div className="min-h-screen bg-background text-foreground">
        <Routes>
          <Route path="/" element={<HomePage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
