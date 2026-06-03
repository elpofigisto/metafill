import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { METADATA_FILES, SOURCE_LOCALE, type MetadataFile } from "./app-store-metadata";
import type { AppConfig } from "./types";

// App Store language -> representative storefront (ISO country code) whose
// DEFAULT listing language matches that App Store language. The public iTunes
// lookup only returns a storefront's default localization, so we only map
// locales that are the primary language of some storefront. Multi-language
// storefronts (e.g. India, Canada, Catalan) are intentionally omitted — the
// public API would only return their English/primary listing, so those locales
// are filled with "Translate selected" instead of being mislabeled.
export const LOCALE_STOREFRONTS: Record<string, string> = {
  "en-US": "us",
  "en-GB": "gb",
  "en-AU": "au",
  "en-CA": "ca",
  "de-DE": "de",
  ja: "jp",
  "es-ES": "es",
  "es-MX": "mx",
  "fr-FR": "fr",
  it: "it",
  "nl-NL": "nl",
  "pt-BR": "br",
  "pt-PT": "pt",
  ru: "ru",
  ko: "kr",
  "zh-Hans": "cn",
  "zh-Hant": "tw",
  uk: "ua",
  pl: "pl",
  tr: "tr",
  sv: "se",
  da: "dk",
  fi: "fi",
  no: "no",
  cs: "cz",
  sk: "sk",
  hu: "hu",
  ro: "ro",
  el: "gr",
  hr: "hr",
  th: "th",
  vi: "vn",
  id: "id",
  he: "il",
  "ar-SA": "sa",
  "sl-SI": "si",
};

/** The subset of the public iTunes lookup result we read. */
interface ITunesLookupResult {
  trackName?: string;
  trackId?: number;
  bundleId?: string;
  description?: string;
  releaseNotes?: string;
}

interface ITunesLookupResponse {
  results?: ITunesLookupResult[];
}

/** A full set of metadata file contents for a single locale. */
export type LocaleMetadata = Record<MetadataFile, string>;

/** Identifying fields used by the public App Store lookup. */
type LookupApp = Pick<AppConfig, "id" | "appStoreId" | "bundleId">;

export type LocalizationStatus =
  | "source"
  | "localized"
  | "fallback"
  | "unavailable"
  | "unmapped";

export interface LocalizationEntry {
  locale: string;
  country: string | null;
  status: LocalizationStatus;
  files?: LocaleMetadata;
}

export interface PublicAppInfo {
  name: string;
  appStoreId: string;
  bundleId: string;
}

function appQueryParam(app: LookupApp, params: URLSearchParams): void {
  if (app.appStoreId) {
    params.set("id", app.appStoreId);
  } else if (app.bundleId) {
    params.set("bundleId", app.bundleId);
  } else {
    throw new Error(`App "${app.id}" needs appStoreId or bundleId for public App Store lookup.`);
  }
}

function lookupUrlForApp(app: LookupApp): string {
  const params = new URLSearchParams({ country: "us" });
  appQueryParam(app, params);
  return `https://itunes.apple.com/lookup?${params.toString()}`;
}

async function lookupResult(url: string, label: string): Promise<ITunesLookupResult> {
  const response = await fetch(url, { headers: { accept: "application/json" } });

  if (!response.ok) {
    throw new Error(`App Store lookup failed with ${response.status}.`);
  }

  const payload = (await response.json()) as ITunesLookupResponse;
  const result = payload.results?.[0];

  if (!result) {
    throw new Error(`No public App Store result found for "${label}".`);
  }

  return result;
}

// Tolerant per-storefront lookup: returns the result or null (a storefront
// where the app is unavailable should be skipped, not fail the whole fetch).
async function lookupResultForCountry(
  app: LookupApp,
  country: string,
): Promise<ITunesLookupResult | null> {
  const params = new URLSearchParams({ country });
  appQueryParam(app, params);

  try {
    const response = await fetch(`https://itunes.apple.com/lookup?${params.toString()}`, {
      headers: { accept: "application/json" },
    });

    if (!response.ok) {
      return null;
    }

    const payload = (await response.json()) as ITunesLookupResponse;
    return payload.results?.[0] || null;
  } catch {
    return null;
  }
}

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let cursor = 0;

  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await fn(items[index]);
    }
  });

  await Promise.all(workers);
  return results;
}

