#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { loadApps, loadSettings, metadataRootForApp } from "../lib/app-registry.js";
import { defaultModel, translateText } from "../lib/ai-provider.js";
import {
  LOCALE_LABELS,
  METADATA_FILES,
  metadataFileLimit,
  normalizeLocale,
  SOURCE_LOCALE,
  TARGET_LOCALES,
} from "../lib/app-store-metadata.js";
import { clearLocaleReview } from "../lib/review-state.js";

const FILE_PURPOSES = {
  "name.txt": "App Store app name",
  "subtitle.txt": "App Store subtitle",
  "description.txt": "App Store description",
  "keywords.txt": "App Store ASO keyword field",
  "promotional_text.txt": "App Store promotional text",
  "release_notes.txt": "App Store release notes",
};

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

function charCount(value) {
  return Array.from(value).length;
}

function stripCodeFences(value) {
  const trimmed = value.trim();
  const fenceMatch = trimmed.match(/^```(?:\w+)?\s*([\s\S]*?)\s*```$/);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

function normalizeOutput(fileName, value) {
  let output = stripCodeFences(value)
    .replace(/\u2013|\u2014|\u2212/g, "-")
    .trim();

  if (fileName === "keywords.txt") {
    output = output
      .split(",")
      .map((keyword) => keyword.trim())
      .filter(Boolean)
      .join(",");
  }

  return output;
}

function buildSystemPrompt() {
  return [
    "You are a senior native App Store localization and ASO copywriter.",
    "Translate and localize marketing metadata for the target locale.",
    "Use natural native phrasing that sounds like marketing copy, not literal translation.",
    "Keep the brand name Tidyshot untranslated.",
    "Use regular hyphens (-), never en dashes or em dashes.",
    "Return only the final localized text for the requested file.",
    "Do not wrap the answer in quotes, Markdown, bullets, labels, or code fences.",
  ].join(" ");
}

function buildUserPrompt({ fileName, sourceText, locale, translatedName, translatedSubtitle }) {
  const localeName = LOCALE_LABELS[locale] ?? locale;
  const limit = metadataFileLimit(fileName);
  const rules = [
    `Target locale: ${locale} (${localeName}).`,
    `File: ${fileName} (${FILE_PURPOSES[fileName]}).`,
  ];

  if (fileName === "name.txt") {
    rules.push(
      "Max length: 30 characters.",
      "If a direct translation exceeds 30 characters, shorten intelligently while keeping the strongest App Store meaning.",
    );
  } else if (fileName === "subtitle.txt") {
    rules.push(
      "Max length: 30 characters.",
      "If a direct translation exceeds 30 characters, shorten intelligently while keeping the strongest App Store meaning.",
    );
  } else if (fileName === "keywords.txt") {
    rules.push(
      "Max length: 100 characters total.",
      "Return comma-separated keywords with no spaces after commas.",
      "Do not translate literally.",
      "Generate locale-appropriate ASO keywords that real users in this language would search.",
      "Strip any words already present in the localized name or localized subtitle.",
      `Localized name to exclude from keywords: ${translatedName || "(not available)"}`,
      `Localized subtitle to exclude from keywords: ${translatedSubtitle || "(not available)"}`,
    );
  } else if (fileName === "promotional_text.txt") {
    rules.push("Max length: 170 characters.");
  } else if (fileName === "description.txt") {
    rules.push(
      "Max length: 4000 characters.",
      "Preserve the section structure and line breaks from the source.",
    );
  } else if (fileName === "release_notes.txt") {
    rules.push("Preserve the intent and structure of the release notes.");
  }

  if (limit) {
    rules.push(`The final answer must be at or under ${limit} characters.`);
  }

  return `
Rules:
${rules.map((rule) => `- ${rule}`).join("\n")}

Source text:
${sourceText}
`.trim();
}

async function readSourceMetadata(sourceDir) {
  const entries = new Map();

  for (const fileName of METADATA_FILES) {
    const filePath = path.join(sourceDir, fileName);

    try {
      entries.set(fileName, await readFile(filePath, "utf8"));
    } catch (error) {
      if (error.code === "ENOENT") {
        throw new Error(`Missing source metadata file: ${filePath}`);
      }

      throw error;
    }
  }

  return entries;
}

async function translateField({ ai, fileName, sourceText, locale, translatedName, translatedSubtitle }) {
  const text = await translateText({
    provider: ai.provider,
    model: ai.model,
    apiKey: ai.apiKey,
    system: buildSystemPrompt(),
    user: buildUserPrompt({ fileName, sourceText, locale, translatedName, translatedSubtitle }),
    maxTokens: fileName === "description.txt" ? 3000 : 1200,
    temperature: fileName === "keywords.txt" ? 0.5 : 0.35,
  });

  return normalizeOutput(fileName, text);
}

function validateGeneratedFile(locale, fileName, text) {
  const count = charCount(text);
  const limit = metadataFileLimit(fileName);
  const exceedsLimit = typeof limit === "number" && count > limit;

  if (exceedsLimit) {
    console.warn(
      `WARN ${locale}/${fileName}: ${count}/${limit} chars exceeds App Store limit.`,
    );
  }

  if (fileName === "keywords.txt" && /\s,|,\s/.test(text)) {
    console.warn(`WARN ${locale}/${fileName}: keywords contain spaces around commas.`);
  }

  return {
    locale,
    fileName,
    chars: count,
    limit: limit ?? "",
    status: exceedsLimit ? "WARN" : "OK",
  };
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

async function translateLocale({ ai, app, metadataRoot, sourceEntries, locale }) {
  const outputDir = path.join(metadataRoot, locale);
  const rows = [];
  const translated = new Map();

  await mkdir(outputDir, { recursive: true });

  for (const fileName of METADATA_FILES) {
    console.log(`Translating ${app.id}/${locale}/${fileName}...`);

    const output = await translateField({
      ai,
      fileName,
      sourceText: sourceEntries.get(fileName),
      locale,
      translatedName: translated.get("name.txt"),
      translatedSubtitle: translated.get("subtitle.txt"),
    });

    translated.set(fileName, output);

    const outputPath = path.join(outputDir, fileName);
    await writeFile(outputPath, `${output}\n`, "utf8");

    rows.push({
      app: app.id,
      ...validateGeneratedFile(locale, fileName, output),
    });
  }

  await clearLocaleReview(metadataRoot, locale);

  return rows;
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
