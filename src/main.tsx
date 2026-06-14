import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles/index.css";

if (typeof window !== "undefined" && window.location.hostname === "localhost") {
  const target = new URL(window.location.href);
  target.hostname = "127.0.0.1";
  window.location.replace(target.toString());
}

const rootEl = document.getElementById("root");
if (rootEl) {
  createRoot(rootEl).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
