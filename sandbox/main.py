"""Command-line demo for the thermostat sandbox."""

import sys

from display import format_temperature
from sensor import Sensor
from thermostat import Thermostat

VERSION = "1.0.0"


def main(argv=None):
    """Run the CLI demo: print heating state, plus temperatures in --unit mode."""
    args = argv if argv is not None else sys.argv[1:]
    if args and args[0] == "--version":
        print(f"thermostat-sandbox {VERSION}")
        return 0
    temperature = 21.0
    unit = None
    i = 0
    while i < len(args):
        if args[i] in ("--temperature", "--unit"):
            if i + 1 >= len(args):
                print(f"error: {args[i]} requires a value", file=sys.stderr)
                return 1
            value = args[i + 1]
            if args[i] == "--temperature":
                try:
                    temperature = float(value)
                except ValueError:
                    print(f"error: invalid temperature '{value}'", file=sys.stderr)
                    return 1
            else:
                unit = value
            i += 2
        else:
            i += 1
    if unit is not None and unit not in ("c", "f"):
        print(f"error: unknown unit '{unit}' (use c or f)", file=sys.stderr)
        return 1
    sensor = Sensor(temperature)
    thermostat = Thermostat()
    heating = thermostat.update(sensor.read())
    line = "heating" if heating else "idle"
    if unit is not None:
        print(f"current: {format_temperature(sensor.read(), unit=unit)}")
        print(f"setpoint: {format_temperature(thermostat.setpoint, unit=unit)}")
    print(line)
    return 0


if __name__ == "__main__":
    sys.exit(main())
