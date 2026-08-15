"""Tests for the thermostat module."""

import unittest

from thermostat import Thermostat, clamp


class ClampTests(unittest.TestCase):
    """Clamp boundary behavior."""

    def test_clamp_within_range(self):
        self.assertEqual(clamp(20.0, 0.0, 40.0), 20.0)

    def test_clamp_below_range(self):
        self.assertEqual(clamp(-5.0, 0.0, 40.0), 0.0)

    def test_clamp_above_range(self):
        self.assertEqual(clamp(99.0, 0.0, 40.0), 40.0)


class ThermostatTests(unittest.TestCase):
    """Hysteresis and setpoint behavior."""

    def test_heating_starts_below_band(self):
        t = Thermostat(setpoint=20.0, hysteresis=0.5)
        self.assertTrue(t.update(19.4))

    def test_heating_off_above_band(self):
        t = Thermostat(setpoint=20.0, hysteresis=0.5)
        self.assertFalse(t.update(20.6))

    def test_heating_holds_within_band(self):
        t = Thermostat(setpoint=20.0, hysteresis=0.5)
        t.update(19.4)
        self.assertTrue(t.update(20.2))
        self.assertFalse(t.update(20.6))

    def test_decision_uses_latest_setpoint(self):
        t = Thermostat(setpoint=20.0, hysteresis=0.5)
        t.update(19.4)
        t.set_temperature(30.0)
        self.assertTrue(t.update(19.4))
        t.set_temperature(18.0)
        self.assertFalse(t.update(19.4))

    def test_set_temperature_clamps(self):
        t = Thermostat()
        t.set_temperature(100.0)
        self.assertEqual(t.setpoint, 40.0)