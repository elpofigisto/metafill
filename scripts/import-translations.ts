#!/usr/bin/env node

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

import { loadConfig, metadataRootForApp } from "../lib/app-registry.js";
import {
  ALL_LOCALES,
  charCount,
  LOCALE_LABELS,
  METADATA_FILES,
  metadataFileLimit,
  normalizeLocale,
} from "../lib/app-store-metadata.js";
import { toMessage } from "../lib/errors";
import { clearLocaleReview } from "../lib/review-state.js";
import type { AppConfig } from "../lib/types";

interface ParsedArgs {
  app: string | null;
  file: string | null;
  help: boolean;
}

interface ReportRow {
  locale: string;
  fileName: string;
  count: number;
  limit: number | "";
  status: "OVER" | "ok";
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = { app: null, file: null, help: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--app") {
      args.app = argv[i + 1];
      i += 1;
    } else if (arg.startsWith("--app=")) {
      args.app = arg.slice("--app=".length);
    } else if (arg === "--file") {
      args.file = argv[i + 1];
      i += 1;
    } else if (arg.startsWith("--file=")) {
      args.file = arg.slice("--file=".length);
    }
  }

  return args;
}

function printHelp(): void {
  console.log(`
Import Gemini (or any) JSON translations into per-locale metadata files.

Usage:
  npm run import:translations -- --file translations.json
  npm run import:translations -- --app tidyshot --file translations.json
  pbpaste | npm run import:translations -- --app tidyshot

Input:
  A JSON object keyed by locale code, each value an object of metadata files, e.g.
  { "de-DE": { "name.txt": "...", "description.txt": "...", ... }, "ja": { ... } }
  Surrounding Markdown code fences and a trailing "...CONTINUE" line are tolerated.
`.trim());
}

function selectApp(apps: AppConfig[], appId: string | null): AppConfig {
  const selectedId = appId || apps[0]?.id;
  const app = apps.find((candidate) => candidate.id === selectedId);

  if (!app) {
    throw new Error(`Unknown app "${selectedId}". Available: ${apps.map((a) => a.id).join(", ")}`);
  }

  return app;
}

async function readInput(file: string | null): Promise<string> {
  if (file) {
    return readFile(file, "utf8");
  }

  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function extractJson(raw: string): unknown {
  let text = raw.trim();

  // Strip a wrapping ```json ... ``` fence if present.
  const fence = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fence) {
    text = fence[1].trim();
  }

  // Tolerate a trailing batch marker.
  text = text.replace(/\.\.\.CONTINUE\s*$/i, "").trim();

  // Fall back to the outermost { ... } if there is surrounding prose.
  if (!text.startsWith("{")) {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      text = text.slice(start, end + 1);
    }
  }

  return JSON.parse(text);
}

function stripCodeFences(value: unknown): string {
  const trimmed = String(value).trim();
  const fenceMatch = trimmed.match(/^```(?:\w+)?\s*([\s\S]*?)\s*```$/);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

function normalizeOutput(fileName: string, value: unknown): string {
  let output = stripCodeFences(value)
    .replace(/–|—|−/g, "-")
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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  const rootDir = process.cwd();
  const { apps } = await loadConfig(rootDir);
  const app = selectApp(apps, args.app);
  const metadataRoot = metadataRootForApp(rootDir, app);

  const data = extractJson(await readInput(args.file));

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    throw new Error("Input must be a JSON object keyed by locale code.");
  }

  const rows: ReportRow[] = [];
  const written: string[] = [];
  const unknown: string[] = [];

  for (const [rawLocale, fields] of Object.entries(data as Record<string, unknown>)) {
    const locale = normalizeLocale(rawLocale.trim());

    if (!ALL_LOCALES.includes(locale)) {
      unknown.push(rawLocale);
      continue;
    }

    if (!fields || typeof fields !== "object") {
      continue;
    }

    const fieldMap = fields as Record<string, unknown>;
    const outputDir = path.join(metadataRoot, locale);
    await mkdir(outputDir, { recursive: true });

    let wroteAny = false;

    for (const fileName of METADATA_FILES) {
      if (typeof fieldMap[fileName] !== "string") {
        continue;
      }

      const output = normalizeOutput(fileName, fieldMap[fileName]);
      await writeFile(path.join(outputDir, fileName), `${output}\n`, "utf8");
      wroteAny = true;

      const limit = metadataFileLimit(fileName);
      const count = charCount(output);
      const over = typeof limit === "number" && count > limit;
      rows.push({ locale, fileName, count, limit: limit ?? "", status: over ? "OVER" : "ok" });
    }

    if (wroteAny) {
      await clearLocaleReview(metadataRoot, locale);
      written.push(locale);
    }
  }

  for (const row of rows) {
    const flag = row.status === "OVER" ? "  <-- OVER LIMIT" : "";
    console.log(
      `${row.locale.padEnd(8)} ${row.fileName.padEnd(20)} ${String(row.count).padStart(4)}/${row.limit}${flag}`,
    );
  }

  console.log("");
  console.log(
    `Imported ${written.length} locale(s) for ${app.name}: ${written
      .map((locale) => `${LOCALE_LABELS[locale] || locale} (${locale})`)
      .join(", ") || "(none)"}.`,
  );

  if (unknown.length > 0) {
    console.log(`Skipped unknown locale key(s): ${unknown.join(", ")}.`);
  }

  const over = rows.filter((row) => row.status === "OVER");
  if (over.length > 0) {
    console.log(
      `WARNING: ${over.length} field(s) exceed App Store limits and should be shortened before publishing.`,
    );
  }
}

main().catch((error: unknown) => {
  console.error(toMessage(error));
  process.exitCode = 1;
});
