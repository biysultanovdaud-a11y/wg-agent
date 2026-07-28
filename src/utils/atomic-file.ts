import { randomBytes } from "node:crypto";
import { constants as fsConstants } from "node:fs";
import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export interface AtomicWriteOptions {
  /** Runs against the temp file's path before it replaces the target — throw to abort the write. Typically `wg-quick strip <path>` for wg0.conf, to catch syntax errors before they ever touch the real file. */
  validate?: ((tempFilePath: string) => Promise<void>) | undefined;
}

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath, fsConstants.F_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Writes `content` to `targetPath` without ever leaving it in a
 * half-written or invalid state: the new content lands in a temp file in
 * the same directory first (so the final `rename` is an atomic same-
 * filesystem operation, not a copy), gets validated if a validator was
 * given, and only then replaces the original. On any failure the target
 * file is untouched — there is no window where it's partially written.
 *
 * Returns the target's previous content (or null if it didn't exist yet)
 * so the caller can restore it if something *downstream* of the write
 * fails (e.g. the reload command) — this function only guarantees the
 * write itself is safe, not everything that happens after it.
 */
export async function atomicWrite(
  targetPath: string,
  content: string,
  options: AtomicWriteOptions = {}
): Promise<string | null> {
  const dir = path.dirname(targetPath);
  await mkdir(dir, { recursive: true });

  const previousContent = (await fileExists(targetPath)) ? await readFile(targetPath, "utf8") : null;

 const ext = path.extname(targetPath);
const base = path.basename(targetPath, ext);

const suffix = randomBytes(1).toString("hex");

const tempPath = path.join(
  dir,
  `${base}.${suffix}${ext}`
);

  try {
    await writeFile(tempPath, content, { mode: 0o600 });

    if (options.validate) {
      await options.validate(tempPath);
    }

    await rename(tempPath, targetPath);
    return previousContent;
  } catch (error) {
    await rm(tempPath, { force: true });
    throw error;
  }
}

/** Restores a target file to previously-captured content — the rollback half of atomicWrite's contract. `null` means the file didn't exist before, so it's removed rather than written empty. */
export async function restore(targetPath: string, previousContent: string | null): Promise<void> {
  if (previousContent === null) {
    await rm(targetPath, { force: true });
    return;
  }
  await atomicWrite(targetPath, previousContent);
}
