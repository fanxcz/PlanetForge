(() => {
  "use strict";

  const MAP_W = 512;
  const MAP_H = 256;
  const TAU = Math.PI * 2;
  const STORAGE_KEY = "planetforge.savedWorlds.v1";
  const BIOMES = [
    { name: "Глубокий океан", color: [16, 48, 82] },
    { name: "Мелководье", color: [31, 105, 137] },
    { name: "Ледяной океан", color: [74, 133, 158] },
    { name: "Ледяной покров", color: [213, 237, 239] },
    { name: "Тундра", color: [142, 166, 151] },
    { name: "Горы", color: [144, 151, 147] },
    { name: "Пустыня", color: [194, 151, 83] },
    { name: "Саванна", color: [161, 170, 91] },
    { name: "Степь и луга", color: [105, 157, 91] },
    { name: "Лес", color: [49, 119, 78] },
    { name: "Тропический лес", color: [27, 91, 71] },
    { name: "Тайга", color: [58, 111, 105] }
  ];
  const PRESETS = {
    temperate: { seaLevel: 50, landmass: 0, relief: 5, temperature: 0, humidity: 50 },
    archipelago: { seaLevel: 55, landmass: -3, relief: 3, temperature: 6, humidity: 61 },
    desert: { seaLevel: 48, landmass: 2, relief: 5, temperature: 24, humidity: 12 },
    ice: { seaLevel: 52, landmass: -1, relief: 5, temperature: -29, humidity: 63 },
    alien: { seaLevel: 46, landmass: 8, relief: 8, temperature: 12, humidity: 83 },
    volcanic: { seaLevel: 50, landmass: 3, relief: 10, temperature: 9, humidity: 30 }
  };
  const DEFAULTS = { name: "Aurelia", seed: 840271, ...PRESETS.temperate, preset: "temperate" };
  const $ = (id) => document.getElementById(id);
  const canvas = $("planetCanvas");
  const mapCanvas = $("mapCanvas");
  const planetStage = $("planetStage");
  const ctx = canvas.getContext("2d", { alpha: true });
  const mapCtx = mapCanvas.getContext("2d", { alpha: false });
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = MAP_W;
  textureCanvas.height = MAP_H;
  const textureCtx = textureCanvas.getContext("2d", { alpha: false });
  const textureImage = textureCtx.createImageData(MAP_W, MAP_H);
  let texturePixels = textureImage.data;
  let globeBuffer = null;
  let globeBufferSize = 0;
  let mapData = null;
  let resizeObserver = null;
  let regenTimer = 0;
  let animationId = 0;
  let lastFrame = 0;
  let toastTimer = 0;
  let pointerState = null;
  let dragMoved = false;
  let exportMenu = null;
  let activeData = null;
  let stats = null;

  const state = {
    ...DEFAULTS,
    view: "globe",
    layer: "biome",
    rotation: 0,
    zoom: 1,
    rotating: true,
    isGenerating: false
  };

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(t) { return t * t * (3 - 2 * t); }
  function hash3(x, y, z, seed) {
    let h = Math.imul(x | 0, 374761393) + Math.imul(y | 0, 668265263) + Math.imul(z | 0, 2147483647) + Math.imul(seed | 0, 1274126177);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
  }
  function noise3(x, y, z, seed) {
    const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
    const fx = smooth(x - ix), fy = smooth(y - iy), fz = smooth(z - iz);
    const a = lerp(hash3(ix, iy, iz, seed), hash3(ix + 1, iy, iz, seed), fx);
    const b = lerp(hash3(ix, iy + 1, iz, seed), hash3(ix + 1, iy + 1, iz, seed), fx);
    const c = lerp(hash3(ix, iy, iz + 1, seed), hash3(ix + 1, iy, iz + 1, seed), fx);
    const d = lerp(hash3(ix, iy + 1, iz + 1, seed), hash3(ix + 1, iy + 1, iz + 1, seed), fx);
    return lerp(lerp(a, b, fy), lerp(c, d, fy), fz);
  }
  function fbm3(x, y, z, frequency, octaves, seed) {
    let amp = 0.5, total = 0, weight = 0;
    for (let i = 0; i < octaves; i++) {
      total += noise3(x * frequency, y * frequency, z * frequency, seed + i * 1013) * amp;
      weight += amp;
      frequency *= 2;
      amp *= 0.5;
    }
    return total / weight;
  }
  function seededRandom(seed) {
    let x = seed >>> 0;
    return () => {
      x += 0x6D2B79F5;
      let t = x;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function hueColor(t, stops) {
    t = clamp(t, 0, 1);
    for (let i = 1; i < stops.length; i++) {
      if (t <= stops[i][0]) {
        const a = stops[i - 1], b = stops[i];
        const q = (t - a[0]) / Math.max(0.00001, b[0] - a[0]);
        return [Math.round(lerp(a[1][0], b[1][0], q)), Math.round(lerp(a[1][1], b[1][1], q)), Math.round(lerp(a[1][2], b[1][2], q))];
      }
    }
    return stops[stops.length - 1][1].slice();
  }
  const HEIGHT_STOPS = [[0,[8,25,51]],[.30,[17,55,88]],[.48,[40,117,137]],[.50,[52,117,108]],[.56,[88,142,90]],[.64,[143,157,91]],[.73,[166,129,88]],[.84,[137,105,92]],[.94,[178,184,177]],[1,[246,250,247]]];
  const TEMP_STOPS = [[0,[31,64,125]],[.2,[62,133,175]],[.36,[121,189,183]],[.5,[179,203,143]],[.64,[228,196,105]],[.8,[217,125,77]],[1,[151,55,62]]];
  const MOIST_STOPS = [[0,[151,105,67]],[.2,[194,155,91]],[.4,[175,184,105]],[.6,[98,165,113]],[.8,[54,146,129]],[1,[46,112,163]]];

  function generatePlanet() {
    const started = performance.now();
    const seed = Number(state.seed) >>> 0;
    const size = MAP_W * MAP_H;
    const height = new Float32Array(size);
    const temperature = new Float32Array(size);
    const moisture = new Float32Array(size);
    const biome = new Uint8Array(size);
    const tempOffset = Number(state.temperature);
    const humidity = Number(state.humidity) / 100;
    const relief = Number(state.relief);
    const threshold = 0.535 + (Number(state.seaLevel) - 50) * 0.0042 - Number(state.landmass) * 0.0045;
    let landCount = 0, totalTemp = 0;
    const counts = new Uint32Array(BIOMES.length);
    for (let y = 0; y < MAP_H; y++) {
      const lat = Math.PI / 2 - ((y + 0.5) / MAP_H) * Math.PI;
      const latSin = Math.sin(lat);
      const latCos = Math.cos(lat);
      const absLat = Math.abs(lat * 180 / Math.PI);
      for (let x = 0; x < MAP_W; x++) {
        const lon = ((x + 0.5) / MAP_W) * TAU - Math.PI;
        const sx = latCos * Math.cos(lon);
        const sy = latSin;
        const sz = latCos * Math.sin(lon);
        const continent = fbm3(sx, sy, sz, 2.25, 3, seed + 11);
        const detail = fbm3(sx, sy, sz, 6.6, 2, seed + 271);
        const fine = noise3(sx * 13.1, sy * 13.1, sz * 13.1, seed + 701);
        const h = continent * 0.68 + detail * 0.24 + fine * 0.08;
        const idx = y * MAP_W + x;
        height[idx] = h;
        const alt = h - threshold;
        const t = 30 - absLat * 0.48 + tempOffset - Math.max(0, alt) * 130;
        const rain = fbm3(sx, sy, sz, 4.7, 2, seed + 1907);
        const wet = clamp(humidity * 0.60 + rain * 0.25 + (1 - Math.abs(latSin)) * 0.15, 0, 1);
        temperature[idx] = t;
        moisture[idx] = wet;
        totalTemp += t;
        let b;
        if (h <= threshold) {
          b = t < -8 ? 2 : (h > threshold - 0.035 ? 1 : 0);
        } else if (t < -16) {
          b = 3;
        } else if (t < -1) {
          b = 4;
        } else if (alt > 0.135 - relief * 0.0085) {
          b = 5;
        } else if (wet < 0.22 && t > 7) {
          b = 6;
        } else if (t < 7 && wet > 0.40) {
          b = 11;
        } else if (wet < 0.38 && t > 16) {
          b = 7;
        } else if (wet > 0.78 && t > 17) {
          b = 10;
        } else if (wet > 0.51 && t > 4) {
          b = 9;
        } else {
          b = 8;
        }
        biome[idx] = b;
        counts[b]++;
        if (h > threshold) landCount++;
      }
    }
    const meanTemp = totalTemp / size;
    const landPercent = landCount / size * 100;
    const rand = seededRandom(seed);
    const radius = Math.round(3400 + rand() * 7300);
    const dayHours = Math.round((10 + rand() * 50) * 10) / 10;
    const tilt = Math.round(rand() * 47 * 10) / 10;
    const moons = Math.floor(rand() * 5);
    let uniqueBiomes = 0;
    for (let i = 0; i < counts.length; i++) if (counts[i] > size * 0.0001) uniqueBiomes++;
    activeData = { width: MAP_W, height: MAP_H, heightField: height, temperature, moisture, biome, threshold, counts, landCount, meanTemp, landPercent, waterPercent: 100 - landPercent, uniqueBiomes, radius, dayHours, tilt, moons, generatedMs: performance.now() - started };
    stats = { ...activeData };
    drawTexture();
    updateStats();
    updateInterface();
    renderCurrentView();
    $("resolutionLabel").textContent = "PROCEDURAL SURFACE · " + MAP_W + " × " + MAP_H;
    $("perfReadout").textContent = "CANVAS ENGINE · " + Math.round(activeData.generatedMs) + " MS";
    $("statusText").textContent = "Мир сформирован · " + state.name;
    $("renderOverlay").classList.add("hidden");
    state.isGenerating = false;
    startAnimation();
  }

  function drawTexture() {
    const { heightField, temperature, moisture, biome, threshold } = activeData;
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const i = y * MAP_W + x;
        const h = heightField[i];
        const hm = heightField[y * MAP_W + Math.max(0, x - 1)];
        const hp = heightField[y * MAP_W + Math.min(MAP_W - 1, x + 1)];
        const vm = heightField[Math.max(0, y - 1) * MAP_W + x];
        const vp = heightField[Math.min(MAP_H - 1, y + 1) * MAP_W + x];
        const slope = clamp(1 + (hm - hp) * 4.8 + (vm - vp) * 3.2, 0.72, 1.24);
        let color;
        if (state.layer === "elevation") {
          const normalized = clamp((h - threshold + 0.18) / 0.46, 0, 1);
          color = hueColor(normalized, HEIGHT_STOPS);
        } else if (state.layer === "temperature") {
          color = hueColor((temperature[i] + 35) / 72, TEMP_STOPS);
        } else if (state.layer === "moisture") {
          color = hueColor(moisture[i], MOIST_STOPS);
        } else {
          color = BIOMES[biome[i]].color.slice();
          const ocean = biome[i] <= 2;
          const hillShade = ocean ? clamp(0.87 + (threshold - h) * 0.9, 0.75, 1.02) : slope;
          color[0] = Math.round(color[0] * hillShade);
          color[1] = Math.round(color[1] * hillShade);
          color[2] = Math.round(color[2] * hillShade);
        }
        const j = i * 4;
        texturePixels[j] = color[0];
        texturePixels[j + 1] = color[1];
        texturePixels[j + 2] = color[2];
        texturePixels[j + 3] = 255;
      }
    }
    textureCtx.putImageData(textureImage, 0, 0);
    mapData = texturePixels;
  }

  function resizeCanvas(el, context) {
    const rect = el.getBoundingClientRect();
    const dpr = Math.min(1.5, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (el.width !== w || el.height !== h) {
      el.width = w;
      el.height = h;
      context.imageSmoothingEnabled = true;
      return true;
    }
    return false;
  }

  function drawGlobe() {
    if (!activeData || state.view !== "globe") return;
    resizeCanvas(canvas, ctx);
    const w = canvas.width, h = canvas.height;
    ctx.clearRect(0, 0, w, h);
    const cx = w * 0.5;
    const cy = h * 0.51;
    const baseRadius = Math.min(w, h) * 0.355;
    const radius = Math.max(35, Math.min(Math.min(w, h) * 0.46, baseRadius * state.zoom));
    const glow = ctx.createRadialGradient(cx, cy, radius * 0.55, cx, cy, radius * 1.25);
    glow.addColorStop(0, "rgba(38,123,142,.13)");
    glow.addColorStop(.72, "rgba(29,94,132,.075)");
    glow.addColorStop(1, "rgba(29,94,132,0)");
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(cx, cy, radius * 1.3, 0, TAU); ctx.fill();
    const halo = ctx.createRadialGradient(cx - radius * .25, cy - radius * .35, radius * .08, cx, cy, radius * 1.08);
    halo.addColorStop(0, "rgba(90,210,225,.15)");
    halo.addColorStop(.82, "rgba(80,166,206,.04)");
    halo.addColorStop(1, "rgba(82,172,219,0)");
    ctx.fillStyle = halo;
    ctx.beginPath(); ctx.arc(cx, cy, radius * 1.08, 0, TAU); ctx.fill();

    const diameter = Math.max(40, Math.ceil(radius * 2));
    if (globeBufferSize !== diameter) {
      globeBufferSize = diameter;
      globeBuffer = document.createElement("canvas");
      globeBuffer.width = globeBuffer.height = diameter;
      globeBuffer.ctx = globeBuffer.getContext("2d", { alpha: true });
      globeBuffer.image = globeBuffer.ctx.createImageData(diameter, diameter);
    }
    const img = globeBuffer.image;
    const data = img.data;
    const r = diameter / 2;
    const lightX = -0.42, lightY = 0.31, lightZ = 0.852;
    const rotation = state.rotation;
    for (let py = 0; py < diameter; py++) {
      const ny = (r - py - 0.5) / r;
      const lat = Math.asin(clamp(ny, -1, 1));
      const v = clamp(Math.floor((0.5 - lat / Math.PI) * MAP_H), 0, MAP_H - 1);
      for (let px = 0; px < diameter; px++) {
        const nx = (px + 0.5 - r) / r;
        const rr = nx * nx + ny * ny;
        const out = (py * diameter + px) * 4;
        if (rr > 1) {
          data[out + 3] = 0;
          continue;
        }
        const nz = Math.sqrt(1 - rr);
        const lon = Math.atan2(nx, nz) + rotation;
        let u = Math.floor(((lon / TAU + 0.5) % 1) * MAP_W);
        if (u < 0) u += MAP_W;
        const src = (v * MAP_W + u) * 4;
        const dot = clamp(nx * lightX + ny * lightY + nz * lightZ, 0, 1);
        const shade = 0.19 + 0.88 * dot;
        let red = mapData[src], green = mapData[src + 1], blue = mapData[src + 2];
        if (activeData.biome[v * MAP_W + u] <= 2) {
          const spec = Math.pow(dot, 20) * 17;
          red += spec * .43; green += spec * .72; blue += spec;
        }
        data[out] = clamp(Math.round(red * shade), 0, 255);
        data[out + 1] = clamp(Math.round(green * shade), 0, 255);
        data[out + 2] = clamp(Math.round(blue * shade), 0, 255);
        data[out + 3] = Math.round(clamp((1 - rr) * 12 + .2, 0, 1) * 255);
      }
    }
    globeBuffer.ctx.putImageData(img, 0, 0);
    ctx.save();
    ctx.shadowColor = "rgba(72,174,213,.26)";
    ctx.shadowBlur = 15 * (window.devicePixelRatio || 1);
    ctx.drawImage(globeBuffer, cx - radius, cy - radius, radius * 2, radius * 2);
    ctx.restore();
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 1, 0, TAU);
    ctx.strokeStyle = "rgba(136,220,236,.42)";
    ctx.lineWidth = Math.max(1, w / 1100);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, radius + 5 * (window.devicePixelRatio || 1), 0, TAU);
    ctx.strokeStyle = "rgba(79,153,192,.13)";
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawMap() {
    if (!activeData || state.view !== "map") return;
    resizeCanvas(mapCanvas, mapCtx);
    const w = mapCanvas.width, h = mapCanvas.height;
    mapCtx.clearRect(0, 0, w, h);
    mapCtx.fillStyle = "#08121e";
    mapCtx.fillRect(0, 0, w, h);
    const ratio = MAP_W / MAP_H;
    const outW = Math.min(w, h * ratio) * state.zoom;
    const outH = outW / ratio;
    mapCtx.imageSmoothingEnabled = true;
    mapCtx.drawImage(textureCanvas, (w - outW) / 2, (h - outH) / 2, outW, outH);
    mapCtx.strokeStyle = "rgba(173,207,220,.12)";
    mapCtx.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
      const x = (w - outW) / 2 + outW * i / 6;
      mapCtx.beginPath(); mapCtx.moveTo(x, (h - outH) / 2); mapCtx.lineTo(x, (h + outH) / 2); mapCtx.stroke();
    }
    for (let i = 1; i < 4; i++) {
      const y = (h - outH) / 2 + outH * i / 4;
      mapCtx.beginPath(); mapCtx.moveTo((w - outW) / 2, y); mapCtx.lineTo((w + outW) / 2, y); mapCtx.stroke();
    }
    mapCtx.strokeStyle = "rgba(173,207,220,.22)";
    mapCtx.strokeRect((w - outW) / 2, (h - outH) / 2, outW, outH);
  }

  function renderCurrentView() {
    if (state.view === "globe") {
      canvas.hidden = false;
      mapCanvas.hidden = true;
      drawGlobe();
    } else {
      canvas.hidden = true;
      mapCanvas.hidden = false;
      drawMap();
    }
  }

  function startAnimation() {
    if (animationId) cancelAnimationFrame(animationId);
    animationId = 0;
    lastFrame = 0;
    if (!state.rotating || state.view !== "globe") return;
    const loop = (ts) => {
      animationId = 0;
      if (!state.rotating || state.view !== "globe") return;
      if (ts - lastFrame >= 55) {
        state.rotation += 0.0032;
        drawGlobe();
        lastFrame = ts;
      }
      animationId = requestAnimationFrame(loop);
    };
    animationId = requestAnimationFrame(loop);
  }

  function updateStats() {
    if (!stats) return;
    $("landStat").innerHTML = stats.landPercent.toFixed(1) + "<span>%</span>";
    $("waterStat").innerHTML = stats.waterPercent.toFixed(1) + "<span>%</span>";
    $("tempStat").innerHTML = stats.meanTemp.toFixed(1) + "<span>°C</span>";
    $("landBar").style.width = stats.landPercent + "%";
    $("waterBar").style.width = stats.waterPercent + "%";
    $("tempBar").style.width = clamp((stats.meanTemp + 30) / 70 * 100, 3, 100) + "%";
    $("biomeStat").textContent = stats.uniqueBiomes;
    $("radiusStat").textContent = stats.radius.toLocaleString("en-US") + " km";
    const hrs = Math.floor(stats.dayHours), mins = Math.round((stats.dayHours - hrs) * 60);
    $("dayStat").textContent = String(hrs).padStart(2, "0") + " h " + String(mins).padStart(2, "0") + " m";
    $("tiltStat").textContent = stats.tilt.toFixed(1) + "°";
    $("moonStat").textContent = String(stats.moons);
    const bars = $("biomeBars").querySelectorAll("i");
    bars.forEach((bar, i) => { bar.style.opacity = i < stats.uniqueBiomes ? "1" : ".18"; });
    const total = MAP_W * MAP_H;
    const order = Array.from(stats.counts.entries()).filter(([id]) => id !== 0 && id !== 1 && id !== 2).sort((a, b) => b[1] - a[1]).slice(0, 5);
    $("biomeBreakdown").innerHTML = order.map(([id, count]) => {
      const value = count / total * 100;
      const color = BIOMES[id].color;
      return '<div class="breakdown-row"><div class="breakdown-name"><i class="breakdown-dot" style="background:rgb(' + color.join(",") + ')"></i><span>' + BIOMES[id].name + '</span></div><span class="breakdown-value">' + value.toFixed(1) + '%</span><div class="breakdown-track"><i style="width:' + Math.max(1, value / Math.max(...order.map((x) => x[1] / total * 100), 1) * 100) + '%;background:rgb(' + color.join(",") + ')"></i></div></div>';
    }).join("") || '<div class="breakdown-empty">Нет выраженных биомов</div>';
    const className = stats.meanTemp < -8 ? "CRYOGENIC · CLASS F" : stats.meanTemp > 25 ? "ARID / HOT · CLASS H" : (stats.landPercent < 12 ? "OCEANIC · CLASS O" : "TERRESTRIAL · CLASS M");
    $("planetClass").textContent = className;
  }

  function updateInterface() {
    $("planetName").value = state.name;
    $("seedInput").value = String(state.seed);
    $("seedBadge").textContent = "SEED " + state.seed;
    $("statsPlanetName").textContent = state.name || "Безымянный мир";
    $("seaLevel").value = state.seaLevel;
    $("landmass").value = state.landmass;
    $("relief").value = state.relief;
    $("temperature").value = state.temperature;
    $("humidity").value = state.humidity;
    $("seaLevelOut").textContent = state.seaLevel + "%";
    $("landmassOut").textContent = (state.landmass > 0 ? "+" : "") + state.landmass;
    $("reliefOut").textContent = ["", "Низкая", "Низкая", "Низкая", "Средняя", "Средняя", "Средняя", "Высокая", "Высокая", "Горная", "Горная"][state.relief] || "Средняя";
    $("temperatureOut").textContent = (state.temperature > 0 ? "+" : "") + state.temperature + " °C";
    $("humidityOut").textContent = state.humidity + "%";
    document.querySelectorAll('input[type="range"]').forEach((input) => {
      const min = Number(input.min), max = Number(input.max), val = Number(input.value);
      input.style.setProperty("--range-fill", ((val - min) / (max - min) * 100) + "%");
    });
    document.querySelectorAll(".preset-card").forEach((button) => button.classList.toggle("active", button.dataset.preset === state.preset));
    $("rotationSwitch").classList.toggle("on", state.rotating);
    $("rotateBtn").setAttribute("aria-pressed", String(state.rotating));
    $("mapLayer").value = state.layer;
    $("viewModeLabel").textContent = state.view === "globe" ? "PLANET VIEW / 3D RENDER" : "CARTOGRAPHY / EQUIRECTANGULAR";
    updateLegend();
  }

  function updateLegend() {
    const labels = {
      biome: [['Океан','#1b5d82'],['Леса','#44805f'],['Пустыни','#c59b57'],['Горы','#b9c2bc'],['Лёд','#cbe8ed']],
      elevation: [['Глубины','#12375a'],['Низменность','#4e8d79'],['Возвышенность','#a28b67'],['Горы','#c5ccc7'],['Вершины','#f6faf7']],
      temperature: [['Холод','#1f407d'],['Прохладно','#7dbdb7'],['Умеренно','#b3cb8f'],['Жарко','#d97d4d'],['Экстремум','#97373e']],
      moisture: [['Засуха','#976b43'],['Сухо','#c29b5b'],['Умеренно','#afb869'],['Влажно','#369281'],['Очень влажно','#2e70a3']]
    };
    $("mapLegend").innerHTML = labels[state.layer].map(([label,color]) => '<span><i class="legend-color" style="background:' + color + '"></i>' + label + '</span>').join("");
  }

  function scheduleGenerate() {
    clearTimeout(regenTimer);
    state.isGenerating = true;
    $("renderOverlay").classList.remove("hidden");
    $("statusText").textContent = "Обновляем поверхность…";
    regenTimer = window.setTimeout(() => {
      try { generatePlanet(); }
      catch (error) {
        console.error("PlanetForge generation failed:", error);
        $("renderOverlay").classList.add("hidden");
        state.isGenerating = false;
        $("statusText").textContent = "Ошибка генерации";
        showToast("Не удалось сформировать мир. Попробуйте другой seed.");
      }
    }, 35);
  }

  function setView(view) {
    state.view = view;
    document.querySelectorAll(".view-tab").forEach((button) => {
      const active = button.dataset.view === view;
      button.classList.toggle("active", active);
      button.setAttribute("aria-selected", String(active));
    });
    renderCurrentView();
    updateInterface();
    startAnimation();
  }

  function createExportMenu() {
    if (exportMenu) { exportMenu.remove(); exportMenu = null; return; }
    exportMenu = document.createElement("div");
    exportMenu.className = "export-menu";
    exportMenu.innerHTML = '<strong>ЭКСПОРТ МИРА</strong><button data-export="png"><span>▧</span><i><b>PNG-карта мира</b><small>Текущее отображение · 512 × 256</small></i></button><button data-export="json"><span>{ }</span><i><b>JSON-проект</b><small>Seed и все настройки</small></i></button><button data-export="csv"><span>▤</span><i><b>CSV-статистика</b><small>Доли поверхности по биомам</small></i></button>';
    $("exportBtn").parentElement.style.position = "relative";
    $("exportBtn").parentElement.appendChild(exportMenu);
    exportMenu.addEventListener("click", (event) => {
      const button = event.target.closest("[data-export]");
      if (!button) return;
      const type = button.dataset.export;
      exportMenu.remove(); exportMenu = null;
      if (type === "png") exportPNG();
      if (type === "json") exportJSON();
      if (type === "csv") exportCSV();
    });
    document.addEventListener("pointerdown", closeExportOnOutside, { once: true });
  }
  function closeExportOnOutside(event) {
    if (exportMenu && !exportMenu.contains(event.target) && !$("exportBtn").contains(event.target)) {
      exportMenu.remove(); exportMenu = null;
    } else if (exportMenu) {
      document.addEventListener("pointerdown", closeExportOnOutside, { once: true });
    }
  }
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function cleanFileName(name) {
    return (name || "planet").normalize("NFKD").replace(/[^a-zA-Z0-9а-яА-Я_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "planet";
  }
  function exportPNG() {
    if (!activeData) return;
    textureCanvas.toBlob((blob) => {
      if (blob) { downloadBlob(blob, cleanFileName(state.name) + "-" + state.layer + ".png"); showToast("PNG-карта экспортирована"); }
      else showToast("Не удалось экспортировать PNG");
    }, "image/png");
  }
  function projectJSON() {
    return {
      format: "planetforge-world",
      version: 1,
      name: state.name,
      seed: Number(state.seed),
      preset: state.preset,
      settings: { seaLevel: state.seaLevel, landmass: state.landmass, relief: state.relief, temperature: state.temperature, humidity: state.humidity },
      view: { layer: state.layer, zoom: state.zoom },
      exportedAt: new Date().toISOString()
    };
  }
  function exportJSON() {
    const blob = new Blob([JSON.stringify(projectJSON(), null, 2)], { type: "application/json;charset=utf-8" });
    downloadBlob(blob, cleanFileName(state.name) + ".planetforge.json");
    showToast("Проект сохранён в JSON");
  }
  function exportCSV() {
    const total = MAP_W * MAP_H;
    const lines = ["biome_id,biome,share_percent,pixel_count"];
    activeData.counts.forEach((count, id) => lines.push([id, '"' + BIOMES[id].name.replace(/"/g, '""') + '"', (count / total * 100).toFixed(3), count].join(",")));
    downloadBlob(new Blob(["\uFEFF" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }), cleanFileName(state.name) + "-biomes.csv");
    showToast("Статистика биомов экспортирована");
  }

  function readSavedWorlds() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(data) ? data : [];
    } catch (_) { return []; }
  }
  function saveWorld() {
    const world = { id: String(Date.now()) + "-" + String(Math.floor(Math.random() * 100000)), name: state.name || "Безымянный мир", seed: Number(state.seed), preset: state.preset, settings: { seaLevel: state.seaLevel, landmass: state.landmass, relief: state.relief, temperature: state.temperature, humidity: state.humidity }, savedAt: new Date().toISOString(), stats: stats ? { landPercent: Number(stats.landPercent.toFixed(2)), meanTemp: Number(stats.meanTemp.toFixed(1)), uniqueBiomes: stats.uniqueBiomes } : null };
    const worlds = readSavedWorlds().filter((item) => item.seed !== world.seed || item.name !== world.name);
    worlds.unshift(world);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(worlds.slice(0, 30)));
      showToast("«" + world.name + "» сохранена в локальный архив");
    } catch (error) {
      showToast("Не удалось сохранить: хранилище браузера недоступно");
    }
  }
  function openSavedDialog() {
    drawSavedWorlds();
    $("savedDialog").showModal();
  }
  function drawSavedWorlds() {
    const worlds = readSavedWorlds();
    const list = $("savedWorldsList");
    if (!worlds.length) {
      list.innerHTML = '<div class="empty-archive"><strong>Архив пока пуст</strong>Сохраните планету, чтобы она появилась здесь.<br>Миры остаются на этом устройстве.</div>';
      return;
    }
    list.innerHTML = worlds.map((world) => {
      const date = world.savedAt ? new Date(world.savedAt).toLocaleDateString() : "";
      return '<div class="saved-item"><span class="saved-thumb"></span><div class="saved-item-main"><strong>' + escapeHTML(world.name || "Безымянный мир") + '</strong><small>SEED ' + Number(world.seed) + ' · ' + date + '</small></div><div class="saved-item-actions"><button data-load="' + escapeHTML(world.id) + '">Открыть</button><button data-delete="' + escapeHTML(world.id) + '" aria-label="Удалить сохранённый мир">×</button></div></div>';
    }).join("");
    list.querySelectorAll("[data-load]").forEach((button) => button.addEventListener("click", () => {
      const world = readSavedWorlds().find((item) => item.id === button.dataset.load);
      if (!world) return;
      restoreProject(world);
      $("savedDialog").close();
      showToast("Загружен мир «" + state.name + "»");
    }));
    list.querySelectorAll("[data-delete]").forEach((button) => button.addEventListener("click", () => {
      const worldsNow = readSavedWorlds().filter((item) => item.id !== button.dataset.delete);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(worldsNow));
      drawSavedWorlds();
      showToast("Сохранение удалено");
    }));
  }
  function restoreProject(input) {
    const settings = input.settings || input;
    state.name = String(input.name || "Untitled World").slice(0, 48);
    state.seed = normalizeSeed(input.seed);
    state.preset = PRESETS[input.preset] ? input.preset : "custom";
    state.seaLevel = clampInt(settings.seaLevel, 34, 67, 50);
    state.landmass = clampInt(settings.landmass, -12, 12, 0);
    state.relief = clampInt(settings.relief, 1, 10, 5);
    state.temperature = clampInt(settings.temperature, -40, 40, 0);
    state.humidity = clampInt(settings.humidity, 0, 100, 50);
    state.layer = input.view && ["biome", "elevation", "temperature", "moisture"].includes(input.view.layer) ? input.view.layer : "biome";
    state.zoom = input.view && Number.isFinite(input.view.zoom) ? clamp(input.view.zoom, .7, 1.5) : 1;
    state.rotation = 0;
    updateInterface();
    scheduleGenerate();
  }
  function clampInt(value, min, max, fallback) {
    const n = Number(value);
    return Number.isFinite(n) ? Math.round(clamp(n, min, max)) : fallback;
  }
  function normalizeSeed(value) {
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed)) return Math.floor(Math.random() * 900000000) + 100000000;
    return Math.abs(parsed) % 2147483647 || 1;
  }
  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
  }
  function showToast(message) {
    const toast = $("toast");
    toast.textContent = message;
    toast.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => toast.classList.remove("show"), 2600);
  }
  function formatCoord(degrees, positive, negative) {
    const side = degrees < 0 ? negative : positive;
    const abs = Math.abs(degrees);
    const whole = Math.floor(abs);
    const minutes = Math.floor((abs - whole) * 60);
    return whole + "° " + String(minutes).padStart(2, "0") + "' " + side;
  }

  $("planetName").addEventListener("input", () => {
    state.name = $("planetName").value.slice(0, 48);
    $("statsPlanetName").textContent = state.name || "Безымянный мир";
    $("statusText").textContent = state.name ? "Редактирование · " + state.name : "Безымянный мир";
  });
  $("seedInput").addEventListener("change", () => {
    state.seed = normalizeSeed($("seedInput").value);
    state.preset = "custom";
    updateInterface(); scheduleGenerate();
  });
  $("randomSeedBtn").addEventListener("click", () => {
    state.seed = Math.floor(Math.random() * 900000000) + 100000000;
    state.preset = "custom";
    updateInterface(); scheduleGenerate();
  });
  $("regenerateBtn").addEventListener("click", () => {
    state.seed = Math.floor(Math.random() * 900000000) + 100000000;
    state.preset = "custom";
    state.rotation = 0;
    updateInterface(); scheduleGenerate();
  });
  document.querySelectorAll(".preset-card").forEach((button) => button.addEventListener("click", () => {
    state.preset = button.dataset.preset;
    Object.assign(state, PRESETS[state.preset]);
    state.seed = Math.floor(Math.random() * 900000000) + 100000000;
    state.rotation = 0;
    updateInterface(); scheduleGenerate();
  }));
  ["seaLevel", "landmass", "relief", "temperature", "humidity"].forEach((key) => {
    $(key).addEventListener("input", () => {
      state[key] = Number($(key).value);
      state.preset = "custom";
      updateInterface();
      clearTimeout(regenTimer);
      regenTimer = window.setTimeout(scheduleGenerate, 140);
    });
  });
  $("mapLayer").addEventListener("change", () => {
    state.layer = $("mapLayer").value;
    updateInterface();
    if (activeData) { drawTexture(); renderCurrentView(); }
  });
  document.querySelectorAll(".view-tab").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
  $("rotateBtn").addEventListener("click", () => {
    state.rotating = !state.rotating;
    updateInterface(); startAnimation();
    if (!state.rotating && state.view === "globe") drawGlobe();
  });
  $("zoomInBtn").addEventListener("click", () => { state.zoom = clamp(state.zoom * 1.12, .65, 1.55); $("zoomLabel").textContent = Math.round(state.zoom * 100) + "%"; renderCurrentView(); });
  $("zoomOutBtn").addEventListener("click", () => { state.zoom = clamp(state.zoom / 1.12, .65, 1.55); $("zoomLabel").textContent = Math.round(state.zoom * 100) + "%"; renderCurrentView(); });
  $("resetViewBtn").addEventListener("click", () => { state.zoom = 1; state.rotation = 0; $("zoomLabel").textContent = "100%"; renderCurrentView(); });
  $("fullscreenBtn").addEventListener("click", async () => {
    try {
      if (!document.fullscreenElement) await planetStage.requestFullscreen();
      else await document.exitFullscreen();
    } catch (_) { showToast("Полноэкранный режим недоступен в этом браузере"); }
  });
  $("exportBtn").addEventListener("click", createExportMenu);
  $("importBtn").addEventListener("click", () => $("importFile").click());
  $("importFile").addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("Файл слишком большой");
      const parsed = JSON.parse(await file.text());
      if (parsed.format && parsed.format !== "planetforge-world") throw new Error("Это не проект PlanetForge");
      restoreProject(parsed);
      showToast("Проект «" + state.name + "» импортирован");
    } catch (error) {
      showToast(error.message === "Файл слишком большой" ? error.message : "Не удалось прочитать JSON-проект");
    } finally { event.target.value = ""; }
  });
  $("saveWorldBtn").addEventListener("click", saveWorld);
  $("savedWorldsBtn").addEventListener("click", openSavedDialog);
  $("closeSavedBtn").addEventListener("click", () => $("savedDialog").close());
  $("copySeedBtn").addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(String(state.seed));
      showToast("Seed скопирован: " + state.seed);
    } catch (_) {
      const input = $("seedInput"); input.focus(); input.select();
      try { document.execCommand("copy"); showToast("Seed скопирован"); }
      catch (_) { showToast("Seed: " + state.seed); }
    }
  });

  function pointerCoordinates(event) {
    const rect = (state.view === "globe" ? canvas : mapCanvas).getBoundingClientRect();
    if (state.view === "globe") {
      const r = Math.min(rect.width, rect.height) * .355 * state.zoom;
      const nx = (event.clientX - (rect.left + rect.width / 2)) / r;
      const ny = ((rect.top + rect.height * .51) - event.clientY) / r;
      if (nx * nx + ny * ny > 1) return null;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const lat = Math.asin(clamp(ny, -1, 1)) * 180 / Math.PI;
      let lon = (Math.atan2(nx, nz) + state.rotation) * 180 / Math.PI;
      lon = ((lon + 180) % 360 + 360) % 360 - 180;
      return { lat, lon };
    }
    const width = rect.width, height = rect.height;
    const fitW = Math.min(width, height * MAP_W / MAP_H) * state.zoom;
    const fitH = fitW / (MAP_W / MAP_H);
    const px = event.clientX - rect.left - (width - fitW) / 2;
    const py = event.clientY - rect.top - (height - fitH) / 2;
    if (px < 0 || py < 0 || px > fitW || py > fitH) return null;
    return { lat: 90 - py / fitH * 180, lon: px / fitW * 360 - 180 };
  }
  function updateCoordinates(event) {
    const point = pointerCoordinates(event);
    if (!point) return;
    $("coordReadout").textContent = formatCoord(point.lat, "N", "S") + "  " + formatCoord(point.lon, "E", "W");
  }
  canvas.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) return;
    pointerState = { x: event.clientX, rotation: state.rotation };
    dragMoved = false;
    canvas.setPointerCapture(event.pointerId);
    if (state.rotating) { state.rotating = false; updateInterface(); startAnimation(); }
  });
  canvas.addEventListener("pointermove", (event) => {
    updateCoordinates(event);
    if (!pointerState) return;
    const dx = event.clientX - pointerState.x;
    if (Math.abs(dx) > 2) dragMoved = true;
    if (dragMoved) {
      state.rotation = pointerState.rotation + dx / Math.max(160, canvas.clientWidth) * TAU;
      drawGlobe();
    }
  });
  const endPointer = () => { pointerState = null; if (state.rotating) startAnimation(); };
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  mapCanvas.addEventListener("pointermove", updateCoordinates);
  planetStage.addEventListener("wheel", (event) => {
    if (state.view !== "globe") return;
    event.preventDefault();
    state.zoom = clamp(state.zoom * (event.deltaY < 0 ? 1.07 : .935), .65, 1.55);
    $("zoomLabel").textContent = Math.round(state.zoom * 100) + "%";
    drawGlobe();
  }, { passive: false });
  window.addEventListener("resize", () => { renderCurrentView(); });
  document.addEventListener("fullscreenchange", () => { window.setTimeout(renderCurrentView, 80); });

  function initialize() {
    updateInterface();
    $("renderOverlay").classList.remove("hidden");
    window.setTimeout(() => {
      try { generatePlanet(); }
      catch (error) {
        console.error(error);
        $("renderOverlay").classList.add("hidden");
        showToast("Ошибка генерации. Обновите страницу и попробуйте снова.");
      }
    }, 70);
  }

  initialize();
})();