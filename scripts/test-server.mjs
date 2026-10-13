import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const port = Number(process.env.PORT) || 4173;
const mime = {
  ".html":"text/html; charset=utf-8", ".css":"text/css; charset=utf-8",
  ".js":"text/javascript; charset=utf-8", ".json":"application/json; charset=utf-8",
  ".svg":"image/svg+xml", ".png":"image/png", ".txt":"text/plain; charset=utf-8"
};
http.createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url || "/", "http://localhost").pathname);
    const relative = pathname === "/" ? "index.html" : (pathname.startsWith("/") ? pathname.slice(1) : pathname);
    const file = path.resolve(root, relative);
    if (file !== root && !file.startsWith(root + path.sep)) {
      response.writeHead(403).end("Forbidden"); return;
    }
    const body = await readFile(file);
    response.writeHead(200, {"content-type":mime[path.extname(file)] || "application/octet-stream","cache-control":"no-store"});
    response.end(body);
  } catch {
    response.writeHead(404, {"content-type":"text/plain; charset=utf-8"}).end("Not found");
  }
}).listen(port, "127.0.0.1", () => {
  process.stdout.write("PlanetForge test server listening on http://127.0.0.1:" + port + "\n");
});
