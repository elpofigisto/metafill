#!/usr/bin/env node

import process from "node:process";

import { findApp } from "../lib/app-registry";
import { normalizeLocale } from "../lib/app-store-metadata";
import { toMessage } from "../lib/errors";
import {
  applyIapChanges,
  describeIapChange,
  planIapPush,
  readIapDocument,
} from "../lib/in-app-purchases";

interface ParsedArgs {
  app: string;
  confirm: boolean;
  locales: string[];
  help: boolean;
}

function parseLocales(value: string): string[] {
  return value.split(",").map((locale) => normalizeLocale(locale.trim())).filter(Boolean);
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = { app: "", confirm: false, locales: [], help: false };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      args.help = true;
    } else if (arg === "--confirm") {
      args.confirm = true;
    } else if (arg === "--app") {
      args.app = argv[i + 1] ?? "";
      i += 1;
    } else if (arg.startsWith("--app=")) {
      args.app = arg.slice("--app=".length);
    } else if (arg === "--locales") {
      args.locales = parseLocales(argv[i + 1] ?? "");
      i += 1;
    } else if (arg.startsWith("--locales=")) {
      args.locales = parseLocales(arg.slice("--locales=".length));
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function printHelp(): void {
  console.log(`
Upload in-app purchase display names and descriptions to App Store Connect.

Usage:
  npm run deliver:iap -- --app netprobe              # dry run: print the changes
  npm run deliver:iap -- --app netprobe --confirm    # apply them
  npm run deliver:iap -- --app netprobe --locales de-DE,fr-FR --confirm

Behavior:
  Diffs in_app_purchases.json against App Store Connect, then creates missing
  localizations and updates changed ones. Remote localizations are never deleted.
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
  const document = await readIapDocument(rootDir, app);

  if (!document) {
    throw new Error(`No in_app_purchases.json for ${app.id}. Run npm run fetch:iap -- --app ${app.id} first.`);
  }

  const { client, changes } = await planIapPush(app, settings, document, {
    locales: args.locales,
    rootDir,
  });

  if (changes.length === 0) {
    console.log(`${app.id}: in-app purchases already match App Store Connect.`);
    return;
  }

  for (const change of changes) {
    console.log(describeIapChange(change));
  }

  if (!args.confirm) {
    console.log(`\nDry run: ${changes.length} change(s). Re-run with --confirm to upload.`);
    return;
  }

  const failed = await applyIapChanges(client, changes);

  for (const { change, error } of failed) {
    console.error(`! ${change.productId} ${change.locale}: ${error}`);
  }

  console.log(`\nUploaded ${changes.length - failed.length} of ${changes.length} in-app purchase localization change(s) for ${app.id}.`);

  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error: unknown) => {
  console.error(toMessage(error));
  process.exitCode = 1;
});
