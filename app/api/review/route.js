import { NextResponse } from "next/server";

import { findApp, metadataRootForApp } from "../../../lib/app-registry";
import { assertSupportedLocale, normalizeLocale } from "../../../lib/app-store-metadata";
import { readReviewState, setLocaleReviewed } from "../../../lib/review-state";

export const dynamic = "force-dynamic";

async function resolveApp(request) {
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

export async function GET(request) {
  try {
    const { app, apps, metadataRoot } = await resolveApp(request);
    const reviewState = await readReviewState(metadataRoot);

    return NextResponse.json({
      app,
      apps,
      reviewState: reviewState.locales,
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

export async function PUT(request) {
  try {
    const { app, apps, metadataRoot } = await resolveApp(request);
    const payload = await request.json();
    const locale = normalizeLocale(String(payload.locale ?? ""));
    const reviewed = Boolean(payload.reviewed);

    assertSupportedLocale(locale);

    const reviewState = await setLocaleReviewed(metadataRoot, locale, reviewed);

    return NextResponse.json({
      app,
      apps,
      reviewState: reviewState.locales,
      review: reviewState.locales[locale],
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
