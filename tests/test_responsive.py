"""Layout regression: no sideways scroll, no overflow, usable touch targets and readable chart text
from 320px phones to desktop. Needs node + playwright (skipped if unavailable)."""
import json
import os
import pathlib
import shutil
import socket
import subprocess
import sys
import time

import pytest

ROOT = pathlib.Path(__file__).resolve().parents[1]


def _node_path():
    try:
        return subprocess.check_output(["npm", "root", "-g"], text=True).strip()
    except Exception:
        return ""


def _has_playwright(env):
    return shutil.which("node") and subprocess.run(["node", "-e", "require('playwright')"], env=env, capture_output=True).returncode == 0


@pytest.fixture(scope="module")
def site():
    s = socket.socket(); s.bind(("127.0.0.1", 0)); port = s.getsockname()[1]; s.close()
    proc = subprocess.Popen([sys.executable, "-m", "http.server", str(port), "--bind", "127.0.0.1", "--directory", str(ROOT / "web")],
                            stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1)
    yield f"http://127.0.0.1:{port}"
    proc.terminate()


def test_layout_holds_from_phone_to_desktop(site):
    env = {**os.environ, "NODE_PATH": _node_path()}
    if not _has_playwright(env):
        pytest.skip("node/playwright not available")
    out = subprocess.check_output(["node", str(ROOT / "tests" / "responsive_audit.js"), site], env=env, text=True, timeout=300)
    problems = json.loads(out.strip().splitlines()[-1])
    assert not problems, "\n".join(problems[:25])
