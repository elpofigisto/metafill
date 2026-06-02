// Translation engine: reads the source listing and produces localized files for
// a target locale, retrying length-limited fields until they fit.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { translateText } from "../ai-provider.js";
import { METADATA_FILES, metadataFileLimit } from "../app-store-metadata.js";
import { clearLocaleReview } from "../review-state.js";
import { buildSystemPrompt, buildUserPrompt } from "./prompt.js";
import { charCount, normalizeOutput, validateGeneratedFile } from "./normalize.js";

export async function readSourceMetadata(sourceDir) {
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

async function translateField({ ai, brand, fileName, sourceText, locale, translatedName, translatedSubtitle }) {
  const limit = metadataFileLimit(fileName);
  const system = buildSystemPrompt(brand);
  const baseUser = buildUserPrompt({ fileName, sourceText, locale, translatedName, translatedSubtitle });
  // Models can't reliably count characters, so when a length-limited field comes
  // back over the limit we re-prompt with the real count and ask for a shorter
  // rewrite. If every attempt is over, keep the shortest one.
  const maxAttempts = limit ? 4 : 1;

  let lastOutput = null;
  let best = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const user =
      lastOutput && limit
        ? `${baseUser}\n\nYour previous answer was ${charCount(lastOutput)} characters, which is over the ${limit}-character limit. Rewrite it to be at most ${limit} characters while keeping the meaning and natural native phrasing. Count characters carefully before answering.`
        : baseUser;

    const text = await translateText({
      provider: ai.provider,
      model: ai.model,
      apiKey: ai.apiKey,
      system,
      user,
      maxTokens: fileName === "description.txt" ? 3000 : 1200,
      temperature: fileName === "keywords.txt" ? 0.5 : 0.35,
    });

    const output = normalizeOutput(fileName, text);

    if (!limit || charCount(output) <= limit) {
      return output;
    }

    if (!best || charCount(output) < charCount(best)) {
      best = output;
    }
    lastOutput = output;

    if (attempt < maxAttempts) {
      console.log(`  ${locale}/${fileName}: ${charCount(output)}/${limit} over limit, retrying...`);
    }
  }

  return best;
}

export async function translateLocale({ ai, app, metadataRoot, sourceEntries, locale }) {
  const outputDir = path.join(metadataRoot, locale);
  const rows = [];
  const translated = new Map();
  // Brand to keep untranslated: the listing's name before any colon (e.g.
  // "Hush: Screen Share Focus" -> "Hush"), falling back to the configured name.
  const brand = (sourceEntries.get("name.txt") || "").split(":")[0].trim() || app.name;

  await mkdir(outputDir, { recursive: true });

  for (const fileName of METADATA_FILES) {
    console.log(`Translating ${app.id}/${locale}/${fileName}...`);

    const output = await translateField({
      ai,
      brand,
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
