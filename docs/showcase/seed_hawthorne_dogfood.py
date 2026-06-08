#!/usr/bin/env python3
"""Seed a temporary Hawthorne home with rich dogfood data for screenshots."""

from __future__ import annotations

import hashlib
import json
import os
import shutil
import sqlite3
import subprocess
import sys
import uuid
import zipfile
from datetime import datetime, timedelta, timezone
from pathlib import Path

BASE_TIME = datetime(2026, 6, 8, 2, 0, tzinfo=timezone.utc)
SAFE_MARKER = ".hawthorne-dogfood-root"


def iso(minutes_ago: int) -> str:
    return (BASE_TIME - timedelta(minutes=minutes_ago)).isoformat()


def is_safe_home(path: Path) -> bool:
    if path == Path(path.anchor):
        return False
    if (path / SAFE_MARKER).exists():
        return True
    return "hawthorne" in path.name and "dogfood" in path.name


def write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, indent=2), encoding="utf-8")


def agent_slug(agent_path: Path) -> str:
    canon = agent_path.resolve()
    return hashlib.sha256(str(canon).encode()).hexdigest()[:16]


def git(cmd: list[str], cwd: Path) -> None:
    subprocess.run(["git", *cmd], cwd=cwd, check=True, stdout=subprocess.DEVNULL)


def seed_git_repo(agent: Path) -> None:
    git(["init"], agent)
    git(["config", "user.email", "dogfood@broomva.tech"], agent)
    git(["config", "user.name", "Hawthorne Dogfood"], agent)
    (agent / "README.md").write_text(
        "# Hawthorne fork dogfood\n\n"
        "This repo is seeded with real files so the Git panel shows status, log, and diffs.\n",
        encoding="utf-8",
    )
    (agent / "docs").mkdir(exist_ok=True)
    (agent / "docs" / "linear-sync-plan.md").write_text(
        "# Linear sync plan\n\n- Mirror issues\n- Verify webhook idempotency\n",
        encoding="utf-8",
    )
    git(["add", "README.md", "docs/linear-sync-plan.md"], agent)
    git(["commit", "-m", "seed: baseline hawthorne fork evidence"], agent)
    (agent / "docs" / "linear-sync-plan.md").write_text(
        "# Linear sync plan\n\n"
        "- Mirror issues into the board\n"
        "- Verify webhook idempotency ledger\n"
        "- Capture kanban screenshots with real issue content\n",
        encoding="utf-8",
    )
    (agent / "engine-note.txt").write_text(
        "Dogfood capture: engine routes are serving this working tree.\n",
        encoding="utf-8",
    )


def seed_checkpoint(home: Path, agent: Path, name: str, minutes_ago: int) -> None:
    checkpoint_id = str(uuid.uuid5(uuid.NAMESPACE_URL, f"{agent_slug(agent)}:{name}"))
    root = home / "checkpoints" / agent_slug(agent) / checkpoint_id
    root.mkdir(parents=True, exist_ok=True)
    zip_path = root / "snapshot.zip"
    with zipfile.ZipFile(zip_path, "w", compression=zipfile.ZIP_DEFLATED) as zf:
        for path in agent.rglob("*"):
            if path.is_file() and ".git" not in path.parts:
                zf.write(path, path.relative_to(agent))
    write_json(
        root / "manifest.json",
        {
            "id": checkpoint_id,
            "name": name,
            "createdAt": iso(minutes_ago),
            "sizeBytes": zip_path.stat().st_size,
        },
    )


