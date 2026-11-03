// Local static preview; never serves the repository root, key files or Python API.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
const root = new URL("../BeautyAI/", import.meta.url);
const files = ["index.html", "style.css", "script.js", "api-client.js", "ai-core.js", "ai-assets.js", "gemini-client.js", "report-model.js"];
const types = { html: "text/html; charset=utf-8", css: "text/css; charset=utf-8", js: "text/javascript; charset=utf-8" };
const port = Number(process.env.PORT || 8080);
createServer(async (request, response) => {
  const path = new URL(request.url, "http://localhost").pathname;
  const name = path === "/" ? "index.html" : path.slice(1);
  if (!["GET", "HEAD"].includes(request.method) || !files.includes(name)) {
    response.writeHead(404); response.end(); return;
  }
  try {
    const body = await readFile(new URL(name, root));
    response.writeHead(200, { "Content-Type": types[name.split(".").at(-1)], "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff" });
    response.end(request.method === "HEAD" ? undefined : body);
  } catch { response.writeHead(500); response.end(); }
}).listen(port, "127.0.0.1", () => console.log(`Static preview: http://127.0.0.1:${port} (no API key loaded)`));
