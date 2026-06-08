import { useEffect, useRef, useState } from "react";

import {
  FILE_LABELS,
  FILE_LIMITS,
  isCopyVerbatimFile,
  LOCALE_LABELS,
  METADATA_FILES,
} from "../../lib/app-store-metadata";

import type { MetadataEditor } from "./useMetadataEditor";

type FieldSelectModalProps = MetadataEditor;

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Field picker shown before a translation runs. Defaults to every field
 * selected; unchecking fields skips them (and the tokens they'd cost). Rendered
 * only while a translation is pending, so it resets to "all" on each open.
 */
export function FieldSelectModal({ actions, state }: FieldSelectModalProps) {
  const { busyAction, pendingTranslate } = state;
  const [selected, setSelected] = useState<string[]>(() => [...METADATA_FILES]);
  const dialogRef = useRef<HTMLDivElement>(null);
  const busy = busyAction === "translate";

  // While open: lock background scroll, pull focus into the dialog, and restore
  // both (scroll + the previously-focused element) when it closes. Mount-scoped
  // because the modal is only mounted while a translation is pending.
  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const { overflow } = document.body.style;
    document.body.style.overflow = "hidden";

    const first = dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE);
    first?.focus();

    return () => {
      document.body.style.overflow = overflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  // Escape closes; Tab is trapped inside the dialog so focus can't wander to the
  // page behind it.
  function onKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      actions.cancelTranslate();
      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
    if (!focusable || focusable.length === 0) {
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    const active = document.activeElement;

    if (event.shiftKey && active === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  }

  if (!pendingTranslate) {
    return null;
  }

  const { locales } = pendingTranslate;
  const target =
    locales.length === 1
      ? LOCALE_LABELS[locales[0]] || locales[0]
      : `${locales.length} languages`;
  const allSelected = selected.length === METADATA_FILES.length;

  function toggle(fileName: string) {
    setSelected((current) =>
      current.includes(fileName)
        ? current.filter((entry) => entry !== fileName)
        : [...current, fileName],
    );
  }

  function toggleAll() {
    setSelected(allSelected ? [] : [...METADATA_FILES]);
  }

  // Keep the API's field order regardless of click order.
  const ordered = METADATA_FILES.filter((fileName) => selected.includes(fileName));

  return (
    <div
      className="modal-backdrop"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          actions.cancelTranslate();
        }
      }}
    >
      <div
        ref={dialogRef}
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Choose fields to translate for ${target}`}
        onKeyDown={onKeyDown}
      >
        <div className="modal-header">
          <h2>Translate {target}</h2>
          <p className="eyebrow">Pick the fields to translate. Unchecked fields are left as-is.</p>
        </div>

        <div className="modal-body">
          <label className="field-select-row field-select-all">
            <input checked={allSelected} type="checkbox" onChange={toggleAll} />
            <span className="field-select-name">All fields</span>
          </label>

          {METADATA_FILES.map((fileName) => {
            const limit = FILE_LIMITS[fileName];
            const meta = isCopyVerbatimFile(fileName)
              ? "copied as-is"
              : limit
                ? `${limit} chars`
                : "no limit";

            return (
              <label className="field-select-row" key={fileName}>
                <input
                  checked={selected.includes(fileName)}
                  type="checkbox"
                  onChange={() => toggle(fileName)}
                />
                <span className="field-select-name">{FILE_LABELS[fileName]}</span>
                <span className="field-select-meta">{meta}</span>
              </label>
            );
          })}
        </div>

        <div className="modal-footer">
          <button className="ghost-button" type="button" disabled={busy} onClick={actions.cancelTranslate}>
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || ordered.length === 0}
            onClick={() => actions.confirmTranslate(ordered)}
          >
            {busy
              ? "Translating…"
              : `Translate ${ordered.length} ${ordered.length === 1 ? "field" : "fields"}`}
          </button>
        </div>
      </div>
    </div>
  );
}
