#!/usr/bin/env python3
"""
Export NotebookLM auth from Windows Chrome (for WSL environments).

Connects to Chrome via CDP (Chrome DevTools Protocol), extracts Google
session cookies, and saves them as Playwright-compatible storage_state.json.

Requirements: websockets (available in bridge venv)

Usage:
  # Activate bridge venv:
  source packages/course-gen-platform/docker/notebooklm-bridge/.venv/bin/activate

  # Local auth:
  python scripts/notebooklm-export-auth.py

  # Server auth (separate Google account):
  python scripts/notebooklm-export-auth.py -o /tmp/server_storage_state.json
  scp /tmp/server_storage_state.json megacampus-prod:/opt/megacampus/secrets/notebooklm/storage_state.json
"""

import argparse
import json
import os
import subprocess
import sys
from pathlib import Path
from urllib.request import urlopen


def find_chrome_windows():
    """Find Chrome/Edge executable on Windows from WSL."""
    candidates = [
        "/mnt/c/Program Files/Google/Chrome/Application/chrome.exe",
        "/mnt/c/Program Files (x86)/Google/Chrome/Application/chrome.exe",
        "/mnt/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
        "/mnt/c/Program Files/Microsoft/Edge/Application/msedge.exe",
    ]
    for path in candidates:
        if os.path.isfile(path):
            return path
    return None


def get_windows_host_ip():
    """Get Windows host IP from WSL for CDP connection."""
    try:
        with open("/etc/resolv.conf") as f:
            for line in f:
                if line.strip().startswith("nameserver"):
                    return line.split()[1]
    except Exception:
        pass
    return "localhost"


def get_cookies_via_cdp(page_ws_url):
    """Connect to a Chrome page target via CDP and extract all cookies."""
    from websockets.sync.client import connect

    with connect(page_ws_url) as ws:
        # Enable Network domain first (required for cookie access)
        ws.send(json.dumps({"id": 1, "method": "Network.enable"}))
        json.loads(ws.recv())  # ack

        ws.send(json.dumps({"id": 2, "method": "Network.getAllCookies"}))
        response = json.loads(ws.recv())

        if "error" in response:
            raise RuntimeError(f"CDP error: {response['error']}")

        return response["result"]["cookies"]


def cdp_to_playwright_cookie(cookie):
    """Convert CDP cookie to Playwright storage_state format."""
    return {
        "name": cookie["name"],
        "value": cookie["value"],
        "domain": cookie["domain"],
        "path": cookie["path"],
        "expires": cookie.get("expires", -1),
        "httpOnly": cookie.get("httpOnly", False),
        "secure": cookie.get("secure", False),
        "sameSite": cookie.get("sameSite", "None"),
    }


def discover_cdp(port):
    """Find a page target's WebSocket URL via Chrome CDP HTTP API."""
    hosts = ["localhost"]
    win_ip = get_windows_host_ip()
    if win_ip != "localhost":
        hosts.append(win_ip)

    for host in hosts:
        try:
            # Get list of page targets (tabs)
            url = f"http://{host}:{port}/json"
            with urlopen(url, timeout=5) as resp:
                targets = json.loads(resp.read())

            # Find a page target (prefer NotebookLM tab)
            pages = [t for t in targets if t.get("type") == "page"]
            if not pages:
                print(f"  {host}:{port} - no page targets found")
                continue

            target = pages[0]
            for p in pages:
                if "notebooklm" in p.get("url", "").lower():
                    target = p
                    break

            ws_url = target["webSocketDebuggerUrl"]
            if host != "localhost":
                ws_url = ws_url.replace("localhost", host).replace(
                    "127.0.0.1", host
                )
            print(f"  Connected: {host}:{port}")
            print(f"  Target: {target.get('title', 'unknown')}")
            return ws_url
        except Exception as e:
            print(f"  {host}:{port} - {e}")

    return None


