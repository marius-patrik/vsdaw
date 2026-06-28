import type { EngineMessage, ErrorEnvelope } from "@singularity/shared";

export type { EngineMessage, ErrorEnvelope };

export function isErrorEnvelope(envelope: ErrorEnvelope): boolean {
  return envelope.code.startsWith("ERR_");
}
