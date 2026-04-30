/**
 * cctop — btop-like TUI for monitoring Claude Code instances.
 *
 * Layout:
 * ┌──────────────────── Header ────────────────────────┐
 * ├──────────────────── Activity ──────────────────────┤
 * ├──────────────────── Sessions ──────────────────────┤
 * │                                                     │
 * ├──────────────────── Event Feed ────────────────────┤
 * │                                                     │
 * └─────────────────────────────────────────────────────┘
 *
 * When detail mode is active, the right half becomes session detail.
 */

import { createCliRenderer, Box, Text, type KeyEvent } from "@opentui/core";
import { CctopDB, type SessionInfo, type Event } from "./lib/db";
import { colors } from "./lib/theme";
import { createHeader } from "./components/header";
import { createSessionsTable } from "./components/sessions-table";
import { createEventFeed } from "./components/event-feed";
import { createActivityChart } from "./components/activity-chart";
import { createSessionDetail } from "./components/session-detail";
import { createHelpPanel } from "./components/help";

// ─── State ───────────────────────────────────────────
interface AppState {
  selectedIndex: number;
  showDetail: boolean;
  showHelp: boolean;
  filterSessionId: string | null;
  activityWindow: number; // seconds
  activityBucket: number; // seconds per bucket
  sessions: SessionInfo[];
  events: Event[];
  detailEvents: Event[];
  termWidth: number;
  termHeight: number;
}

const state: AppState = {
  selectedIndex: 0,
  showDetail: false,
  showHelp: false,
  filterSessionId: null,
  activityWindow: 300, // 5 minutes
  activityBucket: 10,
  sessions: [],
  events: [],
  detailEvents: [],
  termWidth: 120,
  termHeight: 40,
};

// ─── DB ──────────────────────────────────────────────
const db = new CctopDB();

function pollData() {
  if (!db.isOpen()) {
    // Try to open the DB on each poll (it may not exist yet)
    db.open();
    return;
  }

  state.sessions = db.getSessions(state.activityWindow);
  const newEvents = db.getNewEvents(50);
  if (newEvents.length > 0) {
    state.events.push(...newEvents);
    // Keep only last 500 events in memory
    if (state.events.length > 500) {
      state.events = state.events.slice(-500);
    }
  }

  // Clamp selection
  if (state.sessions.length > 0) {
    state.selectedIndex = Math.min(state.selectedIndex, state.sessions.length - 1);
  } else {
    state.selectedIndex = 0;
  }

  // Update detail events if in detail mode
  if (state.showDetail && state.sessions[state.selectedIndex]) {
    state.detailEvents = db.getSessionEvents(state.sessions[state.selectedIndex].session_id, 200);
  }
}

// ─── Render ──────────────────────────────────────────
function render(renderer: any) {
  // Clear and rebuild the tree
  for (const child of renderer.root.getChildren()) {
    renderer.root.remove(child.id);
  }

  const w = state.termWidth;
  const h = state.termHeight;

  // Calculate panel heights
  const headerHeight = 3;
  const activityHeight = 4;
  const sessionsHeight = Math.max(6, Math.floor((h - headerHeight - activityHeight) * 0.4));
  const feedHeight = Math.max(5, h - headerHeight - activityHeight - sessionsHeight);

  if (!db.isOpen()) {
    // Show "waiting for DB" screen
    renderer.root.add(
      Box(
        {
          width: "100%",
          height: "100%",
          flexDirection: "column",
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: colors.bg,
        },
        Text({
          content: "⏳ cctop",
          fg: colors.cyan,
          bold: true,
        }),
        Text({ content: "", fg: colors.textDim }),
        Text({
          content: "Waiting for Claude Code events...",
          fg: colors.textSecondary,
        }),
        Text({ content: "", fg: colors.textDim }),
        Text({
          content: "Make sure hooks are installed: bun run install-hooks",
          fg: colors.textDim,
        }),
        Text({
          content: `DB path: ~/.cctop/events.db`,
          fg: colors.textDim,
        }),
        Text({ content: "", fg: colors.textDim }),
        Text({
          content: "Press q to quit",
          fg: colors.textDim,
        })
      )
    );
    return;
  }

  const stats = db.getStats();
  const activity = db.getActivity(state.activityBucket, state.activityWindow);

  if (state.showDetail && state.sessions[state.selectedIndex]) {
    // ─── Detail mode: split layout ───
    const session = state.sessions[state.selectedIndex];
    const leftWidth = Math.floor(w * 0.5);
    const rightWidth = w - leftWidth;

    renderer.root.add(
      Box(
        {
          width: "100%",
          height: "100%",
          flexDirection: "column",
          backgroundColor: colors.bg,
        },
        createHeader({
          activeSessions: stats.activeSessions,
          totalSessions: stats.totalSessions,
          totalEvents: stats.totalEvents,
          eventsLastMinute: stats.eventsLastMinute,
        }),
        Box(
          {
            width: "100%",
            flexGrow: 1,
            flexDirection: "row",
          },
          // Left: sessions + feed
          Box(
            {
              width: leftWidth,
              flexDirection: "column",
              flexGrow: 1,
            },
            createSessionsTable({
              sessions: state.sessions,
              selectedIndex: state.selectedIndex,
              height: Math.floor((h - headerHeight) * 0.5),
            }),
            createEventFeed({
              events: state.events,
              height: Math.max(5, h - headerHeight - Math.floor((h - headerHeight) * 0.5)),
              filterSessionId: session.session_id,
            })
          ),
          // Right: session detail
          createSessionDetail({
            session,
            events: state.detailEvents,
            height: h - headerHeight,
            width: rightWidth,
          })
        )
      )
    );
  } else {
    // ─── Normal mode: full-width stacked layout ───
    renderer.root.add(
      Box(
        {
          width: "100%",
          height: "100%",
          flexDirection: "column",
          backgroundColor: colors.bg,
        },
        createHeader({
          activeSessions: stats.activeSessions,
          totalSessions: stats.totalSessions,
          totalEvents: stats.totalEvents,
          eventsLastMinute: stats.eventsLastMinute,
        }),
        createActivityChart({
          buckets: activity,
          width: w,
          windowSecs: state.activityWindow,
          bucketSecs: state.activityBucket,
        }),
        createSessionsTable({
          sessions: state.sessions,
          selectedIndex: state.selectedIndex,
          height: sessionsHeight,
        }),
        createEventFeed({
          events: state.events,
          height: feedHeight,
          filterSessionId: state.filterSessionId,
        })
      )
    );
  }

  // Help overlay (absolute positioned)
  if (state.showHelp) {
    renderer.root.add(createHelpPanel(w, h));
  }
}

