import http from "http";
import zlib from "zlib";
import type { AddressInfo } from "net";

/*
 * A real HTTP origin server for exercising the ingestion path over real
 * sockets: real status codes, real redirect chains, real conditional
 * GETs, real gzip, real timeouts, real truncated bodies.
 *
 * This is NOT a mock of our own code - every byte still travels through
 * the production safeFetch, the production RSS parser and the
 * production ingest logic. It stands in only for the publisher's
 * server, because this environment's network policy denies outbound
 * access to every real publisher host.
 *
 * All content served here is obviously-synthetic fixture text. Nothing
 * in this file is presented anywhere as real news.
 */

export const FIXTURE_ETAG = '"fixture-etag-v1"';
export const FIXTURE_LAST_MODIFIED = "Wed, 03 Feb 2026 08:00:00 GMT";

export function rssFixture(
  items: Array<{ title: string; link: string; summary?: string; pubDate?: string; image?: string }>
): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:media="http://search.yahoo.com/mrss/">
  <channel>
    <title>Example Test Authority (fixture)</title>
    <link>https://example.test/</link>
${items
  .map(
    (item) => `    <item>
      <title><![CDATA[${item.title}]]></title>
      <link>${item.link}</link>
      ${item.summary ? `<description><![CDATA[${item.summary}]]></description>` : ""}
      ${item.pubDate ? `<pubDate>${item.pubDate}</pubDate>` : ""}
      ${item.image ? `<media:content url="${item.image}" type="image/jpeg" />` : ""}
    </item>`
  )
  .join("\n")}
  </channel>
</rss>`;
}

export interface OriginServer {
  url: (path: string) => string;
  port: number;
  requests: Array<{ path: string; headers: http.IncomingHttpHeaders }>;
  close: () => Promise<void>;
}

export async function startOriginServer(
  options: { robots?: string } = {}
): Promise<OriginServer> {
  const requests: OriginServer["requests"] = [];
  // Sockets held open by the /slow route, destroyed on close so the
  // server can actually shut down.
  const hanging: http.ServerResponse[] = [];

  const server = http.createServer((req, res) => {
    const path = req.url ?? "/";
    requests.push({ path, headers: req.headers });

    const send = (status: number, body: string | Buffer, headers: Record<string, string> = {}) => {
      res.writeHead(status, { "Content-Type": "application/rss+xml", ...headers });
      res.end(body);
    };

    if (path === "/robots.txt") {
      if (options.robots === undefined) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("not found");
        return;
      }
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end(options.robots);
      return;
    }

    if (path.startsWith("/good.xml")) {
      send(
        200,
        rssFixture([
          {
            title: "Example Test Authority publishes a scheduled maintenance notice",
            link: "https://example.test/notices/maintenance",
            summary: "Fixture summary: a routine notice used only in tests.",
            pubDate: "Tue, 03 Feb 2026 08:15:00 GMT",
            image: "https://cdn.example.test/notice.jpg",
          },
          {
            title: "Example Test Authority updates its published opening hours",
            link: "https://example.test/notices/hours",
            summary: "Fixture summary: second synthetic item.",
            pubDate: "Tue, 03 Feb 2026 07:00:00 GMT",
          },
        ])
      );
      return;
    }

    if (path.startsWith("/etag.xml")) {
      if (req.headers["if-none-match"] === FIXTURE_ETAG) {
        res.writeHead(304, { ETag: FIXTURE_ETAG });
        res.end();
        return;
      }
      send(
        200,
        rssFixture([
          {
            title: "Example Test Authority conditional-GET fixture item",
            link: "https://example.test/notices/etag",
          },
        ]),
        { ETag: FIXTURE_ETAG, "Last-Modified": FIXTURE_LAST_MODIFIED }
      );
      return;
    }

    if (path.startsWith("/lastmod.xml")) {
      if (req.headers["if-modified-since"] === FIXTURE_LAST_MODIFIED) {
        res.writeHead(304);
        res.end();
        return;
      }
      send(
        200,
        rssFixture([
          { title: "Example Test Authority last-modified fixture", link: "https://example.test/n/lm" },
        ]),
        { "Last-Modified": FIXTURE_LAST_MODIFIED }
      );
      return;
    }

    if (path.startsWith("/gzip.xml")) {
      const body = zlib.gzipSync(
        Buffer.from(
          rssFixture([
            { title: "Example Test Authority gzip fixture item", link: "https://example.test/n/gz" },
          ]),
          "utf-8"
        )
      );
      send(200, body, { "Content-Encoding": "gzip" });
      return;
    }

    // Redirect chain: /redirect -> /redirect2 -> /good.xml
    // NOTE: /redirect-loop must be matched BEFORE the /redirect prefix,
    // or it falls into the finite chain and never loops.
    if (path.startsWith("/redirect-loop")) {
      res.writeHead(302, { Location: "/redirect-loop" });
      res.end();
      return;
    }
    if (path.startsWith("/redirect2")) {
      res.writeHead(302, { Location: "/good.xml" });
      res.end();
      return;
    }
    if (path.startsWith("/redirect")) {
      res.writeHead(301, { Location: "/redirect2" });
      res.end();
      return;
    }

    if (path.startsWith("/slow")) {
      // Never responds: the client's own timeout must fire.
      hanging.push(res);
      return;
    }

    if (path.startsWith("/500")) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end("upstream is unwell");
      return;
    }

    if (path.startsWith("/404")) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("no such feed");
      return;
    }

    if (path.startsWith("/malformed.xml")) {
      // Truncated mid-element, exactly like a connection cut short.
      send(200, '<?xml version="1.0"?><rss><channel><item><title>Unterminated');
      return;
    }

    if (path.startsWith("/notxml")) {
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<!doctype html><html><body><h1>A web page, not a feed</h1></body></html>");
      return;
    }

    if (path.startsWith("/empty.xml")) {
      send(200, rssFixture([]));
      return;
    }

    if (path.startsWith("/huge.xml")) {
      const filler = "x".repeat(64 * 1024);
      res.writeHead(200, { "Content-Type": "application/rss+xml" });
      // Far past any sane cap; the client must stop reading.
      for (let index = 0; index < 200; index += 1) res.write(filler);
      res.end();
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("unknown fixture path");
  });

  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", () => resolve()));
  const port = (server.address() as AddressInfo).port;

  return {
    port,
    requests,
    url: (path: string) => `http://127.0.0.1:${port}${path}`,
    close: () =>
      new Promise<void>((resolve) => {
        hanging.forEach((res) => res.destroy());
        server.close(() => resolve());
        server.unref();
      }),
  };
}
