#!/usr/bin/env python3
"""Save one authenticated Upstash URL without echoing it or logging it."""
import argparse
import getpass
import json
import os
import sys
from pathlib import Path
from urllib.parse import urlsplit

default_dir = (Path.home() / "Library/Application Support/Codex/tcp-clean-management"
               if sys.platform == "darwin" else Path.home() / ".config/tcp-clean-management")
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--config", type=Path, default=default_dir / "runtime.json")
args = parser.parse_args()
url = os.environ.get("UPSTASH_REDIS_URL") or getpass.getpass("Upstash 연결 URL (인증 정보 포함): ")
try:
    parsed = urlsplit(url)
    if parsed.scheme not in ("rediss", "https") or not parsed.hostname or not parsed.hostname.endswith(".upstash.io") or not parsed.password:
        raise ValueError()
    port = parsed.port
except ValueError:
    raise SystemExit("인증 정보가 포함된 Upstash rediss:// 또는 https:// URL을 입력하세요.")
config = json.loads(args.config.read_text()) if args.config.exists() else {}
config['UPSTASH_REDIS_URL'] = url
if parsed.scheme == 'rediss':
    config['SPRING_DATA_REDIS_URL'] = url
args.config.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
with open(args.config, "w", opener=lambda path, flags: os.open(path, flags, 0o600)) as file:
    json.dump(config, file)
os.chmod(args.config, 0o600)
print("Upstash 연결 URL을 비공개 설정에 저장했습니다. 백엔드를 시작하거나 재시작하면 자동 동기화됩니다.")
