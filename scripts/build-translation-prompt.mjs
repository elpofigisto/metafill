#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { loadConfig, metadataRootForApp } from "../lib/app-registry.js";
import {
  FILE_LIMITS,
  LOCALE_LABELS,
  METADATA_FILES,
  SOURCE_LOCALE,
  TARGET_LOCALES,
} from "../lib/app-store-metadata.js";

function parseArgs(argv) {
  const args = { app: null, locales: null, missing: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--app") {
      args.app = argv[i + 1];
      i += 1;
    } else if (arg.startsWith("--app=")) {
      args.app = arg.slice("--app=".length);
    } else if (arg === "--missing") {
      args.missing = true;
    } else if (arg === "--locales") {
      args.locales = argv[i + 1].split(",").map((l) => l.trim()).filter(Boolean);
      i += 1;
    } else if (arg.startsWith("--locales=")) {
      args.locales = arg.slice("--locales=".length).split(",").map((l) => l.trim()).filter(Boolean);
    }
  }

  return args;
}

// Target locales that are not yet fully populated (folder missing, or any of
// the six metadata files absent/empty). Used by --missing.
async function pendingLocales(metadataRoot) {
  const pending = [];

  for (const locale of TARGET_LOCALES) {
    let full = true;

    for (const fileName of METADATA_FILES) {
      try {
        const value = await readFile(path.join(metadataRoot, locale, fileName), "utf8");
        if (!value.trim()) {
          full = false;
          break;
        }
      } catch {
        full = false;
        break;
      }
    }

    if (!full) {
      pending.push(locale);
    }
  }

  return pending;
}

function selectApp(apps, appId) {
  const selectedId = appId || apps[0]?.id;
  const app = apps.find((candidate) => candidate.id === selectedId);

  if (!app) {
    throw new Error(`Unknown app "${selectedId}". Available: ${apps.map((a) => a.id).join(", ")}`);
  }

  return app;
}

async function readSource(metadataRoot) {
  const dir = path.join(metadataRoot, SOURCE_LOCALE);
  const source = {};

  for (const fileName of METADATA_FILES) {
    try {
      source[fileName] = (await readFile(path.join(dir, fileName), "utf8")).replace(/\n+$/, "");
    } catch (error) {
      if (error.code === "ENOENT") {
        source[fileName] = "";
      } else {
        throw error;
      }
    }
  }

  return source;
}

function buildPrompt(app, source, locales) {
  const localeList = locales
    .map((locale) => `  - ${locale} — ${LOCALE_LABELS[locale] || locale}`)
    .join("\n");

  const fieldKeys = METADATA_FILES.map((f) => `"${f}"`).join(", ");

  return `You are a senior, native-level App Store Optimization (ASO) copywriter and localizer,
fluent at native level in every target language listed below. You localize marketing
copy so it reads like it was written by a native marketer in that market — not a literal
translation.

# Task
Localize the App Store metadata for the app "${app.name}" from English (en-US) into EVERY
target locale listed below. For each locale, produce all six metadata fields.

# Global rules
- Keep the brand name "${app.name}" exactly as written, untranslated, in every language and script.
- Do NOT translate product/technology names, UI targets, file names, or template tokens.
  Keep these literal: macOS, Mac, Finder, Dock, Slack, Mail, Quick Look, Launch at Login,
  OCR, CleanShot, Shottr, PNG, figma-dashboard-header.png, [app], [date], [keywords].
- Use a regular hyphen (-). Never use an en dash or em dash.
- Localize, do not translate literally. Adapt tone, idioms, and word order to each market.
- Respect each field's CHARACTER limit (count characters, not bytes; each CJK character counts as 1).
- Output ONLY one valid JSON object. No commentary, no markdown, no code fences.

# Field rules
- name.txt — App name. Max ${FILE_LIMITS["name.txt"]} chars. Keep "${app.name}"; localize the
  descriptive part. If a faithful translation is too long, shorten while keeping the strongest meaning.
- subtitle.txt — App Store subtitle. Max ${FILE_LIMITS["subtitle.txt"]} chars. ${
    source["subtitle.txt"] ? "Localize the English subtitle below." : "The English source is EMPTY — CREATE a punchy native subtitle that complements the name without repeating its words."
  }
- description.txt — Max ${FILE_LIMITS["description.txt"]} chars. Translate/localize the English
  description below. PRESERVE the structure exactly: the ALL-CAPS section headers (localize the
  words but keep them as headers), blank lines between sections, and every "- " bullet marker.
- keywords.txt — Max ${FILE_LIMITS["keywords.txt"]} chars TOTAL. ${
    source["keywords.txt"] ? "Localize as ASO keywords." : "The English source is EMPTY — GENERATE locale-appropriate ASO keywords that real users in that language actually search for (e.g. screenshot manager, organizer, OCR, search)."
  } Comma-separated, NO spaces after commas. Do not reuse words already in that locale's name or
  subtitle. Never translate keywords literally — use terms native users really type.
- promotional_text.txt — Max ${FILE_LIMITS["promotional_text.txt"]} chars. ${
    source["promotional_text.txt"] ? "Localize the English promotional text below." : "The English source is EMPTY — CREATE a short, native promotional line."
  }
- release_notes.txt — Translate/localize the English release notes below. Keep the "- " bullet structure.

# Source (English, en-US)
<<<NAME
${source["name.txt"]}
NAME

<<<SUBTITLE
${source["subtitle.txt"]}
SUBTITLE

<<<DESCRIPTION
${source["description.txt"]}
DESCRIPTION

<<<KEYWORDS
${source["keywords.txt"]}
KEYWORDS

<<<PROMOTIONAL_TEXT
${source["promotional_text.txt"]}
PROMOTIONAL_TEXT

<<<RELEASE_NOTES
${source["release_notes.txt"]}
RELEASE_NOTES

# Target locales (code — language)
${localeList}

# Output format
Return ONE JSON object keyed by locale code. Each value is an object with EXACTLY these keys:
${fieldKeys}.

Example shape (values illustrative only):
{
  "de-DE": {
    "name.txt": "...",
    "subtitle.txt": "...",
    "description.txt": "...",
    "keywords.txt": "...",
    "promotional_text.txt": "...",
    "release_notes.txt": "..."
  }
}

# If the output is too long for one reply
Output COMPLETE locales only — never a partial locale. Stop at a locale boundary and end your
message with a line containing only: ...CONTINUE
I will reply "continue" and you resume with the next locales, never repeating ones already given.
`;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const rootDir = process.cwd();
  const { apps } = await loadConfig(rootDir);
  const app = selectApp(apps, args.app);
  const metadataRoot = metadataRootForApp(rootDir, app);
  const source = await readSource(metadataRoot);

  let locales;
  if (args.locales) {
    const unknown = args.locales.filter((locale) => !TARGET_LOCALES.includes(locale));
    if (unknown.length > 0) {
      throw new Error(`Not target locales: ${unknown.join(", ")}`);
    }
    locales = args.locales;
  } else if (args.missing) {
    locales = await pendingLocales(metadataRoot);
    if (locales.length === 0) {
      process.stderr.write("All target locales are already fully populated.\n");
      return;
    }
    process.stderr.write(`Building prompt for ${locales.length} remaining locale(s): ${locales.join(", ")}\n`);
  } else {
    locales = TARGET_LOCALES;
  }

  process.stdout.write(buildPrompt(app, source, locales));
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
