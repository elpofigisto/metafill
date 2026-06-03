// Output normalization and per-file validation for translated metadata.

import { metadataFileLimit } from "../app-store-metadata";

/** A row describing the validation outcome for one generated file. */
export interface GeneratedFileResult {
  locale: string;
  fileName: string;
  chars: number;
  limit: number | "";
  status: "OK" | "WARN";
}

export function charCount(value: string): number {
  return Array.from(value).length;
}

export function stripCodeFences(value: string): string {
  const trimmed = value.trim();
  const fenceMatch = trimmed.match(/^```(?:\w+)?\s*([\s\S]*?)\s*```$/);
  return fenceMatch ? fenceMatch[1].trim() : trimmed;
}

export function normalizeOutput(fileName: string, value: string): string {
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

export function validateGeneratedFile(
  locale: string,
  fileName: string,
  text: string,
): GeneratedFileResult {
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
