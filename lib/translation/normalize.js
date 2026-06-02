// Output normalization and per-file validation for translated metadata.

import { metadataFileLimit } from "../app-store-metadata.js";

export function charCount(value) {
  return Array.from(value).length;
}

export function stripCodeFences(value) {
  const trimmed = value.trim();
  const fenceMatch = trimmed.match(/^```(?:\w+)?\s*([\s\S]*?)\s*```$/);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

export function normalizeOutput(fileName, value) {
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

export function validateGeneratedFile(locale, fileName, text) {
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
