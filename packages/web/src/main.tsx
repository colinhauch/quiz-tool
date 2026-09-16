import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";
import { EnvironmentBadge } from "./EnvironmentBadge.js";
import "./index.css";

const root = document.getElementById("root");
if (!root) throw new Error("missing #root element");

createRoot(root).render(
  <StrictMode>
    <EnvironmentBadge />
    <App />
  </StrictMode>,
);
