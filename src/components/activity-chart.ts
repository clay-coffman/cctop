/**
 * Activity sparkline — shows event rate over time using Unicode block chars.
 *
 * ┌─ Activity (5m) ─────────────────────────────────────────┐
 * │ ▁▂▃▅█▇▃▁▁▂▄▇█▅▃▂▁▁▁▁▂▃▅▇█▇▅▃▂                        │
 * └─────────────────────────────────────────────────────────┘
 *
 * Built once. update() rewrites the title and sparkline strings via the
 * `content` setter on TextRenderable — no tree teardown.
 */

import { Box, Text, TextRenderable } from "@opentui/core";
import type { ActivityBucket } from "../lib/db";
import { colors } from "../lib/theme";

const SPARK_CHARS = " ▁▂▃▄▅▆▇█";

export interface ActivityChartProps {
  buckets: ActivityBucket[];
  width: number;
  windowSecs: number;
  bucketSecs: number;
}

export class ActivityChart {
  private titleText: TextRenderable;
  private statsText: TextRenderable;
  private sparkText: TextRenderable;
  readonly node: any;

  constructor(renderer: any) {
    this.titleText = new TextRenderable(renderer, {
      content: " Activity (5m) ",
      fg: colors.blue,
    });
    this.statsText = new TextRenderable(renderer, {
      content: "",
      fg: colors.textDim,
    });
    this.sparkText = new TextRenderable(renderer, {
      content: "",
      fg: colors.green,
    });

    this.node = Box(
      {
        width: "100%",
        height: 4,
        flexDirection: "column",
        borderStyle: "rounded",
        borderColor: colors.border,
        backgroundColor: colors.bgPanel,
        paddingLeft: 1,
        paddingRight: 1,
      },
      Box(
        { width: "100%", flexDirection: "row", justifyContent: "space-between" },
        this.titleText,
        this.statsText
      ),
      this.sparkText
    );
  }

  update(props: ActivityChartProps) {
    const { buckets, width, windowSecs, bucketSecs } = props;

    const chartWidth = Math.max(10, width - 6);
    const now = Date.now() / 1000;
    const startTime = now - windowSecs;

    const totalSlots = Math.floor(windowSecs / bucketSecs);
    const counts = new Array(totalSlots).fill(0);
    for (const b of buckets) {
      const slotIdx = Math.floor((b.bucket - startTime) / bucketSecs);
      if (slotIdx >= 0 && slotIdx < totalSlots) {
        counts[slotIdx] += b.count;
      }
    }

    const displayCounts = new Array(chartWidth).fill(0);
    for (let i = 0; i < totalSlots; i++) {
      const displayIdx = Math.floor((i / totalSlots) * chartWidth);
      if (displayIdx >= 0 && displayIdx < chartWidth) {
        displayCounts[displayIdx] += counts[i];
      }
    }

    const maxCount = Math.max(1, ...displayCounts);
    let sparkline = "";
    for (let i = 0; i < chartWidth; i++) {
      const normalized = displayCounts[i] / maxCount;
      const charIdx = Math.round(normalized * (SPARK_CHARS.length - 1));
      sparkline += SPARK_CHARS[charIdx];
    }

    const peakPerBucket = Math.max(...counts);
    const peakPerMin = Math.round((peakPerBucket / bucketSecs) * 60);
    const totalEvents = counts.reduce((a, b) => a + b, 0);
    const windowLabel =
      windowSecs >= 3600
        ? `${Math.round(windowSecs / 3600)}h`
        : `${Math.round(windowSecs / 60)}m`;

    this.titleText.content = ` Activity (${windowLabel}) `;
    this.statsText.content = `${totalEvents} events  peak: ${peakPerMin}/min `;
    this.sparkText.content = sparkline;
  }
}
