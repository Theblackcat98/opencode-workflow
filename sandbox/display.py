"""Formatting helpers for presenting temperatures to a user."""


def format_temperature(celsius, unit="c"):
    """Format a Celsius value as text in the requested unit (c or f)."""
    if unit == "f":
        return f"{celsius * 9 / 5 + 32:.1f} F"
    return f"{celsius:.1f} C"
