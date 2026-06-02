import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { ALL_LOCALES } from "./app-store-metadata.js";

const REVIEW_STATE_FILE = ".aso-review-state.json";

function defaultReviewState() {
  return {
    locales: Object.fromEntries(
      ALL_LOCALES.map((locale) => [
        locale,
        {
          reviewed: false,
          reviewedAt: null,
        },
      ]),
    ),
  };
}

export async function readReviewState(metadataRoot) {
  const fallback = defaultReviewState();

  try {
    const rawState = await readFile(path.join(metadataRoot, REVIEW_STATE_FILE), "utf8");
    const parsed = JSON.parse(rawState);

    return {
      locales: {
        ...fallback.locales,
        ...(parsed.locales ?? {}),
      },
    };
  } catch (error) {
    if (error.code === "ENOENT") {
      return fallback;
    }

    throw error;
  }
}

export async function writeReviewState(metadataRoot, state) {
  await mkdir(metadataRoot, { recursive: true });
  await writeFile(
    path.join(metadataRoot, REVIEW_STATE_FILE),
    `${JSON.stringify(state, null, 2)}\n`,
    "utf8",
  );
}

export async function setLocaleReviewed(metadataRoot, locale, reviewed) {
  const state = await readReviewState(metadataRoot);

  state.locales[locale] = {
    reviewed,
    reviewedAt: reviewed ? new Date().toISOString() : null,
  };

  await writeReviewState(metadataRoot, state);
  return state;
}

export async function clearLocaleReview(metadataRoot, locale) {
  return setLocaleReviewed(metadataRoot, locale, false);
}
