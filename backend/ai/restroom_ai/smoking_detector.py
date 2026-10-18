"""Dedicated smoking detector: MQ-135 + MQ-7 together, read every 15 seconds.

Cigarette smoke is the only restroom situation in which both gas sensors rise strongly;
odours and cleaning raise MQ-135 but leave MQ-7 almost flat (docs/MQ7_FACTORS.md). The
detector turns the two sensors into causal features, scores them with a small gradient
boosting model and raises an alarm when the score stays high.

Features (one vector per decision row, index % 3 == 2):
    conductance       every ADC value becomes adc / (4095 - adc), proportional to the sensor
                      conductance (1 / Rs); its rise over clean air grows roughly linearly
                      with gas concentration, unlike the saturating ADC value
    clean-air level   asymmetric slow average of the conductance per sensor: follows drops within ~5 minutes,
                      rises only over ~1 hour, so a 2-10 minute smoking event cannot lift it
    MQ-135 rises      last 1 / 3 minutes, best 1-minute rise of the last 10 minutes, slope
    MQ-7 rise         mean of the qualified readings of the latest heater window (MQ-7 is
                      only readable 30-90 s into the low-voltage phase of each 150 s cycle),
                      previous window, best of the last 3 windows
    matched MQ-135    MQ-135 rise averaged over the same rows as the latest MQ-7 window
    CO share          MQ-7 rise / matched MQ-135 rise, and MQ-7 rise - 0.1 x matched rise
    device CO share   median CO share of this device's recent gas-event windows. Odours happen
                      ~10x more often than smoking, so this is the device's own "ordinary odour"
                      share (its MQ-7 cross-sensitivity and heater-window attenuation); the
                      current share divided by it, and MQ-7 rise - device share x matched rise;
                      best ratio and summed positive excess over the last 3 heater windows. Until
                      a device has 8 gas-event windows the dev-device median (0.074) is used
    every-row MQ-7    all low-phase MQ-7 readings (not only the qualified window), each against
                      the clean-air level and the device's usual odour share of its own 5-second
                      position in the heater cycle; "slot excess" = MQ-7 rise / usual share -
                      MQ-135 rise, i.e. the CO that odour cannot explain, in MQ-135 rise units:
                      last 30 s, this low phase, previous low phase, best of the last 3
    humidity rise     relative humidity minus its 30-minute average (handwashing, mopping)
    MQ-7 age          seconds since the latest qualified MQ-7 reading
Missing values are NaN (the model handles them).

Two alarm tiers on the score: "alarm" (strict, few false alarms -> 흡연 경보) and "suspect"
(sensitive -> 흡연 의심). Each tier is either "m of the last `window` decisions above a
threshold" or a CUSUM of the score's log-odds, and stays on until `clear` decisions without
the condition. Streaming (`SmokingDetector`) and batch (`features` + `alarm_states`) give
identical results.
"""
from __future__ import annotations

import json
from collections import deque
from dataclasses import dataclass

import numpy as np

FEATURES = ("r135_1m", "r135_3m", "r135_max10m", "r135_slope", "r135_win", "r135_win_prev", "r7", "r7_prev",
            "r7_max3", "co_share", "co_excess", "rh_rise", "mq7_age_s", "device_share", "share_rel", "share_rel_prev",
            "excess_dev", "share_rel_max3", "excess_dev_sum3", "device_windows",
            "slot_rel", "slot_excess", "slot_excess_cycle", "slot_excess_prev", "slot_excess_max3")
KEYS = ("mq135_adc", "mq135_valid", "mq7_cycle_id", "mq7_new_qualified", "mq7_last_qualified_adc",
        "mq7_available", "mq7_sample_age_s", "relative_humidity_pct", "dht_valid", "mq7_adc", "mq7_phase_s",
        "mq7_low_phase")
