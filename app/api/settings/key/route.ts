import { writeFile } from "node:fs/promises";
import path from "node:path";
import { NextResponse } from "next/server";

import { loadConfig, loadSettings, saveSettings } from "../../../../lib/app-registry";
import { toMessage } from "../../../../lib/errors";

export const dynamic = "force-dynamic";

// Accept only a bare, safe .p8 filename (no path traversal). Falls back to a
// generic name so an odd upload name can't escape the project root.
function safeKeyName(filename: unknown) {
  const base = path.basename(String(filename || "").trim());
  return /^[A-Za-z0-9._-]+\.p8$/.test(base) ? base : "AuthKey.p8";
}

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { content?: unknown; filename?: unknown };
    const content = String(payload.content ?? "");

    if (!content.includes("PRIVATE KEY")) {
      throw new Error("That file does not look like a .p8 private key (expected a PEM PRIVATE KEY).");
    }

    const name = safeKeyName(payload.filename);
    const relPath = `./${name}`;
    await writeFile(
      path.join(process.cwd(), name),
      content.endsWith("\n") ? content : `${content}\n`,
      "utf8",
    );

    const { settings } = await loadConfig();
    const saved = await saveSettings({ ...settings, apiKeyPath: relPath });
    const resolved = await loadSettings();

    return NextResponse.json({
      settings: saved,
      resolved,
      keyPath: relPath,
      keyFile: { path: relPath, exists: true },
    });
  } catch (error) {
    return NextResponse.json({ error: toMessage(error) }, { status: 400 });
  }
}
