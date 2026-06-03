import { spawn, type SpawnOptions } from "node:child_process";
import { createWriteStream, type WriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

// Run a command connected to the current terminal: output streams live and
// interactive prompts are visible/answerable. Pass `logFile` to also tee
// stdout+stderr to a file (keeps stdin interactive). Use for CLI tools (like
// fastlane) that stream output and may prompt for input.
export async function runInherit(
  command: string,
  args: string[],
  options: SpawnOptions & { logFile?: string } = {},
): Promise<{ code: number | null }> {
  const { logFile, ...spawnOptions } = options;

  let fileStream: WriteStream | null = null;
  if (logFile) {
    await mkdir(path.dirname(logFile), { recursive: true });
    fileStream = createWriteStream(logFile, { flags: "a" });
    fileStream.write(`# ${new Date().toISOString()}\n$ ${command} ${args.join(" ")}\n\n`);
  }

  return new Promise<{ code: number | null }>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: fileStream ? ["inherit", "pipe", "pipe"] : "inherit",
      ...spawnOptions,
    });

    if (fileStream) {
      child.stdout?.on("data", (chunk: Buffer) => {
        process.stdout.write(chunk);
        fileStream?.write(chunk);
      });
      child.stderr?.on("data", (chunk: Buffer) => {
        process.stderr.write(chunk);
        fileStream?.write(chunk);
      });
    }

    child.on("error", (error) => {
      fileStream?.end();
      reject(error);
    });

    child.on("close", (code) => {
      fileStream?.end();

      if (code === 0) {
        resolve({ code });
        return;
      }

      const error = new Error(`${command} exited with code ${code}.`) as Error & {
        code?: number | null;
      };
      error.code = code;
      reject(error);
    });
  });
}
