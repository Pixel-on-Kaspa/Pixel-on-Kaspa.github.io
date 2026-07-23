/* PinataAdapter — production storage on IPFS via Pinata.

   Pins TWO objects per artwork:
     • the PNG file            -> imageCid  (served from the dedicated gateway)
     • a metadata JSON record  -> keeps the gallery index queryable via pinList

   Config (Worker secrets / vars):
     PINATA_JWT       — required, stays server-side (never reaches the browser)
     PINATA_GATEWAY   — e.g. https://your-name.mypinata.cloud (falls back to public)

   NOTE: pinList + per-item gateway GETs are fine to start, but the gallery INDEX
   is a good candidate to move to Workers KV or R2 later (cheaper, faster to list).
   The StorageAdapter interface is exactly what makes that swap a one-file change. */
const PIN_FILE = "https://api.pinata.cloud/pinning/pinFileToIPFS";
const PIN_JSON = "https://api.pinata.cloud/pinning/pinJSONToIPFS";
const PIN_LIST = "https://api.pinata.cloud/data/pinList";
const APP_TAG = "pixel-gallery";

export function PinataAdapter(env) {
  const JWT = env.PINATA_JWT;
  const gateway = (env.PINATA_GATEWAY || "https://gateway.pinata.cloud").replace(/\/+$/, "");
  if (!JWT) throw new Error("PINATA_JWT not configured");
  const auth = { Authorization: "Bearer " + JWT };

  async function pinFile(id, image) {
    const form = new FormData();
    form.append("file", new Blob([image.bytes], { type: image.contentType || "image/png" }), id + ".png");
    form.append("pinataOptions", JSON.stringify({ cidVersion: 1 }));
    form.append("pinataMetadata", JSON.stringify({
      name: "pixel-img:" + id,
      keyvalues: { app: APP_TAG, type: "image", id },
    }));
    const r = await fetch(PIN_FILE, { method: "POST", headers: auth, body: form });
    if (!r.ok) throw new Error("pinFile failed: " + r.status + " " + (await r.text()));
    return (await r.json()).IpfsHash;
  }

  async function pinMeta(record) {
    const r = await fetch(PIN_JSON, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        pinataContent: record,
        pinataMetadata: {
          name: "pixel-meta:" + record.id,
          keyvalues: {
            app: APP_TAG, type: "meta", id: record.id,
            labId: record.labId || "", parentId: record.parentId || "",
          },
        },
        pinataOptions: { cidVersion: 1 },
      }),
    });
    if (!r.ok) throw new Error("pinMeta failed: " + r.status + " " + (await r.text()));
    return (await r.json()).IpfsHash;
  }

  async function queryPins(extraKeyvalues, limit) {
    const kv = { app: { value: APP_TAG, op: "eq" }, type: { value: "meta", op: "eq" }, ...extraKeyvalues };
    const u = new URL(PIN_LIST);
    u.searchParams.set("status", "pinned");
    u.searchParams.set("pageLimit", String(limit || 60));
    u.searchParams.set("metadata[keyvalues]", JSON.stringify(kv));
    const r = await fetch(u, { headers: auth });
    if (!r.ok) throw new Error("pinList failed: " + r.status);
    return (await r.json()).rows || [];
  }

  async function fetchMeta(cid) {
    const r = await fetch(`${gateway}/ipfs/${cid}`);
    if (!r.ok) return null;
    return r.json().catch(() => null);
  }

  return {
    async save({ id, image, record }) {
      const imageCid = await pinFile(id, image);
      const imageUrl = `${gateway}/ipfs/${imageCid}`;
      const full = { ...record, image: imageUrl, thumb: imageUrl, imageCid, backend: "pinata" };
      await pinMeta(full);
      return full;
    },
    async get(id) {
      const rows = await queryPins({ id: { value: id, op: "eq" } }, 1);
      if (!rows.length) return null;
      return fetchMeta(rows[0].ipfs_pin_hash);
    },
    async getImage() {
      return null; // images are served directly from the gateway URL
    },
    async list({ limit }) {
      const rows = await queryPins({}, limit);
      rows.sort((a, b) => new Date(b.date_pinned) - new Date(a.date_pinned));
      const items = await Promise.all(rows.map((row) => fetchMeta(row.ipfs_pin_hash)));
      return items.filter(Boolean);
    },
  };
}
