import type { ReactNode } from "react";

export interface ShellProps {
  children?: ReactNode;
}

export function Shell({ children }: ShellProps): React.JSX.Element {
  return <div className="singularity-shell">{children}</div>;
}
