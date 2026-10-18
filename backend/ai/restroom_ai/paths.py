"""Model and data locations inside result/, with frozen SHA-256 hashes."""
from __future__ import annotations

import hashlib
import json

from . import RESULT

MODELS = RESULT / "models"
SITUATION = MODELS / "situation"
ENVIRONMENT = MODELS / "environment"
POLICY = SITUATION / "policy.json"
DATA = RESULT / "data"
SPECS = DATA / "ir02_specs.json"

ROOT_OCCURRENCE = SITUATION / "occurrence_r256.ubj"
ROOT_CONDITIONAL = SITUATION / "conditional_r256.ubj"
BOOST = SITUATION / "diversity_expanded_r256.ubj"
HISTORY = SITUATION / "temporal_filter_history_e24.npz"
GATE = SITUATION / "fusion_objective_a25_dbase_e8.npz"
RESIDUAL = SITUATION / "residual_expanded_observed_a00_e8.npz"
SITUATION_FILES = (ROOT_OCCURRENCE, ROOT_CONDITIONAL, BOOST, HISTORY, GATE, RESIDUAL)
ENVIRONMENT_TARGETS = ("window_open", "faucet_on", "leak_active", "freeze_risk_1h", "freeze_risk_3h")


def sha256(path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as handle:
        for block in iter(lambda: handle.read(1 << 20), b""):
            digest.update(block)
    return digest.hexdigest()


def policy() -> dict:
    return json.loads(POLICY.read_text(encoding="utf-8"))


def check_situation_files() -> None:
    expected = {key.rsplit("/", 1)[-1]: value for key, value in policy()["model_sha256"].items()}
    for path in SITUATION_FILES:
        if sha256(path) != expected[path.name]:
            raise ValueError(f"Frozen situation model changed: {path.name}")
