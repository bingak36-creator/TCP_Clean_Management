#!/usr/bin/env python3
"""Run the backend with optional private JSON configuration and environment overrides."""
import argparse
import json
import os
from pathlib import Path

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--config", type=Path, help="Private JSON object of environment variables")
args = parser.parse_args()
backend = Path(__file__).resolve().parents[1]
env = {}
if args.config:
    env.update({key: str(value) for key, value in json.loads(args.config.read_text()).items()})
env.update(os.environ)
jars = [p for p in (backend / "build/libs").glob("*.jar") if not p.name.endswith("-plain.jar")]
if len(jars) != 1:
    raise SystemExit("Build the backend first: ./gradlew bootJar")
os.chdir(backend)
os.execvpe("java", ["java", "-jar", str(jars[0])], env)
