"use client";

import { FieldSelectModal } from "./FieldSelectModal";
import { LocalePane } from "./LocalePane";
import { LocaleSidebar } from "./LocaleSidebar";
import { TopBar } from "./TopBar";
import { useMetadataEditor } from "./useMetadataEditor";

export default function MetadataEditor() {
  const editor = useMetadataEditor();

  return (
    <main className="aso-shell">
      <TopBar {...editor} />
      <div className="aso-body">
        <LocaleSidebar {...editor} />
        <LocalePane {...editor} />
      </div>
      {editor.state.pendingTranslate ? <FieldSelectModal {...editor} /> : null}
    </main>
  );
}
