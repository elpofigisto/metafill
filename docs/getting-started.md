# Getting started

This walks you from a fresh clone to publishing translated metadata to an App
Store Connect draft.

## Requirements

- Node.js 18 or newer.
- An App Store Connect API key: a `.p8` key file, its Key ID, and the Issuer ID.
  See Apple's guide:
  https://developer.apple.com/documentation/appstoreconnectapi/creating-api-keys-for-app-store-connect-api
- An AI provider key for translation (Anthropic, OpenAI, or Google Gemini).
  For Gemini, create a key in Google AI Studio: https://aistudio.google.com/apikey
- Fastlane, only if you sync from or publish to App Store Connect:
  `brew install fastlane`

## Install and run

```bash
git clone https://github.com/elpofigisto/metafill.git
cd metafill
npm install
npm run dev
```

Open the URL it prints (http://127.0.0.1:3000 by default).

## First-time setup

Do these once. Everything is stored locally in `apps.config.json` (git-ignored).

1. **Settings**
   - Enter your **Team ID**, **API Key ID**, and **Issuer ID**.
   - Click **Upload .p8** and choose your AuthKey file. The status flips to
     "Key file found". (You can also type a path if the file already exists.)
   - Under **AI translation**, pick your **Provider**, optionally set a **Model**
     (blank uses the default), and paste your **API key**.
   - Click **Save settings**.

2. **Apps**
   - Click **Add app**, type the **Bundle ID**, and press **Look up** to fill the
     name and App Store ID from the public App Store.
   - Set the **Platform** (this must match the app: a Mac app needs macOS, or
     Fastlane will not find the version).
   - Click **Save apps**.

## A full run

On the **Metadata** screen, with your app selected:

1. **Seed the source.** Click **Fetch public data** to pull your existing public
   listing into `en-US` (and any locales that already have a public
   localization). Or click **Sync App Store Connect** to download everything in
   your account, including subtitle and keywords.
2. **Edit English.** Open `en-US`, clean up the fields, and keep each within its
   character limit (the counters turn red if you go over).
3. **Translate.** Tick the locales you want in the sidebar and click
   **Translate selected**. Output streams live into the panel.
4. **Review.** Open each translated locale, check it, and click **Mark reviewed**.
   The sidebar badge turns to "reviewed" and the progress count goes up.
5. **Publish.** Tick the reviewed locales and click **Publish reviewed**. metafill
   uploads them to your editable App Store Connect version as a **draft**. It
   does **not** submit for review - you do that in App Store Connect when ready.

## Sharing setup with a team

On **Settings**, use **Export JSON** to save your Team ID, key IDs, and apps list
to a file you can share. It never includes your `.p8` key or AI key. A teammate
uses **Import JSON**, then uploads their own `.p8` and adds their own AI key.

## Doing it from the command line

Every step is also a script. See [Command-line usage](cli.md).
