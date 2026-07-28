import { execFile } from "node:child_process";
import { WireGuardCommandError } from "./errors";

export interface ExecResult {
  stdout: string;
  stderr: string;
}

export interface RunOptions {
  /** Piped to the child process's stdin — needed for `wg pubkey`, which reads a private key from stdin rather than argv (argv would leak the key into the process list). */
  input?: string;
  timeoutMs?: number;
}

/**
 * The only place in this service that spawns a process. Always execFile
 * with an argv array — never a shell string — so there is no command
 * injection surface regardless of what ends up in an argument (a public
 * key, an IP, etc. all pass through here as separate argv entries, never
 * interpolated into a command string). Wraps execFile manually (rather
 * than util.promisify) because promisify's callback form doesn't expose
 * child.stdin for the one command here that needs it.
 */
export function run(binary: string, args: string[], options: RunOptions = {}): Promise<ExecResult> {
  return new Promise((resolve, reject) => {
    const child = execFile(
      binary,
      args,
      { timeout: options.timeoutMs ?? 10_000, maxBuffer: 10 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error) {
          reject(new WireGuardCommandError(`${binary} ${args.join(" ")}`, stderr.toString() || error.message));
          return;
        }
        resolve({ stdout: stdout.toString(), stderr: stderr.toString() });
      }
    );

    if (options.input !== undefined) {
      child.stdin?.write(options.input);
      child.stdin?.end();
    }
  });
}
