/* Local dev/test server — runs the exact Worker app with the in-memory adapter.
   No Cloudflare, no Pinata. Proves the API + cross-browser behaviour.
     bun run worker/dev-server.mjs        (PORT env optional, default 8787)   */
import { createApp } from "./src/app.js";
import { MemoryAdapter } from "./src/adapters/memory.js";

const handle = createApp({ adapter: MemoryAdapter() });
const port = Number(process.env.PORT || 8787);

Bun.serve({ port, fetch: (req) => handle(req) });
console.log(`PixelGallery dev API → http://localhost:${port}/api/v1  (storage: memory)`);
