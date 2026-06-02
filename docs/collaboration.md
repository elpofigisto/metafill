# Team collaboration

metafill runs locally with no shared backend, so teammates collaborate by
sharing two things separately:

- **Configuration** - your apps list and shared App Store Connect IDs - via the
  **Export JSON** / **Import JSON** buttons on the Settings screen.
- **Metadata** - the actual listing text in `fastlane/<app>/metadata/<locale>/*.txt`
  - via your version control (git) or any file sync.

Secrets are never shared by either path. Each teammate brings their own `.p8`
key file and their own AI provider key.

## Share configuration (Export / Import)

On **Settings → Share configuration**:

- **Export JSON** downloads `aso-config.json` describing your setup.
- **Import JSON** reads such a file and applies it to this machine.

### What Export includes

```json
{
  "version": 1,
  "settings": {
    "teamId": "ABCDE12345",
    "apiKeyId": "2X9R4HXF34",
    "apiIssuerId": "00000000-0000-0000-0000-000000000000",
    "aiProvider": "anthropic",
    "aiModel": ""
  },
  "apps": [
    { "id": "tidyshot", "name": "Tidyshot", "bundleId": "…", "appStoreId": "…", "platform": "ios", "metadataPath": "…" }
  ]
}
```

- **Shared IDs** - Team ID, API Key ID, Issuer ID.
- **AI choice** - provider and model (so the team translates with the same
  model), but **not** the AI API key.
- **Apps** - the full apps list with per-app overrides.

### What Export never includes

- The `.p8` key file or its path (`apiKeyPath`), globally or per app.
- The AI provider **API key** (`aiApiKey`).

These stay on the machine that created them and are excluded from the file.

### What Import does

Importing **replaces** the local apps list and the shared App Store Connect IDs,
and adopts the file's AI provider/model. It **keeps** whatever this machine
already has for:

- The global `.p8` path and any per-app `.p8` overrides (matched back to each app
  by its `id`).
- The local AI API key.

So a teammate can import a fresh `aso-config.json` repeatedly without ever losing
their own keys. The file must contain a non-empty `apps` array or the import is
rejected.

## A typical team workflow

1. **One person sets up the apps.** Add every app on the **Apps** screen, fill in
   the shared Team ID / Key ID / Issuer ID and the AI provider on **Settings**,
   then click **Export JSON**.
2. **Share the file.** Commit `aso-config.json` to your repo, or send it over
   your usual channel. It carries no secrets.
3. **Each teammate imports.** They click **Import JSON**, then add their own
   secrets once: **Upload .p8** under App Store Connect API, and paste their own
   key under **AI translation**.
4. **Share the metadata text via git.** The listing files live under
   `fastlane/<app>/metadata/<locale>/`. Commit them so everyone edits, reviews,
   and translates against the same source. Use **Refresh** in the locale sidebar
   to re-scan after pulling new files.
5. **Divide and review.** Different people can own different locales, mark them
   reviewed, and publish - publishing always targets a **draft** in App Store
   Connect, never submitting for review.

## Why this split

Configuration and metadata change at different rates and live in different
places. Keeping config in a single portable JSON makes onboarding a teammate one
import away, while keeping the metadata text in plain files makes it diff-able
and reviewable in your existing version control. Secrets never travel in either,
so sharing is safe by default.
