/**
 * Help overlay — keybinding reference.
 */

import { Box, Text } from "@opentui/core";
import { colors } from "../lib/theme";

const keybindings = [
  ["j / ↓", "Move selection down"],
  ["k / ↑", "Move selection up"],
  ["Enter", "View session detail"],
  ["Esc", "Back / close detail"],
  ["f", "Filter event feed by selected session"],
  ["F", "Clear event feed filter"],
  ["r", "Force refresh"],
  ["1-3", "Activity window: 1m / 5m / 15m"],
  ["?", "Toggle this help"],
  ["q / Ctrl+C", "Quit"],
];

export function createHelpPanel(width: number, height: number) {
  const panelWidth = Math.min(50, width - 4);
  const panelHeight = Math.min(keybindings.length + 5, height - 4);

  const rows = keybindings.map(([key, desc]) =>
    Box(
      { width: "100%", height: 1, flexDirection: "row", paddingLeft: 2 },
      Text({
        content: key.padEnd(14),
        fg: colors.yellow,
        bold: true,
      }),
      Text({
        content: desc,
        fg: colors.textPrimary,
      })
    )
  );

  return Box(
    {
      position: "absolute",
      left: Math.floor((width - panelWidth) / 2),
      top: Math.floor((height - panelHeight) / 2),
      width: panelWidth,
      height: panelHeight,
      flexDirection: "column",
      borderStyle: "rounded",
      borderColor: colors.yellow,
      backgroundColor: colors.bgPanel,
      paddingLeft: 1,
      paddingRight: 1,
      paddingTop: 0,
      paddingBottom: 0,
    },
    Text({ content: " Keybindings ", fg: colors.yellow, bold: true }),
    Text({ content: "", fg: colors.textMuted }),
    ...rows,
    Text({ content: "", fg: colors.textMuted }),
    Box(
      { width: "100%", flexDirection: "row", justifyContent: "center" },
      Text({ content: "Press ? or Esc to close", fg: colors.textDim })
    )
  );
}
