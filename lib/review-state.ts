import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { ALL_LOCALES } from "./app-store-metadata";
import { hasProp } from "./errors";

const REVIEW_STATE_FILE = ".aso-review-state.json";

/** Per-locale review status. */
export interface LocaleReview {
  reviewed: boolean;
  reviewedAt: string | null;
}

/** The on-disk review-state document. */
export interface ReviewState {
  locales: Record<string, LocaleReview>;
}

function defaultReviewState(): ReviewState {
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

export async function readReviewState(metadataRoot: string): Promise<ReviewState> {
  const fallback = defaultReviewState();

  try {
    const rawState = await readFile(path.join(metadataRoot, REVIEW_STATE_FILE), "utf8");
    const parsed = JSON.parse(rawState) as Partial<ReviewState>;

    return {
      locales: {
        ...fallback.locales,
        ...(parsed.locales ?? {}),
      },
    };
  } catch (error) {
    if (hasProp(error, "code") && error.code === "ENOENT") {
      return fallback;
    }

    throw error;
  }
}

export async function writeReviewState(
  metadataRoot: string,
  state: ReviewState,
): Promise<void> {
  await mkdir(metadataRoot, { recursive: true });
  await writeFile(
    path.join(metadataRoot, REVIEW_STATE_FILE),
    `${JSON.stringify(state, null, 2)}\n`,
    "utf8",
  );
}

export async function setLocaleReviewed(
  metadataRoot: string,
  locale: string,
  reviewed: boolean,
): Promise<ReviewState> {
  const state = await readReviewState(metadataRoot);

  state.locales[locale] = {
    reviewed,
    reviewedAt: reviewed ? new Date().toISOString() : null,
  };

  await writeReviewState(metadataRoot, state);
  return state;
}

export async function setLocalesReviewed(
  metadataRoot: string,
  locales: string[],
  reviewed: boolean,
): Promise<ReviewState> {
  const state = await readReviewState(metadataRoot);
  const reviewedAt = reviewed ? new Date().toISOString() : null;

  for (const locale of locales) {
    state.locales[locale] = { reviewed, reviewedAt };
  }

  await writeReviewState(metadataRoot, state);
  return state;
}

export async function clearLocaleReview(
  metadataRoot: string,
  locale: string,
): Promise<ReviewState> {
  return setLocaleReviewed(metadataRoot, locale, false);
}
