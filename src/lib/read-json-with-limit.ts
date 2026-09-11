/**
 * Reads a NextRequest's body as JSON without ever buffering more than
 * `maxBytes`, regardless of what (or whether) a Content-Length header
 * claims.
 *
 * ⚠️ SECURITY: checking `Content-Length` before calling `req.json()` is
 * not a body-size limit - a request sent with `Transfer-Encoding:
 * chunked` has no Content-Length header at all (or can lie about it),
 * so the check is skipped and `req.json()` still buffers the entire
 * body in memory before any application-level check ever runs. Next.js
 * App Router route handlers enforce no default body-size limit of their
 * own (unlike Server Actions' `serverActions.bodySizeLimit`), so a route
 * that wants one has to enforce it itself, on the actual bytes read from
 * the stream.
 */
export class BodyTooLargeError extends Error {
  constructor(maxBytes: number) {
    super(`Request body exceeds the ${maxBytes}-byte limit.`);
    this.name = "BodyTooLargeError";
  }
}

export async function readJsonWithLimit(
  req: Request,
  maxBytes: number
): Promise<unknown> {
  const body = req.body;
  if (!body) return undefined;

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new BodyTooLargeError(maxBytes);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }

  const text = new TextDecoder().decode(combined);
  if (!text.trim()) return undefined;
  return JSON.parse(text);
}
