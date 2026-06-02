# Command-line usage

Everything the web UI does is also available as npm scripts, reading the same
`apps.config.json`. Pass script arguments after `--`.

## Fetch metadata from App Store Connect

```bash
npm run fetch:metadata -- --app myapp
```

Downloads your existing metadata for the app via Fastlane and writes it into the
app's metadata folder. Overwrites local files. Needs a bundle ID, credentials,
and Fastlane installed.

## Translate

```bash
npm run translate:metadata -- --app myapp --locales uk,de-DE,ja
npm run translate:metadata -- --app myapp --all-apps   # every configured app
```

Machine-translates from `en-US` into the given locales using your configured AI
provider and model (Settings, or env vars). Without `--locales`, it does all
supported target locales.

## Publish (deliver)

```bash
npm run deliver:metadata -- --app myapp --locales en-US,uk --confirm
```

Uploads the listed locales to your editable App Store Connect version as a
draft. Requires `--confirm`, and each locale must be marked reviewed. It does
**not** submit for review. Fastlane output streams live and is also written to a
timestamped file in `logs/`.

## Translate with another model (bring your own)

To use a model you do not have an API key wired up for, generate a prompt, run
it through that model, and import the JSON it returns:

```bash
# Prompt for only the locales that still need work
npm run prompt:translations -- --app myapp --missing > prompt.md

# Paste prompt.md into the model, save its JSON reply as reply.json, then:
npm run import:translations -- --app myapp --file reply.json
```

`prompt:translations` also accepts `--locales a,b,c` to target specific locales,
or no flag for all target locales. The importer is idempotent per locale,
normalizes dashes and keyword spacing, flags over-limit fields, and marks
imported locales as needing review. After importing while the UI is open, click
**Refresh** to see the new status.

## Notes

- App `platform` (`ios` / `osx` / `appletvos`) must match the app's App Store
  platform, or Fastlane cannot find the version to edit.
- Credentials resolve as: per-app override, then Settings, then `.env`
  (`APP_STORE_CONNECT_*`, and `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` /
  `GEMINI_API_KEY`, `AI_PROVIDER`, `AI_MODEL`).
