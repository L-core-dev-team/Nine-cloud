#!/usr/bin/env python3
"""test-comfy-runner.py —— 工作流运行器的最小回归测试（离线，不依赖 GPU/ComfyUI）

覆盖 GPT-6.2 审查点：
  - Thread 子类不覆盖 _stop
  - 异常/超时路径下采样线程必然结束（try/finally）
  - 空输出、0 字节文件、损坏 PNG 被拒绝
  - 输出重名不覆盖
  - 输入路径逃逸与缺失被拒绝
  - 参数取值范围校验
  - dual ControlNet 图结构正确
  - --dry-run 可离线校验
用法：python test-comfy-runner.py [runner 文件路径]
"""
from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import threading
import unittest

RUNNER = os.environ.get("JX_RUNNER_PATH") or os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                                          "comfy-workflow-runner.py")
PY = sys.executable


def load_runner(path: str):
    spec = importlib.util.spec_from_file_location("jx_runner", path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


runner = load_runner(RUNNER)


class TestThreadSafety(unittest.TestCase):
    def test_no_stop_override(self):
        self.assertNotIn("_stop", runner.VramWatch.__dict__,
                         "VramWatch 不能定义 _stop，会遮蔽 Thread 内部方法")
        w = runner.VramWatch(interval=0.05)
        self.assertTrue(hasattr(w, "_stop_event"))

    def test_thread_is_thread(self):
        self.assertTrue(issubclass(runner.VramWatch, threading.Thread))

    def test_stop_terminates(self):
        w = runner.VramWatch(interval=0.05)
        w.start()
        w.stop()
        self.assertFalse(w.is_alive(), "stop() 后采样线程必须退出")


class TestOutputHandling(unittest.TestCase):
    def test_unique_path(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "a.png")
            open(p, "wb").close()
            self.assertNotEqual(runner.unique_path(p), p)
            self.assertTrue(runner.unique_path(p).endswith("-001.png"))

    def test_reject_zero_byte(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "empty.png")
            open(p, "wb").close()
            with self.assertRaises(runner.RunnerError):
                runner.verify_image_file(p)

    def test_reject_corrupt_png(self):
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "bad.png")
            with open(p, "wb") as fh:
                fh.write(b"\x89PNG\r\n\x1a\n" + b"garbage" * 200)
            with self.assertRaises(runner.RunnerError):
                runner.verify_image_file(p)

    def test_accept_valid_png(self):
        from PIL import Image
        with tempfile.TemporaryDirectory() as d:
            p = os.path.join(d, "ok.png")
            Image.new("RGB", (64, 64), (10, 20, 30)).save(p)
            runner.verify_image_file(p)  # 不抛即通过

    def test_collect_rejects_empty_outputs(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(runner.RunnerError):
                runner.collect({"outputs": {}}, d, "x")

    def test_collect_rejects_missing_source(self):
        with tempfile.TemporaryDirectory() as d:
            entry = {"outputs": {"7": {"images": [{"filename": "nope_00001_.png", "subfolder": ""}]}}}
            with self.assertRaises(runner.RunnerError):
                runner.collect(entry, d, "x")

    def test_subfolder_traversal_rejected(self):
        with self.assertRaises(runner.RunnerError):
            runner._safe_relpath("../../etc")


class TestInputValidation(unittest.TestCase):
    def test_reject_absolute_and_traversal(self):
        with self.assertRaises(runner.RunnerError):
            runner.require_input(os.path.abspath(os.path.join(os.path.sep, "secret.png")), "--image")
        with self.assertRaises(runner.RunnerError):
            runner.require_input("../../secret.png", "--image")

    def test_missing_input(self):
        with tempfile.TemporaryDirectory() as d:
            os.environ["JX_INPUT_DIR"] = d
            with self.assertRaises(runner.RunnerError):
                runner.require_input("definitely_not_here_12345.png", "--image")

    def test_param_ranges(self):
        class A:
            width, height, steps, cfg, denoise, strength = 1023, 1024, 28, 7.0, 0.6, 0.9
        with self.assertRaises(runner.RunnerError):
            runner.validate_common(A())
        class B:
            width, height, steps, cfg, denoise, strength = 1024, 1024, 0, 7.0, 0.6, 0.9
        with self.assertRaises(runner.RunnerError):
            runner.validate_common(B())


class TestGraphs(unittest.TestCase):
    def _img(self, path, mode="RGB", size=256):
        """造一张足够大的噪声图，避免被“文件过小”校验拦住。"""
        import random
        from PIL import Image
        if mode == "L":
            im = Image.new("L", (size, size))
            im.putdata([random.randint(0, 255) for _ in range(size * size)])
        else:
            im = Image.new("RGB", (size, size))
            im.putdata([(random.randint(0, 255), random.randint(0, 255), random.randint(0, 255))
                        for _ in range(size * size)])
        im.save(path)

    def _dry(self, *args):
        cmd = [PY, RUNNER, *args, "--dry-run"]
        out = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
        self.assertEqual(out.returncode, 0, out.stderr)
        return json.loads(out.stdout)

    def test_dual_graph(self):
        with tempfile.TemporaryDirectory() as d:
            self._img(os.path.join(d, "depth.png"))
            self._img(os.path.join(d, "img.png"))
            os.environ["JX_INPUT_DIR"] = d
            j = self._dry("dual", "--depth", "depth.png", "--image", "img.png", "--out", os.path.join(d, "o"))
            g = j["graph"]
            types = {v["class_type"] for v in g.values()}
            self.assertIn("ControlNetApplyAdvanced", types)
            self.assertEqual(sum(1 for v in g.values() if v["class_type"] == "ControlNetApplyAdvanced"), 2)
            # 第二路 ControlNet 的 positive 来自第一路输出
            self.assertEqual(g["11"]["inputs"]["positive"], ["10", 0])

    def test_inpaint_graph_uses_image_to_mask(self):
        with tempfile.TemporaryDirectory() as d:
            self._img(os.path.join(d, "base.png"))
            self._img(os.path.join(d, "mask.png"), mode="L")
            os.environ["JX_INPUT_DIR"] = d
            j = self._dry("inpaint", "--image", "base.png", "--mask", "mask.png", "--out", os.path.join(d, "o"))
            types = {v["class_type"] for v in j["graph"].values()}
            self.assertIn("ImageToMask", types)


class TestFailurePath(unittest.TestCase):
    def test_unreachable_server_writes_failed_receipt_and_stops_thread(self):
        runner.COMFY = "http://127.0.0.1:59999"
        g = runner.base_graph("x", 512, 512)
        g["5"] = runner.ks(1, 4, 7.0, 1.0, "euler", "normal")
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(runner.RunnerError):
                runner.run_prompt(g, "dead", d, {"mode": "t2i"}, timeout=10)
            receipt = os.path.join(d, "dead_receipt.json")
            self.assertTrue(os.path.exists(receipt))
            j = json.load(open(receipt, encoding="utf-8"))
            self.assertFalse(j["ok"])
            self.assertIn("无法连接", j["error"])
        self.assertTrue(all(not t.is_alive() for t in threading.enumerate() if t.name == "VramWatch"))


if __name__ == "__main__":
    unittest.main(verbosity=2)
