"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import {
  overallStorefrontRating,
  ratingsByCountry,
  summarizeRatings,
  territoryFlag,
  territoryName,
  type CustomerReview,
  type CustomerReviewsDocument,
  type RatingSummary,
} from "../../lib/customer-review-stats";
import { toMessage } from "../../lib/errors";
import type { AppConfig } from "../../lib/types";
import { loadApps } from "../metadata/metadataClient";
import { fetchReviews, loadReviews } from "./reviewsClient";

// Shared with the other pages so the chosen app follows you around.
const STORAGE_KEY = "selectedMetadataAppId";

function readStoredAppId(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) || "";
  } catch {
    return "";
  }
}

function storeAppId(appId: string) {
  try {
    window.localStorage.setItem(STORAGE_KEY, appId);
  } catch {
    // Storage can be unavailable (private mode); the picker still works.
  }
}

const formatAverage = (average: number | null) => (average === null ? "—" : average.toFixed(2));

function formatDate(iso: string): string {
  if (!iso) {
    return "—";
  }
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString("en", { year: "numeric", month: "short", day: "numeric" });
}

function Stars({ rating }: { rating: number }) {
  const full = Math.max(0, Math.min(5, Math.round(rating)));
  return (
    <span aria-label={`${rating} out of 5 stars`} className="stars">
      {"★".repeat(full)}
      <span className="stars-empty">{"★".repeat(5 - full)}</span>
    </span>
  );
}

function Distribution({ summary }: { summary: RatingSummary }) {
  const max = Math.max(1, ...summary.distribution);
  return (
    <div className="rating-bars">
      {[5, 4, 3, 2, 1].map((stars) => {
        const count = summary.distribution[stars - 1];
        return (
          <div className="rating-bar" key={stars}>
            <span>{stars}★</span>
            <span className="rating-bar-track">
              <span className="rating-bar-fill" style={{ width: `${(count / max) * 100}%` }} />
            </span>
            <span>{count}</span>
          </div>
        );
      })}
    </div>
  );
}

function ReviewCard({ review }: { review: CustomerReview }) {
  const flag = territoryFlag(review.territory);
  return (
    <article className="review-card">
      <header className="review-head">
        <Stars rating={review.rating} />
        <strong>{review.title || "(no title)"}</strong>
      </header>
      <p className="review-meta">
        {flag ? `${flag} ` : ""}
        {territoryName(review.territory)} · {review.reviewerNickname || "anonymous"} · {formatDate(review.createdDate)}
      </p>
      {review.body ? <p className="review-body">{review.body}</p> : null}
      {review.response ? (
        <div className="review-response">
          <p className="review-meta">
            Developer response · {formatDate(review.response.lastModifiedDate)}
            {review.response.state && review.response.state !== "PUBLISHED" ? (
              <span className="badge badge-draft">{review.response.state.replaceAll("_", " ").toLowerCase()}</span>
            ) : null}
          </p>
          <p className="review-body">{review.response.body}</p>
        </div>
      ) : (
        <span className="badge badge-empty">No response</span>
      )}
    </article>
  );
}