// Look up an app by bundle ID or App Store ID and return the key identifying
// fields so the Apps manager can auto-fill a new entry.
export async function lookupPublicAppInfo({
  bundleId,
  appStoreId,
  country = "us",
}: {
  bundleId?: string;
  appStoreId?: string;
  country?: string;
}): Promise<PublicAppInfo> {
  const params = new URLSearchParams({ country });
  const trimmedId = String(appStoreId ?? "").trim();
  const trimmedBundle = String(bundleId ?? "").trim();

  if (trimmedId) {
    params.set("id", trimmedId);
  } else if (trimmedBundle) {
    params.set("bundleId", trimmedBundle);
  } else {
    throw new Error("Enter a bundle ID or App Store ID to look up.");
  }

  const result = await lookupResult(
    `https://itunes.apple.com/lookup?${params.toString()}`,
    trimmedId || trimmedBundle,
  );

  return {
    name: result.trackName || "",
    appStoreId: result.trackId ? String(result.trackId) : trimmedId,
    bundleId: result.bundleId || trimmedBundle,
  };
}

function metadataFromLookupResult(result: ITunesLookupResult): LocaleMetadata {
  return {
    "name.txt": result.trackName || "",
    "subtitle.txt": "",
    "description.txt": result.description || "",
    "keywords.txt": "",
    "promotional_text.txt": "",
    "release_notes.txt": result.releaseNotes || "",
  };
}

function sameListing(a: LocaleMetadata, b: LocaleMetadata): boolean {
  return (
    (a["description.txt"] || "").trim() === (b["description.txt"] || "").trim() &&
    (a["name.txt"] || "").trim() === (b["name.txt"] || "").trim()
  );
}

export async function fetchPublicAppStoreMetadata(app: LookupApp): Promise<LocaleMetadata> {
  const result = await lookupResult(lookupUrlForApp(app), app.appStoreId || app.bundleId);
  return metadataFromLookupResult(result);
}

// Fetch the public listing for every locale that has a real localization in its
// storefront. en-US is always the baseline/source; a target locale is only
// returned as "localized" when its storefront listing actually differs from the
// English baseline (otherwise the storefront is just falling back to English).
//
// Returns { results: [{ locale, country, status, files }] } where status is one
// of: "source" | "localized" | "fallback" | "unavailable" | "unmapped".
export async function fetchPublicLocalizations(
  app: LookupApp,
  locales?: string[],
): Promise<{ results: LocalizationEntry[] }> {
  const requested = locales && locales.length ? locales : Object.keys(LOCALE_STOREFRONTS);
  const mapped = requested.filter((locale) => LOCALE_STOREFRONTS[locale]);
  const unmapped = requested.filter(
    (locale) => !LOCALE_STOREFRONTS[locale] && locale !== SOURCE_LOCALE,
  );

  // Always include the en-US baseline storefront.
  if (!mapped.includes(SOURCE_LOCALE)) {
    mapped.unshift(SOURCE_LOCALE);
  }

  const countries = [...new Set(mapped.map((locale) => LOCALE_STOREFRONTS[locale]))];
  const fetched = await mapWithConcurrency(countries, 6, async (country) => ({
    country,
    result: await lookupResultForCountry(app, country),
  }));
  const byCountry: Record<string, ITunesLookupResult | null> = Object.fromEntries(
    fetched.map((entry) => [entry.country, entry.result]),
  );

  const baseline = byCountry[LOCALE_STOREFRONTS[SOURCE_LOCALE]];
  if (!baseline) {
    throw new Error(
      `No public App Store result found for "${app.appStoreId || app.bundleId}".`,
    );
  }

  const baselineFiles = metadataFromLookupResult(baseline);

  const results: LocalizationEntry[] = mapped.map((locale) => {
    const country = LOCALE_STOREFRONTS[locale];
    const result = byCountry[country];

    if (!result) {
      return { locale, country, status: "unavailable" };
    }

    const files = metadataFromLookupResult(result);

    if (locale === SOURCE_LOCALE) {
      return { locale, country, status: "source", files };
    }

    if (sameListing(files, baselineFiles)) {
      return { locale, country, status: "fallback" };
    }

    return { locale, country, status: "localized", files };
  });

  for (const locale of unmapped) {
    results.push({ locale, country: null, status: "unmapped" });
  }

  return { results };
}

export async function writeLocaleMetadata(
  metadataRoot: string,
  locale: string,
  files: LocaleMetadata,
): Promise<void> {
  const outputDir = path.join(metadataRoot, locale);
  await mkdir(outputDir, { recursive: true });

  for (const fileName of METADATA_FILES) {
    await writeFile(path.join(outputDir, fileName), `${files[fileName] || ""}\n`, "utf8");
  }
}

export async function writePublicAppStoreMetadata(
  metadataRoot: string,
  files: LocaleMetadata,
): Promise<void> {
  await writeLocaleMetadata(metadataRoot, SOURCE_LOCALE, files);
}
