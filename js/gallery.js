/* ─────────────────────────────────────────────────────────────────────────
   PixelGallery — "Publish to Gallery" rail for the Pixel Art Lab.

   A creation (still PNG + the generative patch that made it) is published to a
   permanent, shareable page. Each published item becomes its own landing page
   with an "Open in Lab" button that rehydrates the parameters — turning a
   viewer into a creator.

   BACKEND IS PLUGGABLE. Right now it runs against a local STUB
   (localStorage + a fake CID) so the whole flow is clickable with zero infra.
   To go live, swap `publish()` / `list()` / `get()` to call a Cloudflare
   Worker that pins to Pinata (the master JWT stays server-side in the Worker,
   never in this file). The UI does not change.
   ───────────────────────────────────────────────────────────────────────── */
(function (global) {
  "use strict";

  var KEY = "pixel_gallery_v1";
  var MAX_ITEMS = 40;          // stub-only cap so we never blow localStorage
  var THUMB_SIZE = 520;        // stub-only downscale for stored thumbnails

  /* ── backend selection ────────────────────────────────────────────────
     If an API base is configured, the browser talks ONLY to the Worker and
     is storage-independent. If not, it falls back to the local stub so dev
     works with zero infra. Configure via:
       window.PIXEL_GALLERY_API_BASE = "https://pixel-gallery.<acct>.workers.dev"
       or <meta name="pixel-gallery-api" content="…">
       or PixelGallery.configure({ apiBase }) */
  var API_BASE = null;
  (function () {
    if (typeof window !== "undefined" && window.PIXEL_GALLERY_API_BASE) {
      API_BASE = String(window.PIXEL_GALLERY_API_BASE);
    } else if (typeof document !== "undefined" && document.querySelector) {
      var meta = document.querySelector('meta[name="pixel-gallery-api"]');
      if (meta && meta.content) API_BASE = meta.content;
    }
    if (API_BASE) API_BASE = API_BASE.replace(/\/+$/, "");
  })();
  function configure(opts) {
    if (opts && opts.apiBase != null) API_BASE = String(opts.apiBase).replace(/\/+$/, "");
  }
  function usingWorker() { return !!API_BASE; }

  /* ── patch <-> URL (base64url of JSON) ───────────────────────────────── */
  function encodePatch(obj) {
    var json = JSON.stringify(obj);
    return btoa(unescape(encodeURIComponent(json)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }
  function decodePatch(str) {
    if (!str) return null;
    str = str.replace(/-/g, "+").replace(/_/g, "/");
    try { return JSON.parse(decodeURIComponent(escape(atob(str)))); }
    catch (e) { return null; }
  }

  /* ── stub storage helpers ────────────────────────────────────────────── */
  function readAll() {
    try { return JSON.parse(localStorage.getItem(KEY)) || []; }
    catch (e) { return []; }
  }
  function writeAll(arr) {
    try { localStorage.setItem(KEY, JSON.stringify(arr)); return true; }
    catch (e) {
      // storage full — drop oldest half and retry once
      arr = arr.slice(0, Math.max(1, Math.floor(arr.length / 2)));
      try { localStorage.setItem(KEY, JSON.stringify(arr)); return true; }
      catch (e2) { return false; }
    }
  }

  function makeThumb(dataURL, size) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        var s = Math.min(1, size / Math.max(img.width, img.height));
        var c = document.createElement("canvas");
        c.width = Math.max(1, Math.round(img.width * s));
        c.height = Math.max(1, Math.round(img.height * s));
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        try { resolve(c.toDataURL("image/jpeg", 0.85)); }
        catch (e) { resolve(dataURL); }
      };
      img.onerror = function () { resolve(dataURL); };
      img.src = dataURL;
    });
  }

  /* ── local STUB backend (no infra) ────────────────────────────────────
     Browser-local only. Used when no API base is configured. */
  function stubPublish(payload) {
    // payload: { pngDataURL, patch, lab, labUrl, title, parentId }
    return makeThumb(payload.pngDataURL, THUMB_SIZE).then(function (thumb) {
      var id = "stub-" + Date.now().toString(36) + "-" +
               Math.random().toString(36).slice(2, 7);
      var item = {
        id: id,
        lab: payload.lab || "Lab",
        labId: payload.labId || null,          // stable Lab id (for filtering / featured lab)
        labUrl: payload.labUrl || "/",
        title: payload.title || payload.lab || "Untitled",
        patch: payload.patch || null,          // serialized captureState() output
        parentId: payload.parentId || null,    // remix lineage
        featured: false,                       // discovery flag (curation comes later)
        thumb: thumb,
        ts: Date.now(),
        backend: "stub"
      };
      var all = readAll();
      all.unshift(item);
      if (all.length > MAX_ITEMS) all = all.slice(0, MAX_ITEMS);
      writeAll(all);
      return {
        id: id,
        url: location.origin + "/gallery.html?item=" + encodeURIComponent(id),
        item: item
      };
    });
  }

  function stubList() { return Promise.resolve(readAll()); }
  function stubGet(id) {
    var found = readAll().filter(function (x) { return x.id === id; })[0] || null;
    return Promise.resolve(found);
  }

  /* ── WORKER backend (platform API) ────────────────────────────────────
     The browser never touches storage — it only speaks /api/v1 to the Worker. */
  function workerPublish(payload) {
    return fetch(API_BASE + "/api/v1/publish", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        png: payload.pngDataURL,
        patch: payload.patch,
        lab: payload.lab,
        labId: payload.labId,
        labUrl: payload.labUrl,
        title: payload.title,
        parentId: payload.parentId,
      }),
    }).then(function (r) {
      return r.json().then(function (d) {
        if (!r.ok) throw new Error(d && d.error ? d.error : "HTTP " + r.status);
        return {
          id: d.id,
          url: location.origin + "/gallery.html?item=" + encodeURIComponent(d.id),
          item: d.item,
        };
      });
    });
  }
  function workerList() {
    return fetch(API_BASE + "/api/v1/gallery")
      .then(function (r) { return r.json(); })
      .then(function (d) { return (d && d.items) || []; });
  }
  function workerGet(id) {
    return fetch(API_BASE + "/api/v1/artwork/" + encodeURIComponent(id))
      .then(function (r) { return r.ok ? r.json().then(function (d) { return d.item; }) : null; })
      .catch(function () { return null; });
  }

  /* ── dispatchers (frontend calls only these) ──────────────────────────── */
  function publish(payload) { return usingWorker() ? workerPublish(payload) : stubPublish(payload); }
  function list() { return usingWorker() ? workerList() : stubList(); }
  function get(id) { return usingWorker() ? workerGet(id) : stubGet(id); }

  /* ── permalink to REMIX a patch back in its Lab ──────────────────────
     Carries `from=<id>` so the next Publish records this piece as its parent
     (remix lineage). ── */
  function labLink(item) {
    if (!item || !item.labUrl) return "#";
    if (!item.patch) return item.labUrl;
    return item.labUrl + "?patch=" + encodePatch(item.patch) +
           "&from=" + encodeURIComponent(item.id);
  }

  /* ── count remixes of a given item within a list ─────────────────────── */
  function remixCount(id, items) {
    return (items || []).filter(function (x) { return x.parentId === id; }).length;
  }

  /* ── PixelLab interface ───────────────────────────────────────────────
     Every Lab registers once and becomes an interchangeable client of the
     same gallery infrastructure. A Lab implements three hooks:

       captureState()      -> a serializable object describing the creation
       restoreState(state) -> apply such an object back to the Lab
       renderThumbnail()   -> a PNG data URL of the current frame

     `publish()` is provided BY the platform (not each Lab). registerLab wires
     the Publish button to it, handles remix lineage (?from=) and rehydration
     from a shared/remix permalink (?patch=). ── */
  var _labs = {};

  function registerLab(spec) {
    if (!spec || !spec.id) return;
    _labs[spec.id] = spec;

    var qs = new URLSearchParams(location.search);
    var parentId = qs.get("from") || null;

    // wire Publish
    var btn = spec.publishButtonId && document.getElementById(spec.publishButtonId);
    if (btn) {
      btn.addEventListener("click", function () {
        if (btn.disabled) return;
        var original = btn.textContent;
        btn.disabled = true;
        btn.textContent = "… publishing";
        Promise.resolve()
          .then(function () {
            return publish({
              pngDataURL: spec.renderThumbnail(),
              patch: spec.captureState ? spec.captureState() : null,
              lab: spec.name,
              labId: spec.id,
              labUrl: spec.labUrl,
              title: spec.title,
              parentId: parentId
            });
          })
          .then(function (res) { toast(res); })
          .catch(function (err) {
            console.error("[gallery] publish failed", err);
            alert("Publish failed: " + (err && err.message ? err.message : err));
          })
          .then(function () {
            btn.disabled = false;
            btn.textContent = original;
          });
      });
    }

    // rehydrate / remix from a permalink
    var pq = qs.get("patch");
    if (pq && spec.restoreState) {
      var state = decodePatch(pq);
      if (state != null) {
        try { spec.restoreState(state); }
        catch (e) { console.warn("[gallery] restoreState failed", e); }
      }
    }
  }

  function getLab(id) { return _labs[id] || null; }

  /* ── minimal confirmation toast with permalink ───────────────────────── */
  function toast(res) {
    var old = document.getElementById("pxg-toast");
    if (old) old.parentNode.removeChild(old);

    var wrap = document.createElement("div");
    wrap.id = "pxg-toast";
    wrap.style.cssText =
      "position:fixed;right:16px;bottom:16px;z-index:99999;max-width:320px;" +
      "background:rgba(14,18,28,.96);border:1px solid #1d2740;border-radius:12px;" +
      "padding:14px 16px;color:#e8eef6;font-family:system-ui,-apple-system,sans-serif;" +
      "box-shadow:0 12px 40px rgba(0,0,0,.5);backdrop-filter:blur(8px)";
    wrap.innerHTML =
      '<div style="font-size:13px;font-weight:600;color:#00c4ff;margin-bottom:6px">Published to Gallery ✓</div>' +
      '<div style="font-size:12px;color:#9fb0c4;margin-bottom:10px;line-height:1.4">' +
      'Permanent, shareable page created.</div>' +
      '<div style="display:flex;gap:8px">' +
      '<a id="pxg-view" href="' + res.url + '" style="flex:1;text-align:center;' +
      'background:#00c4ff;color:#04121b;text-decoration:none;font-size:12px;font-weight:600;' +
      'padding:7px 10px;border-radius:8px">View ↗</a>' +
      '<button id="pxg-copy" style="flex:1;background:transparent;color:#cfe0f0;' +
      'border:1px solid #2a3a58;font-size:12px;padding:7px 10px;border-radius:8px;cursor:pointer">Copy link</button>' +
      '<button id="pxg-x" style="background:transparent;color:#6d7d92;border:none;' +
      'font-size:16px;padding:0 4px;cursor:pointer">×</button>' +
      '</div>';
    document.body.appendChild(wrap);

    var copyBtn = wrap.querySelector("#pxg-copy");
    copyBtn.addEventListener("click", function () {
      try {
        navigator.clipboard.writeText(res.url);
        copyBtn.textContent = "Copied ✓";
      } catch (e) { copyBtn.textContent = "Copy failed"; }
    });
    wrap.querySelector("#pxg-x").addEventListener("click", function () {
      wrap.parentNode && wrap.parentNode.removeChild(wrap);
    });
    setTimeout(function () {
      if (wrap.parentNode) wrap.style.transition = "opacity .4s";
    }, 50);
  }

  global.PixelGallery = {
    configure: configure,
    encodePatch: encodePatch,
    decodePatch: decodePatch,
    publish: publish,
    list: list,
    get: get,
    labLink: labLink,
    remixCount: remixCount,
    registerLab: registerLab,
    getLab: getLab
  };
})(window);
