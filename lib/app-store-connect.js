import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Build the fastlane authentication arguments for `deliver` from resolved
// credentials. App Store Connect API auth uses an --api_key_path pointing at a
// JSON descriptor. If the configured key path is already a JSON descriptor we
// pass it through; if it is a raw .p8 file we synthesize the JSON descriptor
// (Key ID + Issuer ID + the .p8 contents) into the provided temp directory.
//
// fastlane's Spaceship::ConnectAPI::Token.from_json_file requires the actual
// private key under a "key" field (it does not read a "key_filepath"), so we
// inline the .p8 contents. The temp file lives in the caller's temp dir and is
// removed when that dir is cleaned up.
//
// Returns the fastlane CLI args to append. When no API key is configured the
// args only carry --team_id (if any), letting fastlane fall back to its own
// auth (Apple ID / keychain).
export async function prepareFastlaneAuthArgs(creds, { rootDir, tempDir }) {
  const args = [];
  const keyPath = creds.apiKeyPath?.trim();

  if (keyPath) {
    if (keyPath.toLowerCase().endsWith(".json")) {
      args.push("--api_key_path", path.resolve(rootDir, keyPath));
    } else {
      if (!creds.apiKeyId || !creds.apiIssuerId) {
        throw new Error(
          "App Store Connect API key requires Key ID and Issuer ID. Set them in Settings (or per app).",
        );
      }

      const resolvedKeyPath = path.resolve(rootDir, keyPath);
      let keyContent;

      try {
        keyContent = await readFile(resolvedKeyPath, "utf8");
      } catch (error) {
        throw new Error(
          `Could not read App Store Connect .p8 key at ${resolvedKeyPath}: ${error.message}`,
        );
      }

      const descriptorPath = path.join(tempDir, "asc_api_key.json");
      const descriptor = {
        key_id: creds.apiKeyId,
        issuer_id: creds.apiIssuerId,
        key: keyContent,
        in_house: false,
      };

      await writeFile(descriptorPath, `${JSON.stringify(descriptor, null, 2)}\n`, "utf8");
      args.push("--api_key_path", descriptorPath);
    }
  }

  if (creds.teamId) {
    args.push("--team_id", creds.teamId);
  }

  return args;
}
