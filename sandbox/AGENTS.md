# Sandbox Conventions

This is a training project for the engineering harness. Follow these
conventions strictly:

- Every public function and class must have a docstring.
- No global mutable state; modules own their state through classes.
- Tests use stdlib `unittest` only. Run the full suite from the repo root:
  `python3 -m unittest discover -s sandbox`
- One responsibility per module; keep the sandbox small.
- No external dependencies, ever.