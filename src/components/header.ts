/**
 * Header bar — shows app title and aggregate stats.
 *
 * ┌─── cctop ─── Active: 3 │ Sessions: 12 │ Events: 1,204 │ Rate: 42/min ────┐
 */

import { Box, Text } from "@opentui/core";
import { colors } from "../lib/theme";

export interface HeaderProps {
  activeSessions: number;
  totalSessions: number;
  totalEvents: number;
  eventsLastMinute: number;
}

export function createHeader(props: HeaderProps) {
  const statItems = [
    { label: "Active", value: String(props.activeSessions), color: colors.green },
    { label: "Sessions", value: String(props.totalSessions), color: colors.blue },
    {
      label: "Events",
      value: props.totalEvents.toLocaleString(),
      color: colors.purple,
    },
    {
      label: "Rate",
      value: `${props.eventsLastMinute}/min`,
      color: props.eventsLastMinute > 0 ? colors.yellow : colors.textDim,
    },
  ];

  return Box(
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
    // Title
    Text({
      content: " cctop ",
      fg: colors.cyan,
      bold: true,
    }),
    Text({
      content: " │ ",
      fg: colors.textMuted,
    }),
    // Stats
    ...statItems.flatMap((stat, i) => [
      Text({ content: `${stat.label}: `, fg: colors.textSecondary }),
      Text({ content: stat.value, fg: stat.color, bold: true }),
      ...(i < statItems.length - 1
        ? [Text({ content: " │ ", fg: colors.textMuted })]
        : []),
    ]),
    // Right-aligned help hint
    Box(
      { flexGrow: 1, flexDirection: "row", justifyContent: "flex-end" },
      Text({
        content: "q:quit  j/k:nav  enter:detail  ?:help",
        fg: colors.textDim,
      })
    )
  );
}
