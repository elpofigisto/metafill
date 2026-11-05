import type { CustomerReviewsDocument } from "../../lib/customer-review-stats";
import type { AppConfig } from "../../lib/types";
import { requestJson } from "../metadata/metadataClient";

export interface ReviewsResponse {
  app: AppConfig;
  apps: AppConfig[];
  document: CustomerReviewsDocument | null;
  filePath: string;
  /** False for Mac apps: Apple doesn't publish their rating totals. */
  publicRatings: boolean;
}

export function loadReviews(appId: string): Promise<ReviewsResponse> {
  return requestJson<ReviewsResponse>(`/api/reviews?app=${encodeURIComponent(appId)}`, { cache: "no-store" });
}

export function fetchReviews(appId: string): Promise<{ document: CustomerReviewsDocument }> {
  return requestJson("/api/reviews/fetch", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ appId }),
  });
}
