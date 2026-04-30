/**
 * cctop — btop-like TUI for monitoring Claude Code instances.
 *
 * The tree is built once at startup. Every poll (1 Hz) calls `update()` on
 * the component classes, which mutate Text content / colours / visibility
 * via OpenTUI's setters. We never tear nodes down — that's what was leaking
 * ~70 MB/min in the previous factory-rebuild approach.
 */

import {
  createCliRenderer,
  BoxRenderable,
  TextRenderable,
  type KeyEvent,
} from "@opentui/core";
import { CctopDB, type SessionInfo, type Event } from "./lib/db";
import { colors } from "./lib/theme";
import { Header } from "./components/header";
import { ActivityChart } from "./components/activity-chart";
import { SessionsTable } from "./components/sessions-table";
import { EventFeed } from "./components/event-feed";
import { SessionDetail } from "./components/session-detail";
import { HelpPanel } from "./components/help";

// ─── State ───────────────────────────────────────────
interface AppState {
  selectedIndex: number;
  showDetail: boolean;
  showHelp: boolean;
  filterSessionId: string | null;
  activityWindow: number;
  activityBucket: number;
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
  activityWindow: 300,
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
    db.open();
    return;
  }

  state.sessions = db.getSessions(state.activityWindow);
  const newEvents = db.getNewEvents(50);
  if (newEvents.length > 0) {
    state.events.push(...newEvents);
    if (state.events.length > 500) {
      state.events = state.events.slice(-500);
    }
  }

  if (state.sessions.length > 0) {
    state.selectedIndex = Math.min(state.selectedIndex, state.sessions.length - 1);
  } else {
    state.selectedIndex = 0;
  }

  if (state.showDetail && state.sessions[state.selectedIndex]) {
    state.detailEvents = db.getSessionEvents(
      state.sessions[state.selectedIndex].session_id,
      200
    );
  }
}

