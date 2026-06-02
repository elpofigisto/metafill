import { NextResponse } from "next/server";

import { findApp, metadataRootForApp } from "../../../lib/app-registry";
import { LOCALE_LABELS } from "../../../lib/app-store-metadata";
import { streamChildResponse } from "../../../lib/stream-process";
import {
  fetchPublicLocalizations,
  writeLocaleMetadata,
} from "../../../lib/public-app-store-lookup";
import { clearLocaleReview } from "../../../lib/review-state";

export const dynamic = "force-dynamic";

function describeLocale(locale) {
  return `${LOCALE_LABELS[locale] || locale} (${locale})`;
}

export async function POST(request) {
  let app;
  let source;

  try {
    const payload = await request.json();
    source = String(payload.source ?? "fastlane");
    ({ app } = await findApp(String(payload.appId ?? "")));
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Fastlane sync is a long child process - stream it live.
  if (source !== "public") {
    return streamChildResponse({
      command: process.execPath,
      args: ["scripts/fetch-app-store-metadata.mjs", "--app", app.id],
      options: { cwd: process.cwd(), env: process.env },
      onSuccess: () => ({ app, source }),
    });
  }

  try {
    {
      const metadataRoot = metadataRootForApp(process.cwd(), app);
      const { results } = await fetchPublicLocalizations(app);

      const written = results.filter(
        (entry) => entry.status === "source" || entry.status === "localized",
      );

      for (const entry of written) {
        await writeLocaleMetadata(metadataRoot, entry.locale, entry.files);
        await clearLocaleReview(metadataRoot, entry.locale);
      }

      const localized = written.filter((entry) => entry.status === "localized");
      const fallback = results.filter((entry) => entry.status === "fallback");
      const lines = [
        `Fetched public App Store metadata for ${app.name}.`,
        `Wrote ${written.length} locale(s): ${written.map((entry) => describeLocale(entry.locale)).join(", ")}.`,
      ];

      if (localized.length === 0) {
        lines.push(
          "Only the en-US source listing was found publicly. Use Translate to generate other languages.",
        );
      }

      if (fallback.length > 0) {
        lines.push(
          `Skipped ${fallback.length} locale(s) with no public localization (English fallback): ${fallback
            .map((entry) => entry.locale)
            .join(", ")}.`,
        );
      }

      lines.push(
        "Languages without a public storefront listing (e.g. most regional languages) are not fetched here - use Translate or Sync App Store Connect.",
      );

      return NextResponse.json({
        app,
        source,
        stdout: lines.join("\n"),
        stderr: "",
      });
    }
  } catch (error) {
    return NextResponse.json(
      {
        error: error.message,
        stdout: error.stdout,
        stderr: error.stderr,
      },
      { status: 400 },
    );
  }
}
