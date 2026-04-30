/**
 * Event feed — live scrolling log of events across all sessions.
 *
 * ┌─ Event Feed ──────────────────────────────────────────────────────┐
 * │ 14:32:05  🔧 abc123  Bash      npm test                         │
 * │ 14:32:06  ✅ abc123  Bash      ✓                                │
 * │ 14:32:08  💬 def456  —         Refactor the auth module          │
 * └───────────────────────────────────────────────────────────────────┘
 */

import { Box, Text } from "@opentui/core";
import type { Event } from "../lib/db";
import {
  colors,
  getSessionColor,
  eventIcons,
  notificationIcons,
  toolIcons,
  formatTimestamp,
  truncate,
  shortenSessionId,
} from "../lib/theme";

export interface EventFeedProps {
  events: Event[];
  height: number;
  filterSessionId?: string | null;
}

function formatEventLine(event: Event, maxWidth: number) {
  const time = formatTimestamp(event.timestamp);
  const icon =
    event.event_type === "Notification" && event.notification_type
      ? notificationIcons[event.notification_type] || eventIcons.Notification || "•"
      : eventIcons[event.event_type] || "•";
  const toolIcon = event.tool_name ? toolIcons[event.tool_name] || "" : "";
  const sessionColor = getSessionColor(event.session_id);
  const sessionLabel = shortenSessionId(event.session_id);

  // Build the detail string based on event type
  let detail = "";
  if (event.event_type === "UserPromptSubmit" && event.prompt) {
    detail = `"${truncate(event.prompt, 60)}"`;
  } else if (event.notification_message) {
    detail = truncate(event.notification_message, 60);
  } else if (event.tool_input_summary) {
    detail = truncate(event.tool_input_summary, 50);
  } else if (event.stop_reason) {
    detail = `reason: ${event.stop_reason}`;
  } else if (event.source) {
    detail = event.source;
  }

  // Tool response on PostToolUse
  let response = "";
  if (event.event_type === "PostToolUse" && event.tool_response_summary) {
    response = ` → ${event.tool_response_summary}`;
  }

  const toolName = event.tool_name || "—";

  return Box(
    {
      width: "100%",
      height: 1,
      flexDirection: "row",
    },
    // Timestamp
    Text({
      content: time + " ",
      fg: colors.textDim,
      width: 10,
    }),
    // Event icon
    Text({
      content: `${icon}${toolIcon} `,
      width: 4,
    }),
    // Session ID (colored)
    Text({
      content: sessionLabel.padEnd(9),
      fg: sessionColor,
      width: 9,
    }),
    // Tool name
    Text({
      content: truncate(toolName, 12).padEnd(13),
      fg: event.event_type === "PostToolUseFailure" ? colors.red : colors.textSecondary,
      width: 13,
    }),
    // Detail
    Text({
      content: truncate(detail + response, Math.max(10, maxWidth - 40)),
      fg:
        event.event_type === "UserPromptSubmit"
          ? colors.cyan
          : event.event_type === "PostToolUseFailure"
            ? colors.red
            : colors.textPrimary,
    })
  );
}

export function createEventFeed(props: EventFeedProps) {
  const { events, height, filterSessionId } = props;

  const filteredEvents = filterSessionId
    ? events.filter((e) => e.session_id === filterSessionId)
    : events;

  // Show most recent events that fit in the panel
  const maxVisible = Math.max(1, height - 3); // border + title
  const visibleEvents = filteredEvents.slice(-maxVisible);

  const title = filterSessionId
    ? ` Events: ${shortenSessionId(filterSessionId)} `
    : " Event Feed ";

  const children = [];

  if (visibleEvents.length === 0) {
    children.push(
      Box(
        { width: "100%", height: 1, alignItems: "center" },
        Text({
          content: "Waiting for events...",
          fg: colors.textDim,
        })
      )
    );
  } else {
    for (const event of visibleEvents) {
      children.push(formatEventLine(event, 100));
    }
  }

  return Box(
    {
      width: "100%",
      height,
      flexDirection: "column",
      borderStyle: "rounded",
      borderColor: filterSessionId ? colors.borderFocus : colors.border,
      backgroundColor: colors.bgPanel,
      paddingLeft: 1,
      paddingRight: 1,
    },
    Text({
      content: title,
      fg: filterSessionId ? colors.cyan : colors.blue,
      bold: true,
    }),
    ...children
  );
}
