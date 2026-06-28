import type { Project, Message } from "@singularity/shared";

export type { Project, Message };

export function echoProjectName(project: Project): string {
  return project.name;
}
