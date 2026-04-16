# axiomOS Lite

Free local-first habit and focus PWA trial.

[Get the full version on Gumroad](https://axiomlife.gumroad.com/l/axiomlife)

`axiomOS Lite` is the free entry point to the axiomOS ecosystem. It keeps the
core daily loop simple and fully local, while pointing advanced users to the
full commercial edition.

![Dashboard preview](assets/preview/dashboard-real.png)

## What this package is for

- a free Gumroad download
- a public GitHub repo that funnels users to the full product
- a lightweight local-first trial with no backend and no signup
- a clean starter package for white-label or portfolio distribution

## What is included

- Dashboard
- Habits
- Deep Work
- Tomorrow planning
- Statistics
- local offline-first storage
- browser install support on localhost
- local desktop-style launcher for Windows

## Lite vs Full

| Feature | Lite | Full |
| --- | --- | --- |
| Dashboard, habits, deep work, tomorrow, stats | Yes | Yes |
| Habit limit | Up to 5 habits | Unlimited |
| Advanced modules | Locked | Included |
| Import JSON backups | No | Yes |
| Automatic folder backup | No | Yes |
| Identity and goals | No | Yes |
| Customization and white-label flexibility | Limited | Full |

Full version:

- [Buy axiomOS Full on Gumroad](https://axiomlife.gumroad.com/l/axiomlife)

## 5-minute start

### Windows local app flow

1. Double-click `Start-axiomOS.cmd`
2. Wait for the local launcher to open the app window
3. Start using Lite immediately

### Browser install flow

1. Double-click `Install-axiomOS.cmd`
2. Wait for the browser to open on localhost
3. Use the browser install action in Edge or Chrome

## Screenshots

![Habits preview](assets/preview/habits-real.png)

![Stats preview](assets/preview/stats-real.png)

## Why this works well as a free version

- no backend to configure
- no account required
- separate local storage from the full edition
- direct in-app upgrade path to the full product
- clean package structure that can be published as its own GitHub repo

## Important notes

- use `localhost`, not `file://`, if you want full PWA behavior
- Lite uses storage separate from the full version
- all data stays on the local device unless exported manually
- the full version is available here:
  - [https://axiomlife.gumroad.com/l/axiomlife](https://axiomlife.gumroad.com/l/axiomlife)

## Package layout

- `index.html` - Lite app entrypoint
- `manifest.json` - Lite manifest
- `sw.js` - offline shell cache
- `css/`, `icons/`, `js/` - runtime assets
- `tools/` - local launcher internals
- `assets/preview/` - GitHub-safe screenshots for the repo page
- `Start-axiomOS.cmd` - open as a local app window
- `Install-axiomOS.cmd` - open in browser for install flow
- `Stop-axiomOS.cmd` - stop the local server

## Publish as its own GitHub repo

This folder is already structured to become the root of a public repo such as:

- `axiomos-lite`

Recommended GitHub setup is documented in:

- [`GITHUB_SETUP.md`](GITHUB_SETUP.md)

## Upgrade path

The Lite runtime already includes:

- an upgrade strip inside Settings
- a dismissible upgrade card on the dashboard
- upgrade prompts when Lite limits are hit

Full version:

- [Buy axiomOS Full on Gumroad](https://axiomlife.gumroad.com/l/axiomlife)
