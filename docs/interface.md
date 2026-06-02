# Interface guide

metafill has three screens, linked from the top bar: **Metadata** (`/`),
**Apps** (`/apps`), and **Settings** (`/settings`).

## Metadata screen

The main workspace: a top bar, a locale sidebar on the left, and the editor for
the selected locale on the right.

### Top bar

- **App picker** - switch between your configured apps.
- **Path** - shows `metadataPath/locale` for the current selection.
- **Progress pill** - how many locales are marked reviewed (e.g. `12/50
  reviewed`).
- **Saved / Unsaved changes** - whether the open locale has unsaved edits.
- **Limits exceeded** - appears if any field in the open locale is over its
  character limit.
- **Apps / Settings** - navigate to the other screens.

### Sidebar - Source

- **Fetch public data** - pulls your listing from the public App Store into
  `en-US`, plus any locale that has a real public localization (English
  fallbacks are skipped). Read-only against Apple; overwrites local source files.
- **Sync App Store Connect** - authenticated Fastlane download of everything in
  your App Store Connect account, including subtitle and keywords (which the
  public API never exposes). Overwrites local files and clears review flags.
  Needs a bundle ID and Fastlane installed.

### Sidebar - locale list

- **Search** - filter locales by name or code.
- **N selected** - how many locales are ticked for bulk actions.
- **Refresh** - re-scan files on disk (use after a command-line import); also
  reloads the open locale if you have no unsaved edits.
- **Select all** / **Clear** - tick or untick all visible locales.
- **Each locale row** has a checkbox (for bulk Translate/Publish), the language
  name and code, and a status badge:
  - `reviewed` - marked reviewed.
  - `translated` - has content, not yet reviewed.
  - `empty` - folder exists but the files are blank.
  - `missing` - no files yet.
  - `source` - the en-US source language.
  - a small warning marker if any field is over its limit.
  - Click a row to open that locale in the editor.

### Sidebar - bulk actions

- **Translate selected** - machine-translates the ticked target locales from
  en-US using your configured AI provider. Output streams live into the panel.
- **Publish reviewed** - uploads the ticked locales that are reviewed to your
  App Store Connect draft. Enabled only when the app has a bundle ID, there is a
  reviewed selection, and there are no unsaved edits. Never submits for review.

### Editor pane

- **Locale title and code**, plus a **Reviewed / Needs review** pill.
- **Mark reviewed** - marks the open locale reviewed. Disabled while there are
  unsaved edits or a field is over its limit.
- **Fields** - Name, Subtitle, Keywords (single-line, like App Store Connect),
  and Description, Promotional text, Release notes (multi-line). Each shows a
  live character count against Apple's limit.
- **Save** - writes the open locale's files. Saving clears that locale's review
  flag (changed content needs re-review).
- **Output panel** - live output of the last Fetch / Translate / Publish run.

## Apps screen

Each app is a card:

- **Bundle ID** + **Look up** - the look-up fills the name and App Store ID from
  the public App Store.
- **Name**, **App Store ID**, **Platform** (iOS / macOS / tvOS - must match the
  app's App Store platform).
- **Advanced** - the app's folder ID, metadata path, and per-app credential
  overrides (Team ID, Key ID, Issuer ID, .p8 path) for apps on a different team
  or key.
- **Add app**, **Remove**, **Save apps**.

## Settings screen

Shared by every app; an app can override any of these under its Advanced section.

- **App Store Connect API** - Team ID, API Key ID, Issuer ID, and the `.p8` key
  path.
- **Key file** - status (found / not found / none) plus **Upload .p8** to store
  a key file locally and set its path automatically.
- **AI translation** - Provider (Anthropic / OpenAI / Google Gemini), Model
  (blank uses the provider default), and API key. The key is stored locally and
  excluded from export.
- **Share configuration** - **Export JSON** (Team ID, key IDs, apps list - never
  the `.p8` or AI key) and **Import JSON** (replaces the apps list and shared IDs,
  keeps your local keys).

Resolution order for any credential is: per-app override, then global Settings,
then environment variables in `.env`.
