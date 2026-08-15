"""Command-line demo for the thermostat sandbox."""

import sys

from sensor import Sensor
from thermostat import Thermostat


def main(argv=None):
    """Run the CLI demo: print heating state for a given temperature."""
    args = argv if argv is not None else sys.argv[1:]
    temperature = 21.0
    if len(args) == 2 and args[0] == "--temperature":
        temperature = float(args[1])
    sensor = Sensor(temperature)
    thermostat = Thermostat()
    heating = thermostat.update(sensor.read())
    print("heating" if heating else "idle")


if __name__ == "__main__":
    main()