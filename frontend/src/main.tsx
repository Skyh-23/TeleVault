import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";

const appRoot = document.getElementById("root");

if (appRoot) {
  createRoot(appRoot).render(
    <StrictMode>
      <App />
    </StrictMode>
  );
}
