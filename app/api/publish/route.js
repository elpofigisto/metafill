import { NextResponse } from "next/server";

import { findApp } from "../../../lib/app-registry";
import { normalizeLocaleList } from "../../../lib/app-store-metadata";
import { streamChildResponse } from "../../../lib/stream-process";

export const dynamic = "force-dynamic";

export async function POST(request) {
  let app;
  let locales;

  try {
    const payload = await request.json();

    if (!payload.confirmed) {
      throw new Error("Publish confirmation is required.");
    }

    locales = normalizeLocaleList(payload.locales, {
      emptyMessage: "Select at least one reviewed locale to publish.",
    });
    ({ app } = await findApp(String(payload.appId ?? "")));
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return streamChildResponse({
    command: process.execPath,
    args: [
      "scripts/deliver-app-store-metadata.mjs",
      "--app",
      app.id,
      "--locales",
      locales.join(","),
      "--confirm",
    ],
    options: { cwd: process.cwd(), env: process.env },
    onSuccess: () => ({ app, locales }),
  });
}
