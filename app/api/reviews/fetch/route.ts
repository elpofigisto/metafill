import { NextResponse } from "next/server";

import { findApp } from "../../../../lib/app-registry";
import { fetchCustomerReviewsDocument, writeCustomerReviewsDocument } from "../../../../lib/customer-reviews";
import { toMessage } from "../../../../lib/errors";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const payload = (await request.json()) as { appId?: unknown };
    const { app, settings } = await findApp(String(payload.appId ?? ""));
    const document = await writeCustomerReviewsDocument(
      process.cwd(),
      app,
      await fetchCustomerReviewsDocument(app, settings),
    );

    return NextResponse.json({ app, document });
  } catch (error) {
    return NextResponse.json({ error: toMessage(error) }, { status: 400 });
  }
}
