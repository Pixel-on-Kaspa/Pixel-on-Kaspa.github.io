/* PinataAdapter — production storage on IPFS via Pinata's v3 Files API.

   Stores TWO public files per artwork:
     • the PNG image           -> served from the dedicated gateway
     • a metadata JSON record  -> the queryable gallery index (keyvalues filter)

   Config (Worker secrets / vars):
     PINATA_JWT       — required, stays server-side (never reaches the browser)
     PINATA_GATEWAY   — dedicated gateway, e.g. https://<name>.mypinata.cloud

   NOTE: two uploads + per-item gateway GETs are fine to start. The gallery INDEX
   is a good future move to Workers KV or R2 (cheaper/faster to list). The
   StorageAdapter interface makes that a one-file change. */
const UPLOAD = "https://uploads.pinata.cloud/v3/files";
const FILES = "https://api.pinata.cloud/v3/files/public";
const APP_TAG = "pixel-gallery";

export function PinataAdapter(env) {
  const JWT = env.PINATA_JWT;
  const gateway = (env.PINATA_GATEWAY || "https://gateway.pinata.cloud").replace(/\/+$/, "");
  const groupId = env.PINATA_GROUP_ID || null;   // keeps all gallery files in one Pinata group
  if (!JWT) throw new Error("PINATA_JWT not configured");
  const auth = { Authorization: "Bearer " + JWT };

  async function upload(blob, filename, keyvalues) {
    const form = new FormData();
    form.append("file", blob, filename);
    form.append("network", "public");
    form.append("name", filename);
    form.append("keyvalues", JSON.stringify(keyvalues));
    if (groupId) form.append("group_id", groupId);
    const r = await fetch(UPLOAD, { method: "POST", headers: auth, body: form });
    if (!r.ok) throw new Error("upload failed: " + r.status + " " + (await r.text()));
    return (await r.json()).data; // { id, cid, ... }
  }

  async function queryFiles(extra, limit) {
    const u = new URL(FILES);
    u.searchParams.set("keyvalues[app]", APP_TAG);
    u.searchParams.set("keyvalues[type]", "meta");
    for (const k in extra) u.searchParams.set("keyvalues[" + k + "]", extra[k]);
    if (limit) u.searchParams.set("limit", String(limit));
    const r = await fetch(u, { headers: auth });
    if (!r.ok) throw new Error("list failed: " + r.status);
    return ((await r.json()).data || {}).files || [];
  }

  async function fetchJson(cid) {
    const r = await fetch(`${gateway}/ipfs/${cid}`);
    if (!r.ok) return null;
    return r.json().catch(() => null);
  }

  return {
    async save({ id, image, record }) {
      const imgBlob = new Blob([image.bytes], { type: image.contentType || "image/png" });
      const img = await upload(imgBlob, id + ".png", { app: APP_TAG, type: "image", id });
      const imageUrl = `${gateway}/ipfs/${img.cid}`;
      const full = { ...record, image: imageUrl, thumb: imageUrl, imageCid: img.cid, backend: "pinata" };
      const metaBlob = new Blob([JSON.stringify(full)], { type: "application/json" });
      await upload(metaBlob, id + ".json", {
        app: APP_TAG, type: "meta", id,
        labId: record.labId || "", parentId: record.parentId || "",
      });
      return full;
    },
    async get(id) {
      const files = await queryFiles({ id }, 1);
      if (!files.length) return null;
      return fetchJson(files[0].cid);
    },
    async getImage() {
      return null; // images are served directly from the gateway URL
    },
    async list({ limit }) {
      const files = await queryFiles({}, limit);
      const items = await Promise.all(files.map((f) => fetchJson(f.cid)));
      return items.filter(Boolean).sort((a, b) => b.ts - a.ts);
    },
  };
}
