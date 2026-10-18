"""Rules that merge the situation branch (Duo Fusion) and the environment branch (restRoom v2)."""
from __future__ import annotations

from datetime import datetime

from .duo import LABEL_KO

LEVELS = ("평상시", "정보", "주의", "긴급")
LEAK_CONFIRM_MINUTES = 30
WINTER_MONTHS = {12, 1, 2}
FREEZE_WINDOW_TEMPERATURE = 3.0
LEAK_CONTEXT = ("cleaning_products", "cleaning_wet_floor", "handwashing_humidity")
SITUATION_LEVEL = {
    "smoke_residual": "주의", "cleaning_wet_floor": "주의", "wet_floor": "주의",
    "occupancy_odor": "정보", "handwashing_humidity": "정보", "cleaning_products": "정보", "sanitizer": "정보",
    "ventilation_change": "정보", "door_air_exchange": "정보", "fragrance": "정보",
}


class LeakTimer:
    """Minutes the environment branch has reported a leak without interruption."""

    def __init__(self):
        self.since: datetime | None = None

    def next(self, leak: bool, at: datetime) -> float:
        if not leak:
            self.since = None
            return 0.0
        if self.since is None:
            self.since = at
        return (at - self.since).total_seconds() / 60


UNAVAILABLE = {"ready": None, "labels": [], "smoking_alarm": False, "smoking_alarm_score": None, "probabilities": {}}


def combine(at: datetime, device_id: str, duo: dict | None, env: dict | None, leak_minutes: float,
            temperature: float | None) -> dict:
    """duo=None means the situation branch is not available (basic readings without MQ-7)."""
    duo = UNAVAILABLE if duo is None else duo
    items: list[tuple[str, str, str]] = []  # (level, code, message)
    checks: list[str] = []
    situations = set(duo["labels"]) if duo["ready"] else set()
    env_ready = bool(env and env.get("ready"))
    predicted = env["predicted"] if env else {}
    freeze = env.get("freeze_levels", {}) if env else {}

    detector = duo.get("detector")
    if detector is not None and detector.get("suspected"):
        evidence = (f"MQ-135 {detector['mq135_rise']:+.0%}, MQ-7 {detector['mq7_rise']:+.0%}"
                    if detector.get("mq135_rise") is not None and detector.get("mq7_rise") is not None else "")
        if detector.get("co_vs_usual_odour") is not None:
            evidence += f", CO 평소 냄새의 {detector['co_vs_usual_odour']:.1f}배"
        checks.append(f"smoking: 흡연 판정기 점수 {detector['score']:.2f}" + (f" ({evidence})" if evidence else ""))
    if duo["smoking_alarm"]:
        items.append(("긴급", "smoking_alarm", "흡연 경보"))
    elif detector is not None and detector.get("suspected"):
        items.append(("주의", "smoking", "흡연 의심"))
    elif detector is None and "smoking" in situations:
        items.append(("주의", "smoking", "흡연 의심 (경보 전)"))

    if env_ready and predicted.get("leak_active"):
        context = [LABEL_KO[name] for name in LEAK_CONTEXT if name in situations]
        if predicted.get("faucet_on"):
            context.append("수도 사용")
        if "wet_floor" in situations or "cleaning_wet_floor" in situations:
            checks.append("leak: 젖은 바닥 동반")
        if leak_minutes >= LEAK_CONFIRM_MINUTES or not context:
            items.append(("긴급", "leak", f"누수 의심 ({leak_minutes:.0f}분 지속)"))
            checks.append("leak: 청소·손 씻기·수도 사용 없음" if not context else "leak: 30분 이상 지속")
        else:
            items.append(("주의", "leak_check", f"누수 확인 필요 ({', '.join(context)} 중)"))

    if env_ready:
        window = bool(predicted.get("window_open"))
        cold = temperature is not None and temperature <= FREEZE_WINDOW_TEMPERATURE
        if freeze.get("freeze_risk_1h") == "경보":
            items.append(("긴급", "freeze_1h", "1시간 내 동파 위험"))
        elif window and cold and freeze.get("freeze_risk_3h") == "경보":
            items.append(("긴급", "freeze_window", "창문 열림 + 실내 3℃ 이하: 동파 위험"))
        elif freeze.get("freeze_risk_3h") == "경보":
            items.append(("주의", "freeze_3h", "3시간 내 동파 위험"))
        elif "주의" in freeze.values():
            items.append(("주의", "freeze_watch", "동파 주의"))
        if window:
            winter = at.month in WINTER_MONTHS
            items.append(("주의" if winter else "정보", "window_open", "창문 열림" + (" (겨울철)" if winter else "")))
            if "ventilation_change" in situations or "door_air_exchange" in situations:
                checks.append("window: 환기 변화 동반")
        if predicted.get("faucet_on"):
            items.append(("정보", "faucet_on", "수도 사용"))

    for name in sorted(situations - {"smoking"}):
        items.append((SITUATION_LEVEL[name], name, LABEL_KO[name]))

    items.sort(key=lambda item: -LEVELS.index(item[0]))
    ready = {"situations": duo["ready"], "environment": env_ready}
    if items:
        level, headline = items[0][0], items[0][2]
    elif all(value is not False for value in ready.values()) and env_ready:
        level, headline = "평상시", "정상"
    else:
        level, headline = "준비 중", "센서 예열·이력 수집 중"
    result = {
        "device_id": device_id,
        "at": at.isoformat(),
        "level": level,
        "headline": headline,
        "items": [{"level": lv, "code": code, "message": message} for lv, code, message in items],
        "ready": ready,
        "situations": {"labels": sorted(situations), "probabilities": duo["probabilities"],
                       "smoking_alarm": duo["smoking_alarm"], "smoking_alarm_score": duo["smoking_alarm_score"],
                       "model_smoking_alarm": duo.get("model_smoking_alarm", duo["smoking_alarm"]),
                       "smoking_detector": duo.get("detector")},
        "environment": None if env is None else {
            "predicted": predicted, "probabilities": env.get("probabilities"), "freeze_levels": freeze,
            "decision_result": env.get("decision_result"), "history_buckets": env["source"]["history_buckets"]},
        "situations_available": duo["ready"] is not None,
        "checks": checks,
    }
    if duo["ready"] is None:
        result["unavailable"] = {"smoking": "MQ-7 유효 측정 없음", "situations": "MQ-7 유효 측정 없음"}
    return result
