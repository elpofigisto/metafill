# Running with Docker

metafill ships a container image so you can run it without installing Node,
Ruby, or Fastlane yourself - they are all baked into the image. It stays BYOK
and local: your keys and config live on your machine and are mounted in, nothing
is sent to any poTeam server.

> The image carries **Ruby + Fastlane** (not just Node) because Sync and Publish
> shell out to Fastlane's `deliver`. That makes the first build a few minutes and
> the image ~1.4 GB - normal for this tool.

## Requirements

- Docker Engine + Compose (Docker Desktop or OrbStack). Check with
  `docker compose version`.
- Same keys as the native setup: an App Store Connect `.p8` (only for Sync /
  Publish) and an AI provider key for translation. See
  [Getting started](getting-started.md) for where to obtain them.

## Quick start

```bash
git clone https://github.com/elpofigisto/metafill.git
cd metafill
cp apps.config.example.json apps.config.json   # first run only
docker compose up --build
```

Open <http://localhost:3000> and follow the
[first-time setup](getting-started.md#first-time-setup). The first build
compiles Fastlane and takes a few minutes; later runs start in seconds.

Stop it with `Ctrl-C`, or `docker compose down` if you started it detached
(`docker compose up -d`).

## Where your data lives

The container is disposable; everything that matters is bind-mounted to the host
so it survives rebuilds:

| Host path             | In container             | What it is                                   |
| --------------------- | ------------------------ | -------------------------------------------- |
| `./apps.config.json`  | `/app/apps.config.json`  | Team/key IDs + per-provider API keys         |
| `./fastlane`          | `/app/fastlane`          | Your products' metadata content (per locale) |
| `./logs`              | `/app/logs`              | Per-run operation logs                       |

`apps.config.json` must exist before the first `up` (the `cp` above), otherwise
Docker creates a directory in its place.

## Keys and secrets

Nothing secret is baked into the image (`.dockerignore` excludes `*.p8`,
`apps.config.json`, and `.env`). Provide credentials two ways:

- **Via the UI** - open Settings and paste your keys; they save into the
  mounted `apps.config.json`.
- **Via `.env`** (optional) - create a `.env` next to `docker-compose.yml`. It is
  loaded automatically:

  ```env
  ANTHROPIC_API_KEY=sk-ant-...
  OPENAI_API_KEY=sk-...
  GEMINI_API_KEY=...
  APP_STORE_CONNECT_TEAM_ID=ABCDE12345
  APP_STORE_CONNECT_API_KEY_ID=2X9R4HXF34
  APP_STORE_CONNECT_API_ISSUER_ID=00000000-0000-0000-0000-000000000000
  ```

### The `.p8` key (for Sync / Publish)

Uploading a `.p8` through the UI writes it inside the container, so it would not
survive a rebuild. For Docker, mount the key read-only instead. In
`docker-compose.yml`, uncomment the key volume and the environment block:

```yaml
    volumes:
      # ...
      - ${ASC_KEY_FILE:-./AuthKey.p8}:/keys/AuthKey.p8:ro

    environment:
      APP_STORE_CONNECT_API_KEY_PATH: /keys/AuthKey.p8
```

Then point `ASC_KEY_FILE` at your key (in `.env` or your shell):

```bash
ASC_KEY_FILE=/absolute/path/to/AuthKey_XXXXXXXX.p8 docker compose up
```

You can skip this entirely if you only edit and translate metadata (no Sync /
Publish).

## Common commands

```bash
docker compose up --build      # build + run (foreground)
docker compose up -d           # run detached
docker compose logs -f         # follow logs
docker compose down            # stop and remove the container
docker compose build --no-cache  # force a clean rebuild
```

## Notes

- The CLI scripts ([Command-line usage](cli.md)) also work inside the container:
  `docker compose exec metafill npm run translate:metadata -- --app tidyshot`.
- Port 3000 is mapped to the host. Change the left side of `"3000:3000"` in
  `docker-compose.yml` if it's taken.
- This is a local-run image, not a hosted multi-user service - it assumes one
  user on one machine, the same as running it natively.
