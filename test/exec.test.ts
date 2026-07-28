import { describe, expect, it } from "vitest";
import { run } from "../src/utils/exec";
import { WireGuardCommandError } from "../src/utils/errors";

/**
 * `wg`/`wg-quick` aren't installed in this environment (no WireGuard node
 * here), so these tests exercise the exec wrapper itself — argv handling,
 * stdin piping, error propagation — against ordinary system binaries that
 * are actually present, standing in for what `wireguard.service.ts` calls
 * this same function with.
 */
describe("run", () => {
  it("captures stdout from a real child process", async () => {
    const { stdout } = await run("echo", ["hello-from-execfile"]);
    expect(stdout.trim()).toBe("hello-from-execfile");
  });

  it("pipes the `input` option to the child's stdin — the mechanism derivePublicKey relies on to avoid putting a private key in argv", async () => {
    const { stdout } = await run("cat", [], { input: "piped-through-stdin" });
    expect(stdout).toBe("piped-through-stdin");
  });

  it("throws WireGuardCommandError (not a raw exec error) on a nonzero exit", async () => {
    await expect(run("false", [])).rejects.toThrow(WireGuardCommandError);
  });

  it("includes the command and stderr on the thrown error, for operator-facing logs", async () => {
    try {
      await run("sh", ["-c", "echo something-went-wrong >&2; exit 1"]);
      expect.unreachable("expected run() to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(WireGuardCommandError);
      const wgError = error as WireGuardCommandError;
      expect(wgError.command).toContain("sh");
      expect(wgError.stderr).toContain("something-went-wrong");
    }
  });

  it("never invokes a shell — arguments containing shell metacharacters are passed through literally, not interpreted", async () => {
    const { stdout } = await run("echo", ["$(echo injected)", "; rm -rf /tmp/nonexistent-marker"]);
    // If this ever ran through a shell, $(...) would have been substituted
    // and the semicolon would have started a second command. Neither
    // happens with execFile — the string comes back completely literal.
    expect(stdout.trim()).toBe("$(echo injected) ; rm -rf /tmp/nonexistent-marker");
  });
});
