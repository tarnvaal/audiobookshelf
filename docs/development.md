# Development

## Docker dev cycle

The app runs in Docker. After code changes, rebuild and restart:

```bash
cd /home/tarnv/dev/audiobookshelf
docker build -t audiobookshelf-custom .
docker stop audiobookshelf && docker rm audiobookshelf
docker run -d --name audiobookshelf -p 13378:80 \
  -v /home/tarnv/server/audiobookshelf/audiobooks:/audiobooks \
  -v /home/tarnv/server/audiobookshelf/books:/books \
  -v /home/tarnv/server/audiobookshelf/metadata:/metadata \
  -v /home/tarnv/server/audiobookshelf/config:/config \
  --add-host=host.docker.internal:host-gateway \
  --restart unless-stopped \
  audiobookshelf-custom
```

Use `--no-cache` on the build if Docker serves stale client JS (check the hash in browser console network tab).

## Key details

- **Container name:** `audiobookshelf`
- **Image tag:** `audiobookshelf-custom` (local build)
- **Port:** 13378 -> 80
- **Config/DB:** `/home/tarnv/server/audiobookshelf/config/` (contains `absdatabase.sqlite`)
- **Books:** `/home/tarnv/server/audiobookshelf/books/`
- **`--add-host`:** Required for Kokoro TTS and Ollama (they run on the host, accessed via `host.docker.internal`)

## Lock file sync

The Dockerfile uses `npm ci` which requires `package-lock.json` to be in sync with `package.json`. If you add a dependency:

```bash
# Generate lock file using the same Node version as Docker
docker run --rm -v "$(pwd)/client:/client" -w /client node:20-alpine \
  sh -c "npm install --package-lock-only --ignore-scripts"
```

## Cypress tests

```bash
cd client
xvfb-run npx cypress run --component --spec "cypress/tests/lib/**/*.cy.js"
```

Requires `xvfb` installed (`sudo apt-get install -y xvfb`).

## Reverting to stock audiobookshelf

```bash
docker stop audiobookshelf && docker rm audiobookshelf
docker run -d --name audiobookshelf -p 13378:80 \
  -v /home/tarnv/server/audiobookshelf/audiobooks:/audiobooks \
  -v /home/tarnv/server/audiobookshelf/books:/books \
  -v /home/tarnv/server/audiobookshelf/metadata:/metadata \
  -v /home/tarnv/server/audiobookshelf/config:/config \
  --add-host=host.docker.internal:host-gateway \
  --restart unless-stopped \
  ghcr.io/advplyr/audiobookshelf:latest
```
