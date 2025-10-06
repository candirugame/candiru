# copilot instructions

## linting, formatting, type checking, and building

after completing a task, you may want to run these quality checks. it may be easiest to run them all together from a
single command first. to do that, run the `deno task allchecks` command:

### lint, fmt, type check, build

```bash
deno task allchecks
```

here are some individual checks you can also run if needed. generally if allchecks fails, it's most efficient to keep
repeatedly calling allchecks until it passes.

### linting

```bash
deno task lint
```

### formatting

```bash
deno fmt --check src
```

to apply formatting, simply run

```bash
deno fmt src
```

### type checking

```bash
deno check src
```

### building

```bash
deno task build
```

## edge cases

if dependencies are missing, you may need to run `deno install`. assume that the user has already done this and don't
run an install unless you get an error indicating something is missing.
