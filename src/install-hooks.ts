#!/usr/bin/env bun
/**
 * install-hooks — automatically configures Claude Code hooks for cctop.
 *
 * Adds hook entries to ~/.claude/settings.json so all Claude Code instances
 * send events to the shared SQLite database.
 *
 * Usage:
 *   bun run install-hooks
 *   bun run src/install-hooks.ts          # install globally
 *   bun run src/install-hooks.ts --remove # remove cctop hooks
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import { join, resolve } from "path";
import { homedir } from "os";

const CLAUDE_SETTINGS_DIR = join(homedir(), ".claude");
const CLAUDE_SETTINGS_PATH = join(CLAUDE_SETTINGS_DIR, "settings.json");

// Resolve the absolute path to the capture script
const CAPTURE_SCRIPT = resolve(join(import.meta.dir, "..", "hooks", "capture.py"));

// The hook command that will be added
const HOOK_COMMAND = `python3 ${CAPTURE_SCRIPT}`;

// All hook events we want to capture.
//
// Claude Code's settings.json doesn't support a wildcard at the event-name
// level — every event must be listed explicitly — so we subscribe broadly
// once and only revisit when a brand-new category appears upstream.
//
// Skipped on purpose (too noisy or off-purpose for a session monitor):
// TeammateIdle, InstructionsLoaded, ConfigChange, CwdChanged, FileChanged,
// Elicitation, ElicitationResult, Setup. Easy to add later if useful.
const HOOK_EVENTS = [
  // Lifecycle
  "SessionStart",
  "SessionEnd",
  // User input
  "UserPromptSubmit",
  "UserPromptExpansion",
  // Tools
  "PreToolUse",
  "PostToolUse",
  "PostToolUseFailure",
  "PostToolBatch",
  // Permissions
  "PermissionRequest",
  "PermissionDenied",
  // Notifications
  "Notification",
  // Agent flow
  "Stop",
  "StopFailure",
  "SubagentStart",
  "SubagentStop",
  // Compaction
  "PreCompact",
  "PostCompact",
  // Tasks
  "TaskCreated",
  "TaskCompleted",
  // Worktrees
  "WorktreeCreate",
  "WorktreeRemove",
];

function loadSettings(): any {
  if (!existsSync(CLAUDE_SETTINGS_PATH)) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(CLAUDE_SETTINGS_PATH, "utf-8"));
  } catch {
    console.error(`⚠️  Could not parse ${CLAUDE_SETTINGS_PATH}. Creating backup.`);
    const backup = CLAUDE_SETTINGS_PATH + ".bak." + Date.now();
    writeFileSync(backup, readFileSync(CLAUDE_SETTINGS_PATH));
    console.log(`   Backup saved to ${backup}`);
    return {};
  }
}

function saveSettings(settings: any) {
  mkdirSync(CLAUDE_SETTINGS_DIR, { recursive: true });
  writeFileSync(CLAUDE_SETTINGS_PATH, JSON.stringify(settings, null, 2) + "\n");
}

function isCctopHook(hook: any): boolean {
  return hook?.type === "command" && hook?.command?.includes("capture.py");
}

function install() {
  console.log("🔧 Installing cctop hooks into Claude Code...\n");

  // Verify capture script exists
  if (!existsSync(CAPTURE_SCRIPT)) {
    console.error(`❌ Capture script not found: ${CAPTURE_SCRIPT}`);
    console.error("   Make sure you're running this from the cctop project directory.");
    process.exit(1);
  }

  const settings = loadSettings();
  if (!settings.hooks) {
    settings.hooks = {};
  }

  let added = 0;
  let skipped = 0;

  for (const event of HOOK_EVENTS) {
    if (!settings.hooks[event]) {
      settings.hooks[event] = [];
    }

    const eventHooks = settings.hooks[event];

    // Check if cctop hook already exists for this event
    const hasCctop = eventHooks.some((matcher: any) =>
      matcher.hooks?.some((h: any) => isCctopHook(h))
    );

    if (hasCctop) {
      skipped++;
      continue;
    }

    // Add cctop hook — use empty matcher to catch all tools
    eventHooks.push({
      matcher: "",
      hooks: [
        {
          type: "command",
          command: HOOK_COMMAND,
          timeout: 5,
        },
      ],
    });
    added++;
  }

  saveSettings(settings);

  console.log(`✅ Hooks installed: ${added} added, ${skipped} already present`);
  console.log(`   Settings file: ${CLAUDE_SETTINGS_PATH}`);
  console.log(`   Capture script: ${CAPTURE_SCRIPT}`);
  console.log(`   Database: ~/.cctop/events.db`);
  console.log("");
  console.log("📝 Note: Hooks take effect on new Claude Code sessions.");
  console.log("   Existing sessions will use their original hook config.");
  console.log("");
  console.log("🚀 Start cctop with: bun run start");
}

function remove() {
  console.log("🧹 Removing cctop hooks from Claude Code...\n");

  const settings = loadSettings();
  if (!settings.hooks) {
    console.log("No hooks found. Nothing to remove.");
    return;
  }

  let removed = 0;

  for (const event of HOOK_EVENTS) {
    if (!settings.hooks[event]) continue;

    const before = settings.hooks[event].length;

    // Remove matchers that only contain cctop hooks
    settings.hooks[event] = settings.hooks[event].filter((matcher: any) => {
      if (!matcher.hooks) return true;
      // Remove cctop hooks from this matcher
      matcher.hooks = matcher.hooks.filter((h: any) => !isCctopHook(h));
      // Keep matcher if it still has non-cctop hooks
      return matcher.hooks.length > 0;
    });

    // Clean up empty arrays
    if (settings.hooks[event].length === 0) {
      delete settings.hooks[event];
    }

    removed += before - (settings.hooks[event]?.length || 0);
  }

  // Clean up empty hooks object
  if (Object.keys(settings.hooks).length === 0) {
    delete settings.hooks;
  }

  saveSettings(settings);

  console.log(`✅ Removed ${removed} cctop hook entries.`);
  console.log("   Note: This takes effect on new Claude Code sessions.");
}

// ─── CLI ─────────────────────────────────────────────
const args = process.argv.slice(2);

if (args.includes("--remove") || args.includes("-r")) {
  remove();
} else if (args.includes("--help") || args.includes("-h")) {
  console.log(`
cctop hook installer

Usage:
  bun run install-hooks           Install hooks into ~/.claude/settings.json
  bun run install-hooks --remove  Remove cctop hooks
  bun run install-hooks --help    Show this help
`);
} else {
  install();
}
