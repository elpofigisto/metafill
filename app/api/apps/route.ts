import { NextResponse } from "next/server";

import { loadApps, loadSettings, saveApps } from "../../../lib/app-registry";
import { toMessage } from "../../../lib/errors";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const apps = await loadApps();
    const settings = await loadSettings();

    return NextResponse.json({
      apps,
      defaultAppId: apps[0]?.id ?? null,
      // A boolean only - the editor needs to know a key exists, not its value.
      aiConfigured: Boolean(settings.aiApiKey),
    });
  } catch (error) {
    return NextResponse.json({ error: toMessage(error) }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const payload = (await request.json()) as { apps?: unknown };

    if (!Array.isArray(payload.apps)) {
      throw new Error("Request body must include an apps array.");
    }

    const apps = await saveApps(payload.apps);

    return NextResponse.json({
      apps,
      defaultAppId: apps[0]?.id ?? null,
    });
  } catch (error) {
    return NextResponse.json({ error: toMessage(error) }, { status: 400 });
  }
}
