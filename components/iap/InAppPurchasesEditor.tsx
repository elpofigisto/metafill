"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { ALL_LOCALES, charCount, LOCALE_LABELS } from "../../lib/app-store-metadata";
import { toMessage } from "../../lib/errors";
import { IAP_LIMITS, INACTIVE_IAP_STATES, type IapField } from "../../lib/in-app-purchase-fields";
import type { IapChange, IapDocument, IapLocalization, IapProduct } from "../../lib/in-app-purchases";
import type { AppConfig } from "../../lib/types";
import { loadApps } from "../metadata/metadataClient";
import { fetchIap, loadIap, publishIap, saveIap } from "./iapClient";

// Shared with the metadata editor so the chosen app follows you between pages.
const STORAGE_KEY = "selectedMetadataAppId";

const FIELDS: Array<[IapField, string]> = [
  ["name", "Display name"],
  ["description", "Description"],
];

const EMPTY: IapLocalization = { name: "", description: "" };

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

function describeChange(change: IapChange): string {
  const after = `${change.after.name} — ${change.after.description || "(no description)"}`;
  return change.action === "create" ? after : `${change.before?.name} — ${change.before?.description} → ${after}`;
}

function ProductPanel({
  product,
  disabled,
  onChange,
}: {
  product: IapProduct;
  disabled: boolean;
  onChange: (locale: string, field: IapField, value: string) => void;
}) {
  const [showEmpty, setShowEmpty] = useState(false);
  const filled = ALL_LOCALES.filter((locale) => product.localizations[locale]);
  const locales = showEmpty ? ALL_LOCALES : filled;

  return (
    <section className="panel iap-product">
      <div className="panel-header">
        <div>
          <h2>{product.referenceName || product.productId}</h2>
          <p className="iap-product-meta">
            {product.productId} · {product.type.replaceAll("_", " ").toLowerCase()} ·{" "}
            <span className={INACTIVE_IAP_STATES.has(product.state) ? "badge badge-empty" : "badge badge-ready"}>
              {product.state.replaceAll("_", " ").toLowerCase()}
            </span>
          </p>
        </div>
        <span className="progress-pill">
          {filled.length}/{ALL_LOCALES.length} languages
        </span>
      </div>

      <div className="iap-table">
        <div className="iap-row iap-head">
          <span>Language</span>
          {FIELDS.map(([field, label]) => (
            <span key={field}>
              {label} <small>max {IAP_LIMITS[field]}</small>
            </span>
          ))}
        </div>
        {locales.map((locale) => {
          const localization = product.localizations[locale] ?? EMPTY;
          return (
            <div className="iap-row" key={locale}>
              <span className="iap-locale">
                {LOCALE_LABELS[locale] ?? locale}
                <code>{locale}</code>
              </span>
              {FIELDS.map(([field]) => {
                const chars = charCount(localization[field]);
                return (
                  <label className="iap-cell" key={field}>
                    <input
                      aria-label={`${locale} ${field}`}
                      disabled={disabled}
                      value={localization[field]}
                      onChange={(event) => onChange(locale, field, event.target.value)}
                    />
                    <span className={chars > IAP_LIMITS[field] ? "count over" : "count"}>
                      {chars}/{IAP_LIMITS[field]}
                    </span>
                  </label>
                );
              })}
            </div>
          );
        })}
      </div>

      <button className="text-button" type="button" onClick={() => setShowEmpty((value) => !value)}>
        {showEmpty ? "Hide empty languages" : `Show all ${ALL_LOCALES.length} languages`}
      </button>
    </section>
  );
}

