# PlanetForge

**PlanetForge** is a browser-based procedural planet lab. Build a world from a seed, tune the oceans and climate, inspect map layers, and export your creation — no account, server, npm install, or build step required.

**Live site:** https://fanxcz.github.io/PlanetForge/  
**Repository:** https://github.com/fanxcz/PlanetForge

## Features

- **Procedural spherical worlds** generated from a deterministic seed using 3D value noise and fractal layers.
- **Interactive globe** with rotation, drag-to-turn, zoom, surface lighting, and coordinate readout.
- **Eight cartography layers:** biomes, elevation, grayscale heightmap, tectonic plate boundaries, temperature, moisture, hydrology, and political territories.
- **WebGL globe renderer** with Canvas 2D fallback, lighting, ocean highlights, procedural clouds, and atmospheric rim lighting.
- **Off-main-thread terrain generation** via Web Worker; stale slider generations are cancelled, and the deterministic main-thread generator remains as a fallback.
- **Procedural geology:** seeded plate boundaries, adjustable tectonic activity, and terrain relaxation.
- **Terrain sculpting:** map-based raise, lower, smooth, plateau, crater, land and water brushes. Sparse elevation overrides persist in project JSON/autosave/share links and feed back into climate and biome generation.
- **Season control and terrain-aware moisture** change climate and biome distribution.
- **Priority-flood drainage** to route rivers through closed depressions, visualize basin-fill lakes, and mark high-flow river deltas at shorelines.
- **City editing:** double-click land to add settlements or double-click an existing city to rename it; type `DELETE` to remove a user-created settlement.
- **Manual political borders:** turn on the border brush in map view, select a country, and paint land cells. Painted cells persist in project JSON, share links, auto-save, and undo/redo history.
- **Undo/redo**, toolbar controls, Ctrl/Cmd+Z and Ctrl/Cmd+Y.
- **Share links** that encode project settings and custom settlements in the URL hash, without server storage.
- **Curated world gallery:** twelve named example planets with fixed seeds and category filters/search; examples can be opened, edited, saved, and shared entirely offline.
- **Local versioned library:** search saved worlds by name/seed and keep numbered snapshots for the same planet in the browser archive.
- **Game asset export:** grayscale heightmap preview, 2K/4K individual layers, or a full ZIP pack with eight thematic PNG layers, 16-bit big-endian RAW elevation, tangent-space normal map, biome-ID and land/water masks, manifest metadata, project JSON, and CSV statistics/geography. Pack rendering runs in a Worker and reuses one field generation for all layers.
- **Six starting presets:** temperate, archipelago, desert, ice, alien, and volcanic.
- **World controls:** sea level, continental mass, relief, global temperature, and humidity.
- **Surface statistics:** land/water ratio, estimated mean temperature, biome distribution, river-channel cells, lake basins, delta cells, settlement count, and generated planetary properties.
- **Procedural hydrology:** downhill-flow accumulation draws river channels across the generated terrain.
- **Civilization generator:** settlements favor habitable land near rivers and coasts; capitals define spherical territories, and trade routes connect towns within a state.
- **Optional overlays:** toggle rivers, lakes, deltas, cities, trade routes, and national boundaries independently; regenerate civilizations without rebuilding the planet.
- **Local auto-save and compare:** the latest draft is restored on the next visit; compare the active world with a saved world or curated gallery entry on the same 128 × 64 preview grid.
- **Export:** native-resolution PNG, portable JSON project, CSV biome statistics/geography, and a game-ready ZIP with RAW16 height data, normal map, masks, and import metadata.
- **Import and local archive:** save and load projects in the browser's local storage.
- **Responsive layout** for desktop, tablet, and mobile screens.
- **Privacy-first:** world generation happens in the browser. Saved worlds and auto-saves are not sent to a server. The gallery is a curated offline set, not a crowdsourced public gallery. The local archive keeps up to 30 numbered snapshots and supports search.

## Run locally

No build system or npm dependencies are needed. Use a local HTTP server rather than opening `index.html` directly as a `file://` URL, because browsers restrict Web Workers on local files. For example:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

## Publish with GitHub Pages

The repository includes a GitHub Actions workflow at `.github/workflows/pages.yml` that publishes the static project whenever code is pushed to `main`.

