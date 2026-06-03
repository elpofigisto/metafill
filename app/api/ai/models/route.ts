import { NextResponse } from "next/server";

import { loadSettings } from "../../../../lib/app-registry";
import { listModels } from "../../../../lib/ai-provider";
import { toMessage } from "../../../../lib/errors";
import type { AiProvider } from "../../../../lib/types";

export const dynamic = "force-dynamic";

// Fetch the live model list from the chosen provider. The key is sent here from
// the Settings form (it may be unsaved) and never leaves the server; if it's
// blank we fall back to the saved key for the same provider.
export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { provider?: unknown; apiKey?: unknown };
    const provider = String(payload.provider || "").trim();
    let apiKey = typeof payload.apiKey === "string" ? payload.apiKey.trim() : "";

    if (!apiKey) {
      const settings = await loadSettings();
      apiKey = settings.aiApiKeys?.[provider as AiProvider] || "";
    }

    const models = await listModels({ provider, apiKey });
    return NextResponse.json({ provider, models });
  } catch (error) {
    return NextResponse.json({ error: toMessage(error) }, { status: 400 });
  }
}
