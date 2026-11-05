#!/usr/bin/env node

import path from "node:path";
import process from "node:process";

import { findApp } from "../lib/app-registry";
import { hasProp, toMessage } from "../lib/errors";
import {
  fetchRemoteIapDocument,
  iapFileForApp,
  writeIapDocument,
} from "../lib/in-app-purchases";

function parseArgs(argv: string[]): { app: string; help: boolean } {
  const args = { app: "", help: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--app") {
      args.app = argv[i + 1] ?? "";
      i += 1;
    } else if (arg.startsWith("--app=")) {
      args.app = arg.slice("--app=".length);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp(): void {
  console.log(`
Download in-app purchase display names and descriptions from App Store Connect.

Usage:
  npm run fetch:iap -- --app netprobe

Behavior:
  Replaces <metadataPath>/../in_app_purchases.json with what App Store Connect has.
`.trim());
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  const rootDir = process.cwd();
  const { app, settings } = await findApp(args.app, rootDir);
  const document = await writeIapDocument(rootDir, app, await fetchRemoteIapDocument(app, settings, rootDir));

  for (const product of document.products) {
    const locales = Object.keys(product.localizations);
    console.log(`${product.productId} (${product.state}): ${locales.length} locale(s) ${locales.join(", ")}`);
  }

  console.log(`\nSaved ${document.products.length} in-app purchase(s) to ${path.relative(rootDir, iapFileForApp(rootDir, app))}`);
}

main().catch((error: unknown) => {
  console.error(toMessage(error));
  if (hasProp(error, "stderr") && error.stderr) {
    console.error(error.stderr);
  }
  process.exitCode = 1;
});
