import http from "http";
import type { AddressInfo } from "net";

/*
 * A real OpenAI-compatible HTTP endpoint.
 *
 * This lets the REAL `openai` SDK - the same client the production code
 * builds, with the same timeout and retry configuration - make real HTTP
 * requests, so timeout handling, retry behaviour, 5xx propagation and
 * malformed-body handling are exercised for real rather than asserted
 * against a hand-written stub object.
 *
 * The upstream model is what is substituted, and only because this
 * environment's network policy denies api.deepseek.com. Nothing served
 * here is presented as real news anywhere.
 */

export type ModelBehaviour =
  | { kind: "ok"; headline: string; body: string }
  | { kind: "raw"; content: string }
  | { kind: "status"; status: number; body?: string }
  | { kind: "invalid-json-envelope" }
  | { kind: "empty-content" }
  | { kind: "hang" };

export interface ModelServer {
  baseURL: string;
  requestCount: number;
  lastAuthHeader: string | null;
  setBehaviour: (behaviour: ModelBehaviour) => void;
  close: () => Promise<void>;
}

export async function startModelServer(initial: ModelBehaviour): Promise<ModelServer> {
  let behaviour = initial;
  let requestCount = 0;
  let lastAuthHeader: string | null = null;
  const hanging: http.ServerResponse[] = [];

  const server = http.createServer((req, res) => {
    if (!req.url?.includes("/chat/completions")) {
      res.writeHead(404, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "not found" }));
      return;
    }

    requestCount += 1;
    lastAuthHeader = (req.headers.authorization as string) ?? null;

    // Drain the request body so the socket behaves like a real server.
    req.resume();
    req.on("end", () => {
      if (behaviour.kind === "hang") {
        hanging.push(res);
        return;
      }

      if (behaviour.kind === "status") {
        res.writeHead(behaviour.status, { "Content-Type": "application/json" });
        res.end(behaviour.body ?? JSON.stringify({ error: { message: "upstream error" } }));
        return;
      }

      if (behaviour.kind === "invalid-json-envelope") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end("this is not json at all");
        return;
      }

      const content =
        behaviour.kind === "ok"
          ? JSON.stringify({ headline: behaviour.headline, body: behaviour.body })
          : behaviour.kind === "raw"
            ? behaviour.content
            : "";

      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          id: "chatcmpl-fixture",
          object: "chat.completion",
          created: Math.floor(Date.now() / 1000),
          model: "deepseek-v4-flash",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content },
              finish_reason: "stop",
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
        })
      );
    });
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as AddressInfo).port;

  return {
    baseURL: `http://127.0.0.1:${port}/v1`,
    get requestCount() {
      return requestCount;
    },
    get lastAuthHeader() {
      return lastAuthHeader;
    },
    setBehaviour: (next: ModelBehaviour) => {
      behaviour = next;
      requestCount = 0;
    },
    close: () =>
      new Promise<void>((resolve) => {
        hanging.forEach((res) => res.destroy());
        server.close(() => resolve());
        server.unref();
      }),
  };
}
