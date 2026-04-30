/**
 * Sessions table — the main panel showing active Claude Code instances.
 *
 * ┌─ Sessions ────────────────────────────────────────────────────────┐
 * │ TMUX         PROJECT        STATUS          TOOLS  DURATION  AGO │
 * │▸ dev:0.1     ~/my-proj      running: Bash    42    12m 30s   2s  │
 * │  work:1.0    ~/other-proj   idle              8     5m 12s  45s  │
 * └───────────────────────────────────────────────────────────────────┘
 */

import { Box, Text } from "@opentui/core";
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

export interface SessionsTableProps {
  sessions: SessionInfo[];
  selectedIndex: number;
  height: number;
}

function formatTmuxLabel(s: SessionInfo): string {
  if (s.tmux_session && s.tmux_window && s.tmux_pane) {
    return `${s.tmux_session}:${s.tmux_window}.${s.tmux_pane}`;
  }
  if (s.tmux_session) return s.tmux_session;
  return shortenSessionId(s.session_id);
}

function createColumnHeader() {
  const cols = [
    { text: "TMUX", width: 16 },
    { text: "PROJECT", width: 22 },
    { text: "STATUS", width: 20 },
    { text: "TOOLS", width: 7 },
    { text: "DURATION", width: 10 },
    { text: "LAST", width: 8 },
  ];

  return Box(
    {
      width: "100%",
      height: 1,
      flexDirection: "row",
      paddingLeft: 2,
    },
    ...cols.map((col) =>
      Text({
        content: col.text.padEnd(col.width),
        fg: colors.textDim,
        bold: true,
        width: col.width,
      })
    )
  );
}

function createSessionRow(session: SessionInfo, isSelected: boolean, index: number) {
  const sessionColor = getSessionColor(session.session_id);
  const statusColor = getStatusColor(session.status);
  const now = Date.now() / 1000;
  const duration = session.last_seen - session.first_seen;

  const indicator = isSelected ? "▸" : " ";
  const activeIndicator = session.is_active ? "●" : "○";

  return Box(
    {
      width: "100%",
      height: 1,
      flexDirection: "row",
      backgroundColor: isSelected ? colors.bgSelected : undefined,
      paddingLeft: 0,
    },
    // Selection indicator + active dot
    Text({
      content: `${indicator} `,
      fg: isSelected ? colors.blue : colors.textDim,
      width: 2,
    }),
    // Active indicator with session color
    Text({
      content: `${activeIndicator} `,
      fg: session.is_active ? sessionColor : colors.textDim,
      width: 2,
    }),
    // Tmux location
    Text({
      content: truncate(formatTmuxLabel(session), 14).padEnd(14),
      fg: sessionColor,
      bold: session.is_active,
      width: 14,
    }),
    // Project path
    Text({
      content: truncate(shortenPath(session.cwd), 20).padEnd(22),
      fg: colors.textPrimary,
      width: 22,
    }),
    // Status
    Text({
      content: truncate(session.status, 18).padEnd(20),
      fg: statusColor,
      bold: session.is_active,
      width: 20,
    }),
    // Tool calls
    Text({
      content: String(session.tool_call_count).padStart(5).padEnd(7),
      fg: colors.textSecondary,
      width: 7,
    }),
    // Duration
    Text({
      content: formatDuration(duration).padEnd(10),
      fg: colors.textSecondary,
      width: 10,
    }),
    // Last activity
    Text({
      content: formatTimeAgo(session.last_seen),
      fg: session.is_active ? colors.green : colors.textDim,
      width: 8,
    })
  );
}

export function createSessionsTable(props: SessionsTableProps) {
  const { sessions, selectedIndex, height } = props;

  // Calculate visible window (scroll if needed)
  const maxVisible = Math.max(1, height - 4); // account for border + header
  let scrollOffset = 0;
  if (selectedIndex >= scrollOffset + maxVisible) {
    scrollOffset = selectedIndex - maxVisible + 1;
  }
  if (selectedIndex < scrollOffset) {
    scrollOffset = selectedIndex;
  }

  const visibleSessions = sessions.slice(scrollOffset, scrollOffset + maxVisible);

  const children = [createColumnHeader()];

  if (visibleSessions.length === 0) {
    children.push(
      Box(
        { width: "100%", height: 3, justifyContent: "center", alignItems: "center" },
        Text({
          content: "No active sessions. Start Claude Code to see activity here.",
          fg: colors.textDim,
        })
      )
    );
  } else {
    for (let i = 0; i < visibleSessions.length; i++) {
      const globalIdx = scrollOffset + i;
      children.push(createSessionRow(visibleSessions[i], globalIdx === selectedIndex, globalIdx));
    }
  }

  // Scroll indicator
  if (sessions.length > maxVisible) {
    children.push(
      Text({
        content: ` ↕ ${scrollOffset + 1}-${Math.min(scrollOffset + maxVisible, sessions.length)} of ${sessions.length}`,
        fg: colors.textDim,
      })
    );
  }

  return Box(
    {
      width: "100%",
      height,
      flexDirection: "column",
      borderStyle: "rounded",
      borderColor: colors.border,
      backgroundColor: colors.bgPanel,
      paddingLeft: 1,
      paddingRight: 1,
    },
    // Panel title
    Text({
      content: " Sessions ",
      fg: colors.blue,
      bold: true,
    }),
    ...children
  );
}
