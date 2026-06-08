import { NextResponse } from "next/server";

import { findApp } from "../../../lib/app-registry";
import { normalizeFieldList, normalizeLocaleList } from "../../../lib/app-store-metadata";
import { streamChildResponse } from "../../../lib/stream-process";
import { toMessage } from "../../../lib/errors";
import type { AppConfig } from "../../../lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let app: AppConfig;
  let locales: string[];
  let fields: string[];

  try {
    const payload = (await request.json()) as {
      locales?: unknown;
      appId?: unknown;
      fields?: unknown;
    };
    locales = normalizeLocaleList(payload.locales, {
      allowSource: false,
      emptyMessage: "Select at least one locale to translate.",
    });
    fields = normalizeFieldList(payload.fields);
    ({ app } = await findApp(String(payload.appId ?? "")));
  } catch (error) {
    return NextResponse.json({ error: toMessage(error) }, { status: 400 });
  }

  return streamChildResponse({
    command: process.execPath,
    args: [
      "--import",
      "tsx",
      "scripts/translate-app-store-metadata.ts",
      "--app",
      app.id,
      "--locales",
      locales.join(","),
      "--fields",
      fields.join(","),
    ],
    options: { cwd: process.cwd(), env: process.env },
    onSuccess: () => ({ app, locales, fields }),
  });
}
