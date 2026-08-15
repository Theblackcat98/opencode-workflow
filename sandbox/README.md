# Thermostat Sandbox

A tiny thermostat simulation used to exercise the engineering harness. This is
a training surface, not a real product: features should stay small, well
tested, and consistent with the conventions in this directory's `AGENTS.md`.

## What it does

- `thermostat.py` — hysteresis-based heating decisions (`Thermostat`) and a
  `clamp` helper.
- `sensor.py` — a simulated temperature `Sensor`.
- `display.py` — `format_temperature` for Celsius/Fahrenheit output.
- `main.py` — CLI demo: `python3 main.py --temperature 19.4` prints whether
  heating runs; `python3 main.py --temperature 25 --unit f` also prints the
  current and setpoint temperatures in the chosen unit; `python3 main.py
  --version` prints the version.
- `test_*.py` — `unittest` suite (stdlib only, no dependencies).

## Usage

```
$ python3 main.py --temperature 25 --unit f
current: 77.0 F
setpoint: 68.0 F
idle
```

## Development

Run the full suite from the repo root:

```
python3 -m unittest discover -s sandbox
```