export default function CustomerReviewsView() {
  const [apps, setApps] = useState<AppConfig[]>([]);
  const [appId, setAppId] = useState("");
  const [document, setDocument] = useState<CustomerReviewsDocument | null>(null);
  const [filePath, setFilePath] = useState("");
  const [publicRatings, setPublicRatings] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [country, setCountry] = useState("");
  const [stars, setStars] = useState(0);
  const [unansweredOnly, setUnansweredOnly] = useState(false);

  const resetFilters = () => {
    setCountry("");
    setStars(0);
    setUnansweredOnly(false);
  };

  const load = useCallback(async (nextAppId: string) => {
    setBusy("Loading…");
    setError("");

    try {
      const payload = await loadReviews(nextAppId);
      setDocument(payload.document);
      setFilePath(payload.filePath);
      setPublicRatings(payload.publicRatings);
    } catch (loadError) {
      setError(toMessage(loadError));
    } finally {
      setBusy("");
    }
  }, []);

  useEffect(() => {
    loadApps()
      .then((payload) => {
        const stored = readStoredAppId();
        const nextAppId =
          payload.apps.find((app) => app.id === stored)?.id || payload.defaultAppId || payload.apps[0]?.id || "";
        setApps(payload.apps);
        setAppId(nextAppId);
        if (nextAppId) {
          void load(nextAppId);
        }
      })
      .catch((loadError) => setError(toMessage(loadError)));
  }, [load]);

  const reviews = useMemo(() => document?.reviews ?? [], [document]);
  const written = useMemo(() => summarizeRatings(reviews.map((review) => review.rating)), [reviews]);
  const overall = useMemo(
    () => (document?.storefrontRatings ? overallStorefrontRating(document.storefrontRatings) : null),
    [document],
  );
  const countries = useMemo(() => (document ? ratingsByCountry(document) : []), [document]);
  const unanswered = reviews.filter((review) => !review.response).length;
  const showPublic = Boolean(document?.storefrontRatings);

  const visibleReviews = reviews.filter(
    (review) =>
      (!country || review.territory === country) &&
      (!stars || review.rating === stars) &&
      (!unansweredOnly || !review.response),
  );

  function changeApp(nextAppId: string) {
    setAppId(nextAppId);
    storeAppId(nextAppId);
    resetFilters();
    void load(nextAppId);
  }

  async function refresh() {
    setBusy("Fetching from App Store Connect…");
    setError("");

    try {
      const payload = await fetchReviews(appId);
      setDocument(payload.document);
      resetFilters();
    } catch (fetchError) {
      setError(toMessage(fetchError));
    } finally {
      setBusy("");
    }
  }

  const locked = Boolean(busy);

  return (
    <main className="page-shell reviews-shell">
      <section className="toolbar">
        <div>
          <h1>Ratings &amp; reviews</h1>
          <p className="eyebrow">{filePath || "customer_reviews.json"}</p>
        </div>
        <div className="toolbar-actions">
          <label className="app-picker">
            <span>App</span>
            <select disabled={locked || apps.length === 0} value={appId} onChange={(event) => changeApp(event.target.value)}>
              {apps.map((app) => (
                <option key={app.id} value={app.id}>
                  {app.name}
                </option>
              ))}
            </select>
          </label>
          <Link className="nav-link" href="/">
            Metadata
          </Link>
          <Link className="nav-link" href="/iap">
            In-app purchases
          </Link>
          <Link className="nav-link" href="/apps">
            Apps
          </Link>
          <Link className="nav-link" href="/settings">
            Settings
          </Link>
        </div>
      </section>

      <section className="reviews-actions">
        <button className="ghost-button" disabled={locked || !appId} type="button" onClick={refresh}>
          Fetch from App Store Connect
        </button>
        {document?.fetchedAt ? (
          <span className="progress-pill">Fetched {new Date(document.fetchedAt).toLocaleString("en")}</span>
        ) : null}
      </section>

      {busy ? <div className="notice">{busy}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}

      {!busy && appId && !document ? (
        <div className="notice">
          No ratings saved for this app yet. Use “Fetch from App Store Connect” to load them.
        </div>
      ) : null}

      {document ? (
        <>
          <section className="reviews-summary">
            <div className="panel summary-card">
              <p className="summary-label">Written reviews</p>
              <p className="summary-value">
                {formatAverage(written.average)} <Stars rating={written.average ?? 0} />
              </p>
              <p className="summary-sub">{written.count} review(s) in App Store Connect</p>
              <Distribution summary={written} />
            </div>

            <div className="panel summary-card">
              <p className="summary-label">All ratings</p>
              {overall ? (
                <>
                  <p className="summary-value">
                    {formatAverage(overall.average)} <Stars rating={overall.average ?? 0} />
                  </p>
                  <p className="summary-sub">
                    {overall.count.toLocaleString("en")} rating(s) in {document.storefrontRatings?.length ?? 0}{" "}
                    countries, including stars without text
                  </p>
                </>
              ) : (
                <p className="summary-sub">
                  {publicRatings
                    ? "Fetch again to load the public per-country totals."
                    : "Apple doesn't publish rating totals for Mac apps, so star-only ratings (without text) are visible only on the Ratings page in App Store Connect. The numbers here count written reviews."}
                </p>
              )}
            </div>

            <div className="panel summary-card">
              <p className="summary-label">Responses</p>
              <p className="summary-value">{unanswered}</p>
              <p className="summary-sub">
                review(s) without a developer response, out of {reviews.length}
              </p>
              {unanswered > 0 ? (
                <button
                  className="text-button"
                  type="button"
                  onClick={() => {
                    resetFilters();
                    setUnansweredOnly(true);
                  }}
                >
                  Show unanswered
                </button>
              ) : null}
            </div>
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>By country</h2>
              <span className="progress-pill">{countries.length} countries</span>
            </div>
            {countries.length === 0 ? (
              <p className="summary-sub">No ratings yet.</p>
            ) : (
              <div className="country-table">
                <div className={showPublic ? "country-row with-public country-head" : "country-row country-head"}>
                  <span>Country</span>
                  {showPublic ? (
                    <>
                      <span>All ratings</span>
                      <span>Average</span>
                    </>
                  ) : null}
                  <span>Reviews</span>
                  <span>Average</span>
                  <span>Stars 5 → 1</span>
                  <span>No response</span>
                  <span>Latest review</span>
                </div>
                {countries.map((row) => (
                  <button
                    className={[
                      "country-row",
                      showPublic ? "with-public" : "",
                      country === row.territory ? "selected" : "",
                    ].join(" ")}
                    disabled={row.reviews.count === 0}
                    key={row.territory}
                    title={row.reviews.count > 0 ? "Show this country's reviews" : undefined}
                    type="button"
                    onClick={() => setCountry((current) => (current === row.territory ? "" : row.territory))}
                  >
                    <span className="country-name">
                      {territoryFlag(row.territory)} {territoryName(row.territory)}
                    </span>
                    {showPublic ? (
                      <>
                        <span>{row.storefront ? row.storefront.count.toLocaleString("en") : "—"}</span>
                        <span>{row.storefront ? row.storefront.average.toFixed(2) : "—"}</span>
                      </>
                    ) : null}
                    <span>{row.reviews.count || "—"}</span>
                    <span>{formatAverage(row.reviews.average)}</span>
                    <span className="mini-distribution">{[...row.reviews.distribution].reverse().join(" · ")}</span>
                    <span className={row.unanswered > 0 ? "unanswered" : undefined}>{row.unanswered || "—"}</span>
                    <span>{formatDate(row.latestReview)}</span>
                  </button>
                ))}
              </div>
            )}
          </section>

          <section className="panel">
            <div className="panel-header">
              <h2>Reviews</h2>
              <div className="review-filters">
                <select aria-label="Country" value={country} onChange={(event) => setCountry(event.target.value)}>
                  <option value="">All countries</option>
                  {countries
                    .filter((row) => row.reviews.count > 0)
                    .map((row) => (
                      <option key={row.territory} value={row.territory}>
                        {territoryName(row.territory)} ({row.reviews.count})
                      </option>
                    ))}
                </select>
                <select aria-label="Stars" value={stars} onChange={(event) => setStars(Number(event.target.value))}>
                  <option value={0}>All stars</option>
                  {[5, 4, 3, 2, 1].map((value) => (
                    <option key={value} value={value}>
                      {value} star{value === 1 ? "" : "s"} ({written.distribution[value - 1]})
                    </option>
                  ))}
                </select>
                <label className="review-filter-check">
                  <input
                    checked={unansweredOnly}
                    type="checkbox"
                    onChange={(event) => setUnansweredOnly(event.target.checked)}
                  />
                  No response only
                </label>
                <span className="progress-pill">
                  {visibleReviews.length}/{reviews.length}
                </span>
              </div>
            </div>
            {visibleReviews.length === 0 ? (
              <p className="summary-sub">No reviews match these filters.</p>
            ) : (
              <div className="review-list">
                {visibleReviews.map((review) => (
                  <ReviewCard key={review.id} review={review} />
                ))}
              </div>
            )}
          </section>
        </>
      ) : null}
    </main>
  );
}
