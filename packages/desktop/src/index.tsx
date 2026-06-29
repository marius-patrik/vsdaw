import { Shell } from "@singularity/ui";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

const container = document.getElementById("root");
if (!container) {
  throw new Error("Root element not found");
}

createRoot(container).render(
  <StrictMode>
    <Shell>
      <h1>Singularity</h1>
    </Shell>
  </StrictMode>,
);
