import { NextResponse } from "next/server";

import { lookupPublicAppInfo } from "../../../lib/public-app-store-lookup";
import { toMessage } from "../../../lib/errors";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { bundleId?: string; appStoreId?: string };
    const info = await lookupPublicAppInfo({
      bundleId: payload.bundleId,
      appStoreId: payload.appStoreId,
    });

    return NextResponse.json(info);
  } catch (error) {
    return NextResponse.json({ error: toMessage(error) }, { status: 400 });
  }
}
