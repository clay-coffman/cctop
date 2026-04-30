/**
 * Help overlay — keybinding reference. Static content; built once and
 * shown/hidden via .visible.
 */

import { Box, Text, BoxRenderable } from "@opentui/core";
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

export class HelpPanel {
  readonly node: BoxRenderable;

  constructor(renderer: any) {
    const panelHeight = keybindings.length + 5;
    const panelWidth = 50;

    const rows = keybindings.map(([key, desc]) =>
      Box(
        { width: "100%", height: 1, flexDirection: "row", paddingLeft: 2 },
        Text({ content: key.padEnd(14), fg: colors.yellow, bold: true }),
        Text({ content: desc, fg: colors.textPrimary })
      )
    );

    this.node = new BoxRenderable(renderer, {
      position: "absolute",
      width: panelWidth,
      height: panelHeight,
      flexDirection: "column",
      borderStyle: "rounded",
      borderColor: colors.yellow,
      backgroundColor: colors.bgPanel,
      paddingLeft: 1,
      paddingRight: 1,
      visible: false,
    });

    // Build inner content via Box(...) tree and add to the real node.
    const inner = Box(
      { width: "100%", height: panelHeight, flexDirection: "column" },
      Text({ content: " Keybindings ", fg: colors.yellow, bold: true }),
      Text({ content: "", fg: colors.textMuted }),
      ...rows,
      Text({ content: "", fg: colors.textMuted }),
      Box(
        { width: "100%", flexDirection: "row", justifyContent: "center" },
        Text({ content: "Press ? or Esc to close", fg: colors.textDim })
      )
    );
    this.node.add(inner as any);
  }

  /** Reposition relative to the parent terminal size. */
  reposition(termWidth: number, termHeight: number) {
    const w = Math.min(50, termWidth - 4);
    const h = Math.min(keybindings.length + 5, termHeight - 4);
    this.node.width = w;
    this.node.height = h;
    this.node.left = Math.floor((termWidth - w) / 2);
    this.node.top = Math.floor((termHeight - h) / 2);
  }
}
