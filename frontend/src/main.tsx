import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { Toaster } from "./toast";
import "./styles.css";
import { applyTheme } from "./theme";
import { registerServiceWorker } from "./install";

applyTheme();
registerServiceWorker();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
    <Toaster />
  </StrictMode>,
);
