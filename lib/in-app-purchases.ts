// In-app purchase display names and descriptions, per locale.
//
// They live in one JSON file next to the app's fastlane metadata folder
// (`<metadataPath>/../in_app_purchases.json`) so they are versioned with the
// rest of the listing. `fetch` replaces the file with what App Store Connect
// has; `publish` diffs the file against App Store Connect and creates or
// updates only the localizations that differ. Nothing is ever deleted remotely.

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { resolveCredentials, metadataRootForApp } from "./app-registry";
import { ALL_LOCALES, assertSupportedLocale, charCount, normalizeLocale } from "./app-store-metadata";
import { createAscClient, type AscClient } from "./asc-api";
import { hasProp, toMessage } from "./errors";
import { IAP_LIMITS, INACTIVE_IAP_STATES, type IapField } from "./in-app-purchase-fields";
import type { AppConfig, Credentials } from "./types";

export const IAP_FILE = "in_app_purchases.json";

export interface IapLocalization {
  name: string;
  description: string;
}

export interface IapProduct {
  /** App Store Connect resource id of the in-app purchase. */
  ascId: string;
  productId: string;
  referenceName: string;
  type: string;
  state: string;
  localizations: Record<string, IapLocalization>;
}

export interface IapDocument {
  fetchedAt: string;
  products: IapProduct[];
}

export interface IapChange {
  ascId: string;
  productId: string;
  locale: string;
  action: "create" | "update";
  /** Existing localization id (updates only). */
  localizationId?: string;
  before?: IapLocalization;
  after: IapLocalization;
}

interface IapAttributes {
  productId: string;
  name: string;
  inAppPurchaseType: string;
  state: string;
}

interface IapLocalizationAttributes {
  locale: string;
  name: string;
  description: string | null;
  state?: string;
}

export function iapFileForApp(rootDir: string, app: AppConfig): string {
  return path.join(path.dirname(metadataRootForApp(rootDir, app)), IAP_FILE);
}

function localeOrder(locale: string): number {
  const index = ALL_LOCALES.indexOf(locale);
  return index === -1 ? ALL_LOCALES.length : index;
}

function sortLocalizations(
  localizations: Record<string, IapLocalization>,
): Record<string, IapLocalization> {
  return Object.fromEntries(
    Object.entries(localizations).sort(([a], [b]) => localeOrder(a) - localeOrder(b) || a.localeCompare(b)),
  );
}

function normalizeLocalization(raw: unknown): IapLocalization {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    name: String(source.name ?? "").trim(),
    description: String(source.description ?? "").trim(),
  };
}

/** Validate an untrusted document (from disk or a request body). */
export function normalizeIapDocument(raw: unknown): IapDocument {
  const source = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const rawProducts = Array.isArray(source.products) ? source.products : [];

  const products = rawProducts.map((rawProduct): IapProduct => {
    const product = (rawProduct && typeof rawProduct === "object" ? rawProduct : {}) as Record<
      string,
      unknown
    >;
    const ascId = String(product.ascId ?? "").trim();

    if (!/^\d+$/.test(ascId)) {
      throw new Error(`In-app purchase "${String(product.productId ?? "")}" has an invalid ascId.`);
    }

    const rawLocalizations = (
      product.localizations && typeof product.localizations === "object" ? product.localizations : {}
    ) as Record<string, unknown>;
    const localizations: Record<string, IapLocalization> = {};

    for (const [rawLocale, value] of Object.entries(rawLocalizations)) {
      const locale = normalizeLocale(rawLocale);
      assertSupportedLocale(locale);
      localizations[locale] = normalizeLocalization(value);
    }

    return {
      ascId,
      productId: String(product.productId ?? "").trim(),
      referenceName: String(product.referenceName ?? "").trim(),
      type: String(product.type ?? "").trim(),
      state: String(product.state ?? "").trim(),
      localizations: sortLocalizations(localizations),
    };
  });

  return { fetchedAt: String(source.fetchedAt ?? ""), products };
}

