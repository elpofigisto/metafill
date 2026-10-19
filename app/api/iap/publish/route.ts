import { NextResponse } from "next/server";

import { findApp } from "../../../../lib/app-registry";
import { normalizeLocaleList } from "../../../../lib/app-store-metadata";
import { toMessage } from "../../../../lib/errors";
import { applyIapChanges, planIapPush, readIapDocument } from "../../../../lib/in-app-purchases";

export const dynamic = "force-dynamic";

// Without `confirmed` this is a dry run that returns the pending changes; with
// it, the same changes are applied. Both work from the saved file on disk.
export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as {
      appId?: unknown;
      confirmed?: unknown;
      locales?: unknown;
    };
    const { app, settings } = await findApp(String(payload.appId ?? ""));
    const locales =
      Array.isArray(payload.locales) && payload.locales.length > 0
        ? normalizeLocaleList(payload.locales)
        : undefined;
    const document = await readIapDocument(process.cwd(), app);

    if (!document) {
      throw new Error("Nothing to publish yet - fetch in-app purchases from App Store Connect first.");
    }

    const { client, changes } = await planIapPush(app, settings, document, { locales });

    if (!payload.confirmed) {
      return NextResponse.json({ app, changes, applied: 0 });
    }

    const failed = (await applyIapChanges(client, changes)).map(({ change, error }) => ({
      productId: change.productId,
      locale: change.locale,
      error,
    }));
    const applied = changes.length - failed.length;

    if (failed.length > 0) {
      return NextResponse.json({ app, changes, applied, failed });
    }

    return NextResponse.json({ app, changes, applied });
  } catch (error) {
    return NextResponse.json({ error: toMessage(error) }, { status: 400 });
  }
}
