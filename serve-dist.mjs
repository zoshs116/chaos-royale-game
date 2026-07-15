import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(fileURLToPath(new URL(".", import.meta.url)), "dist");
const port = Number(process.env.PORT || 5175);

const types = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".webp": "image/webp",
  ".json": "application/json; charset=utf-8",
  ".wasm": "application/wasm",
};

createServer((req, res) => {
  const url = new URL(req.url || "/", `http://${req.headers.host}`);
  const safePath = normalize(decodeURIComponent(url.pathname)).replace(/^(\.\.[/\\])+/, "");
  let file = join(root, safePath === "/" ? "index.html" : safePath);
  if (!file.startsWith(root) || !existsSync(file) || statSync(file).isDirectory()) {
    file = join(root, "index.html");
  }
  res.setHeader("Content-Type", types[extname(file)] || "application/octet-stream");
  createReadStream(file).pipe(res);
}).listen(port, "127.0.0.1", () => {
  console.log(`Serving ${root} at http://127.0.0.1:${port}`);
});
