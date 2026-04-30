/**
 * Database layer for cctop — reads events from the shared SQLite DB.
 *
 * Uses Bun's built-in SQLite support (bun:sqlite) for zero-dependency reads.
 */

import { Database } from "bun:sqlite";
import { homedir } from "os";
import { join } from "path";

const DB_PATH = join(homedir(), ".cctop", "events.db");

export interface Event {
  id: number;
  timestamp: number;
  session_id: string;
  event_type: string;
  tool_name: string | null;
  tool_input_summary: string | null;
  tool_response_summary: string | null;
  cwd: string | null;
  tmux_session: string | null;
  tmux_window: string | null;
  tmux_pane: string | null;
  tmux_pane_title: string | null;
  notification_type: string | null;
  notification_message: string | null;
  prompt: string | null;
  stop_reason: string | null;
  source: string | null;
  permission_mode: string | null;
  transcript_path: string | null;
  model: string | null;
  agent_type: string | null;
  agent_id: string | null;
  tool_use_id: string | null;
  compact_trigger: string | null;
}

export interface SessionInfo {
  session_id: string;
  cwd: string;
  tmux_session: string;
  tmux_window: string;
  tmux_pane: string;
  tmux_pane_title: string;
  model: string | null;
  first_seen: number;
  last_seen: number;
  event_count: number;
  tool_call_count: number;
  last_event_type: string;
  last_tool_name: string | null;
  last_tool_input: string | null;
  last_notification_type: string | null;
  is_active: boolean;
  status: string;
}

export interface ActivityBucket {
  bucket: number; // unix timestamp of bucket start
  count: number;
  session_id: string;
}

export class CctopDB {
  private db: Database | null = null;
  private lastEventId = 0;

  open(): boolean {
    try {
      const { existsSync } = require("fs");
      if (!existsSync(DB_PATH)) {
        return false;
      }
      this.db = new Database(DB_PATH, { readonly: true });
      this.db.exec("PRAGMA journal_mode=WAL");
      this.db.exec("PRAGMA busy_timeout=5000");
      return true;
    } catch {
      return false;
    }
  }

  isOpen(): boolean {
    return this.db !== null;
  }

  /**
   * Get all active and recently active sessions.
   * A session is "active" if it has events in the last 5 minutes.
   */
  getSessions(activeWindowSecs = 300): SessionInfo[] {
    if (!this.db) return [];

    const cutoff = Date.now() / 1000 - activeWindowSecs;

    const rows = this.db
      .query(
        `
      WITH session_stats AS (
        SELECT
          session_id,
          MAX(cwd) as cwd,
          MAX(tmux_session) as tmux_session,
          MAX(tmux_window) as tmux_window,
          MAX(tmux_pane) as tmux_pane,
          MAX(tmux_pane_title) as tmux_pane_title,
          MAX(model) as model,
          MIN(timestamp) as first_seen,
          MAX(timestamp) as last_seen,
          COUNT(*) as event_count,
          COUNT(CASE WHEN event_type IN ('PreToolUse', 'PostToolUse') THEN 1 END) as tool_call_count
        FROM events
        WHERE timestamp > ?
        GROUP BY session_id
      ),
      latest_events AS (
        SELECT
          session_id,
          event_type as last_event_type,
          tool_name as last_tool_name,
          tool_input_summary as last_tool_input,
          notification_type as last_notification_type,
          ROW_NUMBER() OVER (PARTITION BY session_id ORDER BY timestamp DESC) as rn
        FROM events
        WHERE timestamp > ?
      )
      SELECT
        s.*,
        COALESCE(l.last_event_type, '') as last_event_type,
        l.last_tool_name,
        l.last_tool_input,
        l.last_notification_type
      FROM session_stats s
      LEFT JOIN latest_events l ON s.session_id = l.session_id AND l.rn = 1
      ORDER BY s.last_seen DESC
    `
      )
      .all(cutoff, cutoff) as any[];

    const now = Date.now() / 1000;
    return rows.map((r) => ({
      ...r,
      is_active: now - r.last_seen < 30, // active if event in last 30s
      status: this.deriveStatus(
        r.last_event_type,
        r.last_tool_name,
        now - r.last_seen,
        r.last_notification_type
      ),
    }));
  }

