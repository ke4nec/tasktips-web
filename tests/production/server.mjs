import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

const root = resolve("dist");
const security = await readFile("deploy/snippets/security-headers.conf", "utf8");
const csp = security.match(/Content-Security-Policy "([^"]+)"/)[1];
let version = 0;
const payloads = new Map();
const mime = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
};
createServer(async (request, response) => {
  const url = new URL(request.url, "http://127.0.0.1:5175");
  const send = (status, data, headers = {}) => {
    response.writeHead(status, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      ...headers,
    });
    response.end(data === undefined ? undefined : JSON.stringify(data));
  };
  if (url.pathname === "/__test/update") {
    version++;
    return send(200, { version });
  }
  if (url.pathname.startsWith("/api/")) {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    const body = Buffer.concat(chunks);
    const cookie = request.headers.cookie?.includes("test-session=1");
    if (url.pathname.endsWith("/auth/login"))
      return send(
        200,
        { accessToken: "test-token", expiresIn: 900 },
        { "Set-Cookie": "test-session=1; HttpOnly; Path=/; SameSite=Strict" },
      );
    if (url.pathname.endsWith("/auth/refresh"))
      return cookie
        ? send(200, { accessToken: "test-token", expiresIn: 900 })
        : send(401, { code: "AUTHENTICATION_REQUIRED" });
    if (url.pathname.endsWith("/auth/logout"))
      return send(204, undefined, { "Set-Cookie": "test-session=; Max-Age=0; Path=/" });
    if (url.pathname.endsWith("/me")) return send(200, { email: "production-test@example.com" });
    if (url.pathname.endsWith("/devices/register"))
      return send(200, { id: "test-device", displayName: "browser", platform: "web" });
    if (url.pathname === "/api/v1/projects")
      return send(200, { items: [{ id: "production-project", name: "生产测试项目" }] });
    if (url.pathname.endsWith("/sync/bootstrap"))
      return send(200, {
        generation: 1,
        items: [],
        hasMore: false,
        nextPageToken: null,
        cursor: "0",
      });
    if (url.pathname.endsWith("/sync/pull"))
      return send(200, { generation: 1, changes: [], nextCursor: "0", hasMore: false });
    if (url.pathname.endsWith("/sync/push")) {
      const push = JSON.parse(body);
      if (push.objects.some((item) => item.kind === "image" && /[/\\]/.test(item.id)))
        return send(400, { code: "VALIDATION_ERROR" });
      return send(200, {
        results: [...push.objects, ...push.tombstones].map((item) => ({
          kind: item.kind,
          id: item.id,
          status: "applied",
          revision: item.revision,
        })),
      });
    }
    if (url.pathname.includes("/payloads/")) {
      if (request.method === "PUT") {
        payloads.set(url.pathname, body);
        return send(204);
      }
      if (!payloads.has(url.pathname)) return send(404);
      response.writeHead(200, { "Content-Type": "application/octet-stream" });
      return response.end(request.method === "HEAD" ? undefined : payloads.get(url.pathname));
    }
    return send(404, { code: "NOT_FOUND" });
  }
  if (!url.pathname.startsWith("/app/")) return send(404);
  let path = resolve(root, url.pathname.slice(5));
  if (!path.startsWith(`${root}/`) || !extname(path)) path = resolve(root, "index.html");
  try {
    let data = await readFile(path);
    if (url.pathname === "/app/sw.js")
      data = Buffer.from(
        data.toString().replace(/tasktips-web-([a-f0-9]+)/, `tasktips-web-$1-test-${version}`),
      );
    response.writeHead(200, {
      "Content-Type": mime[extname(path)] ?? "application/octet-stream",
      "Cache-Control": "no-cache",
      "Content-Security-Policy": csp,
    });
    response.end(data);
  } catch {
    send(404);
  }
}).listen(5175, "127.0.0.1");
