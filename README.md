# WS Log Viewer

Angular web interface for loading and analyzing workspace JSON logs (for example `WORKSPACES-LOGS-WSWBIA-1754073450597.json`).

## Features

- Upload a local JSON file from the browser
- Parse and analyze `events[]` entries
- Search text across all event fields
- Filter events by level, application, and context
- Show metadata in a readable format
- Render each event as a readable card with expandable raw JSON

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
