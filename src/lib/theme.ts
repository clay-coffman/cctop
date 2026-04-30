/**
 * cctop theme — color palette and formatting utilities.
 *
 * Palette is chosen at startup from `~/.cache/theme-mode` (the same file the
 * user's `theme-sync` daemon writes — see CLAUDE.md). Falls back to dark
 * when the file is missing or unreadable. Restart cctop to pick up a system
 * theme switch; live reload is a follow-up.
 */

import { readFileSync } from "fs";
import { join } from "path";
import { homedir } from "os";

const THEME_MODE_FILE = join(homedir(), ".cache", "theme-mode");

function readThemeMode(): "light" | "dark" {
  try {
    return readFileSync(THEME_MODE_FILE, "utf-8").trim() === "light"
      ? "light"
      : "dark";
  } catch {
    return "dark";
  }
}

// ─── Dark palette (GitHub Dark inspired — original cctop look) ─────
const dark = {
  bg: "#0d1117",
  bgPanel: "#161b22",
  bgHighlight: "#21262d",
  bgSelected: "#1f3a5f",

  textPrimary: "#e6edf3",
  textSecondary: "#8b949e",
  textDim: "#484f58",
  textMuted: "#30363d",

  green: "#3fb950",
  greenBright: "#56d364",
  blue: "#58a6ff",
  blueBright: "#79c0ff",
  purple: "#bc8cff",
  yellow: "#d29922",
  yellowBright: "#e3b341",
  orange: "#f0883e",
  red: "#f85149",
  redBright: "#ff7b72",
  cyan: "#39d2c0",
  pink: "#f778ba",

  active: "#3fb950",
  idle: "#8b949e",
  waiting: "#d29922",
  error: "#f85149",
  done: "#58a6ff",
  ended: "#484f58",

  border: "#30363d",
  borderFocus: "#58a6ff",
} as const;

const darkSessionColors = [
  "#58a6ff", // blue
  "#3fb950", // green
  "#bc8cff", // purple
  "#f0883e", // orange
  "#39d2c0", // cyan
  "#f778ba", // pink
  "#d29922", // yellow
  "#ff7b72", // red
];

// ─── Light palette (GitHub Light, matches user's tmux/bat/starship) ─
const light: typeof dark = {
  bg: "#ffffff",
  bgPanel: "#f6f8fa",
  bgHighlight: "#eaeef2",
  bgSelected: "#ddf4ff",

  textPrimary: "#1f2328",
  textSecondary: "#57606a",
  textDim: "#8c959f",
  textMuted: "#d0d7de",

  green: "#1a7f37",
  greenBright: "#2da44e",
  blue: "#0969da",
  blueBright: "#218bff",
  purple: "#8250df",
  yellow: "#9a6700",
  yellowBright: "#bf8700",
  orange: "#bc4c00",
  red: "#cf222e",
  redBright: "#d12e3f",
  cyan: "#1b7c83",
  pink: "#bf3989",

  active: "#1a7f37",
  idle: "#57606a",
  waiting: "#9a6700",
  error: "#cf222e",
  done: "#0969da",
  ended: "#8c959f",

  border: "#d0d7de",
  borderFocus: "#0969da",
} as const;

const lightSessionColors = [
  "#0969da", // blue
  "#1a7f37", // green
  "#8250df", // purple
  "#bc4c00", // orange
  "#1b7c83", // cyan
  "#bf3989", // pink
  "#9a6700", // yellow
  "#cf222e", // red
];

// ─── Active palette ────────────────────────────────────────────────
const mode = readThemeMode();
export const themeMode: "light" | "dark" = mode;
export const colors = mode === "light" ? light : dark;
export const sessionColors = mode === "light" ? lightSessionColors : darkSessionColors;

// Session color rotation (for distinguishing sessions visually)
const sessionColorMap = new Map<string, string>();
let nextColorIdx = 0;

export function getSessionColor(sessionId: string): string {
  if (!sessionColorMap.has(sessionId)) {
    sessionColorMap.set(sessionId, sessionColors[nextColorIdx % sessionColors.length]);
    nextColorIdx++;
  }
  return sessionColorMap.get(sessionId)!;
}

// Event type emoji/icons
export const eventIcons: Record<string, string> = {
  PreToolUse: "🔧",
  PostToolUse: "✅",
  PostToolUseFailure: "❌",
  PostToolBatch: "🧰",
  PermissionRequest: "🔐",
  PermissionDenied: "🚫",
  Notification: "🔔",
  Stop: "🛑",
  StopFailure: "💥",
  SubagentStop: "👥",
  SubagentStart: "🟢",
  PreCompact: "📦",
  PostCompact: "📤",
  UserPromptSubmit: "💬",
  UserPromptExpansion: "💭",
  SessionStart: "🚀",
  SessionEnd: "🏁",
  TaskCreated: "📝",
  TaskCompleted: "✔️",
  WorktreeCreate: "🌿",
  WorktreeRemove: "✂️",
};

// Notification subtype icons — used when event_type === "Notification"
// to override the generic 🔔 with something specific to the subtype.
export const notificationIcons: Record<string, string> = {
  permission_prompt: "🔐",
  idle_prompt: "💤",
  auth_success: "🔓",
  elicitation_dialog: "❓",
  elicitation_complete: "❔",
  elicitation_response: "💬",
};

export const toolIcons: Record<string, string> = {
  Bash: "💻",
  Read: "📖",
  Write: "✍️",
  Edit: "✏️",
  MultiEdit: "✏️",
  Glob: "🔍",
  Grep: "🔎",
  Task: "🤖",
  WebFetch: "🌐",
  WebSearch: "🔍",
};

// Status colors
export function getStatusColor(status: string): string {
  if (status.startsWith("running")) return colors.green;
  if (status.startsWith("ran")) return colors.greenBright;
  if (status.startsWith("failed")) return colors.red;
  if (status === "denied" || status === "error") return colors.red;
  if (status === "processing") return colors.blue;
  if (status.startsWith("waiting")) return colors.yellow;
  if (status === "idle" || status === "idle prompt") return colors.textDim;
  if (status === "done") return colors.blue;
  if (status === "ended") return colors.ended;
  if (status === "starting") return colors.cyan;
  if (status === "compacting") return colors.purple;
  if (status === "active") return colors.green;
  if (status === "subagent running") return colors.cyan;
  if (status === "tasking") return colors.blueBright;
  if (status === "worktree") return colors.purple;
  if (status === "batch done") return colors.greenBright;
  return colors.textSecondary;
}

// Format helpers
export function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.floor(seconds)}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return `${h}h ${m}m`;
}

export function formatTimestamp(ts: number): string {
  const d = new Date(ts * 1000);
  return d.toLocaleTimeString("en-US", { hour12: false });
}

export function formatTimeAgo(ts: number): string {
  const secs = Date.now() / 1000 - ts;
  if (secs < 5) return "now";
  if (secs < 60) return `${Math.floor(secs)}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  return `${Math.floor(secs / 3600)}h ago`;
}

export function truncate(str: string, maxLen: number): string {
  if (!str) return "";
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + "…";
}

export function shortenPath(cwd: string): string {
  if (!cwd) return "";
  const home = process.env.HOME || "";
  if (home && cwd.startsWith(home)) {
    return "~" + cwd.slice(home.length);
  }
  // Show last 2 path segments
  const parts = cwd.split("/").filter(Boolean);
  if (parts.length <= 2) return cwd;
  return "…/" + parts.slice(-2).join("/");
}

export function shortenSessionId(id: string): string {
  if (!id) return "";
  if (id.length <= 8) return id;
  return id.slice(0, 8);
}
