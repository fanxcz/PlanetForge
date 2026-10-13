# PlanetForge

**PlanetForge** is a browser-based procedural planet lab. Build a world from a seed, tune the oceans and climate, inspect map layers, and export your creation — no account, server, npm install, or build step required.

**Live site:** https://fanxcz.github.io/PlanetForge/  
**Repository:** https://github.com/fanxcz/PlanetForge

## Features

- **Procedural spherical worlds** generated from a deterministic seed using 3D value noise and fractal layers.
- **Interactive globe** with rotation, drag-to-turn, zoom, surface lighting, and coordinate readout.
- **Six cartography layers:** biome, elevation, temperature, moisture, procedural river networks, and political territories.
- **Six starting presets:** temperate, archipelago, desert, ice, alien, and volcanic.
- **World controls:** sea level, continental mass, relief, global temperature, and humidity.
- **Surface statistics:** land/water ratio, estimated mean temperature, biome distribution, river-channel cells, settlement count, and generated planetary properties.
- **Procedural hydrology:** downhill-flow accumulation draws river channels across the generated terrain.
- **Civilization generator:** settlements favor habitable land near rivers and coasts; capitals define spherical territories, and trade routes connect towns within a state.
- **Optional overlays:** toggle rivers, cities, trade routes, and national boundaries independently; regenerate civilizations without rebuilding the planet.
- **Export:** rendered PNG map, portable JSON project, and CSV biome statistics.
- **Import and local archive:** save and load projects in the browser's local storage.
- **Responsive layout** for desktop, tablet, and mobile screens.
- **Privacy-first:** world generation happens in the browser. Saved worlds are not sent to a server.

## Run locally

No build system is needed. Clone or download the repository and open `index.html` in a modern browser. For a local HTTP server, use any static server, for example:

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
│   ├── js/app.js
│   └── favicon.svg
├── .github/workflows/pages.yml
├── .nojekyll
└── README.md
```

## Technical notes

- Plain HTML, CSS, JavaScript, and Canvas 2D — no runtime framework.
- A deterministic integer hash and smooth trilinear noise create large-scale landforms and finer detail.
- Latitude, elevation, temperature, and a procedural moisture field feed into the biome classifier.
- The globe uses an equirectangular texture, spherical projection, directional lighting, ocean highlights, and front-hemisphere settlement/route overlays.
- River drainage is a procedural downhill-flow approximation on the sampled height field; political boundaries use nearest-capital regions on a sphere. These are world-building systems, not validated hydrology or political-science models.
- Seed-based world generation is deterministic for a given version and set of settings. Future generator changes may intentionally change the resulting surface.
- Climate and physical values are **procedural estimates for fictional worlds**, not a validated climate or planetary-science simulation.

## Controls

- Drag the 3D globe to rotate it. Use the zoom buttons or mouse wheel to zoom.
- Switch to **Карта мира** to inspect the equirectangular map.
- Use **Слой карты** to change the displayed data, including river drainage and political territories.
- Toggle rivers, settlements, trade routes, and state borders in the left panel. **Пересоздать цивилизации** changes the civilization layout without changing terrain.
- Choose a preset or tune controls; the surface regenerates automatically.
- **Экспорт** opens PNG, JSON, and CSV export options.
- **Импорт** loads a previously exported JSON project.

## License

The project is released under the MIT License. See [LICENSE](LICENSE).
