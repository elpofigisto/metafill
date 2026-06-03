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
import { toMessage, hasProp } from "../../../lib/errors";
import type { AppConfig } from "../../../lib/types";

export const dynamic = "force-dynamic";

interface ResolvedMetadataDir {
  app: AppConfig;
  apps: AppConfig[];
  locale: string;
  metadataRoot: string;
  dir: string;
}

async function resolveMetadataDir(request: Request): Promise<ResolvedMetadataDir> {
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

function assertMetadataShape(files: unknown): asserts files is Record<string, string> {
  if (!files || typeof files !== "object" || Array.isArray(files)) {
    throw new Error("Request body must include a files object.");
  }

  for (const fileName of METADATA_FILES) {
    if (typeof (files as Record<string, unknown>)[fileName] !== "string") {
      throw new Error(`Missing string value for ${fileName}.`);
    }
  }
}

function normalizeForDisk(value: string) {
  return value.endsWith("\n") ? value : `${value}\n`;
}

function buildValidation(files: Record<string, string>) {
  return METADATA_FILES.map((fileName: string) => {
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

export async function GET(request: Request) {
  let resolved: ResolvedMetadataDir;

  try {
    resolved = await resolveMetadataDir(request);
  } catch (error) {
    return NextResponse.json({ error: toMessage(error) }, { status: 400 });
  }

  const { app, apps, locale, metadataRoot, dir } = resolved;
  const files: Record<string, string> = {};
  const missing: string[] = [];

  for (const fileName of METADATA_FILES) {
    try {
      files[fileName] = await readFile(path.join(dir, fileName), "utf8");
    } catch (error) {
      if (!hasProp(error, "code") || error.code !== "ENOENT") {
        return NextResponse.json({ error: toMessage(error) }, { status: 500 });
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

export async function PUT(request: Request) {
  let payload: { files: Record<string, string> };
  let resolved: ResolvedMetadataDir;

  try {
    resolved = await resolveMetadataDir(request);
    const body = (await request.json()) as { files?: unknown };
    assertMetadataShape(body.files);
    payload = { files: body.files };
  } catch (error) {
    return NextResponse.json({ error: toMessage(error) }, { status: 400 });
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
    return NextResponse.json({ error: toMessage(error) }, { status: 500 });
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
