"""Command-line demo for the thermostat sandbox."""

import sys

from sensor import Sensor
from thermostat import Thermostat

VERSION = "1.0.0"


def main(argv=None):
    """Run the CLI demo: print heating state for a given temperature."""
    args = argv if argv is not None else sys.argv[1:]
    if args and args[0] == "--version":
        print(f"thermostat-sandbox {VERSION}")
        return 0
    temperature = 21.0
    if len(args) == 2 and args[0] == "--temperature":
        temperature = float(args[1])
    sensor = Sensor(temperature)
    thermostat = Thermostat()
    heating = thermostat.update(sensor.read())
    print("heating" if heating else "idle")
    return 0


if __name__ == "__main__":
    main()