#!/usr/bin/env node

import { cp, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import process from "node:process";

import { loadConfig, metadataRootForApp, resolveCredentials } from "../lib/app-registry.js";
import { prepareFastlaneAuthArgs } from "../lib/app-store-connect.js";
import { ALL_LOCALES } from "../lib/app-store-metadata.js";
import { hasProp, toMessage } from "../lib/errors";
import { runInherit } from "../lib/process-runner.js";
import { clearLocaleReview } from "../lib/review-state.js";
import type { AppConfig, Credentials } from "../lib/types";

interface ParsedArgs {
  app: string | null;
  help: boolean;
}

function parseArgs(argv: string[]): ParsedArgs {
  const args: ParsedArgs = {
    app: null,
    help: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];

    if (arg === "--help" || arg === "-h") {
      args.help = true;
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

    throw new Error(`Unknown argument: ${arg}`);
  }

  return args;
}

function printHelp(): void {
  console.log(`
Fetch existing App Store Connect metadata with fastlane deliver.

Usage:
  npm run fetch:metadata -- --app tidyshot
  tsx scripts/fetch-app-store-metadata.ts --app tidyshot

Configuration:
  apps.config.json app entries should include bundleId.
  apiKeyPath and teamId are optional.
`.trim());
}

function selectApp(apps: AppConfig[], appId: string | null): AppConfig {
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

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  const rootDir = process.cwd();
  const { apps, settings } = await loadConfig(rootDir);
  const app = selectApp(apps, args.app);
  const creds: Credentials = resolveCredentials(app, settings);
  const metadataRoot = metadataRootForApp(rootDir, app);
  const tempDir = await mkdtemp(path.join(os.tmpdir(), `aso-${app.id}-metadata-`));
  const tempMetadataPath = path.join(tempDir, "metadata");

  try {
    console.log(`Fetching App Store Connect metadata for ${app.id} (${app.bundleId})...`);

    const authArgs = await prepareFastlaneAuthArgs(creds, { rootDir, tempDir });
    const fastlaneArgs = [
      "deliver",
      "download_metadata",
      "--app_identifier",
      app.bundleId,
      "--metadata_path",
      tempMetadataPath,
      "--platform",
      app.platform,
      // Without --force, deliver's download_metadata prompts before overwriting
      // and, when run non-interactively (as we do), silently downloads nothing.
      // We download into a throwaway temp dir, so forcing overwrite is safe.
      "--force",
      "true",
      ...authArgs,
    ];

    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const logFile = path.join(rootDir, "logs", `fetch-${app.id}-${stamp}.log`);

    await runInherit("fastlane", fastlaneArgs, {
      cwd: rootDir,
      env: {
        ...process.env,
        FASTLANE_SKIP_UPDATE_CHECK: "1",
      },
      logFile,
    });

    await cp(tempMetadataPath, metadataRoot, {
      recursive: true,
      force: true,
    });

    for (const locale of ALL_LOCALES) {
      await clearLocaleReview(metadataRoot, locale);
    }

    console.log(`Metadata synced to ${metadataRoot}`);
    console.log(`Log saved to ${path.relative(rootDir, logFile)}`);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

main().catch((error: unknown) => {
  console.error(toMessage(error));
  if (hasProp(error, "stdout") && error.stdout) {
    console.error(error.stdout);
  }
  if (hasProp(error, "stderr") && error.stderr) {
    console.error(error.stderr);
  }
  process.exitCode = 1;
});
