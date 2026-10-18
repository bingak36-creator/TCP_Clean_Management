"""restroom_ai: one model for restroom smoking, leak, freeze-risk and daily-situation judgements.

Everything it needs is inside result/: models/, vendor/ (frozen research code and
XGBoost 3.4.1) and data/. Nothing is read from the research folder.
"""
import sys
from pathlib import Path

RESULT = Path(__file__).resolve().parents[1]
for _path in (RESULT / "vendor", RESULT / "vendor/research/continuous_year", RESULT / "vendor/xgboost-3.4.1"):
    if str(_path) not in sys.path:
        sys.path.insert(0, str(_path))
