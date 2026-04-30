/**
 * Session detail panel — shown when pressing Enter on a session.
 * Shows full session info and its event history.
 */

import { Box, Text } from "@opentui/core";
import type { SessionInfo, Event } from "../lib/db";
import {
  colors,
  getSessionColor,
  getStatusColor,
  eventIcons,
  toolIcons,
  formatDuration,
  formatTimestamp,
  formatTimeAgo,
  truncate,
  shortenPath,
  shortenSessionId,
} from "../lib/theme";

export interface SessionDetailProps {
  session: SessionInfo;
  events: Event[];
  height: number;
  width: number;
}

function createInfoRow(label: string, value: string, valueColor = colors.textPrimary) {
  return Box(
    { width: "100%", height: 1, flexDirection: "row" },
    Text({
      content: `  ${label}: `.padEnd(16),
      fg: colors.textDim,
    }),
    Text({
      content: value,
      fg: valueColor,
    })
  );
}

export function createSessionDetail(props: SessionDetailProps) {
  const { session, events, height, width } = props;
  const sessionColor = getSessionColor(session.session_id);
  const statusColor = getStatusColor(session.status);
  const now = Date.now() / 1000;
  const duration = session.last_seen - session.first_seen;

  // Info section
  const infoRows = [
    createInfoRow("Session", session.session_id, sessionColor),
    createInfoRow("Status", session.status, statusColor),
    createInfoRow("Model", session.model || "—", colors.cyan),
    createInfoRow("Project", session.cwd || "—", colors.textPrimary),
    createInfoRow(
      "Tmux",
      session.tmux_session
        ? `${session.tmux_session}:${session.tmux_window}.${session.tmux_pane}`
        : "—",
      colors.textSecondary
    ),
    createInfoRow("Duration", formatDuration(duration), colors.textSecondary),
    createInfoRow("Events", String(session.event_count), colors.purple),
    createInfoRow("Tool calls", String(session.tool_call_count), colors.green),
    createInfoRow("Last active", formatTimeAgo(session.last_seen), colors.textSecondary),
  ];

  // Event history (most recent events)
  const maxEventRows = Math.max(1, height - infoRows.length - 6);
  const recentEvents = events.slice(-maxEventRows);

  const eventRows = recentEvents.map((event) => {
    const time = formatTimestamp(event.timestamp);
    const icon = eventIcons[event.event_type] || "•";
    const toolIcon = event.tool_name ? toolIcons[event.tool_name] || "" : "";

    let detail = "";
    if (event.event_type === "UserPromptSubmit" && event.prompt) {
      detail = `"${truncate(event.prompt, 40)}"`;
    } else if (event.tool_input_summary) {
      detail = truncate(event.tool_input_summary, 40);
    } else if (event.notification_message) {
      detail = truncate(event.notification_message, 40);
    }

    return Box(
      { width: "100%", height: 1, flexDirection: "row" },
      Text({ content: `  ${time} `, fg: colors.textDim, width: 12 }),
      Text({ content: `${icon}${toolIcon} `, width: 4 }),
      Text({
        content: (event.tool_name || event.event_type).padEnd(12),
        fg: colors.textSecondary,
        width: 12,
      }),
      Text({
        content: truncate(detail, Math.max(10, width - 34)),
        fg: colors.textPrimary,
      })
    );
  });

  return Box(
    {
      width: "100%",
      height,
      flexDirection: "column",
      borderStyle: "rounded",
      borderColor: sessionColor,
      backgroundColor: colors.bgPanel,
      paddingLeft: 1,
      paddingRight: 1,
    },
    // Title
    Box(
      { width: "100%", flexDirection: "row", justifyContent: "space-between" },
      Text({
        content: ` Session: ${shortenSessionId(session.session_id)} `,
        fg: sessionColor,
        bold: true,
      }),
      Text({
        content: "esc:back ",
        fg: colors.textDim,
      })
    ),
    // Separator
    Text({ content: "─".repeat(Math.max(10, width - 4)), fg: colors.textMuted }),
    // Info section
    ...infoRows,
    // Separator
    Text({ content: "", fg: colors.textMuted }),
    Text({ content: " Recent Events:", fg: colors.textDim, bold: true }),
    // Event history
    ...eventRows
  );
}