def seed_linear(root_dir: Path) -> None:
    linear = root_dir / ".hawthorne" / "trackers" / "linear"
    now = iso(3)
    write_json(
        linear / "connection.json",
        {
            "provider": "linear",
            "org_id": "org-broomva",
            "org_name": "Broomva Labs",
            "app_user_id": "usr-julian",
            "capabilities": ["issues:read", "issues:write", "projects:read", "cycles:read"],
            "oauth_access_token_ref": "keychain:org-broomva:access",
            "oauth_refresh_token_ref": "keychain:org-broomva:refresh",
            "oauth_token_expires_at": iso(-120),
            "webhook_secret_ref": "keychain:org-broomva:webhook",
            "scopes": ["read", "write"],
            "connected_at": iso(180),
            "last_sync_at": now,
        },
    )
    write_json(
        linear / "connections" / "org-broomva.json",
        {
            "provider": "linear",
            "org_id": "org-broomva",
            "org_name": "Broomva Labs",
            "app_user_id": "usr-julian",
            "capabilities": ["issues:read", "issues:write", "projects:read", "cycles:read"],
            "oauth_access_token_ref": "keychain:org-broomva:access",
            "oauth_refresh_token_ref": "keychain:org-broomva:refresh",
            "oauth_token_expires_at": iso(-120),
            "webhook_secret_ref": "keychain:org-broomva:webhook",
            "scopes": ["read", "write"],
            "connected_at": iso(180),
            "last_sync_at": now,
        },
    )
    issues = [
        ("HWT-41", "Wire Linear delegation inbox into agent board", "started", "In Progress", 6),
        ("HWT-38", "CamelCase tracker DTO boundary", "completed", "Done", 16),
        ("HWT-35", "Add webhook replay ledger", "started", "In Review", 24),
        ("HWT-29", "Mirror Linear cycles into Hawthorne", "unstarted", "Todo", 42),
        ("HWT-22", "OAuth callback recovery path", "backlog", "Backlog", 65),
        ("HWT-18", "Per-org connection picker", "completed", "Shipped", 94),
    ]
    projected = []
    for ident, title, state_type, state, mins in issues:
        timestamp = iso(mins)
        projected.append(
            {
                "provider": "linear",
                "provider_id": f"issue-{ident.lower()}",
                "identifier": ident,
                "title": title,
                "description": f"Dogfood issue captured from seeded Linear mirror for {ident}.",
                "state": state,
                "state_type": state_type,
                "priority": 1 if state_type == "started" else 2,
                "estimate": 3 if state_type == "started" else None,
                "team_id": "team-hawthorne",
                "project_id": "project-hack-camp",
                "project_milestone_id": None,
                "cycle_id": "cycle-2026w23" if state_type in {"started", "completed"} else None,
                "parent_id": None,
                "assignee_id": "usr-julian",
                "assigned_hawthorne_agent_id": "agent-fork-operator",
                "label_ids": ["label-fork", "label-dogfood"],
                "url": f"https://linear.app/broomva/issue/{ident}",
                "created_at": iso(mins + 600),
                "updated_at": timestamp,
                "completed_at": timestamp if state_type == "completed" else None,
            }
        )
    write_json(linear / "issues.json", projected)
    write_json(linear / "org-broomva" / "issues.json", projected)


