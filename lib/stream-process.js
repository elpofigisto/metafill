import { spawn } from "node:child_process";

// Stream a child process to the client as newline-delimited JSON events:
//   {"type":"out","text":"..."}   one per stdout/stderr chunk (live)
//   {"type":"done", ...payload}    on exit code 0 (payload from onSuccess)
//   {"type":"error","message":""}  on spawn error or non-zero exit
//
// The client renders "out" chunks live, resolves on "done", throws on "error".
export function streamChildResponse({ command, args, options = {}, onSuccess }) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      let closed = false;
      const send = (event) => {
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
      const observe = (chunk) => {
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
        send({ type: "error", message: error.message });
        finish();
        return;
      }

      child.stdout?.on("data", observe);
      child.stderr?.on("data", observe);

      child.on("error", (error) => {
        send({ type: "error", message: error.message });
        finish();
      });

      child.on("close", (code) => {
        if (code === 0) {
          try {
            send({ type: "done", ...(onSuccess ? onSuccess() : {}) });
          } catch (error) {
            send({ type: "error", message: error.message });
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
