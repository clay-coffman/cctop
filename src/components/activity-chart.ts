/**
 * Activity sparkline — shows event rate over time using Unicode block chars.
 *
 * ┌─ Activity (5m) ─────────────────────────────────────────┐
 * │ ▁▂▃▅█▇▃▁▁▂▄▇█▅▃▂▁▁▁▁▂▃▅▇█▇▅▃▂                        │
 * └─────────────────────────────────────────────────────────┘
 */

import { Box, Text } from "@opentui/core";
import type { ActivityBucket } from "../lib/db";
import { colors, getSessionColor } from "../lib/theme";

const SPARK_CHARS = " ▁▂▃▄▅▆▇█";

export interface ActivityChartProps {
  buckets: ActivityBucket[];
  width: number;
  windowSecs: number;
  bucketSecs: number;
}

export function createActivityChart(props: ActivityChartProps) {
  const { buckets, width, windowSecs, bucketSecs } = props;

  const chartWidth = Math.max(10, width - 6); // padding + border
  const now = Date.now() / 1000;
  const startTime = now - windowSecs;

  // Aggregate buckets into display slots
  const totalSlots = Math.floor(windowSecs / bucketSecs);
  const counts = new Array(totalSlots).fill(0);
  const slotSessions = new Array<Set<string>>(totalSlots);
  for (let i = 0; i < totalSlots; i++) {
    slotSessions[i] = new Set();
  }

  for (const b of buckets) {
    const slotIdx = Math.floor((b.bucket - startTime) / bucketSecs);
    if (slotIdx >= 0 && slotIdx < totalSlots) {
      counts[slotIdx] += b.count;
      slotSessions[slotIdx].add(b.session_id);
    }
  }

  // Resample to fit chart width
  const displayCounts = new Array(chartWidth).fill(0);
  const displaySessions = new Array<Set<string>>(chartWidth);
  for (let i = 0; i < chartWidth; i++) {
    displaySessions[i] = new Set();
  }

  for (let i = 0; i < totalSlots; i++) {
    const displayIdx = Math.floor((i / totalSlots) * chartWidth);
    if (displayIdx >= 0 && displayIdx < chartWidth) {
      displayCounts[displayIdx] += counts[i];
      for (const s of slotSessions[i]) {
        displaySessions[displayIdx].add(s);
      }
    }
  }

  // Normalize and build sparkline
  const maxCount = Math.max(1, ...displayCounts);

  let sparkline = "";
  for (let i = 0; i < chartWidth; i++) {
    const normalized = displayCounts[i] / maxCount;
    const charIdx = Math.round(normalized * (SPARK_CHARS.length - 1));
    sparkline += SPARK_CHARS[charIdx];
  }

  // Calculate peak rate
  const peakPerBucket = Math.max(...counts);
  const peakPerMin = Math.round((peakPerBucket / bucketSecs) * 60);
  const totalEvents = counts.reduce((a, b) => a + b, 0);

  const windowLabel = windowSecs >= 3600
    ? `${Math.round(windowSecs / 3600)}h`
    : `${Math.round(windowSecs / 60)}m`;

  return Box(
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
      Text({
        content: ` Activity (${windowLabel}) `,
        fg: colors.blue,
        bold: true,
      }),
      Text({
        content: `${totalEvents} events  peak: ${peakPerMin}/min `,
        fg: colors.textDim,
      })
    ),
    Text({
      content: sparkline,
      fg: colors.green,
    })
  );
}