UP_ROWS, DOWN_ROWS = 720, 60        # MQ-135 clean-air level: rise over 1 h, fall over 5 min
UP_CYCLES, DOWN_CYCLES = 24, 2      # MQ-7 clean-air level in 150 s heater cycles
RH_ROWS = 360                       # humidity average: 30 minutes
WARMUP_ROWS = 360                   # 30 minutes before the first ready decision
MAX_MQ7_AGE_S = 150
DEVICE_WINDOWS = 240                # heater windows with a gas event kept for the device's usual CO share
DEVICE_MIN_WINDOWS = 8
GAS_EVENT_RISE = 0.15               # matched MQ-135 rise that counts as a gas event
PRIOR_SHARE = 0.074                 # median device share of the dev devices: used until a device has its own
SLOTS = 30                          # 5-second positions in the 150 s heater cycle
SLOT_SHARES = 120                   # gas-event samples kept per low-phase slot


def conductance(adc: float) -> float:
    """Sensor conductance up to a constant: the load-resistor divider gives Rs/RL = (4095 - adc) / adc."""
    adc = min(max(float(adc), 1.0), 4094.0)
    return adc / (4095.0 - adc)


def _track(level, value, up, down):
    if level is None:
        return value
    return level + (value - level) / (up if value > level else down)


