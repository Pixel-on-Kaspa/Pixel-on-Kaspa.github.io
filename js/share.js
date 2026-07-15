/* ─────────────────────────────────────────────────────────────
   PixelShare — one-click "share your creation" to X.
   Used by the art-lab generators (pixel-p5, yohei-glsl, sykora-lab, …).

   Strategy:
   • Mobile / devices whose share sheet accepts files → navigator.share()
     with the actual PNG attached (one tap, image included).
   • Desktop → download the PNG + open the X tweet composer (web intent)
     pre-filled with text, link and hashtags. X's intent URL cannot
     auto-attach an image, so we hand the user the file to drag in.
   ───────────────────────────────────────────────────────────── */
(function () {
  "use strict";

  var X_INTENT = "https://twitter.com/intent/tweet";

  function isMobileShareCapable() {
    if (!navigator.canShare || !navigator.share) return false;
    var coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    var mobileUA = /Mobi|Android|iPhone|iPad|iPod/i.test(navigator.userAgent || "");
    return coarse || mobileUA;
  }

  function dataURLtoBlob(dataURL) {
    var parts = dataURL.split(",");
    var mime = (parts[0].match(/:(.*?);/) || [])[1] || "image/png";
    var bin = atob(parts[1]);
    var u8 = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new Blob([u8], { type: mime });
  }

  function intentURL(o) {
    var p = new URLSearchParams();
    if (o.text) p.set("text", o.text);
    if (o.url) p.set("url", o.url);
    if (o.hashtags && o.hashtags.length) p.set("hashtags", o.hashtags.join(","));
    return X_INTENT + "?" + p.toString();
  }

  function toast(msg) {
    var t = document.createElement("div");
    t.textContent = msg;
    t.style.cssText =
      "position:fixed;left:50%;bottom:26px;transform:translateX(-50%);" +
      "z-index:99999;background:#0a1414;color:#49EACB;border:1px solid rgba(73,234,203,.35);" +
      "padding:11px 18px;border-radius:10px;font:600 13px/1.3 system-ui,-apple-system,sans-serif;" +
      "letter-spacing:.02em;box-shadow:0 12px 40px rgba(0,0,0,.6);max-width:88vw;text-align:center;";
    document.body.appendChild(t);
    setTimeout(function () {
      t.style.transition = "opacity .4s";
      t.style.opacity = "0";
      setTimeout(function () { t.remove(); }, 420);
    }, 3200);
  }

  function extFor(mime) {
    if (!mime) return "png";
    if (mime.indexOf("mp4") >= 0) return "mp4";
    if (mime.indexOf("webm") >= 0) return "webm";
    if (mime.indexOf("png") >= 0) return "png";
    if (mime.indexOf("jpeg") >= 0 || mime.indexOf("jpg") >= 0) return "jpg";
    return "bin";
  }

  // Resolve the payload to a File from whichever input the caller gave us:
  // an already-built File/Blob (e.g. a recorded video) or a PNG data-URL getter.
  function toShareFile(opts) {
    var base = (opts.filenamePrefix || "pixel-on-kaspa") + "-" + Date.now();
    if (opts.file) return opts.file;
    if (opts.blob) {
      return new File([opts.blob], base + "." + extFor(opts.blob.type),
        { type: opts.blob.type || "application/octet-stream" });
    }
    if (opts.getDataURL) {
      var d = null;
      try { d = opts.getDataURL(); } catch (e) { /* ignore */ }
      if (d) return new File([dataURLtoBlob(d)], base + ".png", { type: "image/png" });
    }
    return null;
  }

  /* share({ getDataURL | blob | file, text, url, hashtags, filenamePrefix }) */
  async function share(opts) {
    var file = toShareFile(opts);
    var isVideo = file && /video\//.test(file.type);

    // 1) Mobile share sheet with the actual file (image or clip) attached.
    if (file && isMobileShareCapable()) {
      try {
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({
            files: [file],
            text: opts.text + (opts.url ? "\n" + opts.url : "")
          });
          return;
        }
      } catch (e) {
        if (e && e.name === "AbortError") return; // user cancelled
      }
    }

    // 2) Desktop: save the file, then open the X composer to attach it.
    //    (X's web intent cannot auto-attach media, so we hand over the file.)
    if (file) {
      var url = URL.createObjectURL(file);
      var a = document.createElement("a");
      a.href = url;
      a.download = file.name;
      document.body.appendChild(a);
      a.click();
      setTimeout(function () { a.remove(); URL.revokeObjectURL(url); }, 3000);
      toast(isVideo ? "Clip saved — attach it in the X post"
                    : "Image saved to your device — drag it into the X post");
    }
    window.open(intentURL(opts), "_blank", "noopener");
  }

  /* mount({ buttonId, getDataURL, text, url, hashtags, filenamePrefix }) */
  function mount(opts) {
    var btn = document.getElementById(opts.buttonId);
    if (!btn) return;
    btn.addEventListener("click", function () {
      share(opts);
    });
  }

  window.PixelShare = { share: share, mount: mount, intentURL: intentURL };
})();
