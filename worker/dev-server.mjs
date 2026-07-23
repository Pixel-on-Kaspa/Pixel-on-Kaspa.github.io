/* Local dev/test server — runs the exact Worker app with the in-memory adapter.
   No Cloudflare, no Pinata. Proves the API + cross-browser behaviour.
     bun run worker/dev-server.mjs        (PORT env optional, default 8787)   */
import { createApp } from "./src/app.js";
import { MemoryAdapter } from "./src/adapters/memory.js";
import { PinataAdapter } from "./src/adapters/pinata.js";

const backend = (process.env.STORAGE || "memory").toLowerCase();
const adapter = backend === "pinata" ? PinataAdapter(process.env) : MemoryAdapter();
const handle = createApp({ adapter });
const port = Number(process.env.PORT || 8787);

Bun.serve({ port, fetch: (req) => handle(req) });
console.log(`PixelGallery dev API → http://localhost:${port}/api/v1  (storage: ${backend})`);