/** Over-limit and missing-name problems, as human-readable lines. */
export function validateIapDocument(document: IapDocument): string[] {
  const problems: string[] = [];

  for (const product of document.products) {
    for (const [locale, localization] of Object.entries(product.localizations)) {
      const isEmpty = !localization.name && !localization.description;

      if (!isEmpty && !localization.name) {
        problems.push(`${product.productId} ${locale}: display name is required.`);
      }

      for (const field of Object.keys(IAP_LIMITS) as IapField[]) {
        const chars = charCount(localization[field]);
        if (chars > IAP_LIMITS[field]) {
          problems.push(`${product.productId} ${locale}: ${field} is ${chars}/${IAP_LIMITS[field]} characters.`);
        }
      }
    }
  }

  return problems;
}

export async function readIapDocument(rootDir: string, app: AppConfig): Promise<IapDocument | null> {
  try {
    const raw = await readFile(iapFileForApp(rootDir, app), "utf8");
    return normalizeIapDocument(JSON.parse(raw));
  } catch (error) {
    if (hasProp(error, "code") && error.code === "ENOENT") {
      return null;
    }
    throw error;
  }
}

export async function writeIapDocument(
  rootDir: string,
  app: AppConfig,
  document: IapDocument,
): Promise<IapDocument> {
  const normalized = normalizeIapDocument(document);
  const filePath = iapFileForApp(rootDir, app);

  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(normalized, null, 2)}\n`, "utf8");

  return normalized;
}

function requireAppStoreId(app: AppConfig): string {
  if (!/^\d+$/.test(app.appStoreId)) {
    throw new Error(`App "${app.id}" needs its numeric App Store ID (Apps page) to load in-app purchases.`);
  }
  return app.appStoreId;
}

async function clientFor(app: AppConfig, settings: Credentials, rootDir: string): Promise<AscClient> {
  return createAscClient(resolveCredentials(app, settings), rootDir);
}

// Once anything changes on an approved product, App Store Connect keeps the
// live (APPROVED, read-only) localization and adds an editable draft copy for
// the same locale. One entry per locale, preferring the draft.
async function listRemoteLocalizations(client: AscClient, ascId: string) {
  const entries = await client.list<IapLocalizationAttributes>(
    `/v2/inAppPurchases/${ascId}/inAppPurchaseLocalizations?limit=200`,
  );
  const byLocale = new Map<string, (typeof entries)[number]>();

  for (const entry of entries) {
    const current = byLocale.get(entry.attributes.locale);
    if (!current || current.attributes.state === "APPROVED") {
      byLocale.set(entry.attributes.locale, entry);
    }
  }

  return [...byLocale.values()];
}

/** Read every in-app purchase of the app with all its localizations. */
export async function fetchRemoteIapDocument(
  app: AppConfig,
  settings: Credentials,
  rootDir: string = process.cwd(),
): Promise<IapDocument> {
  const client = await clientFor(app, settings, rootDir);
  const purchases = await client.list<IapAttributes>(
    `/v1/apps/${requireAppStoreId(app)}/inAppPurchasesV2?limit=200`,
  );
  const products: IapProduct[] = [];

  for (const purchase of purchases) {
    const localizations: Record<string, IapLocalization> = {};

    for (const localization of await listRemoteLocalizations(client, purchase.id)) {
      localizations[localization.attributes.locale] = normalizeLocalization(localization.attributes);
    }

    products.push({
      ascId: purchase.id,
      productId: purchase.attributes.productId,
      referenceName: purchase.attributes.name,
      type: purchase.attributes.inAppPurchaseType,
      state: purchase.attributes.state,
      localizations: sortLocalizations(localizations),
    });
  }

  // Active products first, then by product id, so the file diff stays stable.
  products.sort(
    (a, b) =>
      Number(INACTIVE_IAP_STATES.has(a.state)) - Number(INACTIVE_IAP_STATES.has(b.state)) ||
      a.productId.localeCompare(b.productId),
  );

  return { fetchedAt: new Date().toISOString(), products };
}

/**
 * Compare the local document with App Store Connect. Locales left completely
 * empty locally are ignored (never sent, never deleted remotely). Throws when a
 * change to send breaks a limit.
 */
export async function planIapPush(
  app: AppConfig,
  settings: Credentials,
  document: IapDocument,
  { locales, rootDir = process.cwd() }: { locales?: string[]; rootDir?: string } = {},
): Promise<{ client: AscClient; changes: IapChange[] }> {
  const client = await clientFor(app, settings, rootDir);
  const changes: IapChange[] = [];
  const onlyLocales = locales && locales.length > 0 ? new Set(locales) : null;

  for (const product of document.products) {
    const wanted = Object.entries(product.localizations).filter(
      ([locale, localization]) => localization.name && (!onlyLocales || onlyLocales.has(locale)),
    );
    if (wanted.length === 0) {
      continue;
    }

    const remote = new Map(
      (await listRemoteLocalizations(client, product.ascId)).map((entry) => [entry.attributes.locale, entry]),
    );

    for (const [locale, after] of wanted) {
      const existing = remote.get(locale);

      if (!existing) {
        changes.push({ ascId: product.ascId, productId: product.productId, locale, action: "create", after });
        continue;
      }

      const before = normalizeLocalization(existing.attributes);
      if (before.name !== after.name || before.description !== after.description) {
        changes.push({
          ascId: product.ascId,
          productId: product.productId,
          locale,
          action: "update",
          localizationId: existing.id,
          before,
          after,
        });
      }
    }
  }

  // Only what would be sent must fit: older approved localizations that are
  // already over today's limits are left alone rather than blocking a push.
  const problems = validateIapDocument({
    fetchedAt: document.fetchedAt,
    products: changes.map((change) => ({
      ascId: change.ascId,
      productId: change.productId,
      referenceName: "",
      type: "",
      state: "",
      localizations: { [change.locale]: change.after },
    })),
  });
  if (problems.length > 0) {
    throw new Error(`Fix these before publishing:\n${problems.join("\n")}`);
  }

  return { client, changes };
}

export async function applyIapChange(client: AscClient, change: IapChange): Promise<void> {
  const attributes: Record<string, string> = { name: change.after.name };
  // An empty description is left out rather than sent as an empty string.
  if (change.after.description) {
    attributes.description = change.after.description;
  }

  if (change.action === "create") {
    await client.send("POST", "/v1/inAppPurchaseLocalizations", {
      data: {
        type: "inAppPurchaseLocalizations",
        attributes: { locale: change.locale, ...attributes },
        relationships: {
          inAppPurchaseV2: { data: { type: "inAppPurchases", id: change.ascId } },
        },
      },
    });
    return;
  }

  await client.send("PATCH", `/v1/inAppPurchaseLocalizations/${change.localizationId}`, {
    data: { type: "inAppPurchaseLocalizations", id: change.localizationId, attributes },
  });
}

/**
 * Apply every change, continuing past failures, and return the ones that
 * failed. Creates go first: on an approved product they make App Store Connect
 * open a draft, and updates are then pointed at the draft copy of each locale
 * (the live APPROVED copy refuses edits).
 */
export async function applyIapChanges(
  client: AscClient,
  changes: IapChange[],
): Promise<Array<{ change: IapChange; error: string }>> {
  const failed: Array<{ change: IapChange; error: string }> = [];
  const creates = changes.filter((change) => change.action === "create");
  const updates = changes.filter((change) => change.action === "update");

  for (const change of creates) {
    try {
      await applyIapChange(client, change);
    } catch (error) {
      failed.push({ change, error: toMessage(error) });
    }
  }

  const draftIds = new Map<string, Map<string, string>>();
  for (const change of updates) {
    try {
      if (creates.length > 0 && !draftIds.has(change.ascId)) {
        const remote = await listRemoteLocalizations(client, change.ascId);
        draftIds.set(change.ascId, new Map(remote.map((entry) => [entry.attributes.locale, entry.id])));
      }
      const localizationId = draftIds.get(change.ascId)?.get(change.locale) ?? change.localizationId;
      await applyIapChange(client, { ...change, localizationId });
    } catch (error) {
      failed.push({ change, error: toMessage(error) });
    }
  }

  return failed;
}

export function describeIapChange(change: IapChange): string {
  const after = `"${change.after.name}" / "${change.after.description}"`;
  if (change.action === "create") {
    return `+ ${change.productId} ${change.locale}: ${after}`;
  }
  const before = `"${change.before?.name}" / "${change.before?.description}"`;
  return `~ ${change.productId} ${change.locale}: ${before} -> ${after}`;
}
