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
    locales = normalizeLocaleList(payload.locales, {
      allowSource: false,
      emptyMessage: "Select at least one locale to translate.",
    });
    ({ app } = await findApp(String(payload.appId ?? "")));
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return streamChildResponse({
    command: process.execPath,
    args: [
      "scripts/translate-app-store-metadata.mjs",
      "--app",
      app.id,
      "--locales",
      locales.join(","),
    ],
    options: { cwd: process.cwd(), env: process.env },
    onSuccess: () => ({ app, locales }),
  });
}
