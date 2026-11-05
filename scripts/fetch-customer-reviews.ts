#!/usr/bin/env node

import path from "node:path";
import process from "node:process";

import { findApp } from "../lib/app-registry";
import {
  customerReviewsFileForApp,
  fetchCustomerReviewsDocument,
  overallStorefrontRating,
  ratingsByCountry,
  summarizeRatings,
  territoryName,
  writeCustomerReviewsDocument,
} from "../lib/customer-reviews";
import { hasProp, toMessage } from "../lib/errors";

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
Download customer ratings and reviews (read-only).

Usage:
  npm run fetch:reviews -- --app netprobe

Behavior:
  Replaces <metadataPath>/../customer_reviews.json with every written review from
  App Store Connect, plus public per-country rating totals (not available for Mac apps).
`.trim());
}

const stars = (average: number | null) => (average === null ? "-" : average.toFixed(2));

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printHelp();
    return;
  }

  const rootDir = process.cwd();
  const { app, settings } = await findApp(args.app, rootDir);
  const document = await writeCustomerReviewsDocument(
    rootDir,
    app,
    await fetchCustomerReviewsDocument(app, settings, rootDir),
  );

  const written = summarizeRatings(document.reviews.map((review) => review.rating));
  console.log(`Written reviews: ${written.count}, average ${stars(written.average)}`);
  if (document.storefrontRatings) {
    const overall = overallStorefrontRating(document.storefrontRatings);
    console.log(`All ratings: ${overall.count}, average ${stars(overall.average)}`);
  }

  console.log("");
  for (const row of ratingsByCountry(document)) {
    const publicPart = row.storefront ? `  ratings ${row.storefront.count} avg ${stars(row.storefront.average)}` : "";
    console.log(
      `${territoryName(row.territory).padEnd(24)} reviews ${String(row.reviews.count).padStart(3)} avg ${stars(row.reviews.average)}${publicPart}`,
    );
  }

  console.log(`\nSaved to ${path.relative(rootDir, customerReviewsFileForApp(rootDir, app))}`);
}

main().catch((error: unknown) => {
  console.error(toMessage(error));
  if (hasProp(error, "stderr") && error.stderr) {
    console.error(error.stderr);
  }
  process.exitCode = 1;
});
