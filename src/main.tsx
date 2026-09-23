import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { useUI } from "./data/ui";
import { useNotes } from "./data/store";
import "./styles/tokens.css";
import "./styles/chrome.css";
import "./styles/views.css";
import "./styles/shell.css";

// Development only: let browser tests drive the stores directly.
if (import.meta.env.DEV) Object.assign(window, { __ui: useUI, __notes: useNotes });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
