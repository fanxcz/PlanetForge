import { readFileSync, existsSync } from "node:fs";
import assert from "node:assert/strict";

const html = readFileSync("index.html", "utf8");
const js = readFileSync("assets/js/app.js", "utf8");
const css = readFileSync("assets/css/style.css", "utf8");
const ids = [...html.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]);
const idSet = new Set(ids);
assert.equal(ids.length, idSet.size, "HTML must not contain duplicate ids");

const jsIds = [...js.matchAll(/\$\(["']([^"']+)["']\)/g)].map((match) => match[1]);
const missingIds = [...new Set(jsIds)].filter((id) => !idSet.has(id));
assert.deepEqual(missingIds, [], "JavaScript references missing HTML ids: " + missingIds.join(", "));

for (const path of ["assets/css/style.css", "assets/js/app.js", "assets/favicon.svg", ".nojekyll"]) {
  assert.ok(existsSync(path), "Missing static asset: " + path);
}
for (const feature of ["generateRivers", "generateCivilization", "drawCivilizationGlobe", "drawCivilizationMap", "exportPNG", "exportJSON", "restoreProject"]) {
  assert.ok(js.includes("function " + feature + "("), "Missing feature: " + feature);
}
for (const id of ["showRivers", "showCities", "showRoutes", "showBorders", "regenerateCivBtn", "cityCountStat", "countryCountStat", "riverCountStat"]) {
  assert.ok(idSet.has(id), "Missing civilization UI id: " + id);
}
assert.ok(html.includes('value="hydrology"') && html.includes('value="political"'), "Missing map layers");
assert.ok(css.includes(".layer-toggles"), "Missing layer control styles");
console.log("PlanetForge smoke tests passed: HTML ids, assets, map layers, and procedural systems.");
