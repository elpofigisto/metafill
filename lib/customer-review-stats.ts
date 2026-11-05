// Customer review shapes and the per-country rating math. Kept free of Node
// imports so the reviews page can compute summaries in the browser too.

export const CUSTOMER_REVIEWS_FILE = "customer_reviews.json";

export interface CustomerReviewResponse {
  body: string;
  lastModifiedDate: string;
  /** PUBLISHED or PENDING_PUBLISH. */
  state: string;
}

export interface CustomerReview {
  id: string;
  /** 1-5 stars. */
  rating: number;
  title: string;
  body: string;
  reviewerNickname: string;
  createdDate: string;
  /** App Store Connect territory code (ISO 3166-1 alpha-3, e.g. "UKR"). */
  territory: string;
  response: CustomerReviewResponse | null;
}

/** Public App Store rating totals for one storefront (every rating, not only written reviews). */
export interface StorefrontRating {
  territory: string;
  average: number;
  count: number;
  currentVersionAverage: number;
  currentVersionCount: number;
}

export interface CustomerReviewsDocument {
  fetchedAt: string;
  reviews: CustomerReview[];
  /**
   * Public rating totals per storefront, only storefronts with at least one
   * rating. Null when Apple doesn't publish them: Mac apps always report zero
   * ratings through the public lookup, so they are not queried.
   */
  storefrontRatings: StorefrontRating[] | null;
}

export interface RatingSummary {
  count: number;
  /** Null when there is nothing to average. */
  average: number | null;
  /** Number of 1..5 star ratings at index 0..4. */
  distribution: [number, number, number, number, number];
}

export interface CountryRatings {
  territory: string;
  /** Written reviews from App Store Connect. */
  reviews: RatingSummary;
  unanswered: number;
  latestReview: string;
  /** Public totals (all ratings), when Apple publishes them. */
  storefront: StorefrontRating | null;
}

// Every App Store territory as App Store Connect names it (alpha-3), with the
// alpha-2 code used by storefront URLs and for display names / flags.
const TERRITORY_PAIRS =
  "AFG:AF AGO:AO AIA:AI ALB:AL ARE:AE ARG:AR ARM:AM ATG:AG AUS:AU AUT:AT AZE:AZ BEL:BE BEN:BJ " +
  "BFA:BF BGR:BG BHR:BH BHS:BS BIH:BA BLR:BY BLZ:BZ BMU:BM BOL:BO BRA:BR BRB:BB BRN:BN BTN:BT " +
  "BWA:BW CAN:CA CHE:CH CHL:CL CHN:CN CIV:CI CMR:CM COD:CD COG:CG COL:CO CPV:CV CRI:CR CYM:KY " +
  "CYP:CY CZE:CZ DEU:DE DMA:DM DNK:DK DOM:DO DZA:DZ ECU:EC EGY:EG ESP:ES EST:EE FIN:FI FJI:FJ " +
  "FRA:FR FSM:FM GAB:GA GBR:GB GEO:GE GHA:GH GMB:GM GNB:GW GRC:GR GRD:GD GTM:GT GUY:GY HKG:HK " +
  "HND:HN HRV:HR HUN:HU IDN:ID IND:IN IRL:IE IRQ:IQ ISL:IS ISR:IL ITA:IT JAM:JM JOR:JO JPN:JP " +
  "KAZ:KZ KEN:KE KGZ:KG KHM:KH KNA:KN KOR:KR KWT:KW LAO:LA LBN:LB LBR:LR LBY:LY LCA:LC LKA:LK " +
  "LTU:LT LUX:LU LVA:LV MAC:MO MAR:MA MDA:MD MDG:MG MDV:MV MEX:MX MKD:MK MLI:ML MLT:MT MMR:MM " +
  "MNE:ME MNG:MN MOZ:MZ MRT:MR MSR:MS MUS:MU MWI:MW MYS:MY NAM:NA NER:NE NGA:NG NIC:NI NLD:NL " +
  "NOR:NO NPL:NP NRU:NR NZL:NZ OMN:OM PAK:PK PAN:PA PER:PE PHL:PH PLW:PW PNG:PG POL:PL PRT:PT " +
  "PRY:PY QAT:QA ROU:RO RUS:RU RWA:RW SAU:SA SEN:SN SGP:SG SLB:SB SLE:SL SLV:SV SRB:RS STP:ST " +
  "SUR:SR SVK:SK SVN:SI SWE:SE SWZ:SZ SYC:SC TCA:TC TCD:TD THA:TH TJK:TJ TKM:TM TON:TO TTO:TT " +
  "TUN:TN TUR:TR TWN:TW TZA:TZ UGA:UG UKR:UA URY:UY USA:US UZB:UZ VCT:VC VEN:VE VGB:VG VNM:VN " +
  "VUT:VU XKS:XK YEM:YE ZAF:ZA ZMB:ZM ZWE:ZW";

