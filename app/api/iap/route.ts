import path from "node:path";
import { NextResponse } from "next/server";

import { findApp } from "../../../lib/app-registry";
import { toMessage } from "../../../lib/errors";
import {
  iapFileForApp,
  normalizeIapDocument,
  readIapDocument,
  validateIapDocument,
  writeIapDocument,
  type IapDocument,
} from "../../../lib/in-app-purchases";
import type { AppConfig } from "../../../lib/types";

export const dynamic = "force-dynamic";

function respond(app: AppConfig, apps: AppConfig[], document: IapDocument | null) {
  return NextResponse.json({
    app,
    apps,
    document,
    filePath: path.relative(process.cwd(), iapFileForApp(process.cwd(), app)),
    problems: document ? validateIapDocument(document) : [],
  });
}

export async function GET(request: Request) {
  try {
    const { app, apps } = await findApp(new URL(request.url).searchParams.get("app") || "");
    return respond(app, apps, await readIapDocument(process.cwd(), app));
  } catch (error) {
    return NextResponse.json({ error: toMessage(error) }, { status: 400 });
  }
}

export async function PUT(request: Request) {
  try {
    const { app, apps } = await findApp(new URL(request.url).searchParams.get("app") || "");
    const body = (await request.json()) as { document?: unknown };
    const document = await writeIapDocument(process.cwd(), app, normalizeIapDocument(body.document));
    return respond(app, apps, document);
  } catch (error) {
    return NextResponse.json({ error: toMessage(error) }, { status: 400 });
  }
}
