#!/usr/bin/env python3
"""
cctop hook script — captures Claude Code hook events and writes them to SQLite.

This script is invoked by Claude Code hooks. It reads JSON from stdin,
enriches it with tmux context, and writes to ~/.cctop/events.db.

Usage in .claude/settings.json:
  "command": "python3 /path/to/cctop/hooks/capture.py"
"""

import json
import os
import random
import sqlite3
import subprocess
import sys
import time
from pathlib import Path

DB_DIR = Path.home() / ".cctop"
DB_PATH = DB_DIR / "events.db"


def get_tmux_info() -> dict:
    """Capture current tmux session/window/pane info."""
    info = {
        "tmux_session": os.environ.get("TMUX_PANE", ""),
        "tmux_window": "",
        "tmux_pane": "",
        "tmux_pane_title": "",
    }

    # If we're in tmux, get structured info
    if os.environ.get("TMUX"):
        try:
            result = subprocess.run(
                [
                    "tmux",
                    "display-message",
                    "-p",
                    "#{session_name}||#{window_index}||#{window_name}||#{pane_index}||#{pane_title}",
                ],
                capture_output=True,
                text=True,
                timeout=2,
            )
            if result.returncode == 0:
                parts = result.stdout.strip().split("||")
                if len(parts) >= 4:
                    info["tmux_session"] = parts[0]
                    info["tmux_window"] = f"{parts[1]}:{parts[2]}"
                    info["tmux_pane"] = parts[3]
                    if len(parts) >= 5:
                        info["tmux_pane_title"] = parts[4]
        except (subprocess.TimeoutExpired, FileNotFoundError):
            pass

    return info


def init_db(conn: sqlite3.Connection):
    """Create tables if they don't exist."""
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS events (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            timestamp REAL NOT NULL,
            session_id TEXT NOT NULL,
            event_type TEXT NOT NULL,
            tool_name TEXT,
            tool_input_summary TEXT,
            tool_response_summary TEXT,
            cwd TEXT,
            tmux_session TEXT,
            tmux_window TEXT,
            tmux_pane TEXT,
            tmux_pane_title TEXT,
            notification_type TEXT,
            notification_message TEXT,
            prompt TEXT,
            stop_reason TEXT,
            source TEXT,
            permission_mode TEXT,
            transcript_path TEXT,
            payload_json TEXT
        )
    """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_events_session
        ON events(session_id)
    """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_events_timestamp
        ON events(timestamp DESC)
    """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_events_type
        ON events(event_type)
    """
    )

    # Migrations for columns added after the initial schema. SQLite's
    # CREATE TABLE IF NOT EXISTS won't add new columns to an existing table,
    # so we ALTER explicitly when missing.
    existing_cols = {
        row[1] for row in conn.execute("PRAGMA table_info(events)").fetchall()
    }
    for col, typ in (
        ("model", "TEXT"),
        ("agent_type", "TEXT"),
        ("agent_id", "TEXT"),
        ("tool_use_id", "TEXT"),
        ("compact_trigger", "TEXT"),
    ):
        if col not in existing_cols:
            conn.execute(f"ALTER TABLE events ADD COLUMN {col} {typ}")

    conn.commit()


def summarize_tool_input(tool_name: str, tool_input: dict) -> str:
    """Create a short human-readable summary of the tool input."""
    if not tool_input:
        return ""

    if tool_name == "Bash":
        cmd = tool_input.get("command", "")
        return cmd[:120] + ("..." if len(cmd) > 120 else "")
    elif tool_name in ("Write", "Edit", "MultiEdit"):
        return tool_input.get("file_path", "")
    elif tool_name == "Read":
        return tool_input.get("file_path", "")
    elif tool_name in ("Glob", "Grep"):
        pattern = tool_input.get("pattern", tool_input.get("query", ""))
        return pattern[:80]
    elif tool_name == "Task":
        prompt = tool_input.get("prompt", "")
        return prompt[:100] + ("..." if len(prompt) > 100 else "")
    elif tool_name in ("WebFetch", "WebSearch"):
        return tool_input.get("url", tool_input.get("query", ""))[:100]
    else:
        # MCP tools or unknown: just show first key-value
        for k, v in tool_input.items():
            return f"{k}={str(v)[:80]}"
    return ""


