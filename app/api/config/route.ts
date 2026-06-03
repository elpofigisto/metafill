import { NextResponse } from "next/server";

import { loadConfig, saveApps, saveSettings } from "../../../lib/app-registry";
import { toMessage } from "../../../lib/errors";
import type { AppConfig, Settings } from "../../../lib/types";

export const dynamic = "force-dynamic";

const EXPORT_VERSION = 1;

// Everything shareable, minus secrets: settings drop the .p8 path and the AI
// API keys; each app drops its apiKeyPath override.
function exportable({ settings, apps }: { settings: Settings; apps: AppConfig[] }) {
  const {
    apiKeyPath: _drop,
    aiApiKeys: _aiKeys,
    ...sharedSettings
  } = settings;

  return {
    version: EXPORT_VERSION,
    settings: sharedSettings,
    apps: apps.map(({ apiKeyPath: _appDrop, ...app }) => app),
  };
}

export async function GET() {
  try {
    const config = await loadConfig();
    return NextResponse.json(exportable(config));
  } catch (error) {
    return NextResponse.json({ error: toMessage(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { config?: unknown } & Record<string, unknown>;
    const incoming = (
      payload && typeof payload.config === "object" ? payload.config : payload
    ) as Record<string, unknown>;

    if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
      throw new Error("Import file must be a config object.");
    }

    if (!Array.isArray(incoming.apps) || incoming.apps.length === 0) {
      throw new Error("Config must include a non-empty apps array.");
    }

    const existing = await loadConfig();
    const localKeyPathById = new Map(existing.apps.map((app) => [app.id, app.apiKeyPath]));

    // Never import .p8 paths - preserve whatever this machine already has.
    const apps = (incoming.apps as Array<Record<string, unknown>>).map((app) => ({
      ...app,
      apiKeyPath: localKeyPathById.get(String(app.id ?? "").trim()) || "",
    }));

    const incomingSettings = (
      incoming.settings && typeof incoming.settings === "object" ? incoming.settings : {}
    ) as Record<string, unknown>;
    const settings = {
      teamId: incomingSettings.teamId ?? "",
      apiKeyId: incomingSettings.apiKeyId ?? "",
      apiIssuerId: incomingSettings.apiIssuerId ?? "",
      apiKeyPath: existing.settings.apiKeyPath || "",
      // AI provider/model are shareable; the AI keys stay local, per provider.
      aiProvider: incomingSettings.aiProvider ?? existing.settings.aiProvider ?? "",
      aiModel: incomingSettings.aiModel ?? existing.settings.aiModel ?? "",
      aiApiKeys: existing.settings.aiApiKeys || {},
    };

    const savedApps = await saveApps(apps);
    await saveSettings(settings);

    return NextResponse.json({ ok: true, appCount: savedApps.length });
  } catch (error) {
    return NextResponse.json({ error: toMessage(error) }, { status: 400 });
  }
}