// ─── Main ────────────────────────────────────────────
async function main() {
  const renderer = await createCliRenderer({
    exitOnCtrlC: false, // We handle Ctrl+C ourselves
    targetFps: 15,
  });

  // Track terminal size
  state.termWidth = renderer.width;
  state.termHeight = renderer.height;

  renderer.on("resize", (w: number, h: number) => {
    state.termWidth = w;
    state.termHeight = h;
    render(renderer);
  });

  // Try initial DB open
  db.open();

  // Load initial events
  if (db.isOpen()) {
    state.events = db.getRecentEvents(200);
  }

  // ─── Keyboard handling ───
  renderer.keyInput.on("keypress", (key: KeyEvent) => {
    // Quit
    if (key.name === "q" || (key.ctrl && key.name === "c")) {
      cleanup(renderer);
      return;
    }

    // Help toggle
    if (key.name === "?" || key.sequence === "?") {
      state.showHelp = !state.showHelp;
      render(renderer);
      return;
    }

    if (state.showHelp) {
      if (key.name === "escape") {
        state.showHelp = false;
        render(renderer);
      }
      return;
    }

    // Navigation
    if (key.name === "j" || key.name === "down") {
      if (state.sessions.length > 0) {
        state.selectedIndex = Math.min(state.selectedIndex + 1, state.sessions.length - 1);
        render(renderer);
      }
      return;
    }
    if (key.name === "k" || key.name === "up") {
      state.selectedIndex = Math.max(state.selectedIndex - 1, 0);
      render(renderer);
      return;
    }

    // Detail mode
    if (key.name === "return" || key.name === "enter") {
      if (state.sessions[state.selectedIndex]) {
        state.showDetail = true;
        state.detailEvents = db.getSessionEvents(
          state.sessions[state.selectedIndex].session_id,
          200
        );
        render(renderer);
      }
      return;
    }
    if (key.name === "escape") {
      if (state.showDetail) {
        state.showDetail = false;
        render(renderer);
      }
      return;
    }

    // Filter event feed
    if (key.name === "f") {
      if (state.sessions[state.selectedIndex]) {
        state.filterSessionId = state.sessions[state.selectedIndex].session_id;
        render(renderer);
      }
      return;
    }
    if (key.name === "F" || (key.shift && key.name === "f")) {
      state.filterSessionId = null;
      render(renderer);
      return;
    }

    // Activity window
    if (key.name === "1") {
      state.activityWindow = 60;
      state.activityBucket = 2;
      render(renderer);
      return;
    }
    if (key.name === "2") {
      state.activityWindow = 300;
      state.activityBucket = 10;
      render(renderer);
      return;
    }
    if (key.name === "3") {
      state.activityWindow = 900;
      state.activityBucket = 30;
      render(renderer);
      return;
    }

    // Force refresh
    if (key.name === "r") {
      pollData();
      render(renderer);
      return;
    }
  });

  // ─── Render loop ───
  render(renderer);
  renderer.start();

  // Poll DB and re-render periodically
  const pollInterval = setInterval(() => {
    pollData();
    render(renderer);
  }, 1000); // 1 second poll

  // Cleanup handler
  function cleanup(r: any) {
    clearInterval(pollInterval);
    db.close();
    r.stop();
    r.destroy();
    process.exit(0);
  }

  // Handle signals
  process.on("SIGINT", () => cleanup(renderer));
  process.on("SIGTERM", () => cleanup(renderer));
}

main().catch((err) => {
  console.error("cctop error:", err);
  process.exit(1);
});
