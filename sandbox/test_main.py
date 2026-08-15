"""Tests for the CLI entry point."""

import contextlib
import io
import unittest

from main import VERSION, main


class MainTests(unittest.TestCase):
    """CLI behavior: version flag, temperature flag, and defaults."""

    def test_version_flag(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            main(["--version"])
        self.assertEqual(out.getvalue().strip(), f"thermostat-sandbox {VERSION}")

    def test_temperature_flag_heating(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            main(["--temperature", "19.4"])
        self.assertEqual(out.getvalue().strip(), "heating")

    def test_default_is_idle(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            main([])
        self.assertEqual(out.getvalue().strip(), "idle")
