const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 8000);

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
};

const server = http.createServer((request, response) => {
  const requestedUrl = new URL(request.url || "/", `http://localhost:${port}`);
  const safePath = path
    .normalize(decodeURIComponent(requestedUrl.pathname))
    .replace(/^(\.\.[/\\])+/, "");
  const absolutePath = path.join(root, safePath === path.sep ? "index.html" : safePath);

  if (!absolutePath.startsWith(root)) {
    response.writeHead(403);
    response.end("Forbidden");
    return;
  }

  fs.stat(absolutePath, (statError, stats) => {
    if (statError) {
      response.writeHead(404);
      response.end("Not found");
      return;
    }

    const filePath = stats.isDirectory() ? path.join(absolutePath, "index.html") : absolutePath;
    const extension = path.extname(filePath).toLowerCase();
    response.setHeader("Content-Type", mimeTypes[extension] || "application/octet-stream");
    fs.createReadStream(filePath)
      .on("error", () => {
        response.writeHead(500);
        response.end("Unable to read file");
      })
      .pipe(response);
  });
});

server.listen(port, () => {
  console.log(`Idle Civilization running at http://localhost:${port}/`);
});