export const TERRITORY_ALPHA2: Readonly<Record<string, string>> = Object.fromEntries(
  TERRITORY_PAIRS.split(" ").map((pair) => pair.split(":") as [string, string]),
);

let regionNames: Intl.DisplayNames | null = null;

export function territoryName(territory: string): string {
  const alpha2 = TERRITORY_ALPHA2[territory];
  if (!alpha2) {
    return territory;
  }
  try {
    regionNames ??= new Intl.DisplayNames(["en"], { type: "region" });
    return regionNames.of(alpha2) ?? territory;
  } catch {
    return territory;
  }
}

/** Regional-indicator flag emoji, or "" for codes without one. */
export function territoryFlag(territory: string): string {
  const alpha2 = TERRITORY_ALPHA2[territory];
  if (!alpha2 || alpha2 === "XK") {
    return "";
  }
  return String.fromCodePoint(...[...alpha2].map((char) => 0x1f1e6 + char.charCodeAt(0) - 65));
}

export function summarizeRatings(ratings: number[]): RatingSummary {
  const distribution: RatingSummary["distribution"] = [0, 0, 0, 0, 0];
  let total = 0;

  for (const rating of ratings) {
    if (rating >= 1 && rating <= 5) {
      distribution[rating - 1] += 1;
      total += rating;
    }
  }

  const count = distribution.reduce((sum, value) => sum + value, 0);
  return { count, average: count > 0 ? total / count : null, distribution };
}

/** Rating-count-weighted average of the public storefront totals. */
export function overallStorefrontRating(ratings: StorefrontRating[]): { average: number | null; count: number } {
  const count = ratings.reduce((sum, entry) => sum + entry.count, 0);
  const weighted = ratings.reduce((sum, entry) => sum + entry.average * entry.count, 0);
  return { average: count > 0 ? weighted / count : null, count };
}

/**
 * One row per country that has written reviews or public ratings, most
 * reviewed / rated first.
 */
export function ratingsByCountry(document: CustomerReviewsDocument): CountryRatings[] {
  const reviewsByTerritory = new Map<string, CustomerReview[]>();
  for (const review of document.reviews) {
    const list = reviewsByTerritory.get(review.territory) ?? [];
    list.push(review);
    reviewsByTerritory.set(review.territory, list);
  }

  const storefronts = new Map((document.storefrontRatings ?? []).map((entry) => [entry.territory, entry]));
  const territories = new Set([...reviewsByTerritory.keys(), ...storefronts.keys()]);

  return [...territories]
    .map((territory): CountryRatings => {
      const reviews = reviewsByTerritory.get(territory) ?? [];
      return {
        territory,
        reviews: summarizeRatings(reviews.map((review) => review.rating)),
        unanswered: reviews.filter((review) => !review.response).length,
        latestReview: reviews.reduce((latest, review) => (review.createdDate > latest ? review.createdDate : latest), ""),
        storefront: storefronts.get(territory) ?? null,
      };
    })
    .sort(
      (a, b) =>
        (b.storefront?.count ?? 0) - (a.storefront?.count ?? 0) ||
        b.reviews.count - a.reviews.count ||
        territoryName(a.territory).localeCompare(territoryName(b.territory)),
    );
}
