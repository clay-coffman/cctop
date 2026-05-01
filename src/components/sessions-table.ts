/**
 * Sessions table — the main panel showing active Claude Code instances.
 *
 * ┌─ Sessions ────────────────────────────────────────────────────────┐
 * │ TMUX         PROJECT        STATUS          TOOLS  DURATION  AGO │
 * │▸ dev:0.1     ~/my-proj      running: Bash    42    12m 30s   2s  │
 * │  work:1.0    ~/other-proj   idle              8     5m 12s  45s  │
 * └───────────────────────────────────────────────────────────────────┘
 *
 * Built once. A pool of row Boxes is pre-allocated; update() mutates the
 * visible ones and toggles `.visible` on the rest. No tree teardown.
 */

import { Box, Text, BoxRenderable, TextRenderable, TextAttributes } from "@opentui/core";
import type { SessionInfo } from "../lib/db";
import {
  colors,
  getSessionColor,
  getStatusColor,
  formatDuration,
  formatTimeAgo,
  shortenPath,
  shortenSessionId,
  truncate,
} from "../lib/theme";

const MAX_ROWS = 30;

function formatTmuxLabel(s: SessionInfo): string {
  if (s.tmux_session && s.tmux_window && s.tmux_pane) {
    return `${s.tmux_session}:${s.tmux_window}.${s.tmux_pane}`;
  }
  if (s.tmux_session) return s.tmux_session;
  return shortenSessionId(s.session_id);
}

class Row {
  readonly node: BoxRenderable;
  private indicator: TextRenderable;
  private activeIndicator: TextRenderable;
  private tmux: TextRenderable;
  private project: TextRenderable;
  private status: TextRenderable;
  private tools: TextRenderable;
  private duration: TextRenderable;
  private ago: TextRenderable;

  constructor(renderer: any) {
    this.indicator = new TextRenderable(renderer, { content: "  ", width: 2, fg: colors.textDim });
    this.activeIndicator = new TextRenderable(renderer, { content: "  ", width: 2, fg: colors.textDim });
    this.tmux = new TextRenderable(renderer, { content: "".padEnd(14), width: 14, fg: colors.textPrimary });
    this.project = new TextRenderable(renderer, { content: "".padEnd(22), width: 22, fg: colors.textPrimary });
    this.status = new TextRenderable(renderer, { content: "".padEnd(20), width: 20, fg: colors.textSecondary });
    this.tools = new TextRenderable(renderer, { content: "".padEnd(7), width: 7, fg: colors.textSecondary });
    this.duration = new TextRenderable(renderer, { content: "".padEnd(10), width: 10, fg: colors.textSecondary });
    this.ago = new TextRenderable(renderer, { content: "".padEnd(8), width: 8, fg: colors.textDim });

    this.node = new BoxRenderable(renderer, {
      width: "100%",
      height: 1,
      flexDirection: "row",
      paddingLeft: 0,
      visible: false,
    });
    this.node.add(this.indicator);
    this.node.add(this.activeIndicator);
    this.node.add(this.tmux);
    this.node.add(this.project);
    this.node.add(this.status);
    this.node.add(this.tools);
    this.node.add(this.duration);
    this.node.add(this.ago);
  }

  update(session: SessionInfo, isSelected: boolean) {
    const sessionColor = getSessionColor(session.session_id);
    const statusColor = getStatusColor(session.status);
    const duration = session.last_seen - session.first_seen;

    this.indicator.content = isSelected ? "▸ " : "  ";
    this.indicator.fg = isSelected ? colors.blue : colors.textDim;

    this.activeIndicator.content = session.is_active ? "● " : "○ ";
    this.activeIndicator.fg = session.is_active ? sessionColor : colors.textDim;

    this.tmux.content = truncate(formatTmuxLabel(session), 14).padEnd(14);
    this.tmux.fg = sessionColor;

    this.project.content = truncate(shortenPath(session.cwd), 20).padEnd(22);

    this.status.content = truncate(session.status, 18).padEnd(20);
    this.status.fg = statusColor;

    this.tools.content = String(session.tool_call_count).padStart(5).padEnd(7);
    this.duration.content = formatDuration(duration).padEnd(10);

    this.ago.content = formatTimeAgo(session.last_seen);
    this.ago.fg = session.is_active ? colors.green : colors.textDim;

    this.node.backgroundColor = isSelected ? colors.bgSelected : (undefined as any);
    this.node.visible = true;
  }

