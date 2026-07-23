/* ─────────────────────────────────────────────────────────────────────────
   PixelGallery API — the platform boundary.

   The browser talks ONLY to this Worker. Where artwork actually lives (memory,
   Pinata, R2, Supabase…) is hidden behind a StorageAdapter. Swapping storage
   never touches the frontend.

   Routes (versioned):
     POST /api/v1/publish            { png, patch, lab, labId, labUrl, title, parentId }
     GET  /api/v1/gallery?limit=     -> { items: [...] }
     GET  /api/v1/artwork/:id        -> { item }
     GET  /api/v1/artwork/:id/image  -> image bytes (memory adapter; prod uses a CDN URL)

   Responsibilities that live HERE (not in storage): validation, id generation,
   permalink/image URL resolution, CORS, and later auth + rate limiting.
   ───────────────────────────────────────────────────────────────────────── */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;   // 8 MB decoded
const MAX_TITLE = 200;

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function validatePublish(b) {
  if (!b || typeof b !== "object") return "body required";
  if (typeof b.png !== "string" || !b.png.startsWith("data:image/")) return "png data URL required";
  if (b.patch != null && typeof b.patch !== "object") return "patch must be an object";
  if (b.lab != null && typeof b.lab !== "string") return "lab must be a string";
  if (b.labId != null && typeof b.labId !== "string") return "labId must be a string";
  if (b.title != null && String(b.title).length > MAX_TITLE) return "title too long";
  if (b.parentId != null && typeof b.parentId !== "string") return "parentId must be a string";
  return null;
}

function decodeDataUrl(dataUrl) {
  const m = /^data:([^;,]+)(;base64)?,([\s\S]*)$/.exec(dataUrl);
  if (!m) return null;
  const contentType = m[1];
  const bytes = m[2]
    ? Uint8Array.from(atob(m[3]), (c) => c.charCodeAt(0))
    : new TextEncoder().encode(decodeURIComponent(m[3]));
  return { contentType, bytes };
}

function genId() {
  return "art_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
}

/**
 * Build the Worker request handler around a storage adapter.
 * adapter: { save(input) -> record, get(id), getImage(id), list({limit}) }
 */
export function createApp({ adapter }) {
  return async function handle(request) {
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });

    const url = new URL(request.url);
    const origin = url.origin;
    const path = url.pathname.replace(/\/+$/, "") || "/";

    try {
      if (request.method === "POST" && path === "/api/v1/publish") {
        const body = await request.json().catch(() => null);
        const err = validatePublish(body);
        if (err) return json({ error: err }, 400);

        const image = decodeDataUrl(body.png);
        if (!image) return json({ error: "malformed png data URL" }, 400);
        if (image.bytes.length > MAX_IMAGE_BYTES) return json({ error: "image too large" }, 413);

        const id = genId();
        const record = {
          id,
          lab: body.lab || "Lab",
          labId: body.labId || null,
          labUrl: body.labUrl || "/",
          title: (body.title || body.lab || "Untitled").slice(0, MAX_TITLE),
          patch: body.patch || null,
          parentId: body.parentId || null,
          featured: false,
          ts: Date.now(),
        };
        const saved = await adapter.save({ id, image, record, origin });
        return json({ id, item: saved });
      }

      if (request.method === "GET" && path === "/api/v1/gallery") {
        const limit = Math.min(100, parseInt(url.searchParams.get("limit") || "60", 10) || 60);
        const items = await adapter.list({ limit });
        return json({ items });
      }

      let m;
      if (request.method === "GET" && (m = /^\/api\/v1\/artwork\/([^/]+)\/image$/.exec(path))) {
        const img = await adapter.getImage(decodeURIComponent(m[1]));
        if (!img) return json({ error: "not found" }, 404);
        return new Response(img.bytes, {
          headers: { "Content-Type": img.contentType || "image/png", "Cache-Control": "public, max-age=31536000", ...CORS },
        });
      }

      if (request.method === "GET" && (m = /^\/api\/v1\/artwork\/([^/]+)$/.exec(path))) {
        const item = await adapter.get(decodeURIComponent(m[1]));
        if (!item) return json({ error: "not found" }, 404);
        return json({ item });
      }

      return json({ error: "not found" }, 404);
    } catch (e) {
      return json({ error: "server error", detail: String((e && e.message) || e) }, 500);
    }
  };
}
