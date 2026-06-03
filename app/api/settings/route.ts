import { access } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

import { AI_PROVIDERS, loadConfig, loadSettings, saveSettings } from "../../../lib/app-registry";
import { toMessage } from "../../../lib/errors";
import type { AiProvider, ResolvedSettings, Settings } from "../../../lib/types";

export const dynamic = "force-dynamic";

const SETTINGS_FIELDS = [
  "teamId",
  "apiKeyId",
  "apiIssuerId",
  "apiKeyPath",
  "aiProvider",
  "aiModel",
] as const;

async function keyFileStatus(resolved: ResolvedSettings) {
  const keyPath = resolved.apiKeyPath?.trim();

  if (!keyPath) {
    return { path: "", exists: false };
  }

  try {
    await access(path.resolve(process.cwd(), keyPath));
    return { path: keyPath, exists: true };
  } catch {
    return { path: keyPath, exists: false };
  }
}

async function buildResponse(stored: Settings, resolved: ResolvedSettings) {
  const fromEnv: Record<string, unknown> = {};

  for (const field of SETTINGS_FIELDS) {
    fromEnv[field] = !stored[field] && Boolean(resolved[field]);
  }

  // Per-provider flag so the form can show "from .env" against the provider it
  // belongs to, not a single shared key.
  const fromEnvKeys: Record<string, boolean> = {};
  for (const provider of AI_PROVIDERS as readonly AiProvider[]) {
    fromEnvKeys[provider] =
      !stored.aiApiKeys?.[provider] && Boolean(resolved.aiApiKeys?.[provider]);
  }
  fromEnv.aiApiKeys = fromEnvKeys;

  return {
    settings: stored,
    resolved,
    fromEnv,
    keyFile: await keyFileStatus(resolved),
  };
}

export async function GET() {
  try {
    const { settings } = await loadConfig();
    const resolved = await loadSettings();

    return NextResponse.json(await buildResponse(settings, resolved));
  } catch (error) {
    return NextResponse.json({ error: toMessage(error) }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const payload = (await request.json()) as { settings?: unknown };

    if (!payload.settings || typeof payload.settings !== "object") {
      throw new Error("Request body must include a settings object.");
    }

    const settings = await saveSettings(payload.settings);
    const resolved = await loadSettings();

    return NextResponse.json(await buildResponse(settings, resolved));
  } catch (error) {
    return NextResponse.json({ error: toMessage(error) }, { status: 400 });
  }
}
