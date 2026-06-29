import type { HealthResponse } from "@singularity/shared";
import type { ReactNode } from "react";

export interface ShellProps {
  children?: ReactNode;
}

export function Shell({ children }: ShellProps): React.JSX.Element {
  // Demonstrate end-to-end shared-schema wiring in the UI package.
  const health: HealthResponse = { status: "ok", protocolVersion: "1.0.0" };
  // eslint-disable-next-line no-console
  console.log("singularity-shell", health.status);
  return <div className="singularity-shell">{children}</div>;
}
