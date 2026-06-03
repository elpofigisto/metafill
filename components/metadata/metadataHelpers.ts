import { charCount, metadataFileLimit, METADATA_FILES } from "../../lib/app-store-metadata";

// Pure helpers for the metadata editor. Kept out of the hook so it stays focused
// on state and effects.

export type MetadataFiles = Record<string, string>;

export interface FileStatus {
  chars: number;
  limit: number | null;
  overLimit: boolean;
  text: string;
}

export function emptyFiles(): MetadataFiles {
  return Object.fromEntries(METADATA_FILES.map((fileName: string) => [fileName, ""]));
}

// Files are stored on disk with a single trailing newline terminator. Strip it
// when loading into the editor so the character count reflects the real content
// (not the storage newline) and fields don't accumulate blank lines across
// save/reload cycles. The save path re-adds the terminator.
export function stripTrailingNewline(value: unknown): unknown {
  return typeof value === "string" ? value.replace(/\n$/, "") : value;
}

export function normalizeLoadedFiles(files: Record<string, unknown> | null | undefined): MetadataFiles {
  return Object.fromEntries(
    Object.entries(files || {}).map(([key, value]) => [key, stripTrailingNewline(value)]),
  ) as MetadataFiles;
}

export function statusFor(fileName: string, value: string): FileStatus {
  const chars = charCount(value);
  const limit = metadataFileLimit(fileName);
  const overLimit = typeof limit === "number" && chars > limit;

  return {
    chars,
    limit,
    overLimit,
    text: typeof limit === "number" ? `${chars}/${limit}` : `${chars}`,
  };
}
