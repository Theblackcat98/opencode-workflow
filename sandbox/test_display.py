"""Tests for the display and sensor modules."""

import unittest

from display import format_temperature
from sensor import Sensor


class DisplayTests(unittest.TestCase):
    """Temperature formatting."""

    def test_celsius_default(self):
        self.assertEqual(format_temperature(20.0), "20.0 C")

    def test_fahrenheit(self):
        self.assertEqual(format_temperature(20.0, unit="f"), "68.0 F")


class SensorTests(unittest.TestCase):
    """Sensor read/update round-trip."""

    def test_initial_reading(self):
        self.assertEqual(Sensor(18.5).read(), 18.5)

    def test_update_changes_reading(self):
        s = Sensor()
        s.update(24.0)
        self.assertEqual(s.read(), 24.0)