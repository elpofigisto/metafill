import { spawn, type SpawnOptions } from "node:child_process";

import { toMessage } from "./errors";

// Stream a child process to the client as newline-delimited JSON events:
//   {"type":"out","text":"..."}   one per stdout/stderr chunk (live)
//   {"type":"done", ...payload}    on exit code 0 (payload from onSuccess)
//   {"type":"error","message":""}  on spawn error or non-zero exit
//
// The client renders "out" chunks live, resolves on "done", throws on "error".
type StreamEvent =
  | { type: "out"; text: string }
  | { type: "error"; message: string }
  | ({ type: "done" } & Record<string, unknown>);

export function streamChildResponse({
  command,
  args,
  options = {},
  onSuccess,
}: {
  command: string;
  args: string[];
  options?: SpawnOptions;
  onSuccess?: () => Record<string, unknown>;
}): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (event: StreamEvent) => {
        if (!closed) {
          controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`));
        }
      };
      const finish = () => {
        if (!closed) {
          closed = true;
          controller.close();
        }
      };

      let lastLine = "";
      const observe = (chunk: Buffer) => {
        const text = chunk.toString();
        for (const line of text.split("\n")) {
          if (line.trim()) {
            lastLine = line.trim();
          }
        }
        send({ type: "out", text });
      };

      let child;
      try {
        child = spawn(command, args, options);
      } catch (error) {
        send({ type: "error", message: toMessage(error) });
        finish();
        return;
      }

      child.stdout?.on("data", observe);
      child.stderr?.on("data", observe);

      child.on("error", (error) => {
        send({ type: "error", message: toMessage(error) });
        finish();
      });

      child.on("close", (code) => {
        if (code === 0) {
          try {
            send({ type: "done", ...(onSuccess ? onSuccess() : {}) });
          } catch (error) {
            send({ type: "error", message: toMessage(error) });
          }
        } else {
          send({
            type: "error",
            message: lastLine
              ? `Failed (exit ${code}): ${lastLine}`
              : `Process exited with code ${code}.`,
          });
        }
        finish();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}
