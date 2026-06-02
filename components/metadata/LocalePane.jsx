import {
  FILE_HELP,
  FILE_LABELS,
  LOCALE_LABELS,
  METADATA_FILES,
  SOURCE_LOCALE,
} from "../../lib/app-store-metadata";

// Single-line fields, like App Store Connect - prevents stray line breaks that
// would otherwise count toward (and blow) the character limit.
const SINGLE_LINE_FILES = new Set(["name.txt", "subtitle.txt", "keywords.txt"]);

const TEXTAREA_ROWS = {
  "description.txt": 14,
  "promotional_text.txt": 4,
  "release_notes.txt": 8,
};

function PaneNotices({ state }) {
  const { activeApp, error, message, missing, operationOutput, selectedAppId } = state;

  return (
    <>
      {error ? <div className="notice error">{error}</div> : null}
      {message ? <div className="notice success">{message}</div> : null}
      {missing.length > 0 ? (
        <div className="notice">
          Missing files for {activeApp?.name || selectedAppId} will be created on save:{" "}
          {missing.join(", ")}
        </div>
      ) : null}
      {activeApp && !activeApp.bundleId ? (
        <div className="notice">
          Add a <code>bundleId</code> for {activeApp.name} on the <strong>Apps</strong> screen to
          sync or publish with Fastlane.
        </div>
      ) : null}
      {operationOutput ? <pre className="operation-output">{operationOutput}</pre> : null}
    </>
  );
}

export function LocalePane({ actions, computed, state }) {
  const { busyAction, dirty, files, loading, saving, selectedLocale } = state;
  const busy = Boolean(busyAction);
  const isSource = selectedLocale === SOURCE_LOCALE;

  return (
    <section className="locale-pane" aria-label="Locale metadata editor">
      <div className="pane-header">
        <div>
          <h1>{LOCALE_LABELS[selectedLocale] || selectedLocale}</h1>
          <p className="eyebrow">
            {selectedLocale}
            {isSource ? " · source language" : ""}
          </p>
        </div>
        <div className="pane-header-actions">
          <span className={computed.selectedLocaleReviewed ? "clean-pill" : "warning-pill"}>
            {computed.selectedLocaleReviewed ? "Reviewed" : "Needs review"}
          </span>
          {!isSource ? (
            <button
              className="ghost-button"
              disabled={loading || saving || busy || !computed.canTranslateSelected}
              type="button"
              onClick={actions.translateSelectedLocale}
              title={
                !computed.aiConfigured
                  ? "Add an AI API key in Settings to translate"
                  : !computed.selectedLocaleHasSource
                    ? "Add en-US source content first"
                    : "Translate this language from en-US"
              }
            >
              {busyAction === "translate" ? "Translating…" : "Translate this language"}
            </button>
          ) : null}
          <button
            className="ghost-button"
            disabled={loading || saving || busy || dirty || computed.hasLimitWarnings}
            type="button"
            onClick={actions.markSelectedLocaleReviewed}
            title={dirty ? "Save before marking reviewed" : undefined}
          >
            {busyAction === "review" ? "Saving review…" : "Mark reviewed"}
          </button>
        </div>
      </div>

      <PaneNotices state={state} />

      {loading ? <div className="notice">Loading metadata…</div> : null}

      <form className="editor" onSubmit={actions.saveMetadata}>
        {METADATA_FILES.map((fileName) => {
          const status = computed.statuses[fileName];
          const singleLine = SINGLE_LINE_FILES.has(fileName);

          return (
            <section className="field-row" key={fileName}>
              <div className="field-meta">
                <label htmlFor={fileName}>{FILE_LABELS[fileName]}</label>
                <p>{FILE_HELP[fileName]}</p>
              </div>
              <div className="field-control">
                {singleLine ? (
                  <input
                    disabled={loading || saving}
                    id={fileName}
                    name={fileName}
                    spellCheck="true"
                    type="text"
                    value={files[fileName]}
                    onChange={(event) =>
                      actions.updateFile(fileName, event.target.value.replace(/[\r\n]+/g, ""))
                    }
                  />
                ) : (
                  <textarea
                    disabled={loading || saving}
                    id={fileName}
                    name={fileName}
                    rows={TEXTAREA_ROWS[fileName]}
                    spellCheck="true"
                    value={files[fileName]}
                    onChange={(event) => actions.updateFile(fileName, event.target.value)}
                  />
                )}
                <div className="field-footer">
                  <code>{fileName}</code>
                  <span className={status.overLimit ? "count over" : "count"}>
                    {status.text} chars
                  </span>
                </div>
              </div>
            </section>
          );
        })}

        <div className="save-bar">
          {computed.hasLimitWarnings ? (
            <span>Fix App Store limits before translating or reviewing.</span>
          ) : null}
          <button disabled={loading || saving || !dirty} type="submit">
            {saving ? "Saving…" : `Save ${LOCALE_LABELS[selectedLocale] || selectedLocale}`}
          </button>
        </div>
      </form>
    </section>
  );
}
