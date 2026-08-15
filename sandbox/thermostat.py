"""Thermostat simulation: setpoint, hysteresis, and heating decisions."""


def clamp(value, low, high):
    """Clamp value into the inclusive [low, high] range."""
    return max(low, min(high, value))


class Thermostat:
    """A hysteresis-based thermostat that decides when heating runs."""

    def __init__(self, setpoint=20.0, hysteresis=0.5):
        """Initialize with a setpoint and hysteresis band in Celsius."""
        self.setpoint = setpoint
        self.hysteresis = hysteresis
        self._heating = False
        self._cache = {}

    def update(self, current):
        """Feed the current temperature; return whether heating should run.

        Consecutive identical readings reuse the last decision instead of
        recomputing; the cache is invalidated when the setpoint changes.
        """
        if current in self._cache:
            return self._cache[current]
        decision = self._decide(current)
        self._cache = {current: decision}
        return decision

    def _decide(self, current):
        """Compute the heating decision for a reading from scratch."""
        if current <= self.setpoint - self.hysteresis:
            self._heating = True
        elif current >= self.setpoint + self.hysteresis:
            self._heating = False
        return self._heating

    def set_temperature(self, value):
        """Change the setpoint, clamped to [0, 40] Celsius."""
        self.setpoint = clamp(value, 0.0, 40.0)
        self._cache.clear()
