import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { atomicWrite, restore } from "../src/utils/atomic-file";

let dir: string;
let target: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "wg-agent-test-"));
  target = path.join(dir, "wg0.conf");
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("atomicWrite", () => {
  it("writes content to a nonexistent target and returns null as the previous content", async () => {
    const previous = await atomicWrite(target, "hello");
    expect(previous).toBeNull();
    expect(await readFile(target, "utf8")).toBe("hello");
  });

  it("returns the previous content when overwriting an existing file", async () => {
    await atomicWrite(target, "version-1");
    const previous = await atomicWrite(target, "version-2");
    expect(previous).toBe("version-1");
    expect(await readFile(target, "utf8")).toBe("version-2");
  });

  it("never leaves a temp file behind after a successful write", async () => {
    await atomicWrite(target, "content");
    const files = await readdir(dir);
    expect(files).toEqual(["wg0.conf"]);
  });

  it("leaves the target file completely untouched if validation rejects the write", async () => {
    await atomicWrite(target, "known-good");

    await expect(
      atomicWrite(target, "known-bad", {
        validate: () => {
          throw new Error("simulated validation failure");
        },
      })
    ).rejects.toThrow("simulated validation failure");

    // The whole point of this test: a rejected write must not corrupt
    // the live file, which is exactly the guarantee the spec asked for.
    expect(await readFile(target, "utf8")).toBe("known-good");
  });

  it("cleans up its temp file even when validation fails", async () => {
    await atomicWrite(target, "known-good");
    await atomicWrite(target, "known-bad", {
      validate: () => {
        throw new Error("boom");
      },
    }).catch(() => {});

    const files = await readdir(dir);
    expect(files).toEqual(["wg0.conf"]);
  });

  it("runs validation before the rename, so a validator can inspect the not-yet-live temp file", async () => {
    let sawContentDuringValidation = "";
    await atomicWrite(target, "new-content", {
      validate: async (tempPath) => {
        sawContentDuringValidation = await readFile(tempPath, "utf8");
        // The real target must still hold nothing at this point (file didn't exist yet).
        await expect(readFile(target, "utf8")).rejects.toThrow();
      },
    });
    expect(sawContentDuringValidation).toBe("new-content");
  });
});

describe("restore", () => {
  it("restores previously captured content", async () => {
    await atomicWrite(target, "original");
    await atomicWrite(target, "changed");
    await restore(target, "original");
    expect(await readFile(target, "utf8")).toBe("original");
  });

  it("removes the file when restoring to null (file didn't exist before)", async () => {
    await atomicWrite(target, "should-be-removed");
    await restore(target, null);
    await expect(readFile(target, "utf8")).rejects.toThrow();
  });
});
