#!/usr/bin/env bun
/**
 * styles.mjs — validate SOS·DJ's STYLES table without opening a browser.
 *
 * The style presets are hand-written data: step patterns, per-lane scale degrees,
 * engine indices and odd-metre groupings. A 14-step pattern in an 18-step style,
 * a note on a step that is off, or a degree past the end of the scale are all
 * silent failures in the page. This catches them.
 *
 *   bun scripts/synthi-probe/styles.mjs [--file <sos-dj.html>]
 */
import { readFileSync } from "fs";
import { resolve, dirname } from "path";

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), "../..");
const args = process.argv.slice(2);
const f = args.indexOf("--file") >= 0 ? args[args.indexOf("--file") + 1] : `${ROOT}/synthi/sos-dj.html`;
const src = readFileSync(f, "utf8");

const cut = (from, to) => src.slice(src.indexOf(from), src.indexOf(to));
const { SCALES, STYLES, ENG } = new Function(
  cut("const SCALES={", "/* maqams the ARABIC") +
  cut("const _H=(...a)", "function baseMix()") +
  cut("const ENGINES={", "const ENG_ORDER=").replace("const ENGINES=", "const ENG=") +
  "return {SCALES,STYLES,ENG};")();

const VOICES = ["KCK", "BAS", "STB", "HAT", "CLP"];
const bad = [];
for (const S of STYLES) {
  const n = S.steps || 16;
  for (const v of VOICES) {
    const p = S.pat[v];
    if (!p) { bad.push(`${S.name}: no pattern for ${v}`); continue; }
    if (p.length !== n) bad.push(`${S.name}: ${v} pattern is ${p.length} steps, style declares ${n}`);
    const ei = S.eng && S.eng[v];
    if (ei != null && !ENG[v][ei]) bad.push(`${S.name}: ${v} engine ${ei} has no name`);
  }
  if (S.group) {
    const sum = S.group.reduce((a, b) => a + b, 0);
    if (sum !== n) bad.push(`${S.name}: beat groups sum to ${sum}, style declares ${n} steps`);
  }
  if (S.scale && !SCALES[S.scale]) bad.push(`${S.name}: unknown scale "${S.scale}"`);
  const sc = S.maqam ? SCALES.bayati : (SCALES[S.scale] || SCALES.minor);
  for (const lane of ["BAS", "STB"]) {
    const nt = S.notes && S.notes[lane];
    if (!nt) continue;
    if (nt.length !== n) bad.push(`${S.name}: ${lane} notes are ${nt.length} long, style declares ${n}`);
    nt.forEach((deg, i) => {
      if (deg < 0 || deg >= sc.length) bad.push(`${S.name}: ${lane}[${i}] degree ${deg} outside the scale (0..${sc.length - 1})`);
      if (deg && !S.pat[lane][i]) bad.push(`${S.name}: ${lane}[${i}] carries note ${deg} but the step is off`);
    });
  }
}
console.log(`${STYLES.length} styles · ${Object.keys(SCALES).length} scales · STAB engines: ${ENG.STB.length}`);
console.log(STYLES.map(s => s.name).join(", "));
console.log();
console.log(bad.length ? "PROBLEMS:\n" + bad.map(b => "  " + b).join("\n") : "all styles valid");
process.exit(bad.length ? 1 : 0);
