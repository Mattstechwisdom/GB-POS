# GadgetBoy POS

Minimal desktop POS for a tech repair shop. Built with Electron, Vite, React, TypeScript, and Tailwind CSS.

## Features
- Main screen UI for work orders and customers
- Dark theme with neon-green accents
- In-memory mock data (no DB)
- Electron-builder NSIS packaging for Windows .exe

## Tech Stack
- Electron
- Vite
- React + TypeScript
- Tailwind CSS

## Scripts

```sh
npm i
npm run dev
npm run build && npm run dist # Installer in dist/
```

- `npm run dev` — Launches Electron with React UI in development mode
- `npm run build` — Builds the React app
- `npm run dist` — Packages the app as a Windows .exe installer (NSIS)

## Installer output
- Local installer builds are written to `dist/` (example: `dist/GadgetBoy POS Setup X.Y.Z.exe`).

## Downloading from GitHub
- End users should download the installer from the GitHub **Releases** page (the `.exe` asset), not the “Source code (zip)”.
- You should see a clearly named asset like `GadgetBoy-POS-Setup-X.Y.Z.exe`.

## Updates (GitHub Releases)
- In-app updates use GitHub Releases and require installed builds (NSIS installer), not `npm run dev`.
- To publish an update: bump `package.json` version, tag `vX.Y.Z`, push the tag, and GitHub Actions builds the release artifacts.

## Project Structure

- `/app/electron/electron-main.ts` — Electron bootstrap
- `/src/main.tsx` — React root
- `/src/App.tsx` — Layout composition
- `/src/components/` — UI components
- `/src/lib/` — Mock data, types, helpers
- `/src/styles/index.css` — Tailwind styles
- `electron-builder.yml` — NSIS packaging config

## Out of Scope
- No real database, printing, receipts, or payment integration yet—just the main screen UX and installer packaging.
