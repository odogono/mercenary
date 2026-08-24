// Throwaway prototype server for issue #120. Exists only because browsers block
// @font-face fetches from file:// pages; serves the mockup page plus the two
// extracted typefaces straight from the Data Payload.
const pageUrl = new URL("index.html", import.meta.url);
const fontsUrl = new URL("../../payload/fonts/", import.meta.url);
const ALLOWED_FONTS = new Set(["mercenary.woff2", "damocles.woff2"]);
const port = Number(process.env["PORT"] ?? 4180);

Bun.serve({
  hostname: "127.0.0.1",
  port,
  async fetch(request) {
    const path = new URL(request.url).pathname;
    if (path === "/" || path === "/index.html") {
      return new Response(Bun.file(pageUrl), {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    }
    const font = path.match(/^\/fonts\/([a-z]+\.woff2)$/)?.[1];
    if (font !== undefined && ALLOWED_FONTS.has(font)) {
      const file = Bun.file(new URL(font, fontsUrl));
      if (await file.exists()) {
        return new Response(file, { headers: { "content-type": "font/woff2" } });
      }
      return new Response("payload font unavailable", { status: 404 });
    }
    return new Response("not found", { status: 404 });
  },
});

console.log(`browser-experience mockup: http://localhost:${port}/`);
