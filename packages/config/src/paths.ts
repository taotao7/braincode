// Braincode home, project-support, and user-support path resolution.

import { homedir } from "node:os";
import { join } from "node:path";
import { BRAINCODE_HOME_DIR_NAME } from "@braincode/shared";

export type ProjectSupportPaths = {
  root: string;
  agents: string;
  mcp: string;
  skills: string;
  hooks: string;
  checks: string;
};

export type UserSupportPaths = {
  home: string;
  agents: string;
  mcp: string;
  skills: string;
};

export type BraincodePaths = {
  home: string;
  settings: string;
  auth: string;
  brains: string;
  models: string;
  tools: string;
  hooks: string;
  sessions: string;
  logs: string;
  cache: string;
};

export function getBraincodeHome(): string {
  return join(homedir(), BRAINCODE_HOME_DIR_NAME);
}

export function getBraincodePaths(home = getBraincodeHome()): BraincodePaths {
  return {
    home,
    settings: join(home, "settings.json"),
    auth: join(home, "auth.json"),
    brains: join(home, "brains.json"),
    models: join(home, "models.json"),
    tools: join(home, "tools.json"),
    hooks: join(home, "hooks.json"),
    sessions: join(home, "sessions"),
    logs: join(home, "logs"),
    cache: join(home, "cache"),
  };
}

export function getProjectSupportPaths(
  projectRoot = process.cwd(),
): ProjectSupportPaths {
  return {
    root: projectRoot,
    agents: join(projectRoot, "AGENTS.md"),
    mcp: join(projectRoot, ".mcp.json"),
    skills: join(projectRoot, ".agents", "skills"),
    hooks: join(projectRoot, ".agents", "hooks.json"),
    checks: join(projectRoot, ".braincode", "checks.json"),
  };
}

export function getUserSupportPaths(home = getBraincodeHome()): UserSupportPaths {
  return {
    home,
    agents: join(home, "AGENTS.md"),
    mcp: join(home, "mcp.json"),
    skills: join(home, "skills"),
  };
}
