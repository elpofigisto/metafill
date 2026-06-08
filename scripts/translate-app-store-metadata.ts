#!/usr/bin/env node

import path from "node:path";
import process from "node:process";

import { loadApps, loadSettings, metadataRootForApp } from "../lib/app-registry.js";
import { defaultModel } from "../lib/ai-provider.js";
import {
  normalizeFieldList,
  normalizeLocale,
  SOURCE_LOCALE,
  TARGET_LOCALES,
} from "../lib/app-store-metadata.js";
import { toMessage } from "../lib/errors";
import { readSourceMetadata, translateLocale } from "../lib/translation/engine.js";
import type { AppConfig } from "../lib/types";

interface ParsedArgs {
  allApps: boolean;
  app: string | null;
  locale: string | null;
  locales: string[] | null;
  fields: string[] | null;
  help: boolean;
}

interface AiConfig {
  provider: string;
  model: string;
  apiKey: string;
}

interface SummaryRow {
  app: string;
  locale: string;
  fileName: string;
  chars: number;
  limit: number | string;
  status: string;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    allApps: false,
    app: null,
    locale: null,
    locales: null,
    fields: null,
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

    if (arg === "--fields") {
      args.fields = argv[i + 1].split(",").map((field) => field.trim()).filter(Boolean);
      i += 1;
      continue;
    }

    if (arg.startsWith("--fields=")) {
      args.fields = arg.slice("--fields=".length).split(",").map((field) => field.trim()).filter(Boolean);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function printHelp(): void {
  console.log(`
Translate App Store metadata with Anthropic Claude.

Usage:
  npm run translate:metadata
  npm run translate:metadata -- --app tidyshot
  npm run translate:metadata -- --locale uk
  npm run translate:metadata -- --locales uk,de,ja
  tsx scripts/translate-app-store-metadata.ts --app tidyshot --locale de
  tsx scripts/translate-app-store-metadata.ts --all-apps
  tsx scripts/translate-app-store-metadata.ts --app tidyshot --fields name.txt,keywords.txt

Fields:
  Defaults to all. Pass a comma-separated subset to translate only those:
  name.txt, subtitle.txt, description.txt, keywords.txt, promotional_text.txt, release_notes.txt
  support_url.txt and marketing_url.txt are copied verbatim to each locale, not translated.

AI provider:
  Configure provider, model, and API key in Settings (or via env:
  ANTHROPIC_API_KEY / OPENAI_API_KEY / GEMINI_API_KEY, AI_PROVIDER, AI_MODEL).

Apps:
  Configure apps in apps.config.json.

Locales:
  ${TARGET_LOCALES.join(", ")}
`.trim());
}

function printSummary(rows: SummaryRow[]): void {
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

  const formatRow = (row: string[]) =>
    row.map((cell, index) => cell.padEnd(widths[index])).join("  ");

  console.log("");
  console.log(formatRow(headers));
  console.log(formatRow(widths.map((width) => "-".repeat(width))));
  for (const row of body) {
    console.log(formatRow(row));
  }
}

function selectApps({
  apps,
  appId,
  allApps,
}: {
  apps: AppConfig[];
  appId: string | null;
  allApps: boolean;
}): AppConfig[] {
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

async function main(): Promise<void> {
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

  // null/empty -> all fields; otherwise a validated subset.
  const selectedFields = normalizeFieldList(args.fields);

  const rootDir = process.cwd();
  const settings = await loadSettings(rootDir);
  const provider = settings.aiProvider;
  const ai: AiConfig = {
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
  const rows: SummaryRow[] = [];

  for (const app of selectedApps) {
    const metadataRoot = metadataRootForApp(rootDir, app);
    const sourceDir = path.join(metadataRoot, SOURCE_LOCALE);
    const sourceEntries = await readSourceMetadata(sourceDir);

    for (const locale of locales) {
      rows.push(
        ...(await translateLocale({
          ai,
          app,
          metadataRoot,
          sourceEntries,
          locale,
          selectedFields,
        })),
      );
    }
  }

  printSummary(rows);
}

main().catch((error: unknown) => {
  console.error(toMessage(error));
  process.exitCode = 1;
});
