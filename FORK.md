# Hive Harness

Hive Harness is Nimesh Gyawali's private fork of
[Munder Difflin](https://github.com/chaitanyagiri/munder-difflin) by Chaitanya Giri, used under the
MIT License (see `LICENSE`). Bundled pixel art is by LimeZu and keeps its own license
(see `LICENSE-ASSETS`).

It is the same local multi-agent harness: an orchestrator agent, worker agents, a kanban board with
ASK ME questions, shared memory and the office floor UI. Every agent runs on the CLI subscriptions
you already have (Claude Code, Antigravity, Codex and others). Nothing is metered by the harness.

## What this fork changes

| Area | Upstream | This fork |
| --- | --- | --- |
| Usage telemetry (PostHog) | Sent when built with a key, opt-out in Settings | Hard-disabled in `src/main/analytics.ts`; nothing is sent |
| Auto-updater | Polls `chaitanyagiri/munder-difflin` releases | Polls this repo's releases only |
| Remote model catalog and Settings card | Fetched from upstream `main` | Fetched from this repo's `docs/` (falls back to the built-in copy when the repo is private or offline) |
| App identity | `Munder Difflin`, `in.munderdiffl.app` | `hiveharness`, `com.nimeshgyawali.hiveharness` |

Because the app id changed, Hive Harness keeps its own settings and data folder and does not touch
an existing Munder Difflin install.

The floor token budget (Settings → Autonomy & Budgets) is still there and still **off by default**.
Leave it empty for no limit.

## Build and run (Windows, macOS, Linux)

Needs Node 20+ and Git, plus at least one agent CLI installed and signed in (for example `claude`).

```bash
npm install          # also rebuilds the native terminal module for Electron
npm run dev          # run from source
npm run build        # compile
npx electron-builder --win   # or --mac / --linux, to make an installer in dist/
```

On Windows, `npm install` needs the "Desktop development with C++" workload from the Visual Studio
Build Tools for the native `node-pty` rebuild.

## Pulling in upstream fixes

```bash
git remote add upstream https://github.com/chaitanyagiri/munder-difflin.git
git fetch upstream
git merge upstream/main   # resolve conflicts in the files listed above
```
