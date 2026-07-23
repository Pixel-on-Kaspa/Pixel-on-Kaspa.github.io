/* Cloudflare Worker entry. Picks the storage adapter from env and serves the
   versioned PixelGallery API. The frontend only ever sees /api/v1/*. */
import { createApp } from "./app.js";
import { MemoryAdapter } from "./adapters/memory.js";
import { PinataAdapter } from "./adapters/pinata.js";

let _handle = null;

function handlerFor(env) {
  if (_handle) return _handle;
  const backend = (env.STORAGE || "pinata").toLowerCase();
  const adapter = backend === "memory" ? MemoryAdapter() : PinataAdapter(env);
  _handle = createApp({ adapter });
  return _handle;
}

export default {
  fetch(request, env) {
    return handlerFor(env)(request);
  },
};
