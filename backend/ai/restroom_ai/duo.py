"""Duo Fusion situation branch: two worker processes plus the frozen final policy and smoking alarm."""
from __future__ import annotations

import multiprocessing as mp

import numpy as np

from . import paths

LABELS = ("smoking", "occupancy_odor", "handwashing_humidity", "wet_floor", "cleaning_products", "fragrance",
          "sanitizer", "door_air_exchange", "ventilation_change", "cleaning_wet_floor", "smoke_residual")
LABEL_KO = {
    "smoking": "흡연", "occupancy_odor": "이용·냄새", "handwashing_humidity": "손 씻기·습기",
    "wet_floor": "젖은 바닥", "cleaning_products": "청소 제품", "fragrance": "방향제", "sanitizer": "소독제",
    "door_air_exchange": "문 개폐", "ventilation_change": "환기 변화", "cleaning_wet_floor": "청소+젖은 바닥",
    "smoke_residual": "흡연 잔류",
}


def mix(gate: np.ndarray, residual: np.ndarray, weights: np.ndarray) -> np.ndarray:
    """Same arithmetic as research/all_situations/adaptive_fusion_predict.blend."""
    w = np.broadcast_to(np.asarray(weights, float), np.shape(gate))
    return ((1 - w) * gate.astype(float) + w * residual.astype(float)).astype(np.float32)


class SmokingAlarm:
    """Streaming form of research/all_situations/evaluation.episodes (confirm 3, clear 6)."""

    def __init__(self, cut: float, confirm: int, clear: int):
        self.cut, self.confirm, self.clear = cut, confirm, clear
        self.active, self.yes, self.no = False, 0, 0

    def next(self, score: float) -> bool:
        if not np.isfinite(score):
            self.yes = self.no = 0
            return self.active
        self.yes = self.yes + 1 if score >= self.cut else 0
        self.no = self.no + 1 if score < self.cut else 0
        if not self.active and self.yes >= self.confirm:
            self.active = True
        elif self.active and self.no >= self.clear:
            self.active, self.yes = False, 0
        return self.active


class DuoFusionStream:
    def __init__(self):
        final = paths.policy()
        policy, alarm = final["classification_policy"], final["smoking_alarm"]
        self.weights = np.array([policy["residual_weight"][name] for name in LABELS])
        self.cuts = np.array([policy["cut"][name] for name in LABELS])
        self.alarm_weights = np.array([alarm["r44_residual_weight"][name] for name in LABELS])
        self.alarm = SmokingAlarm(alarm["cut"], alarm["confirm_consecutive"], alarm["clear_consecutive"])
        context = mp.get_context("spawn")
        self.workers = {}
        from .duo_workers import serve
        for name in ("xgb", "torch"):
            parent, child = context.Pipe()
            process = context.Process(target=serve, args=(name, child), daemon=True)
            process.start()
            reply = parent.recv()
            if not reply["ok"]:
                raise RuntimeError(f"Duo Fusion {name} worker failed: {reply['error']}")
            self.workers[name] = (process, parent)

    def _call(self, name: str, message):
        _, connection = self.workers[name]
        connection.send(message)
        reply = connection.recv()
        if not reply["ok"]:
            raise RuntimeError(f"Duo Fusion {name} worker: {reply['error']}")
        return reply["result"]

    def next(self, observed: dict) -> list[dict]:
        """Feed consecutive 5-second observation rows; return one result per new 15-second decision."""
        rows = self._call("xgb", observed)
        if rows is None:
            return []
        parents = self._call("torch", rows)
        final = mix(parents["gate"], parents["residual"], self.weights)
        alarm_scores = mix(parents["gate"], parents["residual"], self.alarm_weights)
        results = []
        for i, index in enumerate(parents["indices"]):
            ready = bool(parents["ready"][i])
            score = float(max(alarm_scores[i, 0], alarm_scores[i, -1])) if ready else float("nan")
            active = self.alarm.next(score)
            detected = [LABELS[j] for j in range(len(LABELS)) if ready and final[i, j] >= self.cuts[j]]
            results.append({
                "index": int(index),
                "ready": ready,
                "labels": detected,
                "probabilities": {name: round(float(final[i, j]), 5) for j, name in enumerate(LABELS)},
                "smoking_alarm": active,
                "smoking_alarm_score": None if not ready else round(score, 5),
                "_gate": parents["gate"][i],
                "_residual": parents["residual"][i],
            })
        return results

    def close(self) -> None:
        for process, connection in self.workers.values():
            try:
                connection.send(None)
            except (BrokenPipeError, OSError):
                pass
            process.join(timeout=10)
            if process.is_alive():
                process.terminate()
        self.workers = {}
