import { realpathSync } from "node:fs";
import { pathToFileURL } from "node:url";

/**
 * Returns true when the given module URL is the process entrypoint. Robust to
 * tsx/ESM path and symlink differences.
 */
export function isMain(moduleUrl: string): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    return moduleUrl === pathToFileURL(realpathSync(entry)).href;
  } catch {
    return false;
  }
}
