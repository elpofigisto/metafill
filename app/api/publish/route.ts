import { NextResponse } from "next/server";

import { findApp } from "../../../lib/app-registry";
import { normalizeLocaleList } from "../../../lib/app-store-metadata";
import { streamChildResponse } from "../../../lib/stream-process";
import { toMessage } from "../../../lib/errors";
import type { AppConfig } from "../../../lib/types";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let app: AppConfig;
  let locales: string[];

  try {
    const payload = (await request.json()) as { confirmed?: unknown; locales?: unknown; appId?: unknown };

    if (!payload.confirmed) {
      throw new Error("Publish confirmation is required.");
    }

    locales = normalizeLocaleList(payload.locales, {
      emptyMessage: "Select at least one reviewed locale to publish.",
    });
    ({ app } = await findApp(String(payload.appId ?? "")));
  } catch (error) {
    return NextResponse.json({ error: toMessage(error) }, { status: 400 });
  }

  return streamChildResponse({
    command: process.execPath,
    args: [
      "--import",
      "tsx",
      "scripts/deliver-app-store-metadata.ts",
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
