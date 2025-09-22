# candiru

This is a simple game where you play as a possum and try to eat as many bugs as you can before you get eaten by a snake.

Live versions:

- Stable release: https://candiru.xyz
- Dev branch (latest changes): https://dev.candiru.xyz

![really cool gameplay screenshot](https://raw.githubusercontent.com/candirugame/candiru/refs/heads/dev/assets/screenshot.png)

## Installation

Run the project with either Deno 2 or Docker.

- Deno 2: https://deno.com/
- Dockerfile: https://github.com/candirugame/candiru/blob/dev/Dockerfile

## Running with Deno 2

```bash
deno install
deno task start
```

This installs dependencies, builds the project, and starts a server on port 3000. Open http://localhost:3000 in your
browser to play.

## Running with Docker

```bash
docker build -t candiru .
docker run -p 3000:3000 candiru
```

## Contact

Questions or suggestions: open an issue or email team@candiru.xyz
