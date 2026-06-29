import { platform } from "node:os";
import * as pty from "node-pty";

export interface TerminalSession {
  readonly id: string;
  readonly shell: string;
  resize(cols: number, rows: number): void;
  write(data: string): void;
  kill(signal?: string): void;
}

export interface TerminalSessionOptions {
  id: string;
  shell?: string;
  cwd?: string;
  env?: Record<string, string>;
  onData: (data: string | Uint8Array) => void;
  onExit: (code: number, signal?: number) => void;
}

export function createTerminalSession(options: TerminalSessionOptions): TerminalSession {
  const shell = options.shell ?? defaultShell();
  const ptyProcess = pty.spawn(shell, [], {
    name: "xterm-color",
    cols: 80,
    rows: 24,
    cwd: options.cwd,
    env: { ...process.env, ...options.env } as Record<string, string>,
  });

  ptyProcess.onData(options.onData);
  ptyProcess.onExit(({ exitCode, signal }) => {
    options.onExit(exitCode, signal ?? undefined);
  });

  return {
    id: options.id,
    shell,
    resize(cols: number, rows: number): void {
      ptyProcess.resize(cols, rows);
    },
    write(data: string): void {
      ptyProcess.write(data);
    },
    kill(signal?: string): void {
      ptyProcess.kill(signal);
    },
  };
}

function defaultShell(): string {
  if (platform() === "win32") {
    return process.env.ComSpec ?? "cmd.exe";
  }
  return process.env.SHELL ?? "/bin/sh";
}