class Features:
    """Streaming feature extractor; feed every 5-second row in order."""

    def __init__(self):
        self.rows = 0
        self.base135 = None
        self.recent135 = deque(maxlen=36)          # 3 minutes of valid MQ-135 values
        self.rise1m = deque(maxlen=40)             # 1-minute rises at the last 40 decisions (10 min)
        self.base7 = None
        self.cycles = 0
        self.cycle = None
        self.win7: list[float] = []
        self.win135: list[float] = []
        self.r7_hist = deque(maxlen=3)
        self.r135w_hist = deque(maxlen=2)
        self.r7_now = np.nan
        self.r135_win = np.nan
        self.rh = None
        self.shares = deque(maxlen=DEVICE_WINDOWS)  # CO share of recent gas-event windows (mostly odours)
        self.rel_hist = deque(maxlen=2)
        self.excess_hist = deque(maxlen=2)
        self.slot_base = [None] * SLOTS
        self.slot_shares = [deque(maxlen=SLOT_SHARES) for _ in range(SLOTS)]
        self.slot_recent = deque(maxlen=6)      # (rel, excess) of the last 6 low-phase rows (30 s)
        self.slot_cycle: list[float] = []       # excess of the current low phase
        self.slot_cycles = deque(maxlen=3)      # mean excess of the last 3 finished low phases
        self.slot_cycle_id = None
        self.r135_row = np.nan

    def row(self, obs: dict, decision: bool) -> np.ndarray | None:
        self.rows += 1
        if obs["mq135_valid"]:
            v = conductance(obs["mq135_adc"])
            self.base135 = _track(self.base135, v, UP_ROWS, DOWN_ROWS)
            self.recent135.append(v)
        self.r135_row = (float(np.mean(list(self.recent135)[-3:])) / self.base135 - 1
                         if self.base135 and self.recent135 else np.nan)
        self._slot_row(obs)
        if obs["dht_valid"]:
            h = float(obs["relative_humidity_pct"])
            self.rh = h if self.rh is None else self.rh + (h - self.rh) / RH_ROWS

        cycle = int(obs["mq7_cycle_id"])
        if self.cycle is not None and cycle != self.cycle and self.win7:
            mean7 = float(np.mean(self.win7))      # finished heater window: update the clean-air level
            self.base7 = _track(self.base7, mean7, UP_CYCLES, DOWN_CYCLES)
            self.cycles += 1
            self.r7_hist.append(self.r7_now)
            self.r135w_hist.append(self.r135_win)
            device = self.device_share
            ok = np.isfinite(self.r7_now) and np.isfinite(self.r135_win)
            self.rel_hist.append(self.r7_now / max(self.r135_win, 0.03) / device if ok else np.nan)
            self.excess_hist.append(self.r7_now - device * self.r135_win if ok else np.nan)
            if np.isfinite(self.r7_now) and np.isfinite(self.r135_win) and self.r135_win >= GAS_EVENT_RISE:
                self.shares.append(self.r7_now / self.r135_win)
            self.win7, self.win135 = [], []
        self.cycle = cycle
        if obs["mq7_new_qualified"]:
            self.win7.append(conductance(obs["mq7_last_qualified_adc"]))
            if obs["mq135_valid"]:
                self.win135.append(conductance(obs["mq135_adc"]))
            if self.base7:
                self.r7_now = float(np.mean(self.win7)) / self.base7 - 1
            if self.base135 and self.win135:
                self.r135_win = float(np.mean(self.win135)) / self.base135 - 1
        if not decision:
            return None

        nan = np.nan
        if self.base135 and self.recent135:
            last = list(self.recent135)
            r1 = float(np.mean(last[-12:])) / self.base135 - 1
            r3 = float(np.mean(last)) / self.base135 - 1
        else:
            r1 = r3 = nan
        slope = r1 - self.rise1m[-4] if len(self.rise1m) >= 4 and np.isfinite(self.rise1m[-4]) else nan
        self.rise1m.append(r1)
        finite = [x for x in self.rise1m if np.isfinite(x)]
        rmax = max(finite) if finite else nan
        age = float(obs["mq7_sample_age_s"])
        fresh = bool(obs["mq7_available"]) and age <= MAX_MQ7_AGE_S and self.cycles >= 6
        r7 = self.r7_now if fresh else nan
        r135w = self.r135_win if fresh else nan
        prev7 = self.r7_hist[-1] if self.r7_hist else nan
        prev135w = self.r135w_hist[-1] if self.r135w_hist else nan
        best7 = [x for x in (*self.r7_hist, r7) if np.isfinite(x)]
        share = r7 / max(r135w, 0.03) if np.isfinite(r7) and np.isfinite(r135w) else nan
        excess = r7 - 0.1 * r135w if np.isfinite(r7) and np.isfinite(r135w) else nan
        rh_rise = float(obs["relative_humidity_pct"]) - self.rh if obs["dht_valid"] and self.rh is not None else nan
        device = self.device_share
        rel = share / device if np.isfinite(share) else nan
        excess_dev = r7 - device * r135w if np.isfinite(r7) and np.isfinite(r135w) else nan
        rel_prev = self.rel_hist[-1] if self.rel_hist else nan
        rels = [x for x in (*self.rel_hist, rel) if np.isfinite(x)]
        excesses = [max(x, 0.0) for x in (*self.excess_hist, excess_dev) if np.isfinite(x)]
        return np.array([r1, r3, rmax, slope, r135w, prev135w, r7, prev7, max(best7) if best7 else nan,
                         share, excess, rh_rise, min(age, 1e4) if np.isfinite(age) else nan,
                         device, rel, rel_prev, excess_dev, max(rels) if rels else nan,
                         sum(excesses) if excesses else nan, float(len(self.shares)), *self._slot_features()], float)

    def _slot_features(self) -> list[float]:
        nan = np.nan
        if not self.slot_recent:
            return [nan] * 5
        rel = float(np.mean([r for r, _ in self.slot_recent]))
        excess = float(np.mean([e for _, e in self.slot_recent]))
        cycle = float(np.mean(self.slot_cycle)) if self.slot_cycle else nan
        prev = self.slot_cycles[-1] if self.slot_cycles else nan
        best = [x for x in (*self.slot_cycles, cycle) if np.isfinite(x)]
        return [rel, excess, cycle, prev, max(best) if best else nan]

    def _slot_row(self, obs: dict) -> None:
        """Every low-phase MQ-7 reading against the clean-air level of its own heater-cycle position."""
        cycle = int(obs["mq7_cycle_id"])
        if cycle != self.slot_cycle_id:
            if self.slot_cycle:
                self.slot_cycles.append(float(np.mean(self.slot_cycle)))
            self.slot_cycle, self.slot_cycle_id = [], cycle
        adc = float(obs["mq7_adc"])
        if not obs["mq7_low_phase"] or not 0 < adc < 4095:
            return
        slot = int(obs["mq7_phase_s"]) // 5 % SLOTS
        g = conductance(adc)
        base = self.slot_base[slot]
        self.slot_base[slot] = _track(base, g, UP_CYCLES, DOWN_CYCLES)
        if base is None or not np.isfinite(self.r135_row):
            return
        r7 = g / base - 1
        shares = self.slot_shares[slot]
        if self.r135_row >= GAS_EVENT_RISE:
            shares.append(r7 / self.r135_row)
        if len(shares) < DEVICE_MIN_WINDOWS:
            return
        share = max(float(np.median(shares)), 0.005)
        rel = r7 / max(self.r135_row, 0.03) / share
        excess = r7 / share - self.r135_row      # CO beyond what odour explains, in MQ-135 rise units
        self.slot_recent.append((rel, excess))
        self.slot_cycle.append(excess)

    @property
    def device_share(self) -> float:
        """This device's usual MQ-7 / MQ-135 rise during gas events (median; odours dominate, smoking is rare)."""
        if len(self.shares) < DEVICE_MIN_WINDOWS:
            return PRIOR_SHARE
        return max(float(np.median(self.shares)), 0.01)

    @property
    def ready(self) -> bool:
        return self.rows >= WARMUP_ROWS and self.base7 is not None


