# broomva-cli

CLI and daemon for [broomva.tech](https://broomva.tech) — prompts, skills, context, and infrastructure monitoring.

## Install

### One command (CLI + skills + bstack)

```sh
curl -fsSL https://broomva.tech/api/install | bash
```

### CLI only (from crates.io)

```sh
cargo install broomva
```

### From source

```sh
git clone https://github.com/broomva/broomva.tech
cd broomva.tech/crates/broomva-cli
cargo install --path .
```

## Usage

```
broomva [OPTIONS] <COMMAND>

Commands:
  auth     Authentication (login, logout, status, token)
  prompts  Manage prompts (list, get, create, update, delete, pull, push)
  skills   Manage skills (list, get, install)
  context  Project context (show, conventions, stack)
  config   Configuration (set, get, reset)
  daemon   Daemon management (start, stop, status, logs, tasks)

Options:
  --api-base <URL>     API base URL [env: BROOMVA_API_BASE]
  --token <TOKEN>      Auth token [env: BROOMVA_TOKEN]
  --format table|json  Output format [default: table]
```

## Authentication

```sh
broomva auth login          # Device code flow (opens browser)
broomva auth login --manual # Paste token manually
broomva auth status         # Check auth state
```

## Prompts

```sh
broomva prompts list --category dev
broomva prompts get my-prompt --raw
broomva prompts pull my-prompt -o prompt.md
broomva prompts push prompt.md --create
```

## Daemon

Infrastructure monitoring daemon with heartbeat loop, sensors, and dashboard.

```sh
broomva daemon start                    # Foreground, railway mode
broomva daemon start --env local        # Target localhost services
broomva daemon start --detach           # Background mode
broomva daemon status --format json
broomva daemon logs --lines 20 --level error
broomva daemon stop
```

Dashboard available at `http://localhost:7890` when running.

## Configuration

Config stored at `~/.broomva/config.json` (backward-compatible with the TS CLI).

```sh
broomva config get
broomva config set daemon.symphonyUrl https://symphony.example.com
broomva config reset
```

## License

MIT