def main():
    parser = argparse.ArgumentParser(
        description="Export NotebookLM auth cookies from Windows Chrome"
    )
    parser.add_argument(
        "-o",
        "--output",
        default="./secrets/notebooklm/storage_state.json",
        help="Output path (default: ./secrets/notebooklm/storage_state.json)",
    )
    parser.add_argument(
        "--port", type=int, default=9222, help="Chrome debug port (default: 9222)"
    )
    parser.add_argument(
        "--no-launch",
        action="store_true",
        help="Don't launch Chrome, connect to already running instance",
    )
    args = parser.parse_args()

    # --- Check websockets ---
    try:
        from websockets.sync.client import connect  # noqa: F401
    except ImportError:
        print("ERROR: websockets package not found.")
        print(
            "Activate bridge venv:\n"
            "  source packages/course-gen-platform/docker/notebooklm-bridge/.venv/bin/activate"
        )
        sys.exit(1)

    # --- Step 1: Launch Chrome ---
    if not args.no_launch:
        chrome = find_chrome_windows()
        if not chrome:
            print("Chrome/Edge not found in standard Windows paths.")
            print("Launch manually from PowerShell/cmd:")
            print(
                f'  chrome.exe --remote-debugging-port={args.port} '
                f'--user-data-dir="C:\\temp\\nlm-auth" '
                f"https://notebooklm.google.com"
            )
            print(f"\nThen re-run: python {sys.argv[0]} --no-launch")
            sys.exit(1)

        # Separate profile avoids conflicts with running Chrome
        temp_profile = "C:\\temp\\nlm-auth"
        print(f"Launching {os.path.basename(chrome)} ...")
        print(f"  Debug port: {args.port}")
        print(f"  Profile:    {temp_profile}")
        subprocess.Popen(
            [
                chrome,
                f"--remote-debugging-port={args.port}",
                f"--user-data-dir={temp_profile}",
                "https://notebooklm.google.com",
            ]
        )

    # --- Step 2: Wait for login ---
    print()
    print("=" * 55)
    print("  1. Log into your Google account in the Chrome window")
    print("  2. Wait for NotebookLM page to fully load")
    print("  3. Come back here and press Enter")
    print("=" * 55)
    input("\n>>> Press Enter when logged in... ")

    # --- Step 3: Connect to CDP ---
    print("Connecting to Chrome CDP...")
    ws_url = discover_cdp(args.port)
    if not ws_url:
        print("\nFailed to connect. Make sure Chrome is running with:")
        print(f"  --remote-debugging-port={args.port}")
        sys.exit(1)

    # --- Step 4: Extract cookies ---
    print("Extracting cookies...")
    all_cookies = get_cookies_via_cdp(ws_url)

    # Filter to Google/NotebookLM domains
    google_suffixes = (".google.com", ".google.com.", ".youtube.com")
    filtered = [
        cdp_to_playwright_cookie(c)
        for c in all_cookies
        if any(c.get("domain", "").endswith(s) for s in google_suffixes)
    ]

    state = {"cookies": filtered, "origins": []}

    # --- Step 5: Save ---
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(state, indent=2))
    os.chmod(output_path, 0o600)

    print(f"\nSaved: {output_path}")
    print(f"  Cookies: {len(filtered)} of {len(all_cookies)} total")

    # Verify key Google auth cookies
    key_names = {"SID", "HSID", "SSID", "APISID", "SAPISID"}
    found = {c["name"] for c in filtered} & key_names
    missing = key_names - found
    if missing:
        print(f"  WARNING: missing key cookies: {', '.join(sorted(missing))}")
        print("  Auth may not work. Make sure you're fully logged in.")
    else:
        print("  All key auth cookies present.")

    print(f"\nFor server deploy:")
    print(
        f"  scp {args.output} "
        f"megacampus-prod:/opt/megacampus/secrets/notebooklm/storage_state.json"
    )


if __name__ == "__main__":
    main()
