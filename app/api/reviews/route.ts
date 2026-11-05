import path from "node:path";
import { NextResponse } from "next/server";

import { findApp } from "../../../lib/app-registry";
import {
  customerReviewsFileForApp,
  hasPublicRatings,
  readCustomerReviewsDocument,
} from "../../../lib/customer-reviews";
import { toMessage } from "../../../lib/errors";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { app, apps } = await findApp(new URL(request.url).searchParams.get("app") || "");
    return NextResponse.json({
      app,
      apps,
      document: await readCustomerReviewsDocument(process.cwd(), app),
      filePath: path.relative(process.cwd(), customerReviewsFileForApp(process.cwd(), app)),
      publicRatings: hasPublicRatings(app),
    });
  } catch (error) {
    return NextResponse.json({ error: toMessage(error) }, { status: 400 });
  }
}
