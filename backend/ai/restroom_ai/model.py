"""RestroomJudge: the single entry point of restroom_ai.

Two kinds of input:
  full  — 5-second rows in the 18-channel observation format (MQ135, MQ-7 heater
          cycle, DHT11). Both branches run: 11 situations (Duo Fusion), the dedicated
          smoking detector (흡연 경보 / 흡연 의심), and window / faucet / leak / freeze
          risk. Output every 15 seconds.
  basic — temperature, humidity and gas (MQ135) only, as the team backend
          (TCP_Clean_Management) collects today. Only the environment branch runs.
"""
from __future__ import annotations

import math
from datetime import datetime, timedelta

from . import paths
from .environment import EnvironmentBranch
from .integrate import LeakTimer, combine
from .sensors import MQ135Warmup, dht_model, dht_valid
from .smoking_detector import KEYS as DETECTOR_KEYS
from .smoking_detector import SmokingDetector
from .smoking_detector import load as load_detector

_DETECTOR = None


def detector() -> SmokingDetector | None:
    """A new per-device smoking detector (models/situation/smoking_detector.*), or None if not installed."""
    global _DETECTOR
    if _DETECTOR is None:
        _DETECTOR = load_detector(paths.SITUATION) or False
    return SmokingDetector(*_DETECTOR) if _DETECTOR else None

OBSERVATION_CHANNELS = (
    "mq135_adc", "mq135_valid", "mq7_adc", "mq7_qualified", "mq7_last_qualified_adc", "mq7_new_qualified",
    "mq7_last_measurement_index", "mq7_last_measurement_time_s", "mq7_sample_age_s", "mq7_available",
    "mq7_low_phase", "mq7_phase_s", "mq7_cycle_id", "mq7_window_eligible", "temperature_c",
    "relative_humidity_pct", "dht_valid", "dht_sample_age_s")


class RestroomJudge:
    def __init__(self, device_id: str, situations: bool = True, environment: EnvironmentBranch | None = None,
                 basic_warmup: bool = False):
        self.device_id = device_id
        self.env = environment or EnvironmentBranch()
        self.duo = None
        self.smoking = None
        if situations:
            from .duo import DuoFusionStream
            self.duo = DuoFusionStream()
            self.smoking = detector()
        self.leak = LeakTimer()
        self.rows_seen = 0
        self.mq7_seen = False
        self.warmup = MQ135Warmup() if basic_warmup else None
        self.basic_at = None

    def __enter__(self):
        return self

    def __exit__(self, *exc):
        self.close()

    def _merge(self, at: datetime, duo: dict | None, temperature: float | None) -> dict:
        env = self.env.predict(self.device_id)
        # Keep qualified MQ-7 streams unchanged, including their startup decisions.
        if duo is not None and not self.mq7_seen and env and env["ready"]:
            duo = None
        leak = bool(env and env["ready"] and env["predicted"]["leak_active"])
        result = combine(at, self.device_id, duo, env, self.leak.next(leak, at), temperature)
        if env:
            result["environment"]["features"] = env["features"]
        return result

    def step(self, observed: dict, timestamps: list[datetime], *,
             sensor_model: str = "DHT11", environment_dht_valid=None) -> list[dict]:
        """full input: consecutive 5-second rows; returns one result per new 15-second decision."""
        if self.duo is None:
            raise RuntimeError("This judge was created without the situation branch")
        missing = set(OBSERVATION_CHANNELS) - set(observed)
        if missing:
            raise ValueError(f"Missing observation channels: {sorted(missing)}")
        sensor_model = dht_model(sensor_model)
        if sensor_model == "DHT22" and environment_dht_valid is None:
            raise ValueError("DHT22 full input requires environment_dht_valid (fresh successful readings)")
        n = len(observed["mq135_adc"])
        if any(len(observed[k]) != n for k in OBSERVATION_CHANNELS):
            raise ValueError("Observation channels must have equal lengths")
        if environment_dht_valid is not None and len(environment_dht_valid) != n:
            raise ValueError("One environment DHT validity flag per row is required")
        if len(timestamps) != n:
            raise ValueError("One timestamp per observation row is required")
        lo = self.rows_seen
        self.rows_seen += n
        decisions = {r["index"]: r for r in self.duo.next(observed)}
        results = []
        for i in range(n):
            self.mq7_seen |= bool(observed["mq7_available"][i] or observed["mq7_qualified"][i])
            env_dht = bool(observed["dht_valid"][i])
            if sensor_model == "DHT22":
                fresh = environment_dht_valid[i]
                env_dht = bool(fresh) and dht_valid(observed["temperature_c"][i],
                                                  observed["relative_humidity_pct"][i], sensor_model)
            smoking = None
            if self.smoking is not None:
                smoking = self.smoking.row({k: observed[k][i] for k in DETECTOR_KEYS}, decision=(lo + i) % 3 == 2)
            if env_dht and observed["mq135_valid"][i]:
                self.env.add(self.device_id, timestamps[i], observed["temperature_c"][i],
                             observed["relative_humidity_pct"][i], observed["mq135_adc"][i])
            if lo + i in decisions:
                duo = dict(decisions[lo + i])
                if smoking is not None:  # the dedicated detector decides smoking; Duo Fusion's alarm is kept for reference
                    duo["model_smoking_alarm"] = duo["smoking_alarm"]
                    duo["detector"] = smoking
                    duo["smoking_alarm"] = smoking["alarm"]
                temperature = float(observed["temperature_c"][i]) if env_dht else None
                merged = self._merge(timestamps[i], duo, temperature)
                merged["index"] = duo["index"]
                results.append(merged)
        return results

    def add_basic(self, at: datetime, temperature: float, humidity: float, gas: float, *,
                  sensor_model: str = "DHT11", mq_ready: bool | None = None, dht_ok: bool = True) -> dict:
        """One basic reading; explicit mq_ready uses the ESP32 hardware gate."""
        sensor_model = dht_model(sensor_model)
        if not all(math.isfinite(float(v)) for v in (temperature, humidity, gas)):
            raise ValueError("Sensor values must be finite")
        if mq_ready is None and not 0 < float(gas) < 4095:
            raise ValueError("GAS must be a valid MQ135 12-bit ADC value (0 < GAS < 4095)")
        late = self.basic_at is not None and at <= self.basic_at
        ready, restarted = True, False
        if mq_ready is not None:
            ready = bool(mq_ready)
        elif self.warmup is not None:
            ready, restarted = self.warmup.add(at, gas)
        if restarted:
            self.env.reset(self.device_id)
            self.leak = LeakTimer()
        valid = dht_ok and dht_valid(temperature, humidity, sensor_model)
        if not late:
            self.basic_at = at
            if ready and valid:
                self.env.add(self.device_id, at, temperature, humidity, gas)
        if ready:
            result = self._merge(at, None, float(temperature) if valid else None)
        else:
            result = combine(at, self.device_id, None, None, self.leak.next(False, at), None)
            result["headline"] = "MQ135 예열 중"
        if self.warmup is not None or mq_ready is not None:
            result["sensor_status"] = {"mq135": {"ready": ready, "reason": None if ready else "MQ135 예열 중"}}
        if not valid:
            result.setdefault("sensor_status", {})["dht"] = {"ready": False, "reason": "온습도 읽기 실패 또는 센서 범위 밖"}
        return result

    def close(self) -> None:
        if self.duo is not None:
            self.duo.close()
            self.duo = None


def timestamps_for(start: datetime, lo: int, n: int) -> list[datetime]:
    return [start + timedelta(seconds=5 * (lo + i)) for i in range(n)]
