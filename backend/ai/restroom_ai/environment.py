"""Environment branch: restRoom-sensor v2 (window, faucet, leak, freeze risk 1h/3h).

Same feature arithmetic as the verified restRoom-sensor serve_live_model.py v2
(5-minute bucket means, float32 operations and the CSV text round trip used by
training), without pandas, so it runs in the same process as the app.
"""
from __future__ import annotations

import math
import warnings
from collections import defaultdict, deque
from datetime import datetime, timedelta

import joblib
import numpy as np

from . import paths

BUCKET_SECONDS = 300
HISTORY_BUCKETS = 36  # 3 hours, the longest training window
READY_BUCKETS = HISTORY_BUCKETS - 1
MAX_FILLED_GAP_BUCKETS = 6
HIGH_HUMIDITY = 85.0
MQ135_10BIT = 1023 / 4095  # training data is 10-bit; the ESP32 firmware reads 12-bit
LABELS_KO = {"window_open": "창문 열림", "faucet_on": "수도 사용", "leak_active": "누수 지속",
             "freeze_risk_1h": "1시간 동파 위험", "freeze_risk_3h": "3시간 동파 위험"}


def f32(value: float) -> float:
    return float(np.float32(value))


def csv_round_trip(value: float) -> float:
    """Training read these float32 features back from CSV text (shortest float32 repr)."""
    return float(str(np.float32(value)))


