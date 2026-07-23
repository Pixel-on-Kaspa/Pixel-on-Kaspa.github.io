/* MemoryAdapter — in-process storage for dev/test.
   Implements the StorageAdapter interface. Nothing persists across restarts;
   its only job is to prove the API + cross-browser behaviour without infra. */
export function MemoryAdapter() {
  const records = new Map();   // id -> record
  const images = new Map();    // id -> { bytes, contentType }
  const order = [];            // newest-first ids

  return {
    async save({ id, image, record, origin }) {
      images.set(id, { bytes: image.bytes, contentType: image.contentType });
      const imageUrl = `${origin}/api/v1/artwork/${id}/image`;
      const full = { ...record, image: imageUrl, thumb: imageUrl, backend: "memory" };
      records.set(id, full);
      order.unshift(id);
      return full;
    },
    async get(id) {
      return records.get(id) || null;
    },
    async getImage(id) {
      return images.get(id) || null;
    },
    async list({ limit }) {
      return order.slice(0, limit).map((id) => records.get(id)).filter(Boolean);
    },
  };
}
