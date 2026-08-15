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
  heating runs.
- `test_*.py` — `unittest` suite (stdlib only, no dependencies).

## Development

Run the full suite from the repo root:

```
python3 -m unittest discover -s sandbox
```

## Roadmap (training features)

- `--version` flag on the CLI
- Fahrenheit mode across display and sensor/thermostat
- Caching of heating decisions (intentionally conflicts with tests)