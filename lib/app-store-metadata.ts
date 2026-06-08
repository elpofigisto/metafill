export const SOURCE_LOCALE = "en-US";

export const TARGET_LOCALES = [
  "zh-Hans",
  "de-DE",
  "ja",
  "es-ES",
  "uk",
  "ar-SA",
  "bn-BD",
  "ca",
  "zh-Hant",
  "hr",
  "cs",
  "da",
  "nl-NL",
  "en-AU",
  "en-CA",
  "en-GB",
  "fi",
  "fr-FR",
  "fr-CA",
  "el",
  "gu-IN",
  "he",
  "hi",
  "hu",
  "id",
  "it",
  "kn-IN",
  "ko",
  "ms",
  "ml-IN",
  "mr-IN",
  "no",
  "or-IN",
  "pl",
  "pt-BR",
  "pt-PT",
  "pa-IN",
  "ro",
  "ru",
  "sk",
  "sl-SI",
  "es-MX",
  "sv",
  "ta-IN",
  "te-IN",
  "th",
  "tr",
  "ur-PK",
  "vi",
];

export const ALL_LOCALES = [SOURCE_LOCALE, ...TARGET_LOCALES];

export const LOCALE_LABELS: Record<string, string> = {
  "en-US": "English (U.S.)",
  "ar-SA": "Arabic",
  "bn-BD": "Bangla",
  ca: "Catalan",
  cs: "Czech",
  da: "Danish",
  "de-DE": "German",
  "el": "Greek",
  "en-AU": "English (Australia)",
  "en-CA": "English (Canada)",
  "en-GB": "English (U.K.)",
  "es-ES": "Spanish (Spain)",
  "es-MX": "Spanish (Mexico)",
  fi: "Finnish",
  "fr-CA": "French (Canada)",
  "fr-FR": "French",
  "gu-IN": "Gujarati",
  he: "Hebrew",
  hi: "Hindi",
  hr: "Croatian",
  hu: "Hungarian",
  id: "Indonesian",
  it: "Italian",
  uk: "Ukrainian",
  ja: "Japanese",
  "kn-IN": "Kannada",
  ko: "Korean",
  "ml-IN": "Malayalam",
  "mr-IN": "Marathi",
  ms: "Malay",
  "nl-NL": "Dutch",
  no: "Norwegian",
  "or-IN": "Odia",
  "pa-IN": "Punjabi",
  pl: "Polish",
  "pt-BR": "Portuguese (Brazil)",
  "pt-PT": "Portuguese (Portugal)",
  ro: "Romanian",
  ru: "Russian",
  sk: "Slovak",
  "sl-SI": "Slovenian",
  sv: "Swedish",
  "ta-IN": "Tamil",
  "te-IN": "Telugu",
  th: "Thai",
  tr: "Turkish",
  "ur-PK": "Urdu",
  vi: "Vietnamese",
  "zh-Hans": "Simplified Chinese",
  "zh-Hant": "Traditional Chinese",
};

export const LOCALE_ALIASES: Record<string, string> = {
  de: "de-DE",
  es: "es-ES",
};

/** The metadata files an App Store listing is split into. */
export type MetadataFile =
  | "name.txt"
  | "subtitle.txt"
  | "description.txt"
  | "keywords.txt"
  | "promotional_text.txt"
  | "release_notes.txt"
  | "support_url.txt"
  | "marketing_url.txt"
  | "privacy_url.txt";

export const METADATA_FILES: MetadataFile[] = [
  "name.txt",
  "subtitle.txt",
  "description.txt",
  "keywords.txt",
  "promotional_text.txt",
  "release_notes.txt",
  "support_url.txt",
  "marketing_url.txt",
  "privacy_url.txt",
];

/**
 * Files that are copied verbatim from the en-US source to every locale instead
 * of being translated. URLs are the same in every language, so the translate
 * flow propagates the source value as-is rather than sending it to the AI.
 */
export const COPY_VERBATIM_FILES: ReadonlySet<MetadataFile> = new Set([
  "support_url.txt",
  "marketing_url.txt",
  "privacy_url.txt",
]);

