import { NextResponse } from "next/server";

import { findApp, metadataRootForApp } from "../../../lib/app-registry";
import {
  assertSupportedLocale,
  normalizeLocale,
  normalizeLocaleList,
} from "../../../lib/app-store-metadata";
import {
  readReviewState,
  setLocaleReviewed,
  setLocalesReviewed,
} from "../../../lib/review-state";
import { toMessage } from "../../../lib/errors";
import type { AppConfig } from "../../../lib/types";

export const dynamic = "force-dynamic";

async function resolveApp(request: Request): Promise<{
  app: AppConfig;
  apps: AppConfig[];
  metadataRoot: string;
}> {
  const url = new URL(request.url);
  const appId = url.searchParams.get("app") || "";
  const { app, apps } = await findApp(appId);
  const metadataRoot = metadataRootForApp(process.cwd(), app);

  return {
    app,
    apps,
    metadataRoot,
  };
}

export async function GET(request: Request) {
  try {
    const { app, apps, metadataRoot } = await resolveApp(request);
    const reviewState = await readReviewState(metadataRoot);

    return NextResponse.json({
      app,
      apps,
      reviewState: reviewState.locales,
    });
  } catch (error) {
    return NextResponse.json({ error: toMessage(error) }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  try {
    const { app, apps, metadataRoot } = await resolveApp(request);
    const payload = (await request.json()) as {
      locale?: unknown;
      locales?: unknown;
      reviewed?: unknown;
    };
    const reviewed = Boolean(payload.reviewed);

    // Bulk form: mark a list of locales at once (used by "Mark all reviewed").
    if (payload.locales !== undefined) {
      const locales = normalizeLocaleList(payload.locales);
      const reviewState = await setLocalesReviewed(metadataRoot, locales, reviewed);

      return NextResponse.json({
        app,
        apps,
        reviewState: reviewState.locales,
      });
    }

    const locale = normalizeLocale(String(payload.locale ?? ""));
    assertSupportedLocale(locale);

    const reviewState = await setLocaleReviewed(metadataRoot, locale, reviewed);

    return NextResponse.json({
      app,
      apps,
      reviewState: reviewState.locales,
      review: reviewState.locales[locale],
    });
  } catch (error) {
    return NextResponse.json({ error: toMessage(error) }, { status: 400 });
  }
}
