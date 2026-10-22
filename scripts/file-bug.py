#!/usr/bin/env python3
"""File a GitHub issue and start the Pond bug cloud agent on it.

Reads ANTHROPIC_API_KEY, GITHUB_AGENT_TOKEN, CLAUDE_ENVIRONMENT_ID,
CLAUDE_VAULT_ID, and CLAUDE_AGENT_ID from the environment, then from
.env.local for any name still missing. Never prints those values.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
import urllib.error
import urllib.request
from pathlib import Path

KEYS = (
    "ANTHROPIC_API_KEY",
    "GITHUB_AGENT_TOKEN",
    "CLAUDE_ENVIRONMENT_ID",
    "CLAUDE_VAULT_ID",
    "CLAUDE_AGENT_ID",
)
REPO = "pfaff-designed/Pond-v4"
REPO_URL = f"https://github.com/{REPO}"
API = "https://api.anthropic.com/v1/sessions"
BETA = "managed-agents-2026-04-01"


def repo_root() -> Path:
    completed = subprocess.run(
        ["git", "rev-parse", "--show-toplevel"],
        check=True,
        capture_output=True,
        text=True,
    )
    return Path(completed.stdout.strip())


def load_config(root: Path) -> dict[str, str]:
    import os

    found: dict[str, str] = {}
    for key in KEYS:
        value = os.environ.get(key, "").strip()
        if value:
            found[key] = value

    env_file = root / ".env.local"
    if env_file.is_file():
        for line in env_file.read_text().splitlines():
            if not line or line.startswith("#") or "=" not in line:
                continue
            name, value = line.split("=", 1)
            value = value.strip()
            if len(value) >= 2 and value[0] == value[-1] and value[0] in {'"', "'"}:
                value = value[1:-1]
            if name in KEYS and name not in found and value:
                found[name] = value

    missing = [key for key in KEYS if key not in found]
    if missing:
        joined = ", ".join(missing)
        sys.exit(f"missing {joined} in the environment or .env.local")
    return found


def redact(text: str, secrets: list[str]) -> str:
    redacted = text
    for secret in secrets:
        if secret:
            redacted = redacted.replace(secret, "[redacted]")
    return redacted


def create_issue(title: str, body: str) -> str:
    completed = subprocess.run(
        ["gh", "issue", "create", "--repo", REPO, "--title", title, "--label", "bug", "--body", body],
        capture_output=True,
        text=True,
    )
    if completed.returncode != 0:
        detail = (completed.stderr or completed.stdout).strip()
        sys.exit(f"could not create the issue:\n{detail}")
    match = re.search(r"https://github\.com/\S+/issues/\d+", completed.stdout)
    if match is None:
        sys.exit(f"issue create returned no url:\n{completed.stdout.strip()}")
    return match.group(0)


def start_session(config: dict[str, str], title: str, body: str, issue_url: str) -> str:
    number = issue_url.rstrip("/").rsplit("/", 1)[-1]
    prompt = (
        f"Fix GitHub issue #{number}: {issue_url}\n\n"
        f"{title}\n\n"
        f"{body}"
    )
    payload = {
        "agent": config["CLAUDE_AGENT_ID"],
        "environment_id": config["CLAUDE_ENVIRONMENT_ID"],
        "vault_ids": [config["CLAUDE_VAULT_ID"]],
        "title": title[:500],
        "resources": [
            {
                "type": "github_repository",
                "url": REPO_URL,
                "mount_path": "/workspace/repo",
                "authorization_token": config["GITHUB_AGENT_TOKEN"],
                "checkout": {"type": "branch", "name": "main"},
            }
        ],
        "initial_events": [
            {
                "type": "user.message",
                "content": [{"type": "text", "text": prompt}],
            }
        ],
    }
    request = urllib.request.Request(
        API,
        data=json.dumps(payload).encode(),
        headers={
            "x-api-key": config["ANTHROPIC_API_KEY"],
            "anthropic-version": "2023-06-01",
            "anthropic-beta": BETA,
            "content-type": "application/json",
        },
        method="POST",
    )
    secrets = [config["ANTHROPIC_API_KEY"], config["GITHUB_AGENT_TOKEN"]]
    try:
        with urllib.request.urlopen(request, timeout=120) as response:
            session = json.load(response)
    except urllib.error.HTTPError as error:
        detail = redact(error.read().decode()[:2000], secrets)
        sys.exit(
            f"issue: {issue_url}\n"
            "session: failed\n"
            f"the issue exists and the agent did not start ({error.code}):\n{detail}"
        )
    session_id = session.get("id")
    if not isinstance(session_id, str) or not session_id:
        sys.exit(f"issue: {issue_url}\nsession: failed\nno session id in the response")
    return session_id


def main() -> None:
    parser = argparse.ArgumentParser(description="File a bug and start the Pond bug agent.")
    parser.add_argument("--title", help="Issue title")
    parser.add_argument(
        "--check",
        action="store_true",
        help="Confirm the keys and gh auth are present, then exit",
    )
    args = parser.parse_args()

    config = load_config(repo_root())
    if args.check:
        login = subprocess.run(
            ["gh", "api", "user", "--jq", ".login"],
            capture_output=True,
            text=True,
            check=False,
        )
        if login.returncode != 0:
            sys.exit("gh is not authenticated")
        print(f"ready as {login.stdout.strip()}")
        print(f"agent: {config['CLAUDE_AGENT_ID']}")
        print(f"environment: {config['CLAUDE_ENVIRONMENT_ID']}")
        print(f"vault: {config['CLAUDE_VAULT_ID']}")
        return

    if not args.title or not args.title.strip():
        sys.exit("a title is required")
    body = sys.stdin.read().strip()
    if not body:
        sys.exit("a report on stdin is required")

    issue_url = create_issue(args.title.strip(), body)
    session_id = start_session(config, args.title.strip(), body, issue_url)
    print(f"issue: {issue_url}")
    print(f"session: {session_id}")
    print(f"transcript: https://platform.claude.com/workspaces/default/sessions/{session_id}")


if __name__ == "__main__":
    main()