  private deriveStatus(
    lastEvent: string,
    lastTool: string | null,
    ageSecs: number,
    notificationType: string | null
  ): string {
    if (ageSecs > 120) return "idle";
    if (lastEvent === "Stop" || lastEvent === "SubagentStop") return "done";
    if (lastEvent === "StopFailure") return "error";
    if (lastEvent === "SessionEnd") return "ended";
    if (lastEvent === "Notification") {
      if (notificationType === "permission_prompt") return "waiting: perm";
      if (notificationType === "idle_prompt") return "idle prompt";
      if (notificationType?.startsWith("elicitation")) return "waiting: input";
      return "waiting";
    }
    if (lastEvent === "PreToolUse" && lastTool) return `running: ${lastTool}`;
    if (lastEvent === "PostToolUse" && lastTool) return `ran: ${lastTool}`;
    if (lastEvent === "PostToolUseFailure" && lastTool) return `failed: ${lastTool}`;
    if (lastEvent === "PostToolBatch") return "batch done";
    if (lastEvent === "PermissionDenied") return "denied";
    if (lastEvent === "UserPromptSubmit" || lastEvent === "UserPromptExpansion")
      return "processing";
    if (lastEvent === "SessionStart") return "starting";
    if (lastEvent === "PreCompact") return "compacting";
    if (lastEvent === "PostCompact") return "active";
    if (lastEvent === "SubagentStart") return "subagent running";
    if (lastEvent === "TaskCreated" || lastEvent === "TaskCompleted") return "tasking";
    if (lastEvent === "WorktreeCreate" || lastEvent === "WorktreeRemove") return "worktree";
    return lastEvent.toLowerCase();
  }

  /**
   * Get new events since last poll (for the event feed).
   */
  getNewEvents(limit = 50): Event[] {
    if (!this.db) return [];

    const rows = this.db
      .query(
        `
      SELECT * FROM events
      WHERE id > ?
      ORDER BY id DESC
      LIMIT ?
    `
      )
      .all(this.lastEventId, limit) as Event[];

    if (rows.length > 0) {
      this.lastEventId = Math.max(...rows.map((r) => r.id));
    }

    return rows.reverse(); // chronological order
  }

  /**
   * Get recent events for initial feed load.
   */
  getRecentEvents(limit = 100): Event[] {
    if (!this.db) return [];

    const rows = this.db
      .query(
        `
      SELECT * FROM events
      ORDER BY id DESC
      LIMIT ?
    `
      )
      .all(limit) as Event[];

    if (rows.length > 0) {
      this.lastEventId = Math.max(...rows.map((r) => r.id));
    }

    return rows.reverse();
  }

  /**
   * Get events for a specific session.
   */
  getSessionEvents(sessionId: string, limit = 200): Event[] {
    if (!this.db) return [];

    return this.db
      .query(
        `
      SELECT * FROM events
      WHERE session_id = ?
      ORDER BY id DESC
      LIMIT ?
    `
      )
      .all(sessionId, limit) as Event[];
  }

  /**
   * Get activity data for the sparkline chart — event counts per bucket.
   */
  getActivity(bucketSecs = 10, windowSecs = 300): ActivityBucket[] {
    if (!this.db) return [];

    const cutoff = Date.now() / 1000 - windowSecs;

    return this.db
      .query(
        `
      SELECT
        CAST(timestamp / ? AS INTEGER) * ? as bucket,
        COUNT(*) as count,
        session_id
      FROM events
      WHERE timestamp > ?
      GROUP BY bucket, session_id
      ORDER BY bucket ASC
    `
      )
      .all(bucketSecs, bucketSecs, cutoff) as ActivityBucket[];
  }

  /**
   * Get aggregate stats.
   */
  getStats(): {
    totalEvents: number;
    totalSessions: number;
    activeSessions: number;
    eventsLastMinute: number;
  } {
    if (!this.db)
      return { totalEvents: 0, totalSessions: 0, activeSessions: 0, eventsLastMinute: 0 };

    const now = Date.now() / 1000;
    const stats = this.db
      .query(
        `
      SELECT
        COUNT(*) as totalEvents,
        COUNT(DISTINCT session_id) as totalSessions,
        COUNT(DISTINCT CASE WHEN timestamp > ? THEN session_id END) as activeSessions,
        COUNT(CASE WHEN timestamp > ? THEN 1 END) as eventsLastMinute
      FROM events
    `
      )
      .get(now - 30, now - 60) as any;

    return stats || { totalEvents: 0, totalSessions: 0, activeSessions: 0, eventsLastMinute: 0 };
  }

  close() {
    this.db?.close();
    this.db = null;
  }
}