def features(observed: dict, lo: int = 0, extractor: Features | None = None) -> tuple[np.ndarray, np.ndarray]:
    """(feature matrix, ready flags) at every decision row of consecutive rows starting at lo."""
    extractor = extractor or Features()
    cols = {k: np.asarray(observed[k]) for k in KEYS}
    out, ready = [], []
    for i in range(len(cols["mq135_adc"])):
        f = extractor.row({k: v[i] for k, v in cols.items()}, decision=(lo + i) % 3 == 2)
        if f is not None:
            out.append(f)
            ready.append(extractor.ready)
    return np.array(out).reshape(-1, len(FEATURES)), np.array(ready, bool)


@dataclass(frozen=True)
class AlarmParams:
    """One alarm tier. kind "window": score >= threshold in at least m of the last `window`
    decisions. kind "cusum": S = max(0, S + logit(score) - bias), on when S >= h.
    Either way the tier turns off after `clear` decisions without the condition."""
    kind: str = "window"
    threshold: float = 0.5
    m: int = 2
    window: int = 4
    bias: float = 0.0
    h: float = 4.0
    clear: int = 8


def _logit(score: float) -> float:
    p = min(max(score, 1e-6), 1 - 1e-6)
    return float(np.log(p / (1 - p)))


class AlarmTier:
    """Streaming state of one tier; `alarm_states` is the same definition over a whole sequence."""

    def __init__(self, p: AlarmParams):
        self.p = p
        self.hits = deque(maxlen=p.window)
        self.sustained = deque(maxlen=p.clear)
        self.s, self.active, self.off = 0.0, False, 0

    def next(self, score: float, ready: bool) -> bool:
        p = self.p
        if p.kind == "window":
            self.hits.append(ready and score >= p.threshold)
            self.sustained.append(sum(self.hits) >= p.m)
            return bool(ready and any(self.sustained))
        self.s = max(0.0, self.s + _logit(score) - p.bias) if ready else 0.0
        if self.s >= p.h:
            self.active, self.off = True, 0
        elif self.active:
            self.off += 1
            if self.off >= p.clear:
                self.active = False
        return bool(self.active and ready)


