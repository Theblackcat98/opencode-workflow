"""Simulated temperature sensor."""


class Sensor:
    """A fake sensor whose reading is set explicitly by tests or the CLI."""

    def __init__(self, initial=21.0):
        """Start with the given temperature in Celsius."""
        self._temperature = initial

    def read(self):
        """Return the current temperature in Celsius."""
        return self._temperature

    def update(self, value):
        """Set the temperature to a new value."""
        self._temperature = value