def seed_db(home: Path, session_ids: list[str], workspace_id: str, agent_id: str) -> None:
    db_path = home / "db" / "hawthorne.db"
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    try:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS chat_feed (
              id INTEGER PRIMARY KEY AUTOINCREMENT,
              claude_session_id TEXT NOT NULL,
              feed_type TEXT NOT NULL,
              data_json TEXT NOT NULL,
              source TEXT NOT NULL DEFAULT 'desktop',
              timestamp TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_chat_feed_session ON chat_feed(claude_session_id);
            CREATE TABLE IF NOT EXISTS preferences (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL
            );
            """
        )
        prefs = {
            "locale": "en",
            "legal_acceptance": json.dumps({"version": 2, "acceptedAt": iso(1)}),
            "last_workspace_id": workspace_id,
            "last_agent_id": agent_id,
            "advanced.worktrees": "true",
            "advanced.context_meter": "true",
            "advanced.git_panel": "true",
            "advanced.timeline": "true",
            "advanced.checkpoints": "true",
            "advanced.tile_layout": "true",
            "advanced.claude_hooks": "true",
            "advanced.slash_skills": "true",
        }
        for key, value in prefs.items():
            conn.execute(
                "INSERT OR REPLACE INTO preferences (key, value) VALUES (?, ?)",
                (key, value),
            )
        events = [
            ("user_message", "Run the Linear mirror smoke test and capture the real board."),
            ("assistant_text", "I found 6 mirrored issues across Todo, In progress, and Done."),
            ("tool_call", {"name": "GET /v1/trackers/linear/issues", "input": {"orgId": "org-broomva"}}),
            ("tool_result", "200 OK: 6 issues returned with camelCase providerId and updatedAt fields."),
            ("file_changes", "Modified engine/hawthorne-linear/src/models.rs and protocol DTO tests."),
            ("final_result", "Linear tracker board verified from the running engine with seeded dogfood data."),
            ("user_message", "Create a checkpoint before changing the orchestration model."),
            ("assistant_text", "Checkpoint created: before-orchestration-graft, 18.6 KB snapshot."),
        ]
        for idx, (feed_type, data) in enumerate(events):
            sid = session_ids[idx % len(session_ids)]
            conn.execute(
                "INSERT INTO chat_feed (claude_session_id, feed_type, data_json, source, timestamp) VALUES (?, ?, ?, ?, ?)",
                (sid, feed_type, json.dumps(data), "dogfood", iso(4 + idx * 3)),
            )
        conn.commit()
    finally:
        conn.close()


def main() -> int:
    if len(sys.argv) != 2:
        print("usage: seed_hawthorne_dogfood.py <HAWTHORNE_HOME>", file=sys.stderr)
        return 2
    home = Path(sys.argv[1]).expanduser().resolve()
    if home.exists():
        if not is_safe_home(home):
            print(f"refusing to delete unsafe path: {home}", file=sys.stderr)
            return 2
        shutil.rmtree(home)
    home.mkdir(parents=True, exist_ok=True)
    (home / SAFE_MARKER).write_text("safe-to-delete\n", encoding="utf-8")
    docs = home / "workspaces"
    workspace_id = "ws-hack-camp"
    workspace = docs / "Hack Camp Fork"
    agent = workspace / "Fork operator"
    reviewer = workspace / "Review sentinel"
    for directory in [agent, reviewer]:
        directory.mkdir(parents=True, exist_ok=True)
        seed_git_repo(directory)
    write_json(
        docs / "workspaces.json",
        [
            {
                "id": workspace_id,
                "name": "Hack Camp Fork",
                "isDefault": True,
                "createdAt": iso(240),
            }
        ],
    )
    write_json(workspace / ".hawthorne" / "connections.json", [])
    agents = [
        (agent, "agent-fork-operator", "Fork operator", "#2563eb"),
        (reviewer, "agent-review-sentinel", "Review sentinel", "#16a34a"),
    ]
    for directory, agent_id, name, color in agents:
        write_json(
            directory / ".hawthorne" / "agent.json",
            {
                "id": agent_id,
                "name": name,
                "config_id": "blank",
                "color": color,
                "created_at": iso(220),
                "last_opened_at": iso(2 if agent_id == "agent-fork-operator" else 18),
            },
        )
        write_json(
            directory / ".hawthorne" / "config.json",
            {
                "advanced": {
                    "worktrees": True,
                    "git_panel": True,
                    "timeline": True,
                    "checkpoints": True,
                    "context_meter": True,
                    "slash_skills": True,
                    "claude_hooks": True,
                    "tile_layout": True,
                }
            },
        )
    session_ids = ["sess-linear-board", "sess-checkpoint-graft", "sess-git-panel"]
    write_json(
        agent / ".hawthorne" / "activity" / "activity.json",
        [
            {
                "id": "act-linear-sync",
                "title": "Mirror Linear issues into Hawthorne board",
                "description": "Fetch issues, preserve workflow state, and verify the kanban columns with real issue text.",
                "status": "running",
                "claude_session_id": session_ids[0],
                "session_key": "activity-act-linear-sync",
                "agent": "execution",
                "worktree_path": str(agent),
                "updated_at": iso(4),
                "provider": "claude",
                "model": "sonnet",
            },
            {
                "id": "act-user-question",
                "title": "Resolve OAuth callback edge case",
                "description": "Needs a human decision about fallback copy for expired Linear OAuth state.",
                "status": "needs_you",
                "claude_session_id": session_ids[1],
                "session_key": "activity-act-user-question",
                "agent": "planning",
                "worktree_path": str(agent),
                "updated_at": iso(13),
                "provider": "codex",
                "model": "gpt-5",
            },
            {
                "id": "act-camelcase",
                "title": "Fix tracker DTO camelCase boundary",
                "description": "Keep snake_case on disk while returning providerId and updatedAt over HTTP.",
                "status": "done",
                "claude_session_id": session_ids[2],
                "session_key": "activity-act-camelcase",
                "agent": "execution",
                "worktree_path": str(agent),
                "updated_at": iso(35),
                "provider": "codex",
                "model": "gpt-5",
            },
        ],
    )
    write_json(
        reviewer / ".hawthorne" / "activity" / "activity.json",
        [
            {
                "id": "act-review",
                "title": "Cross-review feature flag rollout",
                "description": "Audit dark-launch flags before merging the hack camp branch.",
                "status": "done",
                "claude_session_id": "sess-cross-review",
                "session_key": "activity-act-review",
                "agent": "review",
                "worktree_path": str(reviewer),
                "updated_at": iso(52),
                "provider": "claude",
                "model": "opus",
            }
        ],
    )
    # Hawthorne's current Linear surfaces are in transition: the top-level
    # connection picker can enumerate workspace-scoped orgs, while the agent
    # board and Settings tracker page still read the selected agent folder.
    # Seed both so screenshots exercise the same routes users hit today.
    seed_linear(workspace)
    seed_linear(agent)
    seed_checkpoint(home, agent, "before orchestration graft", 40)
    seed_checkpoint(home, agent, "after Linear mirror sync", 12)
    seed_checkpoint(home, agent, "pre-release capture state", 5)
    seed_db(home, session_ids, workspace_id, "agent-fork-operator")
    print(json.dumps({"home": str(home), "workspace": str(workspace), "agent": str(agent)}, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
