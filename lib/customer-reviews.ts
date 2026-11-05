// Customer ratings and reviews, read-only.
//
// Written reviews (stars, text, country, developer response) come from the App
// Store Connect API. Star-only ratings are not exposed there, so the per-country
// rating totals come from the public App Store lookup instead, and only for
// platforms where Apple publishes them (not Mac apps). Everything is saved to
// `<metadataPath>/../customer_reviews.json` so the page opens instantly and the
// reviews can be read by other tools; `fetch` replaces the file.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { metadataRootForApp, resolveCredentials } from "./app-registry";
import { createAscClient } from "./asc-api";
import {
  CUSTOMER_REVIEWS_FILE,
  TERRITORY_ALPHA2,
  type CustomerReview,
  type CustomerReviewResponse,
  type CustomerReviewsDocument,
  type StorefrontRating,
} from "./customer-review-stats";
import { hasProp } from "./errors";
import { lookupStorefrontRating, mapWithConcurrency } from "./public-app-store-lookup";
import type { AppConfig, Credentials } from "./types";

export * from "./customer-review-stats";

// The public lookup is rate limited; a handful in flight keeps ~175
// storefronts under a minute without tripping it.
const STOREFRONT_CONCURRENCY = 6;

interface ReviewAttributes {
  rating: number;
  title: string | null;
  body: string | null;
  reviewerNickname: string | null;
  createdDate: string;
  territory: string;
}

interface ResponseAttributes {
  responseBody: string | null;
  lastModifiedDate: string | null;
  state: string | null;
}

export function customerReviewsFileForApp(rootDir: string, app: AppConfig): string {
  return path.join(path.dirname(metadataRootForApp(rootDir, app)), CUSTOMER_REVIEWS_FILE);
}

/** Apple publishes rating totals for iPhone/iPad and Apple TV apps, but not Mac apps. */
export function hasPublicRatings(app: AppConfig): boolean {
  return app.platform !== "osx";
}

function requireAppStoreId(app: AppConfig): string {
  if (!/^\d+$/.test(app.appStoreId)) {
    throw new Error(`App "${app.id}" needs its numeric App Store ID (Apps page) to load ratings and reviews.`);
  }
  return app.appStoreId;
}

export async function fetchRemoteReviews(
  app: AppConfig,
  settings: Credentials,
  rootDir: string = process.cwd(),
): Promise<CustomerReview[]> {
  const client = await createAscClient(resolveCredentials(app, settings), rootDir);
  const params = new URLSearchParams({
    limit: "200",
    sort: "-createdDate",
    include: "response",
    "fields[customerReviewResponses]": "responseBody,lastModifiedDate,state",
  });
  const { data, included } = await client.listWithIncluded<ReviewAttributes>(
    `/v1/apps/${requireAppStoreId(app)}/customerReviews?${params.toString()}`,
  );

  const responses = new Map<string, CustomerReviewResponse>();
  for (const resource of included) {
    if (resource.type === "customerReviewResponses") {
      const attributes = resource.attributes as Partial<ResponseAttributes>;
      responses.set(resource.id, {
        body: attributes.responseBody ?? "",
        lastModifiedDate: attributes.lastModifiedDate ?? "",
        state: attributes.state ?? "",
      });
    }
  }

  return data.map((review) => {
    const responseId = review.relationships?.response?.data?.id;
    return {
      id: review.id,
      rating: Number(review.attributes.rating),
      title: review.attributes.title ?? "",
      body: review.attributes.body ?? "",
      reviewerNickname: review.attributes.reviewerNickname ?? "",
      createdDate: review.attributes.createdDate,
      territory: review.attributes.territory,
      response: (responseId && responses.get(responseId)) || null,
    };
  });
}

/** Public rating totals for every storefront that has at least one rating. */
export async function fetchStorefrontRatings(app: AppConfig): Promise<StorefrontRating[]> {
  const territories = Object.keys(TERRITORY_ALPHA2);
  const results = await mapWithConcurrency(territories, STOREFRONT_CONCURRENCY, (territory) =>
    lookupStorefrontRating(app, TERRITORY_ALPHA2[territory].toLowerCase()),
  );

  return territories
    .map((territory, index) => (results[index] ? { territory, ...results[index] } : null))
    .filter((entry): entry is StorefrontRating => Boolean(entry && entry.count > 0))
    .sort((a, b) => b.count - a.count);
}

export async function fetchCustomerReviewsDocument(
  app: AppConfig,
  settings: Credentials,
  rootDir: string = process.cwd(),
): Promise<CustomerReviewsDocument> {
  const [reviews, storefrontRatings] = await Promise.all([
    fetchRemoteReviews(app, settings, rootDir),
    hasPublicRatings(app) ? fetchStorefrontRatings(app) : Promise.resolve(null),
  ]);

  return { fetchedAt: new Date().toISOString(), reviews, storefrontRatings };
}

export async function readCustomerReviewsDocument(
  rootDir: string,
  app: AppConfig,
): Promise<CustomerReviewsDocument | null> {
  try {
    const raw = JSON.parse(await readFile(customerReviewsFileForApp(rootDir, app), "utf8")) as Partial<
      CustomerReviewsDocument
    >;
    return {
      fetchedAt: String(raw.fetchedAt ?? ""),
      reviews: Array.isArray(raw.reviews) ? raw.reviews : [],
      storefrontRatings: Array.isArray(raw.storefrontRatings) ? raw.storefrontRatings : null,
    };
  } catch (error) {
    if (hasProp(error, "code") && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function writeCustomerReviewsDocument(
  rootDir: string,
  app: AppConfig,
  document: CustomerReviewsDocument,
): Promise<CustomerReviewsDocument> {
  const filePath = customerReviewsFileForApp(rootDir, app);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(document, null, 2)}\n`, "utf8");
  return document;
}
