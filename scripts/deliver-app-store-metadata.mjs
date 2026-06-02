#!/usr/bin/env node

import { access, cp, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { loadConfig, metadataRootForApp, resolveCredentials } from "../lib/app-registry.js";
import { prepareFastlaneAuthArgs } from "../lib/app-store-connect.js";
import {
  ALL_LOCALES,
  assertSupportedLocale,
  normalizeLocale,
} from "../lib/app-store-metadata.js";
import { runInherit } from "../lib/process-runner.js";
import { readReviewState } from "../lib/review-state.js";

function parseArgs(argv) {
  const args = {
    app: null,
    confirm: false,
    locales: [],
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      args.help = true;
      continue;
    }

    if (arg === "--confirm") {
      args.confirm = true;
      continue;
    }

    if (arg === "--app") {
      args.app = argv[i + 1];
      i += 1;
      continue;
    }

    if (arg.startsWith("--app=")) {
      args.app = arg.slice("--app=".length);
      continue;
    }

    if (arg === "--locales") {
      args.locales = argv[i + 1].split(",").map((locale) => normalizeLocale(locale.trim())).filter(Boolean);
      i += 1;
      continue;
    }

    if (arg.startsWith("--locales=")) {
      args.locales = arg.slice("--locales=".length).split(",").map((locale) => normalizeLocale(locale.trim())).filter(Boolean);
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function printHelp() {
  console.log(`
Upload reviewed App Store metadata with fastlane deliver.

Usage:
  npm run deliver:metadata -- --app tidyshot --locales en-US,uk --confirm

Behavior:
  Only selected reviewed locale folders are copied to a temporary metadata directory.
  fastlane deliver runs with binary and screenshot uploads disabled.
`.trim());
}

function selectApp(apps, appId) {
  const selectedId = appId || apps[0]?.id;
  const app = apps.find((candidate) => candidate.id === selectedId);

  if (!app) {
    throw new Error(`Unknown app "${selectedId}". Available apps: ${apps.map(({ id }) => id).join(", ")}`);
  }

  if (!app.bundleId) {
    throw new Error(`App "${app.id}" is missing bundleId in apps.config.json.`);
  }

  return app;
}

function normalizeLocales(locales) {
  const selectedLocales = locales.length > 0 ? locales : ALL_LOCALES;

  for (const locale of selectedLocales) {
    assertSupportedLocale(locale);
  }

  return [...new Set(selectedLocales)];
}

async function assertLocalesReady(metadataRoot, locales) {
  const reviewState = await readReviewState(metadataRoot);
  const unreviewed = locales.filter((locale) => !reviewState.locales[locale]?.reviewed);

  if (unreviewed.length > 0) {
    throw new Error(`Cannot publish unreviewed locales: ${unreviewed.join(", ")}`);
  }

  for (const locale of locales) {
    await access(path.join(metadataRoot, locale));
  }
}

function fastlaneArgsForDeliver(app, tempMetadataPath, authArgs) {
  return [
    "deliver",
    "--app_identifier",
    app.bundleId,
    "--metadata_path",
    tempMetadataPath,
    "--skip_screenshots",
    "true",
    "--skip_binary_upload",
    "true",
    "--skip_app_version_update",
    "true",
    "--force",
    "true",
    "--platform",
    app.platform,
    // We never submit for review, so skip precheck — it adds nothing here and
    // can't run with App Store Connect API key auth (it errors on in-app purchases).
    "--run_precheck_before_submit",
    "false",
    ...authArgs,
  ];
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  if (!args.confirm) {
    throw new Error("Refusing to publish without --confirm.");
  }

  const rootDir = process.cwd();
  const { apps, settings } = await loadConfig(rootDir);
  const app = selectApp(apps, args.app);
  const creds = resolveCredentials(app, settings);
  const locales = normalizeLocales(args.locales);
  const metadataRoot = metadataRootForApp(rootDir, app);

  await assertLocalesReady(metadataRoot, locales);

  const tempDir = await mkdtemp(path.join(os.tmpdir(), `aso-${app.id}-deliver-`));
  const tempMetadataPath = path.join(tempDir, "metadata");

  try {
    for (const locale of locales) {
      await cp(path.join(metadataRoot, locale), path.join(tempMetadataPath, locale), {
        recursive: true,
        force: true,
      });
    }

    console.log(`Uploading ${app.id} metadata locales: ${locales.join(", ")}`);

    const authArgs = await prepareFastlaneAuthArgs(creds, { rootDir, tempDir });
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const logFile = path.join(rootDir, "logs", `publish-${app.id}-${stamp}.log`);

    // Inherit stdio so fastlane streams live to the terminal and any prompt is
    // visible and answerable (piped stdio would hang invisibly on a prompt).
    // Tee everything to logs/ so each run is inspectable afterwards.
    await runInherit("fastlane", fastlaneArgsForDeliver(app, tempMetadataPath, authArgs), {
      cwd: rootDir,
      env: {
        ...process.env,
        FASTLANE_SKIP_UPDATE_CHECK: "1",
      },
      logFile,
    });

    console.log(`\nLog saved to ${path.relative(rootDir, logFile)}`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.message);
  if (error.stdout) {
    console.error(error.stdout);
  }
  if (error.stderr) {
    console.error(error.stderr);
  }
  process.exitCode = 1;
});