// ─── Main ────────────────────────────────────────────
async function main() {
  const renderer = await createCliRenderer({
    exitOnCtrlC: false,
    targetFps: 4,
  });

  state.termWidth = renderer.width;
  state.termHeight = renderer.height;

  // Build all components once.
  const header = new Header(renderer);
  const activityChart = new ActivityChart(renderer);
  const sessionsTable = new SessionsTable(renderer);
  const eventFeed = new EventFeed(renderer);
  const sessionDetail = new SessionDetail(renderer);
  const helpPanel = new HelpPanel(renderer);

  // Layout: header on top, then a row containing the main column (chart +
  // sessions + feed) on the left and the session-detail panel on the right.
  // We toggle widths and visibility on mode change instead of rebuilding.
  const mainColumn = new BoxRenderable(renderer, {
    flexDirection: "column",
    flexGrow: 1,
  });
  mainColumn.add(activityChart.node);
  mainColumn.add(sessionsTable.node);
  mainColumn.add(eventFeed.node);

  const contentRow = new BoxRenderable(renderer, {
    width: "100%",
    flexGrow: 1,
    flexDirection: "row",
  });
  contentRow.add(mainColumn);
  contentRow.add(sessionDetail.node);

  const rootBox = new BoxRenderable(renderer, {
    width: "100%",
    height: "100%",
    flexDirection: "column",
    backgroundColor: colors.bg,
  });
  rootBox.add(header.node);
  rootBox.add(contentRow);

  // Waiting-for-DB screen — own subtree, hidden once the DB opens.
  const waitingBox = new BoxRenderable(renderer, {
    width: "100%",
    height: "100%",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: colors.bg,
    visible: !db.isOpen(),
  });
  waitingBox.add(new TextRenderable(renderer, { content: "⏳ cctop", fg: colors.cyan }));
  waitingBox.add(new TextRenderable(renderer, { content: "", fg: colors.textDim }));
  waitingBox.add(
    new TextRenderable(renderer, {
      content: "Waiting for Claude Code events...",
      fg: colors.textSecondary,
    })
  );
  waitingBox.add(new TextRenderable(renderer, { content: "", fg: colors.textDim }));
  waitingBox.add(
    new TextRenderable(renderer, {
      content: "Make sure hooks are installed: bun run install-hooks",
      fg: colors.textDim,
    })
  );
  waitingBox.add(
    new TextRenderable(renderer, {
      content: "DB path: ~/.cctop/events.db",
      fg: colors.textDim,
    })
  );
  waitingBox.add(new TextRenderable(renderer, { content: "", fg: colors.textDim }));
  waitingBox.add(
    new TextRenderable(renderer, { content: "Press q to quit", fg: colors.textDim })
  );

  renderer.root.add(rootBox);
  renderer.root.add(waitingBox);
  renderer.root.add(helpPanel.node);

  // Hide the main UI while waiting.
  rootBox.visible = db.isOpen();

  /**
   * applyLayout — sets the widths/heights of the layout containers based on
   * the current terminal size and mode. Called on resize and on mode toggle.
   */
  function applyLayout() {
    const w = state.termWidth;
    const h = state.termHeight;
    const headerH = 3;
    const activityH = 4;
    const detailVisible = state.showDetail && state.sessions[state.selectedIndex];

    if (detailVisible) {
      const leftW = Math.floor(w * 0.5);
      const rightW = w - leftW;
      mainColumn.width = leftW;
      sessionDetail.node.visible = true;
      sessionDetail.setSize(rightW, h - headerH);

      // Hide activity in detail mode (no vertical room).
      activityChart.node.visible = false;
      const sessionsH = Math.floor((h - headerH) * 0.5);
      const feedH = Math.max(5, h - headerH - sessionsH);
      sessionsTable.setHeight(sessionsH);
      eventFeed.setHeight(feedH);
    } else {
      mainColumn.width = "100%";
      sessionDetail.node.visible = false;

      activityChart.node.visible = true;
      const sessionsH = Math.max(6, Math.floor((h - headerH - activityH) * 0.4));
      const feedH = Math.max(5, h - headerH - activityH - sessionsH);
      sessionsTable.setHeight(sessionsH);
      eventFeed.setHeight(feedH);
    }

    helpPanel.reposition(w, h);
  }

  /**
   * update — called on every poll and after input. Mutates component
   * contents; does not allocate or tear down nodes.
   */
  function update() {
    const dbOpen = db.isOpen();
    waitingBox.visible = !dbOpen;
    rootBox.visible = dbOpen;
    helpPanel.node.visible = state.showHelp;

    if (!dbOpen) return;

    const stats = db.getStats();
    const activity = db.getActivity(state.activityBucket, state.activityWindow);

    header.update(stats);

    if (activityChart.node.visible) {
      activityChart.update({
        buckets: activity,
        width: state.termWidth,
        windowSecs: state.activityWindow,
        bucketSecs: state.activityBucket,
      });
    }

    const sessionsH = state.showDetail
      ? Math.floor((state.termHeight - 3) * 0.5)
      : Math.max(6, Math.floor((state.termHeight - 7) * 0.4));
    sessionsTable.update(state.sessions, state.selectedIndex, sessionsH);

    const detailWidth = state.showDetail ? Math.floor(state.termWidth * 0.5) - 4 : state.termWidth - 40;
    const feedH = state.showDetail
      ? Math.max(5, state.termHeight - 3 - sessionsH)
      : Math.max(5, state.termHeight - 7 - sessionsH);
    eventFeed.update(state.events, state.filterSessionId, feedH, Math.max(10, detailWidth));

    if (state.showDetail && state.sessions[state.selectedIndex]) {
      sessionDetail.update(state.sessions[state.selectedIndex], state.detailEvents);
    }
  }

  applyLayout();
  if (db.isOpen()) {
    state.events = db.getRecentEvents(200);
  }
  update();

  // ─── Resize ───
  renderer.on("resize", (w: number, h: number) => {
    state.termWidth = w;
    state.termHeight = h;
    applyLayout();
    update();
  });

  // ─── Keyboard ───
  renderer.keyInput.on("keypress", (key: KeyEvent) => {
    if (key.name === "q" || (key.ctrl && key.name === "c")) {
      cleanup();
      return;
    }

    if (key.name === "?" || key.sequence === "?") {
      state.showHelp = !state.showHelp;
      update();
      return;
    }

    if (state.showHelp) {
      if (key.name === "escape") {
        state.showHelp = false;
        update();
      }
      return;
    }

    if (key.name === "j" || key.name === "down") {
      if (state.sessions.length > 0) {
        state.selectedIndex = Math.min(state.selectedIndex + 1, state.sessions.length - 1);
        update();
      }
      return;
    }
    if (key.name === "k" || key.name === "up") {
      state.selectedIndex = Math.max(state.selectedIndex - 1, 0);
      update();
      return;
    }

    if (key.name === "return" || key.name === "enter") {
      if (state.sessions[state.selectedIndex]) {
        state.showDetail = true;
        state.detailEvents = db.getSessionEvents(
          state.sessions[state.selectedIndex].session_id,
          200
        );
        applyLayout();
        update();
      }
      return;
    }
    if (key.name === "escape") {
      if (state.showDetail) {
        state.showDetail = false;
        applyLayout();
        update();
      }
      return;
    }

    if (key.name === "f") {
      if (state.sessions[state.selectedIndex]) {
        state.filterSessionId = state.sessions[state.selectedIndex].session_id;
        update();
      }
      return;
    }
    if (key.name === "F" || (key.shift && key.name === "f")) {
      state.filterSessionId = null;
      update();
      return;
    }

    if (key.name === "1") {
      state.activityWindow = 60;
      state.activityBucket = 2;
      update();
      return;
    }
    if (key.name === "2") {
      state.activityWindow = 300;
      state.activityBucket = 10;
      update();
      return;
    }
    if (key.name === "3") {
      state.activityWindow = 900;
      state.activityBucket = 30;
      update();
      return;
    }

    if (key.name === "r") {
      pollData();
      update();
      return;
    }
  });

  renderer.start();

  const pollInterval = setInterval(() => {
    pollData();
    update();
  }, 1000);

  function cleanup() {
    clearInterval(pollInterval);
    db.close();
    renderer.stop();
    renderer.destroy();
    process.exit(0);
  }

  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

main().catch((err) => {
  console.error("cctop error:", err);
  process.exit(1);
});
