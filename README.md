# Workspaces JSON Log Viewer

# by Bernardo Felipe Martinez Meave https://github.com/behrmart

# LinkedIn:

# https://www.linkedin.com/in/bernardo-f-mart%C3%ADnez-meave-608421a/

# Application is built on Angular and TypeScript. Optimized by OpenAI Codex in Visual Studio Code.

# Angular 19 single-page application for loading, parsing, filtering, and inspecting Workspaces/WSFE/AXP-style JSON log exports directly in the browser.

## 1. Purpose

This project provides a local-first log analysis interface for large JSON exports where users need to:

- upload a JSON file from disk,
- inspect metadata and events in human-readable form,
- filter events quickly by text and categorical dimensions,
- drill into raw JSON for both metadata blocks and individual events.

No backend/API is used. All parsing and filtering happens client-side in the browser.

## 2. Technical Scope

- Framework: Angular 19 (standalone component architecture)
- Language: TypeScript (strict mode enabled)
- UI: Angular template control flow (`@if`, `@for`) + CSS (dark theme)
- Test stack: Jasmine + Karma
- Build: `@angular-devkit/build-angular:application`

## 3. Runtime Architecture

### 3.1 Entry points

- Bootstrap: `src/main.ts`
- App config/providers: `src/app/app.config.ts`
- Root component: `src/app/app.component.ts`
- View template: `src/app/app.component.html`
- Styles: `src/app/app.component.css`, `src/styles.css`

### 3.2 Data flow

1. User selects a JSON file in the upload input.
2. File content is read via `FileReader.readAsText`.
3. JSON is parsed (`JSON.parse`) with guarded error handling.
4. Parser derives:
   - metadata record (`meta`/`metadata`/`header`),
   - event collection (multiple supported shapes),
   - normalized `EventView[]` used by the UI.
5. Filter option catalogs are generated from normalized events.
6. UI reacts to filter state and renders the filtered list.

## 4. Supported JSON Shapes

Event extraction supports these patterns:

- top-level array of events,
- object arrays in keys: `events`, `logs`, `records`, `entries`, `items`,
- nested arrays in `data.events`, `data.logs`, `payload.events`, `payload.logs`,
- fallback: first root array that "looks like" events (`timestamp`/`topic`/`message`/`event`/`data` present).

Metadata root is resolved from:

- `meta`,
- `metadata`,
- `header`.

## 5. Event Normalization Model

Internal event model (`EventView`) includes:

- identity: `uid`, `id`
- chronology: `timestamp`
- classification: `level`, `levelTone`
- dimensions: `application`, `context`
- presentation: `message`, `lineTitle`
- inspection: `rawJson`
- filtering support: `searchable`

### 5.1 Level normalization

Raw level candidates are resolved from:

- `metaData.level`, `event.level`, `event.severity`, `data.level`, `data.severity`, `data.notificationType`, `event.channel`.

Normalized outcomes:

- `CRITICAL`/`FATAL` => `CRITICAL`
- `ERROR`/`ERR` => `ERROR`
- `WARN*` => `WARNING`
- `DEBUG` => `DEBUG`
- `TRACE` => `TRACE`
- `INFO`/`LOG` => `INFO`
- uppercase fallback token if pattern matches
- otherwise empty (later defaults to `UNKNOWN`)

### 5.2 Level color tones (UI)

`levelTone` categories:

- `error` (red)
- `warning` (yellow)
- `info` (blue)
- `debug` (purple)
- `trace` (teal)
- `neutral` (gray-blue)

## 6. Filtering Engine

The filter system is client-side and reactive.

### 6.1 Available filters

- Free-text search (`searchText`)
- Multi-select levels (`selectedLevels[]`)
- Multi-select application/channel (`selectedApplications[]`)
- Multi-select context/topic (`selectedContexts[]`)

### 6.2 Filter semantics

An event is included when all conditions are true:

- text term is empty OR present in `event.searchable`,
- no levels selected OR event level is in selected levels,
- no applications selected OR event application is in selected applications,
- no contexts selected OR event context is in selected contexts.

`Clear filters` resets all selections plus search text.

## 7. Metadata Rendering

Metadata is rendered in two layers:

### 7.1 Pretty metadata blocks

Structured cards are generated for:

- Browser
- Agent
- Settings
- Templates
- Widgets

Each card includes:

- subtitle summary,
- normalized key facts,
- compact highlight chips,
- expandable raw JSON block.

### 7.2 Generic metadata cards

All other metadata keys are rendered as compact cards with:

- key label,
- summarized value,
- `View JSON` expandable raw payload.

## 8. Events View

Events are displayed in a condensed single-line table layout with:

- sticky header,
- horizontal scrolling support for dense datasets,
- per-row `View JSON` toggle to inspect raw event payload.

## 9. UI/Theme/Responsiveness

- Global dark theme with gradient background and high-contrast cards.
- Layout uses full width (not constrained to a narrow max-width container).
- Responsive breakpoints tune filter and metadata grids for smaller screens.
- Checkbox-based filter groups support many categorical options.

## 10. Quality and Validation

### 10.1 TypeScript / Angular compiler

Strictness is enabled (`tsconfig.json`):

- `strict: true`
- `strictTemplates: true`
- `strictInjectionParameters: true`
- `noImplicitReturns`, `noFallthroughCasesInSwitch`, etc.

### 10.2 Tests

Current unit tests are baseline smoke tests in `src/app/app.component.spec.ts`:

- component creation,
- title existence,
- upload input presence.

### 10.3 Build status

Build succeeds with current codebase.

Known warning:

- Angular `anyComponentStyle` budget warning (`4kB` warning threshold) is exceeded by `src/app/app.component.css`.
- This is non-blocking (build still succeeds) because `maximumError` is `8kB`.

## 11. Commands

Install dependencies:

```bash
npm install
```

Run dev server:

```bash
npm start
```

Build production bundle:

```bash
npm run build
```

Run tests:

```bash
npm test
```

## 12. Project Structure (key files)

- `src/app/app.component.ts` - core parsing, normalization, filtering, and UI state
- `src/app/app.component.html` - upload/filter/metadata/events layout
- `src/app/app.component.css` - dark theme + component styling
- `src/styles.css` - global base styles
- `src/app/app.component.spec.ts` - baseline unit tests
- `angular.json` - build/serve/test targets and budgets
- `tsconfig.json` - strict TypeScript compiler configuration

## 13. Constraints and Notes

- Local-only processing: large files may impact browser memory/CPU.
- No persistence layer: state resets on refresh.
- JSON view truncation guard is applied to very large metadata expansions to avoid rendering excessive payloads.
- This app is intentionally single-component for speed of iteration; future scaling may benefit from feature modules/services.

## 14. Suggested Next Engineering Steps

- Split `AppComponent` into focused services/components (`parser`, `filters`, `metadata-view`, `events-table`).
- Add dedicated parser unit tests with fixtures for each supported schema variant.
- Add virtualization for very large event lists.
- Make style budget compliant (split CSS into shared/component styles or raise budget intentionally with justification).
