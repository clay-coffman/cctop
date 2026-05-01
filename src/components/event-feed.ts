/**
 * Event feed — live scrolling log of events across all sessions.
 *
 * Built once. A pool of N row Boxes (sized to the panel height on update())
 * is mutated; nothing is torn down.
 */

import { Box, Text, BoxRenderable, TextRenderable } from "@opentui/core";
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

const MAX_ROWS = 60;

class FeedRow {
  readonly node: BoxRenderable;
  private timeText: TextRenderable;
  private iconText: TextRenderable;
  private sessionText: TextRenderable;
  private toolText: TextRenderable;
  private detailText: TextRenderable;

  constructor(renderer: any) {
    this.timeText = new TextRenderable(renderer, { content: "".padEnd(10), width: 10, fg: colors.textDim });
    this.iconText = new TextRenderable(renderer, { content: "".padEnd(4), width: 4, fg: colors.textPrimary });
    this.sessionText = new TextRenderable(renderer, { content: "".padEnd(9), width: 9, fg: colors.textPrimary });
    this.toolText = new TextRenderable(renderer, { content: "".padEnd(13), width: 13, fg: colors.textSecondary });
    this.detailText = new TextRenderable(renderer, { content: "", fg: colors.textPrimary });

    this.node = new BoxRenderable(renderer, {
      width: "100%",
      height: 1,
      flexDirection: "row",
      visible: false,
    });
    this.node.add(this.timeText);
    this.node.add(this.iconText);
    this.node.add(this.sessionText);
    this.node.add(this.toolText);
    this.node.add(this.detailText);
  }

  update(event: Event, maxDetailWidth: number) {
    const time = formatTimestamp(event.timestamp);
    const icon =
      event.event_type === "Notification" && event.notification_type
        ? notificationIcons[event.notification_type] || eventIcons.Notification || "•"
        : eventIcons[event.event_type] || "•";
    const toolIcon = event.tool_name ? toolIcons[event.tool_name] || "" : "";

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

    let response = "";
    if (event.event_type === "PostToolUse" && event.tool_response_summary) {
      response = ` → ${event.tool_response_summary}`;
    }

    const toolName = event.tool_name || "—";

    this.timeText.content = time + " ";
    this.iconText.content = `${icon}${toolIcon} `;
    this.sessionText.content = shortenSessionId(event.session_id).padEnd(9);
    this.sessionText.fg = getSessionColor(event.session_id);
    this.toolText.content = truncate(toolName, 12).padEnd(13);
    this.toolText.fg =
      event.event_type === "PostToolUseFailure" ? colors.red : colors.textSecondary;
    this.detailText.content = truncate(detail + response, Math.max(10, maxDetailWidth));
    this.detailText.fg =
      event.event_type === "UserPromptSubmit"
        ? colors.cyan
        : event.event_type === "PostToolUseFailure"
          ? colors.red
          : colors.textPrimary;

    this.node.visible = true;
  }

  hide() {
    this.node.visible = false;
  }
}

export class EventFeed {
  readonly node: any;
  private rows: FeedRow[] = [];
  private rowsContainer: BoxRenderable;
  private titleText: TextRenderable;
  private emptyText: TextRenderable;
  private outerBox: BoxRenderable;

  constructor(renderer: any) {
    this.titleText = new TextRenderable(renderer, {
      content: " Event Feed ",
      fg: colors.blue,
    });
    this.emptyText = new TextRenderable(renderer, {
      content: "Waiting for events...",
      fg: colors.textDim,
      visible: false,
    });

    this.rowsContainer = new BoxRenderable(renderer, {
      width: "100%",
      flexGrow: 1,
      flexDirection: "column",
    });
    for (let i = 0; i < MAX_ROWS; i++) {
      const row = new FeedRow(renderer);
      this.rows.push(row);
      this.rowsContainer.add(row.node);
    }

    this.outerBox = new BoxRenderable(renderer, {
      width: "100%",
      flexDirection: "column",
      borderStyle: "rounded",
      borderColor: colors.border,
      backgroundColor: colors.bgPanel,
      paddingLeft: 1,
      paddingRight: 1,
    });
    this.outerBox.add(this.titleText);
    this.outerBox.add(this.emptyText);
    this.outerBox.add(this.rowsContainer);
    this.node = this.outerBox;
  }

  setHeight(h: number) {
    this.outerBox.height = h;
  }

  update(events: Event[], filterSessionId: string | null, height: number, maxDetailWidth = 60) {
    const filtered = filterSessionId
      ? events.filter((e) => e.session_id === filterSessionId)
      : events;
    const maxVisible = Math.max(1, Math.min(MAX_ROWS, height - 3));
    const visible = filtered.slice(-maxVisible);

    this.titleText.content = filterSessionId
      ? ` Events: ${shortenSessionId(filterSessionId)} `
      : " Event Feed ";
    this.titleText.fg = filterSessionId ? colors.cyan : colors.blue;
    this.outerBox.borderColor = filterSessionId ? colors.borderFocus : colors.border;

    this.emptyText.visible = visible.length === 0;

    for (let i = 0; i < this.rows.length; i++) {
      if (i < visible.length) {
        this.rows[i].update(visible[i], maxDetailWidth);
      } else {
        this.rows[i].hide();
      }
    }
  }
}
