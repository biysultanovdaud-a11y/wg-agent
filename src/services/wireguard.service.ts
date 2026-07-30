import { randomBytes } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { run } from "../utils/exec";
import { metrics } from "../metrics/registry";

export class WireGuardService {
  async generatePrivateKey(): Promise<string> {
    const { stdout } = await run("wg", ["genkey"]);
    return stdout.trim();
  }

  /** `wg pubkey` reads the private key from stdin rather than argv — argv would put it in `ps` output on the host, which stdin avoids. */
  async derivePublicKey(privateKey: string): Promise<string> {
    const { stdout } = await run("wg", ["pubkey"], { input: privateKey });
    return stdout.trim();
  }

  async generatePresharedKey(): Promise<string> {
    const { stdout } = await run("wg", ["genpsk"]);
    return stdout.trim();
  }

  /**
   * Dry-run validation: `wg-quick strip` fully parses the given config
   * file and fails loudly on syntax errors without touching the live
   * interface. Passed as atomicWrite's `validate` callback so a bad write
   * never reaches the real wg0.conf in the first place.
   */
  async validateConfigFile(configPath: string): Promise<void> {
    await run("wg-quick", ["strip", configPath]);
  }

  /**
   * Applies wg0.conf to the live interface without a wg-quick down/up
   * cycle — `wg syncconf` diffs the running peer set against the given
   * config and adds/removes only what changed, so existing peers' active
   * sessions aren't dropped just because one peer was added or removed.
   *
   * The standard shell idiom for this is
   *   wg syncconf wg0 <(wg-quick strip wg0)
   * which relies on bash process substitution — not available through
   * execFile, and not worth reaching for a shell just to get it. Same
   * result without a shell: strip to stdout ourselves, write that to a
   * throwaway temp file, point `wg syncconf` at the file, then delete it.
   */
  async reload(interfaceName: string, configPath: string): Promise<void> {
    const { stdout: strippedConfig } = await run("wg-quick", ["strip", configPath]);

    const tempDir = await mkdtemp(path.join(tmpdir(), "wg-agent-"));
    const tempConfigPath = path.join(tempDir, `${interfaceName}-${randomBytes(4).toString("hex")}.conf`);

    try {
      await writeFile(tempConfigPath, strippedConfig, { mode: 0o600 });
      await run("wg", ["syncconf", interfaceName, tempConfigPath]);
    } catch (error) {
      metrics.reloadFailures.inc();
      throw error;
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}