1. Open [**Settings → Pages**](https://github.com/fanxcz/PlanetForge/settings/pages).
2. Under **Build and deployment → Source**, select **GitHub Actions** and save the setting.
3. Open **Actions** and check the **Deploy PlanetForge to GitHub Pages** workflow.

**Important:** GitHub currently does not allow this workflow token to create the Pages site on its own. Enable Pages once in Settings first; otherwise the workflow stops at “Configure GitHub Pages” with a “Not Found” error. Once Pages is enabled, every push to `main` runs the syntax checks, smoke tests, and deployment automatically.

After a successful deployment, the site should be available at https://fanxcz.github.io/PlanetForge/.

## Project structure

```text
PlanetForge/
├── index.html
├── assets/
│   ├── css/style.css
│   ├── favicon.svg
│   └── js/
│       ├── app.js
│       ├── generator.js
│       ├── globe3d.js
│       ├── history.js
│       ├── share.js
│       ├── planet-worker.js
│       └── export-worker.js
├── scripts/smoke-test.mjs
├── .github/workflows/pages.yml
├── .nojekyll
├── LICENSE
└── README.md
```

## Technical notes

- The editor uses local system fonts and a muted, flat cartographic palette instead of downloading fonts from a third-party CDN. Political borders use a smoothed vector overlay on the world map and a softened contrast treatment on the globe texture.

- Plain HTML, CSS, and JavaScript. Terrain fields are generated in a Web Worker when supported, with a deterministic synchronous fallback. The map uses Canvas 2D; the globe uses a custom WebGL 1 renderer with automatic Canvas fallback. No framework or build step is required.
- A deterministic integer hash and smooth trilinear noise create landforms; seeded spherical plate regions influence boundary elevation.
- Latitude, elevation, orbital season, temperature, terrain-aware moisture, coastal moderation, and stylized prevailing-wind/rain-shadow effects feed into the biome classifier.
- The globe uses an equirectangular texture, spherical projection, directional lighting, ocean highlights, and front-hemisphere settlement/route overlays.
- River drainage uses a priority-flood approximation. Political territories start from spherical capital regions, then receive a deterministic low-frequency spherical warp to avoid diagram-like arcs; the equirectangular map draws shared boundaries as smoothed vector paths. Climate, tectonics, terrain relaxation, and drainage remain stylized procedural models, not validated scientific simulations.
- Seed-based world generation is deterministic for a given version and set of settings. Future generator changes may intentionally change the resulting surface.
- Climate and physical values are **procedural estimates for fictional worlds**, not a validated climate or planetary-science simulation.

## Controls

- Drag the 3D globe to rotate it. Its surface mesh is displaced from generated height values; clouds and atmosphere are rendered separately. Use the zoom buttons or mouse wheel to zoom.
- Switch to **Карта мира** to inspect the equirectangular map.
- Use **Слой карты** to change the displayed data, including grayscale heightmaps, tectonic plate boundaries, river drainage, and political territories.
- Toggle rivers, lakes, deltas, settlements, trade routes, and state borders in the left panel. To paint state borders, switch to **Карта мира**, enable **Рисовать границы государств**, then choose a country and drag across land. **Пересоздать цивилизации** changes the civilization layout without changing terrain.
- Choose a preset or tune controls; the surface regenerates automatically.
- **Экспорт** offers PNG, heightmap, JSON, CSV, and a full ZIP resource pack. The ZIP contains eight map layers plus the project and geography data. Select Heightmap or Tectonics under **Слой карты** before exporting an individual 2K/4K map.
- **Импорт** loads a previously exported JSON project.

## License

The project is released under the MIT License. See [LICENSE](LICENSE).


The resource pack is a self-contained ZIP archive generated without external packages. It contains eight PNG map layers, project JSON, biome statistics, and city/trade-route geography.


## Automated tests

Run deterministic generator and static integration checks with `npm run test:smoke`. Run browser end-to-end tests with `npm install`, `npx playwright install chromium`, and `npm run test:e2e`. CI installs Chromium and verifies view switching, terrain brush persistence with Undo/Redo, gallery filters, local snapshots, and ZIP resource exports.
