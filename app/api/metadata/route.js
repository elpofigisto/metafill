import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

import { findApp, metadataRootForApp } from "../../../lib/app-registry";
import {
  assertSupportedLocale,
  charCount,
  METADATA_FILES,
  metadataFileLimit,
  normalizeLocale,
  SOURCE_LOCALE,
} from "../../../lib/app-store-metadata";
import { clearLocaleReview, readReviewState } from "../../../lib/review-state";

export const dynamic = "force-dynamic";

async function resolveMetadataDir(request) {
  const url = new URL(request.url);
  const appId = url.searchParams.get("app") || "";
  const locale = normalizeLocale(url.searchParams.get("locale") || SOURCE_LOCALE);
  assertSupportedLocale(locale);

  const { app, apps } = await findApp(appId);
  const metadataRoot = metadataRootForApp(process.cwd(), app);

  return {
    app,
    apps,
    locale,
    metadataRoot,
    dir: path.join(metadataRoot, locale),
  };
}

function assertMetadataShape(files) {
  if (!files || typeof files !== "object" || Array.isArray(files)) {
    throw new Error("Request body must include a files object.");
  }

  for (const fileName of METADATA_FILES) {
    if (typeof files[fileName] !== "string") {
      throw new Error(`Missing string value for ${fileName}.`);
    }
  }
}

function normalizeForDisk(value) {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function buildValidation(files) {
  return METADATA_FILES.map((fileName) => {
    const chars = charCount(files[fileName]);
    const limit = metadataFileLimit(fileName);

    return {
      fileName,
      chars,
      limit,
      ok: typeof limit === "number" ? chars <= limit : true,
    };
  });
}

export async function GET(request) {
  let resolved;

  try {
    resolved = await resolveMetadataDir(request);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const { app, apps, locale, metadataRoot, dir } = resolved;
  const files = {};
  const missing = [];

  for (const fileName of METADATA_FILES) {
    try {
      files[fileName] = await readFile(path.join(dir, fileName), "utf8");
    } catch (error) {
      if (error.code !== "ENOENT") {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      files[fileName] = "";
      missing.push(fileName);
    }
  }

  const reviewState = await readReviewState(metadataRoot);

  return NextResponse.json({
    app,
    apps,
    locale,
    files,
    missing,
    review: reviewState.locales[locale],
    reviewState: reviewState.locales,
    validation: buildValidation(files),
  });
}

export async function PUT(request) {
  let payload;
  let resolved;

  try {
    resolved = await resolveMetadataDir(request);
    payload = await request.json();
    assertMetadataShape(payload.files);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const { app, apps, locale, metadataRoot, dir } = resolved;

  try {
    await mkdir(dir, { recursive: true });

    for (const fileName of METADATA_FILES) {
      await writeFile(
        path.join(dir, fileName),
        normalizeForDisk(payload.files[fileName]),
        "utf8",
      );
    }

    await clearLocaleReview(metadataRoot, locale);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const reviewState = await readReviewState(metadataRoot);

  return NextResponse.json({
    app,
    apps,
    locale,
    files: payload.files,
    missing: [],
    review: reviewState.locales[locale],
    reviewState: reviewState.locales,
    validation: buildValidation(payload.files),
  });
}