export function isCopyVerbatimFile(fileName: string): boolean {
  return COPY_VERBATIM_FILES.has(fileName as MetadataFile);
}

export const FILE_LIMITS: Partial<Record<MetadataFile, number>> = {
  "name.txt": 30,
  "subtitle.txt": 30,
  "keywords.txt": 100,
  "promotional_text.txt": 170,
  "description.txt": 4000,
};

export const FILE_LABELS: Record<MetadataFile, string> = {
  "name.txt": "Name",
  "subtitle.txt": "Subtitle",
  "description.txt": "Description",
  "keywords.txt": "Keywords",
  "promotional_text.txt": "Promotional text",
  "release_notes.txt": "Release notes",
  "support_url.txt": "Support URL",
  "marketing_url.txt": "Marketing URL",
  "privacy_url.txt": "Privacy Policy URL",
};

export const FILE_HELP: Record<MetadataFile, string> = {
  "name.txt": "Maximum 30 characters.",
  "subtitle.txt": "Maximum 30 characters.",
  "description.txt": "Maximum 4000 characters. Preserve section structure and line breaks.",
  "keywords.txt": "Maximum 100 characters. Use comma-separated keywords with no spaces after commas.",
  "promotional_text.txt": "Maximum 170 characters.",
  "release_notes.txt": "No App Store Connect character limit enforced by this tool.",
  "support_url.txt": "Required by App Store Connect. Copied to every language as-is (never translated).",
  "marketing_url.txt": "Optional. Copied to every language as-is (never translated).",
  "privacy_url.txt": "Optional. Copied to every language as-is (never translated).",
};

export function charCount(value: string | null | undefined): number {
  return Array.from(value ?? "").length;
}

export function metadataFileLimit(fileName: string): number | null {
  return FILE_LIMITS[fileName as MetadataFile] ?? null;
}

export function assertSupportedLocale(locale: string): void {
  if (!ALL_LOCALES.includes(normalizeLocale(locale))) {
    throw new Error(`Unsupported locale "${locale}". Supported locales: ${ALL_LOCALES.join(", ")}`);
  }
}

export function normalizeLocale(locale: string): string {
  return LOCALE_ALIASES[locale] ?? locale;
}

// Validate and de-duplicate a list of locale codes from a request. Used by the
// translate and publish routes. `allowSource: false` rejects en-US (you can't
// translate the source from itself).
export function normalizeLocaleList(
  locales: unknown,
  { allowSource = true, emptyMessage }: { allowSource?: boolean; emptyMessage?: string } = {},
): string[] {
  if (!Array.isArray(locales) || locales.length === 0) {
    throw new Error(emptyMessage || "Select at least one locale.");
  }

  const normalized = [
    ...new Set(locales.map((locale) => normalizeLocale(String(locale).trim())).filter(Boolean)),
  ];

  for (const locale of normalized) {
    assertSupportedLocale(locale);
    if (!allowSource && locale === SOURCE_LOCALE) {
      throw new Error("English is the source locale and cannot be translated from itself.");
    }
  }

  return normalized;
}

/**
 * Validate a requested subset of metadata files to translate. An empty or
 * missing value means "all fields" - callers that want a strict subset should
 * pass a non-empty array. Order follows METADATA_FILES so dependent fields
 * (keywords after name/subtitle) keep their natural sequence.
 */
export function normalizeFieldList(fields: unknown): MetadataFile[] {
  if (fields == null || (Array.isArray(fields) && fields.length === 0)) {
    return [...METADATA_FILES];
  }

  if (!Array.isArray(fields)) {
    throw new Error("Fields must be a list of metadata file names.");
  }

  const requested = new Set(fields.map((field) => String(field).trim()));
  const unknown = [...requested].filter(
    (field) => !METADATA_FILES.includes(field as MetadataFile),
  );

  if (unknown.length > 0) {
    throw new Error(
      `Unsupported field: ${unknown.join(", ")}. Supported fields: ${METADATA_FILES.join(", ")}`,
    );
  }

  return METADATA_FILES.filter((fileName) => requested.has(fileName));
}