export default function InAppPurchasesEditor() {
  const [apps, setApps] = useState<AppConfig[]>([]);
  const [appId, setAppId] = useState("");
  const [document, setDocument] = useState<IapDocument | null>(null);
  const [filePath, setFilePath] = useState("");
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [pending, setPending] = useState<IapChange[] | null>(null);
  const [showInactive, setShowInactive] = useState(false);

  const load = useCallback(async (nextAppId: string) => {
    setBusy("Loading…");
    setError("");
    setMessage("");
    setPending(null);

    try {
      const payload = await loadIap(nextAppId);
      setDocument(payload.document);
      setFilePath(payload.filePath);
      setDirty(false);
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

  const problems = useMemo(() => {
    const lines: string[] = [];
    for (const product of document?.products ?? []) {
      for (const [locale, localization] of Object.entries(product.localizations)) {
        if (localization.description && !localization.name) {
          lines.push(`${product.productId} ${locale}: display name is required.`);
        }
        for (const [field] of FIELDS) {
          if (charCount(localization[field]) > IAP_LIMITS[field]) {
            lines.push(`${product.productId} ${locale}: ${field} is over ${IAP_LIMITS[field]} characters.`);
          }
        }
      }
    }
    return lines;
  }, [document]);

  const products = document?.products ?? [];
  const inactiveCount = products.filter((product) => INACTIVE_IAP_STATES.has(product.state)).length;
  const visibleProducts = showInactive
    ? products
    : products.filter((product) => !INACTIVE_IAP_STATES.has(product.state));

  function changeApp(nextAppId: string) {
    if (dirty && !window.confirm("Discard unsaved in-app purchase changes?")) {
      return;
    }
    setAppId(nextAppId);
    storeAppId(nextAppId);
    void load(nextAppId);
  }

  function updateLocalization(ascId: string, locale: string, field: IapField, value: string) {
    setDocument((current) => {
      if (!current) {
        return current;
      }
      return {
        ...current,
        products: current.products.map((product) => {
          if (product.ascId !== ascId) {
            return product;
          }
          const next = { ...(product.localizations[locale] ?? EMPTY), [field]: value };
          const localizations = { ...product.localizations, [locale]: next };
          // Clearing both fields removes the locale from the file again.
          if (!next.name && !next.description) {
            delete localizations[locale];
          }
          return { ...product, localizations };
        }),
      };
    });
    setDirty(true);
    setPending(null);
    setMessage("");
  }

  async function run(label: string, action: () => Promise<void>) {
    setBusy(label);
    setError("");
    setMessage("");

    try {
      await action();
    } catch (actionError) {
      setError(toMessage(actionError));
    } finally {
      setBusy("");
    }
  }

  const save = () =>
    run("Saving…", async () => {
      if (!document) {
        return;
      }
      const payload = await saveIap(appId, document);
      setDocument(payload.document);
      setDirty(false);
      setMessage(`Saved to ${payload.filePath}.`);
    });

  const fetchRemote = () => {
    if (dirty && !window.confirm("Fetching replaces your unsaved changes. Continue?")) {
      return;
    }
    void run("Fetching from App Store Connect…", async () => {
      const payload = await fetchIap(appId);
      setDocument(payload.document);
      setDirty(false);
      setPending(null);
      setMessage(`Fetched ${payload.document.products.length} in-app purchase(s) from App Store Connect.`);
    });
  };

  const preview = () =>
    run("Comparing with App Store Connect…", async () => {
      const payload = await publishIap(appId, false);
      setPending(payload.changes);
      if (payload.changes.length === 0) {
        setMessage("Everything already matches App Store Connect.");
      }
    });

  const upload = () =>
    run("Uploading…", async () => {
      const payload = await publishIap(appId, true);
      setPending(null);
      setMessage(`Uploaded ${payload.applied} of ${payload.changes.length} change(s) to App Store Connect.`);
      if (payload.failed?.length) {
        setError(payload.failed.map((entry) => `${entry.productId} ${entry.locale}: ${entry.error}`).join("\n"));
      }
    });

  const locked = Boolean(busy);

  return (
    <main className="page-shell iap-shell">
      <section className="toolbar">
        <div>
          <h1>In-app purchases</h1>
          <p className="eyebrow">{filePath || "in_app_purchases.json"}</p>
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
          <Link className="nav-link" href="/apps">
            Apps
          </Link>
          <Link className="nav-link" href="/settings">
            Settings
          </Link>
        </div>
      </section>

      <section className="iap-actions">
        <button className="ghost-button" disabled={locked || !appId} type="button" onClick={fetchRemote}>
          Fetch from App Store Connect
        </button>
        <button disabled={locked || !dirty} type="button" onClick={save}>
          Save
        </button>
        <button
          className="ghost-button"
          disabled={locked || dirty || !document}
          title={dirty ? "Save first" : undefined}
          type="button"
          onClick={preview}
        >
          Review changes to publish
        </button>
        <span className={dirty ? "dirty-pill" : "clean-pill"}>{dirty ? "Unsaved changes" : "Saved"}</span>
        {problems.length > 0 ? <span className="warning-pill">Over limit</span> : null}
      </section>

      {busy ? <div className="notice">{busy}</div> : null}
      {error ? <div className="notice error">{error}</div> : null}
      {message ? <div className="notice success">{message}</div> : null}
      {problems.length > 0 ? (
        <div className="notice">
          Only changed localizations are checked when publishing, so a live one that is already over the limit is left as is.
          {problems.map((problem) => (
            <div key={problem}>{problem}</div>
          ))}
        </div>
      ) : null}

      {pending && pending.length > 0 ? (
        <section className="panel iap-pending">
          <div className="panel-header">
            <h2>{pending.length} change(s) for App Store Connect</h2>
            <div className="panel-actions">
              <button className="ghost-button" disabled={locked} type="button" onClick={() => setPending(null)}>
                Cancel
              </button>
              <button disabled={locked} type="button" onClick={upload}>
                Upload {pending.length} change(s)
              </button>
            </div>
          </div>
          <ul>
            {pending.map((change) => (
              <li key={`${change.ascId}-${change.locale}`}>
                <strong>{change.action === "create" ? "New" : "Update"}</strong> {change.productId}{" "}
                <code>{change.locale}</code>: {describeChange(change)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {!busy && appId && !document ? (
        <div className="notice">
          No in-app purchases saved for this app yet. Use “Fetch from App Store Connect” to load them.
        </div>
      ) : null}

      {document && products.length === 0 ? (
        <div className="notice">This app has no in-app purchases in App Store Connect.</div>
      ) : null}

      <div className="iap-products">
        {visibleProducts.map((product) => (
          <ProductPanel
            disabled={locked}
            key={product.ascId}
            product={product}
            onChange={(locale, field, value) => updateLocalization(product.ascId, locale, field, value)}
          />
        ))}
      </div>

      {inactiveCount > 0 ? (
        <button className="text-button" type="button" onClick={() => setShowInactive((value) => !value)}>
          {showInactive ? "Hide" : "Show"} {inactiveCount} in-app purchase(s) removed from sale
        </button>
      ) : null}
    </main>
  );
}
