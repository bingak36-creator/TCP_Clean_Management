import importlib.util
import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
spec = importlib.util.spec_from_file_location("ai_worker", ROOT / "worker.py")
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)


class WorkerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.predictor = worker.Predictor()

    def sample(self, device, seconds=0):
        return {"id": f"{device}:{seconds}", "device_id": device,
                "measured_at": (datetime(2026, 10, 17, tzinfo=timezone.utc) + timedelta(seconds=seconds)).isoformat(),
                "temperature": 24, "humidity": 55, "gas": 400, "sensor_model": "DHT22"}

    def test_five_real_model_files_load_and_cold_start_is_not_normal(self):
        self.assertEqual(5, len(self.predictor.environment.bundles))
        result = self.predictor.predict(self.sample("cold"))
        self.assertEqual("준비 중", result["level"])
        self.assertFalse(result["ready"]["environment"])
        self.assertEqual([], result["alerts"])
        self.assertIn("smoking", result["unavailable"])

    def test_real_models_predict_after_warmup_and_history(self):
        for seconds in range(0, 3601, 5):
            self.predictor.predict(self.sample("ready", seconds))
        for bucket in range(1, 36):
            result = self.predictor.predict(self.sample("ready", 3600 + bucket * 300))
        self.assertTrue(result["ready"]["environment"])
        self.assertEqual(set(worker.EnvironmentBranch().bundles), set(result["environment"]["probabilities"]))
        self.assertTrue(all(0 <= value <= 1 for value in result["environment"]["probabilities"].values()))
        self.assertTrue(result["at"].endswith("+09:00"))
        self.assertEqual("environment-v3-indoor-22-mixed", result["model_version"])

    def test_identical_retry_does_not_advance_history(self):
        sample = self.sample("retry")
        first = self.predictor.predict(sample)
        self.assertEqual(first, self.predictor.predict(sample))
        changed = dict(sample, gas=401)
        with self.assertRaisesRegex(ValueError, "Conflicting"):
            self.predictor.predict(changed)

    def test_device_histories_are_separate(self):
        first = self.predictor.predict(self.sample("separate-a", 5))
        second = self.predictor.predict(self.sample("separate-b", 0))
        self.assertNotEqual(first["device_id"], second["device_id"])
        self.assertFalse(second["ready"]["environment"])

    def test_out_of_order_is_rejected(self):
        self.predictor.predict(self.sample("ordered", 10))
        with self.assertRaisesRegex(ValueError, "Out-of-order"):
            self.predictor.predict(self.sample("ordered", 5))

    def test_invalid_dht_and_gas_are_not_predicted(self):
        with self.assertRaisesRegex(ValueError, "Invalid temperature"):
            self.predictor.predict(dict(self.sample("bad-dht"), humidity=101))
        with self.assertRaisesRegex(ValueError, "ADC"):
            self.predictor.predict(dict(self.sample("bad-gas"), gas=4095))

    def test_naive_timestamps_are_rejected(self):
        with self.assertRaisesRegex(ValueError, "UTC offset"):
            self.predictor.predict(dict(self.sample("naive"), measured_at="2026-10-17T00:00:00"))

    def test_corrupt_model_manifest_is_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "model").write_text("changed")
            (root / "manifest.json").write_text(json.dumps({"model_version": "test", "sha256": {"model": "wrong"}}))
            with self.assertRaisesRegex(ValueError, "checksum"):
                worker.verify_models(root)


if __name__ == "__main__":
    unittest.main()
