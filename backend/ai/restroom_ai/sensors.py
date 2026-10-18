"""Sensor validity and conservative MQ135 startup gating (no model changes)."""
from __future__ import annotations

import math
from collections import deque
from datetime import datetime
from statistics import median


def dht_model(value: str | None) -> str:
    if value is not None and not isinstance(value, str):
        raise ValueError("sensor_model must be DHT11 or DHT22")
    model = (value or "DHT11").upper()
    if model not in ("DHT11", "DHT22"):
        raise ValueError("sensor_model must be DHT11 or DHT22")
    return model


def dht_valid(temperature, humidity, model: str = "DHT11") -> bool:
    if temperature is None or humidity is None:
        return False
    t, h = float(temperature), float(humidity)
    if not math.isfinite(t) or not math.isfinite(h):
        return False
    if dht_model(model) == "DHT22":
        return -40 <= t <= 80 and 0 <= h <= 100
    return 0 < t < 50 and 20 < h < 90


class MQ135Warmup:
    """One hour plus stable 10-minute medians; restart after a 30-minute gap."""

    MIN_SECONDS = 3600
    WINDOW_SECONDS = 600
    GAP_SECONDS = 1800

    def __init__(self):
        self.started: datetime | None = None
        self.last: datetime | None = None
        self.samples = deque()
        self.ready = False

    def add(self, at: datetime, gas: float) -> tuple[bool, bool]:
        """Return (ready, restarted). Late/duplicate readings cannot advance the gate."""
        if self.last is not None and at <= self.last:
            return self.ready, False
        restarted = self.last is not None and (at - self.last).total_seconds() >= self.GAP_SECONDS
        if restarted:
            self.__init__()
        if self.started is None:
            self.started = at
        self.last = at
        if self.ready:
            return True, restarted
        self.samples.append((at, float(gas)))
        while self.samples and (at - self.samples[0][0]).total_seconds() > self.WINDOW_SECONDS:
            self.samples.popleft()
        if (at - self.started).total_seconds() >= self.MIN_SECONDS:
            older = [v for t, v in self.samples if (at - t).total_seconds() >= 300]
            newer = [v for t, v in self.samples if (at - t).total_seconds() < 300]
            coverage = (at - self.samples[0][0]).total_seconds()
            gaps = [(b[0] - a[0]).total_seconds() for a, b in zip(self.samples, list(self.samples)[1:])]
            if len(older) >= 12 and len(newer) >= 12 and coverage >= 540 and max(gaps, default=0) <= 120:
                first, last = median(older), median(newer)
                self.ready = abs(last - first) / max(first, 1.0) <= 0.05
        return self.ready, restarted