def alarm_states(score: np.ndarray, ready: np.ndarray, p: AlarmParams) -> np.ndarray:
    """Tier state at every decision of a whole sequence; identical to feeding AlarmTier."""
    if p.kind == "window":
        hit = (score >= p.threshold) & ready
        c = np.r_[0, np.cumsum(hit.astype(int))]
        idx = np.arange(len(hit))
        sustained = (c[idx + 1] - c[np.maximum(0, idx + 1 - p.window)]) >= p.m
        s = np.r_[0, np.cumsum(sustained.astype(int))]
        return ((s[idx + 1] - s[np.maximum(0, idx + 1 - p.clear)]) > 0) & ready
    # CUSUM as a Lindley recursion: within each run of ready decisions S = C - min(0, running min of C),
    # C the cumulative sum of logit(score) - bias; S = 0 while not ready.
    p_ = np.clip(np.asarray(score, float), 1e-6, 1 - 1e-6)
    z = np.where(ready, np.log(p_ / (1 - p_)) - p.bias, 0.0)
    run = np.cumsum(~ready)                      # run id changes at every not-ready decision
    c = np.cumsum(z)
    first = np.r_[0, np.flatnonzero(np.diff(run)) + 1]
    offset = np.repeat(np.r_[0.0, c][first], np.diff(np.r_[first, len(z)]))
    local = c - offset                           # cumulative sum since the run started
    floor = np.empty_like(local)
    for a, b in zip(first, np.r_[first[1:], len(z)]):
        floor[a:b] = np.minimum.accumulate(np.minimum(local[a:b], 0.0))
    s = np.where(ready, local - floor, 0.0)
    hit = s >= p.h
    k = np.r_[0, np.cumsum(hit.astype(int))]
    idx = np.arange(len(hit))
    return ((k[idx + 1] - k[np.maximum(0, idx + 1 - p.clear)]) > 0) & ready


def _rounded(value, digits):
    return None if value is None or not np.isfinite(value) else round(float(value), digits)


class SmokingDetector:
    """Streaming detector for the app (one instance per device).

    tiers: {"alarm": AlarmParams, "suspect": AlarmParams}. "alarm" is the strict tier
    ("흡연 경보"), "suspect" the sensitive tier ("흡연 의심"); the alarm tier implies suspicion.
    """

    def __init__(self, model, tiers: dict[str, AlarmParams]):
        self.model = model
        self.features = Features()
        self.tiers = {name: AlarmTier(p) for name, p in tiers.items()}
        self.decisions = 0
        self.since: dict[str, int | None] = {name: None for name in tiers}
        self.state: dict = {"ready": False, "score": None, "alarm": False, "suspected": False}

    def row(self, obs: dict, decision: bool) -> dict | None:
        f = self.features.row(obs, decision)
        if f is None:
            return None
        ready = self.features.ready
        score = float(self.model.predict_proba(f[None, :])[0, 1])
        on = {name: tier.next(score, ready) for name, tier in self.tiers.items()}
        for name, value in on.items():
            self.since[name] = (self.since[name] if self.since[name] is not None else self.decisions) if value else None
        self.decisions += 1
        named = dict(zip(FEATURES, f))
        alarm = on.get("alarm", False)
        self.state = {
            "ready": ready, "score": round(score, 4), "alarm": alarm, "suspected": alarm or on.get("suspect", False),
            "alarm_decisions": None if self.since.get("alarm") is None else self.decisions - self.since["alarm"],
            "mq135_rise": _rounded(named["r135_1m"], 4), "mq7_rise": _rounded(named["r7"], 4),
            "co_share": _rounded(named["co_share"], 3), "co_vs_usual_odour": _rounded(named["slot_rel"], 2),
        }
        return self.state


def load(directory):
    """(model, tiers) from models/situation/smoking_detector.{joblib,json}, or None."""
    import joblib
    from pathlib import Path

    directory = Path(directory)
    model_file, meta_file = directory / "smoking_detector.joblib", directory / "smoking_detector.json"
    if not model_file.exists() or not meta_file.exists():
        return None
    meta = json.loads(meta_file.read_text(encoding="utf-8"))
    return joblib.load(model_file), {name: AlarmParams(**p) for name, p in meta["tiers"].items()}