class EnvironmentBranch:
    def __init__(self, model_dir=None):
        warnings.filterwarnings("ignore", module="sklearn")
        model_dir = paths.ENVIRONMENT if model_dir is None else model_dir
        self.bundles = {t: joblib.load(model_dir / f"{t}_hist_gradient_boosting.joblib")
                        for t in paths.ENVIRONMENT_TARGETS}
        self.columns = self.bundles["leak_active"]["feature_columns"]
        self.feature_set = self.bundles["leak_active"].get("feature_set")
        if len(self.columns) != 22 or any(c.startswith("outdoor") or c.endswith("_code") for c in self.columns):
            raise ValueError("Environment models must use the 22 indoor-only features")
        self.history: dict[str, deque] = defaultdict(lambda: deque(maxlen=HISTORY_BUCKETS))
        self.current: dict[str, dict] = {}
        self.streak: dict[str, int] = defaultdict(int)

    def reset(self, device: str) -> None:
        self.current.pop(device, None)
        self.history.pop(device, None)
        self.streak.pop(device, None)

    @staticmethod
    def bucket_start(at: datetime) -> datetime:
        seconds = at.minute * 60 + at.second + at.microsecond / 1e6
        return at.replace(minute=0, second=0, microsecond=0) + timedelta(
            seconds=math.floor(seconds / BUCKET_SECONDS) * BUCKET_SECONDS)

    def _close(self, device: str) -> None:
        bucket = self.current.pop(device)
        means = {k: v / bucket["count"] for k, v in bucket["sums"].items()}
        self.history[device].append(means)
        self.streak[device] = self.streak[device] + 1 if means["humidity"] >= HIGH_HUMIDITY else 0

    def add(self, device: str, at: datetime, temperature: float, humidity: float, mq135_12bit: float,
            gas_scale: float = MQ135_10BIT) -> None:
        """Add one valid reading (any cadence; values are averaged per 5-minute bucket).
        gas_scale converts the 12-bit ESP32 reading to the 10-bit training scale (1.0 if already 10-bit)."""
        reading = {"temperature": float(temperature), "humidity": float(humidity),
                   "mq135_raw": float(mq135_12bit) * gas_scale}
        start = self.bucket_start(at)
        bucket = self.current.get(device)
        if bucket is not None and start < bucket["start"]:
            return  # late reading for a closed bucket
        if bucket is not None and start > bucket["start"]:
            last = bucket["start"]
            self._close(device)
            missing = int((start - last).total_seconds() // BUCKET_SECONDS) - 1
            if missing > MAX_FILLED_GAP_BUCKETS:
                self.history[device].clear()
                self.streak[device] = 0
            else:
                for _ in range(missing):
                    self.history[device].append(dict(self.history[device][-1]))
                    if self.history[device][-1]["humidity"] >= HIGH_HUMIDITY:
                        self.streak[device] += 1
            bucket = None
        if bucket is None:
            bucket = {"start": start, "sums": dict.fromkeys(reading, 0.0), "count": 0, "signature": None}
            self.current[device] = bucket
        signature = (at.isoformat(), *reading.values())
        if bucket["signature"] == signature:
            return
        bucket["signature"] = signature
        bucket["count"] += 1
        for key, value in reading.items():
            bucket["sums"][key] += value

    def features(self, device: str) -> tuple[dict, dict]:
        bucket = self.current[device]
        cur = {k: f32(v / bucket["count"]) for k, v in bucket["sums"].items()}
        hist = list(self.history[device])

        def delta(field, steps):
            return 0.0 if len(hist) < steps else float(np.float32(cur[field]) - np.float32(hist[-steps][field]))

        def window(field, limit):
            return [f32(item[field]) for item in hist[-(limit - 1):]] + [cur[field]]

        start = bucket["start"]
        hour = float(np.float32(start.hour) + np.float32(start.minute) / np.float32(60.0))
        streak = self.streak[device] + 1 if cur["humidity"] >= HIGH_HUMIDITY else 0
        values = {
            "temperature": cur["temperature"], "humidity": cur["humidity"],
            "temp_delta_5m": delta("temperature", 1), "temp_delta_15m": delta("temperature", 3),
            "temp_delta_60m": delta("temperature", 12),
            "humidity_delta_5m": delta("humidity", 1), "humidity_delta_15m": delta("humidity", 3),
            "humidity_delta_60m": delta("humidity", 12),
            "mq_delta_5m": delta("mq135_raw", 1), "mq_delta_15m": delta("mq135_raw", 3),
            "mq_delta_60m": delta("mq135_raw", 12),
            "temp_roll_mean_1h": float(np.mean(window("temperature", 12))),
            "temp_roll_min_3h": min(window("temperature", 36)),
            "humidity_roll_mean_1h": float(np.mean(window("humidity", 12))),
            "humidity_roll_max_1h": max(window("humidity", 12)),
            "humidity_high_duration_min": streak * 5,
            "hour_sin": math.sin(2 * math.pi * hour / 24.0), "hour_cos": math.cos(2 * math.pi * hour / 24.0),
            "month_sin": math.sin(2 * math.pi * start.month / 12.0),
            "month_cos": math.cos(2 * math.pi * start.month / 12.0),
            "weekday": start.weekday(), "is_weekend": int(start.weekday() >= 5),
        }
        values = {k: csv_round_trip(v) for k, v in values.items()}
        source = {"bucket_start": start.isoformat(), "bucket_readings": bucket["count"],
                  "history_buckets": len(hist), "ready": len(hist) >= READY_BUCKETS}
        return values, source

    def predict(self, device: str) -> dict | None:
        if device not in self.current:
            return None
        values, source = self.features(device)
        x = np.array([[values[c] for c in self.columns]], float)
        probabilities, predicted, levels = {}, {}, {}
        for target, bundle in self.bundles.items():
            p = float(bundle["model"].predict_proba(x)[0, 1])
            cut = float(bundle["thresholds"]["best_f1"]["threshold"])
            probabilities[target], predicted[target] = round(p, 5), int(p >= cut)
            if target.startswith("freeze_risk"):
                watch = float(bundle["thresholds"]["recall_90"]["threshold"])
                levels[target] = "경보" if p >= cut else "주의" if p >= watch else "없음"
        labels = [LABELS_KO[t] for t in paths.ENVIRONMENT_TARGETS if predicted[t]]
        if labels:
            decision = ", ".join(labels)
        elif source["ready"]:
            decision = "정상"
        else:
            decision = f"판단 준비 중 ({source['history_buckets']}/{READY_BUCKETS})"
        return {"ready": source["ready"], "predicted": predicted, "probabilities": probabilities,
                "freeze_levels": levels, "decision_result": decision, "source": source, "features": values}
