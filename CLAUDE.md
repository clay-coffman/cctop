# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What is cctop?

A btop-inspired terminal UI for monitoring Claude Code instances across tmux sessions. It captures Claude Code lifecycle events via hooks, stores them in SQLite, and renders a live dashboard.

## Commands

```bash
bun install              # Install dependencies
bun run start            # Launch the TUI
bun run dev              # Dev mode with file watching
bun run install-hooks    # Install hooks into ~/.claude/settings.json
bun run install-hooks --remove  # Remove hooks
bun run db:reset         # Delete and recreate ~/.cctop/events.db
```

No test or lint commands are configured.

## Architecture

**Data flow:** Claude Code hooks → `capture.py` → SQLite (WAL mode) → TUI polling (1s) → OpenTUI render

### Key layers

- **`hooks/capture.py`** — Python hook script (stdlib only) invoked by Claude Code on 10 lifecycle events (PreToolUse, PostToolUse, Notification, Stop, etc.). Reads JSON from stdin, enriches with tmux context via subprocess, writes to `~/.cctop/events.db`.

- **`src/lib/db.ts`** (`CctopDB` class) — SQLite reader. Queries sessions, events, stats. Uses WAL mode and busy timeout for concurrent access with the Python writer.

- **`src/index.ts`** — Main app. Manages `AppState` (selected index, filter, detail mode, activity window) and the 1-second poll loop. Composes all components into an OpenTUI layout.

- **`src/components/`** — Six OpenTUI components: `header` (stats bar), `activity-chart` (sparkline), `sessions-table` (main list), `event-feed` (live log), `session-detail` (drill-down), `help` (overlay).

- **`src/lib/theme.ts`** — GitHub Dark color palette, event type icons/colors, formatting helpers.

- **`src/install-hooks.ts`** — CLI that patches `~/.claude/settings.json` to register cctop hooks, preserving any existing hook config.

### Runtime dependencies

- **Bun** runtime with `bun:sqlite` built-in
- **@opentui/core** for terminal UI rendering
- **Python 3** (stdlib only) for the hook script
- **tmux** (optional) for pane/session mapping

### Database

SQLite at `~/.cctop/events.db`. Single `events` table with indexes on `session_id`, `timestamp DESC`, and `event_type`.
