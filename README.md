# cctop

**btop for Claude Code** — a terminal dashboard for monitoring all your Claude Code instances across tmux sessions in real time.

```
┌─ cctop ─── Active: 3 │ Sessions: 12 │ Events: 1,204 │ Rate: 42/min ────────────────────────┐
├─ Activity (5m) ──────────────────────────────────── 847 events  peak: 18/min ────────────────┤
│ ▁▂▃▅█▇▃▁▁▂▄▇█▅▃▂▁▁▁▁▂▃▅▇█▇▅▃▂▁▁▂▃▄▅▆▇▆▅▃▂▁▁▁▁▂▃▄▅▆▇▆▅▃▂▁▁▂▃▄▅▆▇▆▅▃▂▁▁▁▂▃▅▆▇█▅▃▂▁▁   │
├─ Sessions ───────────────────────────────────────────────────────────────────────────────────┤
│ TMUX             PROJECT                STATUS               TOOLS  DURATION   LAST         │
│▸ ● dev:0.1       ~/pa-apply             running: Bash          42   12m 30s    2s           │
│  ● work:1.0      ~/cctop                ran: Write              8    5m 12s   15s           │
│  ○ api:2.1       ~/backend              idle                   23    1h 5m    3m            │
├─ Event Feed ─────────────────────────────────────────────────────────────────────────────────┤
│ 14:32:05  🔧💻 abc12345  Bash          npm test                                             │
│ 14:32:06  ✅💻 abc12345  Bash          ✓                                                    │
│ 14:32:08  💬   def45678  —             "Refactor the auth module"                            │
│ 14:32:09  🔧✍️  def45678  Write         src/lib/auth.ts                                      │
│ 14:32:10  ✅✍️  def45678  Write         ✓                                                    │
│ 14:32:12  🛑   ghi90123  —             reason: exit                                         │
└──────────────────────────────────────────────────────────────────────────────────────────────┘
```

## Features

- **Session overview** — see all active Claude Code instances at a glance with status indicators
- **Tmux integration** — automatically maps sessions to tmux panes and windows
- **Live event feed** — streaming log of tool calls, prompts, and lifecycle events
- **Activity sparkline** — event rate chart with configurable time windows (1m / 5m / 15m)
- **Session detail** — press Enter for a split-view drill-in with full event history
- **Event filtering** — filter the feed to a specific session
- **Vim-style navigation** — j/k, Enter/Esc, btop-inspired UX

## How it works

```
Claude Code hooks → capture.py → SQLite (WAL) ← TUI polls every 1s
```

No server. The hook script writes directly to a shared SQLite database using WAL mode for safe concurrent access, and the TUI polls it. Simple and reliable.

Claude Code [hooks](https://code.claude.com/docs/en/hooks) fire on lifecycle events — tool calls, prompts, stops, session start/end, etc. cctop installs a small Python script as a hook that captures these events with tmux context and writes them to `~/.cctop/events.db`.

## Prerequisites

- [Bun](https://bun.sh)
- Python 3 (stdlib only, no pip packages)
- [Claude Code](https://code.claude.com/docs)
- [tmux](https://github.com/tmux/tmux) (optional — enables pane/window mapping)

## Setup

```bash
# Clone & install
git clone https://github.com/claycoffman/cctop.git
cd cctop
bun install

# Install hooks into ~/.claude/settings.json
bun run install-hooks

# Launch the dashboard
bun run start
```

Hooks take effect on **new** Claude Code sessions. Existing running sessions won't pick them up — restart them to start capturing events.

## Keybindings

| Key | Action |
|---|---|
| `j` / `↓` | Move selection down |
| `k` / `↑` | Move selection up |
| `Enter` | View session detail (split view) |
| `Esc` | Back / close detail |
| `f` | Filter event feed by selected session |
| `F` | Clear filter |
| `r` | Force refresh |
| `1` / `2` / `3` | Activity window: 1m / 5m / 15m |
| `?` | Toggle help |
| `q` / `Ctrl+C` | Quit |

## Hook events captured

| Event | Description |
|---|---|
| `SessionStart` / `SessionEnd` | Instance started / ended |
| `UserPromptSubmit` / `UserPromptExpansion` | User prompt; slash-command expansion |
| `PreToolUse` / `PostToolUse` | Tool about to run / completed |
| `PostToolUseFailure` | Tool failed |
| `PostToolBatch` | Parallel tool batch resolved |
| `PermissionRequest` / `PermissionDenied` | Permission dialog / auto-mode denial |
| `Notification` | Permission prompts, idle alerts, elicitation dialogs |
| `Stop` / `StopFailure` | Agent finished / turn ended with error |
| `SubagentStart` / `SubagentStop` | Subagent spawned / finished |
| `PreCompact` / `PostCompact` | Context window compaction (before / after) |
| `TaskCreated` / `TaskCompleted` | TodoWrite-style task tracker |
| `WorktreeCreate` / `WorktreeRemove` | Git worktree operations |

## Commands

```bash
bun run start                    # Launch the TUI
bun run dev                      # Dev mode with file watching
bun run install-hooks            # Install hooks
bun run install-hooks --remove   # Remove hooks
bun run db:reset                 # Delete and recreate the database
```

## Troubleshooting

**"Waiting for Claude Code events..."**
- Run `bun run install-hooks` if you haven't already
- Start a **new** Claude Code session (existing ones won't have hooks)
- Check: `ls ~/.cctop/events.db`

**Events aren't appearing**
- Verify hooks: `cat ~/.claude/settings.json | grep capture.py`
- Test manually: `echo '{"session_id":"test","hook_event_name":"SessionStart"}' | python3 hooks/capture.py`
- Check DB: `sqlite3 ~/.cctop/events.db "SELECT COUNT(*) FROM events"`

**Tmux columns are blank**
- Claude Code must be running inside tmux for pane mapping to work

## Tips

Add cctop stats to your tmux status bar:

```bash
# .tmux.conf
set -g status-right '#(sqlite3 ~/.cctop/events.db "SELECT COUNT(DISTINCT session_id) FROM events WHERE timestamp > strftime(\"%s\",\"now\") - 60") active'
```

## License

MIT
