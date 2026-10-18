"""Private JSON-lines inference worker. stdout is protocol-only; no network listener."""
from __future__ import annotations

import hashlib
import json
import sys
from collections import OrderedDict
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

from restroom_ai.environment import EnvironmentBranch
from restroom_ai.model import RestroomJudge
from restroom_ai.sensors import dht_valid, dht_model

ROOT = Path(__file__).resolve().parent
KST = ZoneInfo("Asia/Seoul")
ALERT_TYPES = {"leak": "LEAK", "leak_check": "LEAK", "freeze_1h": "FREEZE",
               "freeze_window": "FREEZE", "freeze_3h": "FREEZE", "freeze_watch": "FREEZE",
               "window_open": "WINDOW"}


def verify_models(root=ROOT):
    manifest = json.loads((root / "manifest.json").read_text())
    for name, expected in manifest["sha256"].items():
        if hashlib.sha256((root / name).read_bytes()).hexdigest() != expected:
            raise ValueError("Bundled AI artifact checksum mismatch: " + name)
    return manifest["model_version"]


class Predictor:
    def __init__(self):
        self.version = verify_models()
        self.environment = EnvironmentBranch()
        self.judges = {}
        self.last_at = {}
        self.cache = OrderedDict()

    def predict(self, request):
        key = str(request["id"])
        fingerprint = json.dumps(request, sort_keys=True, separators=(",", ":"))
        if key in self.cache:
            previous, result = self.cache[key]
            if previous != fingerprint:
                raise ValueError("Conflicting inference request ID")
            self.cache.move_to_end(key)
            return result
        device = str(request["device_id"])
        if not device or len(device) > 128:
            raise ValueError("Invalid device ID")
        at = datetime.fromisoformat(request["measured_at"].replace("Z", "+00:00"))
        if at.tzinfo is None:
            raise ValueError("An explicit UTC offset is required")
        at = at.astimezone(KST)
        if device in self.last_at and at <= self.last_at[device]:
            raise ValueError("Out-of-order AI sample")
        sensor_model = dht_model(request["sensor_model"])
        if not dht_valid(request["temperature"], request["humidity"], sensor_model):
            raise ValueError("Invalid temperature/humidity for " + sensor_model)
        if device not in self.judges:
            if len(self.judges) >= 1000:
                raise ValueError("AI device capacity reached")
            self.judges[device] = RestroomJudge(device, situations=False,
                    environment=self.environment, basic_warmup=True)
        result = self.judges[device].add_basic(at, float(request["temperature"]),
                float(request["humidity"]), float(request["gas"]),
                sensor_model=sensor_model)
        self.last_at[device] = at
        result["model_version"] = self.version
        if result.get("environment"):
            result["environment"].pop("features", None)
        result["alerts"] = [{"type": ALERT_TYPES[item["code"]], "level": item["level"],
                             "message": item["message"]} for item in result["items"]
                            if item["code"] in ALERT_TYPES and item["level"] in ("주의", "긴급")]
        self.cache[key] = (fingerprint, result)
        while len(self.cache) > 4096:
            self.cache.popitem(last=False)
        return result


def main():
    predictor = Predictor()
    print(json.dumps({"type": "ready", "model_version": predictor.version,
                      "models_loaded": len(predictor.environment.bundles)}), flush=True)
    for line in sys.stdin:
        request_id = None
        try:
            request = json.loads(line)
            request_id = str(request["id"])
            result = predictor.predict(request)
            response = {"id": request_id, "ok": True, "result": result}
        except (ValueError, KeyError, TypeError, OverflowError) as error:
            response = {"id": request_id, "ok": False, "error": str(error)}
        print(json.dumps(response, ensure_ascii=False, allow_nan=False), flush=True)


if __name__ == "__main__":
    main()
