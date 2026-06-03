// Prompt construction for the App Store metadata translator.

import { LOCALE_LABELS, metadataFileLimit } from "../app-store-metadata";

const FILE_PURPOSES: Record<string, string> = {
  "name.txt": "App Store app name",
  "subtitle.txt": "App Store subtitle",
  "description.txt": "App Store description",
  "keywords.txt": "App Store ASO keyword field",
  "promotional_text.txt": "App Store promotional text",
  "release_notes.txt": "App Store release notes",
};

export function buildSystemPrompt(brand: string): string {
  const lines = [
    "You are a senior native App Store localization and ASO copywriter.",
    "Translate and localize marketing metadata for the target locale.",
    "Use natural native phrasing that sounds like marketing copy, not literal translation.",
  ];

  if (brand) {
    lines.push(`Keep the brand name ${brand} untranslated.`);
  }

  lines.push(
    "Use regular hyphens (-), never en dashes or em dashes.",
    "Return only the final localized text for the requested file.",
    "Do not wrap the answer in quotes, Markdown, bullets, labels, or code fences.",
  );

  return lines.join(" ");
}

export function buildUserPrompt({
  fileName,
  sourceText,
  locale,
  translatedName,
  translatedSubtitle,
}: {
  fileName: string;
  sourceText: string;
  locale: string;
  translatedName?: string;
  translatedSubtitle?: string;
}): string {
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
