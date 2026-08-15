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


class UnitFlagTests(unittest.TestCase):
    """--unit mode prints current and setpoint temperatures."""

    def test_fahrenheit_mode_shows_current_and_setpoint(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            result = main(["--temperature", "25", "--unit", "f"])
        self.assertEqual(result, 0)
        self.assertEqual(
            out.getvalue().strip(),
            "current: 77.0 F\nsetpoint: 68.0 F\nidle",
        )

    def test_celsius_mode_shows_current_and_setpoint(self):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            result = main(["--unit", "c"])
        self.assertEqual(result, 0)
        self.assertEqual(
            out.getvalue().strip(),
            "current: 21.0 C\nsetpoint: 20.0 C\nidle",
        )

    def test_invalid_unit_reports_error(self):
        out = io.StringIO()
        err = io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            result = main(["--unit", "x"])
        self.assertEqual(result, 1)
        self.assertIn("unknown unit", err.getvalue())

    def test_missing_unit_value_reports_error(self):
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            result = main(["--unit"])
        self.assertEqual(result, 1)
        self.assertIn("requires a value", err.getvalue())

    def test_invalid_temperature_reports_error(self):
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            result = main(["--temperature", "abc"])
        self.assertEqual(result, 1)
        self.assertIn("invalid temperature", err.getvalue())
