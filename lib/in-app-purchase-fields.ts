// Browser-safe constants for in-app purchase localizations, shared by the
// server-side store (./in-app-purchases) and the editor UI.

export const IAP_LIMITS = {
  name: 30,
  description: 45,
} as const;

export type IapField = keyof typeof IAP_LIMITS;

// Products the store no longer sells (e.g. retired tips) stay in the file for
// completeness but are hidden by default in the UI.
export const INACTIVE_IAP_STATES: ReadonlySet<string> = new Set([
  "DEVELOPER_REMOVED_FROM_SALE",
  "REMOVED_FROM_SALE",
]);
