import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";

// Run a command connected to the current terminal: output streams live and
// interactive prompts are visible/answerable. Pass `logFile` to also tee
// stdout+stderr to a file (keeps stdin interactive). Use for CLI tools (like
// fastlane) that stream output and may prompt for input.
export async function runInherit(command, args, options = {}) {
  const { logFile, ...spawnOptions } = options;

  let fileStream = null;
  if (logFile) {
    await mkdir(path.dirname(logFile), { recursive: true });
    fileStream = createWriteStream(logFile, { flags: "a" });
    fileStream.write(`# ${new Date().toISOString()}\n$ ${command} ${args.join(" ")}\n\n`);
  }

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: fileStream ? ["inherit", "pipe", "pipe"] : "inherit",
      ...spawnOptions,
    });

    if (fileStream) {
      child.stdout.on("data", (chunk) => {
        process.stdout.write(chunk);
        fileStream.write(chunk);
      });
      child.stderr.on("data", (chunk) => {
        process.stderr.write(chunk);
        fileStream.write(chunk);
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

      const error = new Error(`${command} exited with code ${code}.`);
      error.code = code;
      reject(error);
    });
  });
}
