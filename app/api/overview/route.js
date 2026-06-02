import { readFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

import { findApp, metadataRootForApp } from "../../../lib/app-registry";
import {
  ALL_LOCALES,
  charCount,
  METADATA_FILES,
  metadataFileLimit,
  SOURCE_LOCALE,
} from "../../../lib/app-store-metadata";
import { readReviewState } from "../../../lib/review-state";

export const dynamic = "force-dynamic";

async function localeStatus(metadataRoot, locale, reviewed) {
  const dir = path.join(metadataRoot, locale);
  let exists = false;
  let hasContent = false;
  let overLimit = false;

  for (const fileName of METADATA_FILES) {
    let value;

    try {
      value = await readFile(path.join(dir, fileName), "utf8");
    } catch (error) {
      if (error.code === "ENOENT") {
        continue;
      }

      throw error;
    }

    exists = true;

    if (value.trim()) {
      hasContent = true;
    }

    const limit = metadataFileLimit(fileName);
    if (typeof limit === "number" && charCount(value.replace(/\n$/, "")) > limit) {
      overLimit = true;
    }
  }

  return {
    locale,
    isSource: locale === SOURCE_LOCALE,
    exists,
    hasContent,
    overLimit,
    reviewed,
  };
}

export async function GET(request) {
  try {
    const url = new URL(request.url);
    const appId = url.searchParams.get("app") || "";
    const { app, apps } = await findApp(appId);
    const metadataRoot = metadataRootForApp(process.cwd(), app);
    const reviewState = await readReviewState(metadataRoot);

    const entries = await Promise.all(
      ALL_LOCALES.map((locale) =>
        localeStatus(metadataRoot, locale, Boolean(reviewState.locales[locale]?.reviewed)),
      ),
    );

    const locales = Object.fromEntries(entries.map((entry) => [entry.locale, entry]));
    const reviewedCount = entries.filter((entry) => entry.reviewed).length;
    const translatedCount = entries.filter((entry) => entry.hasContent).length;

    return NextResponse.json({
      app,
      apps,
      locales,
      summary: {
        total: ALL_LOCALES.length,
        reviewed: reviewedCount,
        translated: translatedCount,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
