# WS Log Viewer

Angular web interface for loading and analyzing Workspaces/OWC JSON logs (for example `WORKSPACES-LOGS-WSWBIA-1754073450597.json` and `OWC-BRIGITTE.VALENCIA-21.JAN.2026-03.45.PM.json`).

## Features

- Upload a local JSON file from the browser
- Parse and analyze `events[]` entries
- Search text across all event fields
- Filter events by level, application, and context
- Show metadata in a readable format
- Render events in a condensed one-line table-style view

## Run

1. Install dependencies:

```bash
npm install
```

2. Start the app:

```bash
npm start
```

3. Open `http://localhost:4200/`.

## Build

```bash
npm run build
```

## Test

```bash
npm test
```
