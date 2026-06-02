import { access } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

import { loadConfig, loadSettings, saveSettings } from "../../../lib/app-registry";

export const dynamic = "force-dynamic";

const SETTINGS_FIELDS = [
  "teamId",
  "apiKeyId",
  "apiIssuerId",
  "apiKeyPath",
  "aiProvider",
  "aiModel",
  "aiApiKey",
];

async function keyFileStatus(resolved) {
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

async function buildResponse(stored, resolved) {
  const fromEnv = {};

  for (const field of SETTINGS_FIELDS) {
    fromEnv[field] = !stored[field] && Boolean(resolved[field]);
  }

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
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const payload = await request.json();

    if (!payload.settings || typeof payload.settings !== "object") {
      throw new Error("Request body must include a settings object.");
    }

    const settings = await saveSettings(payload.settings);
    const resolved = await loadSettings();

    return NextResponse.json(await buildResponse(settings, resolved));
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