  hide() {
    this.node.visible = false;
  }
}

export class SessionsTable {
  readonly node: any;
  private rows: Row[] = [];
  private rowsContainer: BoxRenderable;
  private emptyText: TextRenderable;
  private scrollText: TextRenderable;

  constructor(renderer: any) {
    this.rowsContainer = new BoxRenderable(renderer, {
      width: "100%",
      flexGrow: 1,
      flexDirection: "column",
    });
    for (let i = 0; i < MAX_ROWS; i++) {
      const row = new Row(renderer);
      this.rows.push(row);
      this.rowsContainer.add(row.node);
    }

    this.emptyText = new TextRenderable(renderer, {
      content: "  No active sessions. Start Claude Code to see activity here.",
      fg: colors.textDim,
      visible: false,
    });
    this.scrollText = new TextRenderable(renderer, {
      content: "",
      fg: colors.textDim,
      visible: false,
    });

    const columnHeader = Box(
      { width: "100%", height: 1, flexDirection: "row", paddingLeft: 2 },
      Text({ content: "TMUX".padEnd(16), fg: colors.textDim, bold: true, width: 16 }),
      Text({ content: "PROJECT".padEnd(22), fg: colors.textDim, bold: true, width: 22 }),
      Text({ content: "STATUS".padEnd(20), fg: colors.textDim, bold: true, width: 20 }),
      Text({ content: "TOOLS".padEnd(7), fg: colors.textDim, bold: true, width: 7 }),
      Text({ content: "DURATION".padEnd(10), fg: colors.textDim, bold: true, width: 10 }),
      Text({ content: "LAST".padEnd(8), fg: colors.textDim, bold: true, width: 8 })
    );

    this.node = Box(
      {
        width: "100%",
        flexDirection: "column",
        borderStyle: "rounded",
        borderColor: colors.border,
        backgroundColor: colors.bgPanel,
        paddingLeft: 1,
        paddingRight: 1,
      },
      Text({ content: " Sessions ", fg: colors.blue, bold: true }),
      columnHeader,
      this.rowsContainer,
      this.emptyText,
      this.scrollText
    );
  }

  /** Resize the panel itself (called on terminal resize / detail toggle). */
  setHeight(h: number) {
    this.node.height = h;
  }

  update(sessions: SessionInfo[], selectedIndex: number, height: number) {
    const maxVisible = Math.max(1, Math.min(MAX_ROWS, height - 4));
    let scrollOffset = 0;
    if (selectedIndex >= scrollOffset + maxVisible) {
      scrollOffset = selectedIndex - maxVisible + 1;
    }
    if (selectedIndex < scrollOffset) scrollOffset = selectedIndex;

    const visible = sessions.slice(scrollOffset, scrollOffset + maxVisible);

    this.emptyText.visible = visible.length === 0;

    for (let i = 0; i < this.rows.length; i++) {
      if (i < visible.length) {
        this.rows[i].update(visible[i], scrollOffset + i === selectedIndex);
      } else {
        this.rows[i].hide();
      }
    }

    if (sessions.length > maxVisible) {
      this.scrollText.visible = true;
      this.scrollText.content = ` ↕ ${scrollOffset + 1}-${Math.min(scrollOffset + maxVisible, sessions.length)} of ${sessions.length}`;
    } else {
      this.scrollText.visible = false;
    }
  }
}