def summarize_tool_response(tool_name: str, tool_response: any) -> str:
    """Create a short summary of the tool response."""
    if not tool_response:
        return ""
    if isinstance(tool_response, dict):
        if "success" in tool_response:
            return "✓" if tool_response["success"] else "✗"
        if "error" in tool_response:
            return f"err: {str(tool_response['error'])[:80]}"
    if isinstance(tool_response, str):
        return tool_response[:100]
    return ""


def main():
    DB_DIR.mkdir(parents=True, exist_ok=True)

    # Read JSON from stdin
    try:
        data = json.load(sys.stdin)
    except json.JSONDecodeError:
        sys.exit(0)  # Silently exit on bad input

    # Extract fields
    session_id = data.get("session_id", "unknown")
    event_type = data.get("hook_event_name", "Unknown")
    tool_name = data.get("tool_name", None)
    tool_input = data.get("tool_input", {})
    tool_response = data.get("tool_response", None)
    cwd = data.get("cwd", "")
    permission_mode = data.get("permission_mode", "")
    transcript_path = data.get("transcript_path", "")

    # Event-specific fields
    notification_type = data.get("notification_type", None)
    notification_message = data.get("message", None)
    prompt = data.get("prompt", None)
    stop_reason = data.get("reason", None)
    source = data.get("source", None)
    model = data.get("model", None)
    agent_type = data.get("agent_type", None)
    agent_id = data.get("agent_id", None)
    tool_use_id = data.get("tool_use_id", None)
    # JSON field is "trigger" (PreCompact: manual|auto). Column renamed because
    # TRIGGER is a SQLite reserved word.
    compact_trigger = data.get("trigger", None)

    # Enrich with tmux info
    tmux = get_tmux_info()

    # Summarize tool data
    tool_input_summary = summarize_tool_input(tool_name or "", tool_input or {})
    tool_response_summary = summarize_tool_response(
        tool_name or "", tool_response
    )

    # Write to DB
    try:
        conn = sqlite3.connect(str(DB_PATH))
        init_db(conn)
        conn.execute(
            """
            INSERT INTO events (
                timestamp, session_id, event_type, tool_name,
                tool_input_summary, tool_response_summary, cwd,
                tmux_session, tmux_window, tmux_pane, tmux_pane_title,
                notification_type, notification_message, prompt,
                stop_reason, source, permission_mode, transcript_path,
                model, agent_type, agent_id, tool_use_id, compact_trigger
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
            (
                time.time(),
                session_id,
                event_type,
                tool_name,
                tool_input_summary,
                tool_response_summary,
                cwd,
                tmux.get("tmux_session", ""),
                tmux.get("tmux_window", ""),
                tmux.get("tmux_pane", ""),
                tmux.get("tmux_pane_title", ""),
                notification_type,
                notification_message,
                prompt[:500] if prompt else None,
                stop_reason,
                source,
                permission_mode,
                transcript_path,
                model,
                agent_type,
                agent_id,
                tool_use_id,
                compact_trigger,
            ),
        )
        # Stochastic rolling-window prune: ~1 in 1000 hooks runs DELETE.
        # Keeps the DB bounded near 500k rows without tying up the writer
        # on every event. Uses the PK so it's a fast index range scan.
        if random.random() < 0.001:
            conn.execute(
                "DELETE FROM events WHERE id <= (SELECT MAX(id) FROM events) - 500000"
            )
        conn.commit()
        conn.close()
    except Exception:
        pass  # Don't break Claude Code if DB write fails

    sys.exit(0)


if __name__ == "__main__":
    main()
