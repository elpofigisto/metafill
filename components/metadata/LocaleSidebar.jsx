import { useMemo, useState } from "react";

import { ALL_LOCALES, LOCALE_LABELS } from "../../lib/app-store-metadata";

function badgeFor({ locale, isSelected, dirty, reviewed, info }) {
  if (isSelected && dirty) {
    return { label: "editing", className: "badge badge-draft" };
  }

  if (reviewed) {
    return { label: "reviewed", className: "badge badge-reviewed" };
  }

  if (info?.hasContent) {
    return {
      label: locale === "en-US" ? "source" : "translated",
      className: "badge badge-ready",
    };
  }

  if (info?.exists) {
    return { label: "empty", className: "badge badge-empty" };
  }

  return {
    label: locale === "en-US" ? "no source" : "missing",
    className: "badge badge-missing",
  };
}

export function LocaleSidebar({ actions, computed, state }) {
  const {
    bulkLocales,
    busyAction,
    dirty,
    loading,
    overview,
    refreshing,
    reviewState,
    saving,
    selectedLocale,
  } = state;
  const [query, setQuery] = useState("");
  const busy = Boolean(busyAction);
  const canImport = !loading && !saving && !busy;

  const visibleLocales = useMemo(() => {
    const term = query.trim().toLowerCase();

    if (!term) {
      return ALL_LOCALES;
    }

    return ALL_LOCALES.filter(
      (locale) =>
        locale.toLowerCase().includes(term) ||
        (LOCALE_LABELS[locale] || "").toLowerCase().includes(term),
    );
  }, [query]);

  const allVisibleSelected =
    visibleLocales.length > 0 && visibleLocales.every((locale) => bulkLocales.includes(locale));

  const translateLabel =
    busyAction === "translate"
      ? "Translating…"
      : computed.translateSelectionCount > 0
        ? `Translate ${computed.translateSelectionCount} selected`
        : "Translate selected";
  const publishLabel =
    busyAction === "publish"
      ? "Publishing…"
      : computed.publishSelectionCount > 0
        ? `Publish ${computed.publishSelectionCount} reviewed`
        : "Publish reviewed";

  function toggleSelectAll() {
    if (allVisibleSelected) {
      actions.setBulkSelection(bulkLocales.filter((locale) => !visibleLocales.includes(locale)));
    } else {
      const merged = new Set([...bulkLocales, ...visibleLocales]);
      actions.setBulkSelection([...merged]);
    }
  }

  return (
    <aside className="locale-sidebar" aria-label="Locales and bulk actions">
      <div className="sidebar-section import-group">
        <h2>Source</h2>
        <button
          className="ghost-button"
          disabled={!canImport || !computed.canPublicFetch}
          type="button"
          onClick={() => actions.fetchFromAppStore("public")}
        >
          {busyAction === "fetch-public" ? "Fetching…" : "Fetch public data"}
        </button>
        <button
          className="ghost-button"
          disabled={!canImport || !computed.canSync}
          type="button"
          onClick={() => actions.fetchFromAppStore("fastlane")}
        >
          {busyAction === "fetch-fastlane" ? "Syncing…" : "Sync App Store Connect"}
        </button>
      </div>

      <div className="sidebar-section locale-search">
        <input
          aria-label="Search locales"
          placeholder="Search languages…"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <div className="select-row">
          <span>{bulkLocales.length} selected</span>
          <span className="select-row-actions">
            <button
              className="text-button"
              disabled={refreshing}
              type="button"
              title="Re-scan files on disk (e.g. after a CLI import)"
              onClick={actions.refresh}
            >
              {refreshing ? "Refreshing…" : "Refresh"}
            </button>
            <button className="text-button" type="button" onClick={toggleSelectAll}>
              {allVisibleSelected ? "Clear" : "Select all"}
            </button>
          </span>
        </div>
      </div>

      <ul className="locale-list">
        {visibleLocales.map((locale) => {
          const reviewed = Boolean(reviewState[locale]?.reviewed);
          const info = overview[locale];
          const isSelected = locale === selectedLocale;
          const badge = badgeFor({ locale, isSelected, dirty, reviewed, info });
          const checked = bulkLocales.includes(locale);

          return (
            <li key={locale}>
              <div className={isSelected ? "locale-item active" : "locale-item"}>
                <input
                  aria-label={`Select ${LOCALE_LABELS[locale]} for bulk actions`}
                  checked={checked}
                  disabled={busy}
                  type="checkbox"
                  onChange={() => actions.toggleBulkLocale(locale)}
                />
                <button
                  className="locale-open"
                  disabled={loading || saving || busy}
                  type="button"
                  onClick={() => actions.changeLocale(locale)}
                >
                  <span className="locale-name">{LOCALE_LABELS[locale] || locale}</span>
                  <span className="locale-code">{locale}</span>
                </button>
                <span className="locale-badges">
                  {info?.overLimit ? <span className="badge badge-over" title="Over App Store limit">⚠</span> : null}
                  <span className={badge.className}>{badge.label}</span>
                </span>
              </div>
            </li>
          );
        })}
      </ul>

      <div className="sidebar-section bulk-actions">
        <button
          disabled={loading || saving || busy || computed.translateSelectionCount === 0}
          type="button"
          onClick={actions.translateBulk}
        >
          {translateLabel}
        </button>
        <button
          disabled={!computed.canPublish || busy}
          type="button"
          onClick={actions.publishBulk}
        >
          {publishLabel}
        </button>
        {!computed.canSync ? (
          <p className="bulk-hint">Set a bundle ID in Apps to enable sync and publish.</p>
        ) : null}
      </div>
    </aside>
  );
}
