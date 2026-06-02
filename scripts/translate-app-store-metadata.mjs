#!/usr/bin/env node

import path from "node:path";
import process from "node:process";

import { loadApps, loadSettings, metadataRootForApp } from "../lib/app-registry.js";
import { defaultModel } from "../lib/ai-provider.js";
import { normalizeLocale, SOURCE_LOCALE, TARGET_LOCALES } from "../lib/app-store-metadata.js";
import { readSourceMetadata, translateLocale } from "../lib/translation/engine.js";

function parseArgs(argv) {
  const args = {
    allApps: false,
    app: null,
    locale: null,
    locales: null,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }

    if (arg === "--all-apps") {
      args.allApps = true;
      continue;
    }

    if (arg === "--app") {
      args.app = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg.startsWith("--app=")) {
      args.app = arg.slice("--app=".length);
      continue;
    }

    if (arg === "--locale") {
      args.locale = normalizeLocale(argv[i + 1]);
      i += 1;
      continue;
    }

    if (arg.startsWith("--locale=")) {
      args.locale = normalizeLocale(arg.slice("--locale=".length));
      continue;
    }

    if (arg === "--locales") {
      args.locales = argv[i + 1].split(",").map((locale) => normalizeLocale(locale.trim())).filter(Boolean);
      i += 1;
      continue;
    }

    if (arg.startsWith("--locales=")) {
      args.locales = arg.slice("--locales=".length).split(",").map((locale) => normalizeLocale(locale.trim())).filter(Boolean);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function printHelp() {
  console.log(`
Translate App Store metadata with Anthropic Claude.

Usage:
  npm run translate:metadata
  npm run translate:metadata -- --app tidyshot
  npm run translate:metadata -- --locale uk
  npm run translate:metadata -- --locales uk,de,ja
  node scripts/translate-app-store-metadata.mjs --app tidyshot --locale de
  node scripts/translate-app-store-metadata.mjs --all-apps

AI provider:
  Configure provider, model, and API key in Settings (or via env:
  ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY, AI_PROVIDER, AI_MODEL).

Apps:
  Configure apps in apps.config.json.

Locales:
  ${TARGET_LOCALES.join(", ")}
`.trim());
}

function printSummary(rows) {
  const headers = ["App", "Locale", "File", "Chars", "Limit", "Status"];
  const body = rows.map((row) => [
    row.app,
    row.locale,
    row.fileName,
    String(row.chars),
    String(row.limit),
    row.status,
  ]);
  const widths = headers.map((header, index) =>
    Math.max(header.length, ...body.map((row) => row[index].length)),
  );

  const formatRow = (row) =>
    row.map((cell, index) => cell.padEnd(widths[index])).join("  ");

  console.log("");
  console.log(formatRow(headers));
  console.log(formatRow(widths.map((width) => "-".repeat(width))));
  for (const row of body) {
    console.log(formatRow(row));
  }
}

function selectApps({ apps, appId, allApps }) {
  if (allApps && appId) {
    throw new Error("Use either --app or --all-apps, not both.");
  }

  if (allApps) {
    return apps;
  }

  const selectedId = appId || apps[0]?.id;
  const app = apps.find((candidate) => candidate.id === selectedId);

  if (!app) {
    throw new Error(`Unknown app "${selectedId}". Available apps: ${apps.map(({ id }) => id).join(", ")}`);
  }

  return [app];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  if (args.locale && args.locales) {
    throw new Error("Use either --locale or --locales, not both.");
  }

  const locales = args.locale ? [args.locale] : args.locales || TARGET_LOCALES;
  const unknownLocales = locales.filter((locale) => !TARGET_LOCALES.includes(locale));
  if (unknownLocales.length > 0) {
    throw new Error(
      `Unsupported locale: ${unknownLocales.join(", ")}. Supported locales: ${TARGET_LOCALES.join(", ")}`,
    );
  }

  const rootDir = process.cwd();
  const settings = await loadSettings(rootDir);
  const provider = settings.aiProvider;
  const ai = {
    provider,
    model: settings.aiModel || defaultModel(provider),
    apiKey: settings.aiApiKey,
  };

  if (!ai.apiKey) {
    throw new Error(
      `No API key for AI provider "${provider}". Set it in Settings → AI translation (or the matching env var).`,
    );
  }

  console.log(`Translating with ${provider} (${ai.model}).`);

  const apps = await loadApps(rootDir);
  const selectedApps = selectApps({ apps, appId: args.app, allApps: args.allApps });
  const rows = [];

  for (const app of selectedApps) {
    const metadataRoot = metadataRootForApp(rootDir, app);
    const sourceDir = path.join(metadataRoot, SOURCE_LOCALE);
    const sourceEntries = await readSourceMetadata(sourceDir);

    for (const locale of locales) {
      rows.push(...(await translateLocale({ ai, app, metadataRoot, sourceEntries, locale })));
    }
  }

  printSummary(rows);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
