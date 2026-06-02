import { NextResponse } from "next/server";

import { lookupPublicAppInfo } from "../../../lib/public-app-store-lookup";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const payload = await request.json();
    const info = await lookupPublicAppInfo({
      bundleId: payload.bundleId,
      appStoreId: payload.appStoreId,
    });

    return NextResponse.json(info);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}
