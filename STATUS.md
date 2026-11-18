# hiveharness — status (paused 18 Nov 2026)

## Done
- Forked Munder Difflin (MIT) as `hiveharness`: telemetry off, updater and remote config point at this repo, own app id. See `FORK.md`.
- Built and installed on Nimesh's PC (Windows):
  - source: `C:\Users\nimes\tools\hiveharness`
  - installed app: `%LOCALAPPDATA%\Programs\hiveharness` (Start menu + Desktop shortcut)
  - Build notes for this PC: no C++ build tools, so skip `electron-rebuild` for node-pty (it ships
    win32-x64 prebuilds) and get better-sqlite3 with
    `prebuild-install --runtime electron --target 32.3.3`. Package with
    `set CSC_IDENTITY_AUTO_DISCOVERY=false && npx electron-builder --win nsis --x64 -c.npmRebuild=false --publish never`.
- Home dashboard (commit "Home dashboard…"): Tokens card (today / 5h / 7 days, per-agent one-minute
  strips from `cost-ledger.jsonl`), Active now, Tasks in progress, Ask me. Home/Office toggle in the
  title bar. Pushed, **not yet rebuilt or installed on the PC**.

## Not done yet
1. **Move the Munder Difflin project over.** Quit Munder Difflin fully, then run
   `C:\Users\nimes\tools\hiveharness\migrate-from-munder-difflin.cmd` (copies
   `%APPDATA%\munder-difflin` to `%APPDATA%\hiveharness`, skips the token-allowance and telemetry
   files; the original is left untouched). The project itself stays at `D:\Work\NMCTM`.
   Don't run both apps on the same project at once.
2. **Rebuild with the dashboard:** `git pull`, `npm run build`, package (command above), run the
   new installer with `/S`.
3. **Pro-style layout, written from scratch** (Munder Difflin's Pro UI is paid, closed code, so it is
   not copied): left sidebar (Home, Tasks, Inbox, Automations, Memory, Capabilities, Integrations),
   agent list with model / status / context bar, bottom "To [agent]" composer with Send / Steer,
   usage meters in the title bar. Reference: the Home screenshot from 18 Nov.

## Caveat
The public Munder Difflin source stops before the 0.5.10 build that was installed, so some newer
features are missing. Existing data should still load (older code ignores unknown settings and
database tables); check agents and board after the first launch.
