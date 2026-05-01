/**
 * Header bar — shows app title and aggregate stats.
 *
 * ┌─── cctop ─── Active: 3 │ Sessions: 12 │ Events: 1,204 │ Rate: 42/min ────┐
 *
 * Built once. update() mutates the four stat texts in place via OpenTUI's
 * content/fg setters — never tears the tree down.
 */

import { Box, Text, TextRenderable, TextAttributes } from "@opentui/core";
import { colors } from "../lib/theme";

export interface HeaderProps {
  activeSessions: number;
  totalSessions: number;
  totalEvents: number;
  eventsLastMinute: number;
}

export class Header {
  private activeText: TextRenderable;
  private sessionsText: TextRenderable;
  private eventsText: TextRenderable;
  private rateText: TextRenderable;
  readonly node: any;

  constructor(renderer: any) {
    this.activeText = new TextRenderable(renderer, {
      content: "0",
      fg: colors.green,
      attributes: TextAttributes.BOLD,
    });
    this.sessionsText = new TextRenderable(renderer, {
      content: "0",
      fg: colors.blue,
      attributes: TextAttributes.BOLD,
    });
    this.eventsText = new TextRenderable(renderer, {
      content: "0",
      fg: colors.purple,
      attributes: TextAttributes.BOLD,
    });
    this.rateText = new TextRenderable(renderer, {
      content: "0/min",
      fg: colors.textDim,
      attributes: TextAttributes.BOLD,
    });

    this.node = Box(
      {
        width: "100%",
        height: 3,
        flexDirection: "row",
        alignItems: "center",
        borderStyle: "rounded",
        borderColor: colors.border,
        backgroundColor: colors.bgPanel,
        paddingLeft: 1,
        paddingRight: 1,
      },
      Text({ content: " cctop ", fg: colors.cyan, bold: true }),
      Text({ content: " │ ", fg: colors.textMuted }),
      Text({ content: "Active: ", fg: colors.textSecondary }),
      this.activeText,
      Text({ content: " │ ", fg: colors.textMuted }),
      Text({ content: "Sessions: ", fg: colors.textSecondary }),
      this.sessionsText,
      Text({ content: " │ ", fg: colors.textMuted }),
      Text({ content: "Events: ", fg: colors.textSecondary }),
      this.eventsText,
      Text({ content: " │ ", fg: colors.textMuted }),
      Text({ content: "Rate: ", fg: colors.textSecondary }),
      this.rateText,
      Box(
        { flexGrow: 1, flexDirection: "row", justifyContent: "flex-end" },
        Text({
          content: "q:quit  j/k:nav  enter:detail  ?:help",
          fg: colors.textDim,
        })
      )
    );
  }

  update(props: HeaderProps) {
    this.activeText.content = String(props.activeSessions);
    this.sessionsText.content = String(props.totalSessions);
    this.eventsText.content = props.totalEvents.toLocaleString();
    this.rateText.content = `${props.eventsLastMinute}/min`;
    this.rateText.fg = props.eventsLastMinute > 0 ? colors.yellow : colors.textDim;
  }
}
