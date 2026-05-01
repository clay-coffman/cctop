/**
 * Session detail panel — shown when pressing Enter on a session.
 * Built once. update() mutates info row values and the recent-events list.
 */

import { Box, Text, BoxRenderable, TextRenderable } from "@opentui/core";
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

const MAX_EVENT_ROWS = 40;

class InfoRow {
  readonly node: BoxRenderable;
  readonly value: TextRenderable;

  constructor(renderer: any, label: string) {
    this.value = new TextRenderable(renderer, { content: "—", fg: colors.textPrimary });
    this.node = new BoxRenderable(renderer, {
      width: "100%",
      height: 1,
      flexDirection: "row",
    });
    const labelText = new TextRenderable(renderer, {
      content: `  ${label}: `.padEnd(16),
      fg: colors.textDim,
    });
    this.node.add(labelText);
    this.node.add(this.value);
  }

  set(content: string, fg = colors.textPrimary) {
    this.value.content = content;
    this.value.fg = fg;
  }
}

class EventRow {
  readonly node: BoxRenderable;
  private timeText: TextRenderable;
  private iconText: TextRenderable;
  private nameText: TextRenderable;
  private detailText: TextRenderable;

  constructor(renderer: any) {
    this.timeText = new TextRenderable(renderer, { content: "".padEnd(12), width: 12, fg: colors.textDim });
    this.iconText = new TextRenderable(renderer, { content: "".padEnd(4), width: 4, fg: colors.textPrimary });
    this.nameText = new TextRenderable(renderer, { content: "".padEnd(12), width: 12, fg: colors.textSecondary });
    this.detailText = new TextRenderable(renderer, { content: "", fg: colors.textPrimary });
    this.node = new BoxRenderable(renderer, {
      width: "100%",
      height: 1,
      flexDirection: "row",
      visible: false,
    });
    this.node.add(this.timeText);
    this.node.add(this.iconText);
    this.node.add(this.nameText);
    this.node.add(this.detailText);
  }

  update(event: Event, maxDetailWidth: number) {
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

    this.timeText.content = `  ${formatTimestamp(event.timestamp)} `;
    this.iconText.content = `${icon}${toolIcon} `;
    this.nameText.content = (event.tool_name || event.event_type).padEnd(12);
    this.detailText.content = truncate(detail, Math.max(10, maxDetailWidth));
    this.node.visible = true;
  }

  hide() {
    this.node.visible = false;
  }
}

export class SessionDetail {
  readonly node: BoxRenderable;
  private titleText: TextRenderable;
  private separatorText: TextRenderable;
  private rows: {
    session: InfoRow;
    status: InfoRow;
    model: InfoRow;
    project: InfoRow;
    tmux: InfoRow;
    duration: InfoRow;
    events: InfoRow;
    toolCalls: InfoRow;
    lastActive: InfoRow;
  };
  private eventsContainer: BoxRenderable;
  private eventRows: EventRow[] = [];
  private currentWidth = 80;

  constructor(renderer: any) {
    this.titleText = new TextRenderable(renderer, {
      content: " Session: — ",
      fg: colors.textPrimary,
    });
    this.separatorText = new TextRenderable(renderer, {
      content: "─".repeat(40),
      fg: colors.textMuted,
    });

    this.rows = {
      session: new InfoRow(renderer, "Session"),
      status: new InfoRow(renderer, "Status"),
      model: new InfoRow(renderer, "Model"),
      project: new InfoRow(renderer, "Project"),
      tmux: new InfoRow(renderer, "Tmux"),
      duration: new InfoRow(renderer, "Duration"),
      events: new InfoRow(renderer, "Events"),
      toolCalls: new InfoRow(renderer, "Tool calls"),
      lastActive: new InfoRow(renderer, "Last active"),
    };

    this.eventsContainer = new BoxRenderable(renderer, {
      width: "100%",
      flexGrow: 1,
      flexDirection: "column",
    });
    for (let i = 0; i < MAX_EVENT_ROWS; i++) {
      const row = new EventRow(renderer);
      this.eventRows.push(row);
      this.eventsContainer.add(row.node);
    }

    this.node = new BoxRenderable(renderer, {
      width: "100%",
      flexDirection: "column",
      borderStyle: "rounded",
      borderColor: colors.border,
      backgroundColor: colors.bgPanel,
      paddingLeft: 1,
      paddingRight: 1,
      visible: false,
    });

    const titleRow = Box(
      { width: "100%", flexDirection: "row", justifyContent: "space-between" },
      this.titleText,
      Text({ content: "esc:back ", fg: colors.textDim })
    );

    this.node.add(titleRow as any);
    this.node.add(this.separatorText);
    this.node.add(this.rows.session.node);
    this.node.add(this.rows.status.node);
    this.node.add(this.rows.model.node);
    this.node.add(this.rows.project.node);
    this.node.add(this.rows.tmux.node);
    this.node.add(this.rows.duration.node);
    this.node.add(this.rows.events.node);
    this.node.add(this.rows.toolCalls.node);
    this.node.add(this.rows.lastActive.node);
    this.node.add(new TextRenderable(renderer, { content: "", fg: colors.textMuted }));
    this.node.add(new TextRenderable(renderer, { content: " Recent Events:", fg: colors.textDim }));
    this.node.add(this.eventsContainer);
  }

  setSize(width: number, height: number) {
    this.node.width = width;
    this.node.height = height;
    this.currentWidth = width;
    this.separatorText.content = "─".repeat(Math.max(10, width - 4));
  }

  update(session: SessionInfo, events: Event[]) {
    const sessionColor = getSessionColor(session.session_id);
    const statusColor = getStatusColor(session.status);
    const duration = session.last_seen - session.first_seen;

    this.node.borderColor = sessionColor;
    this.titleText.content = ` Session: ${shortenSessionId(session.session_id)} `;
    this.titleText.fg = sessionColor;

    this.rows.session.set(session.session_id, sessionColor);
    this.rows.status.set(session.status, statusColor);
    this.rows.model.set(session.model || "—", colors.cyan);
    this.rows.project.set(session.cwd || "—", colors.textPrimary);
    this.rows.tmux.set(
      session.tmux_session
        ? `${session.tmux_session}:${session.tmux_window}.${session.tmux_pane}`
        : "—",
      colors.textSecondary
    );
    this.rows.duration.set(formatDuration(duration), colors.textSecondary);
    this.rows.events.set(String(session.event_count), colors.purple);
    this.rows.toolCalls.set(String(session.tool_call_count), colors.green);
    this.rows.lastActive.set(formatTimeAgo(session.last_seen), colors.textSecondary);

    const visible = events.slice(-MAX_EVENT_ROWS);
    const detailMax = Math.max(10, this.currentWidth - 34);
    for (let i = 0; i < this.eventRows.length; i++) {
      if (i < visible.length) {
        this.eventRows[i].update(visible[i], detailMax);
      } else {
        this.eventRows[i].hide();
      }
    }
  }
}
