(() => {
  "use strict";

  const MAP_W = 512;
  const MAP_H = 256;
  const TAU = Math.PI * 2;
  const STORAGE_KEY = "planetforge.savedWorlds.v1";
  const AUTOSAVE_KEY = "planetforge.autosave.v1";
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
    temperate:{seaLevel:50,landmass:0,relief:5,temperature:0,humidity:50,tectonics:56,erosion:28,season:50},
    archipelago:{seaLevel:55,landmass:-3,relief:3,temperature:6,humidity:61,tectonics:68,erosion:35,season:50},
    desert:{seaLevel:48,landmass:2,relief:5,temperature:24,humidity:12,tectonics:45,erosion:18,season:50},
    ice:{seaLevel:52,landmass:-1,relief:5,temperature:-29,humidity:63,tectonics:37,erosion:42,season:50},
    alien:{seaLevel:46,landmass:8,relief:8,temperature:12,humidity:83,tectonics:81,erosion:25,season:50},
    volcanic:{seaLevel:50,landmass:3,relief:10,temperature:9,humidity:30,tectonics:94,erosion:16,season:50}
  };
  const DEFAULTS = { name: "Aurelia", seed: 840271, ...PRESETS.temperate, preset: "temperate" };
  const GALLERY_WORLDS = [
    {name:"Aurelia",seed:840271,preset:"temperate",category:"Terrestrial",description:"Умеренный мир с океанами, лесами и разнообразным рельефом.",orb:"temperate"},
    {name:"Pelagos",seed:316804,preset:"archipelago",category:"Oceanic",description:"Океаническая планета с россыпями островов и влажным климатом.",orb:"archipelago"},
    {name:"Sirocco",seed:725091,preset:"desert",category:"Arid",description:"Жаркие материки, редкие влажные области и золотистые пустыни.",orb:"desert"},
    {name:"Nivara",seed:491207,preset:"ice",category:"Cryogenic",description:"Холодный мир с ледяными широтами и обширными снежными зонами.",orb:"ice"},
    {name:"Xanthe",seed:682413,preset:"alien",category:"Exotic",description:"Экзотическая планета с густой атмосферной влагой и необычными биомами.",orb:"alien"},
    {name:"Pyraxis",seed:908137,preset:"volcanic",category:"Volcanic",description:"Активная кора, суровый рельеф и контрастные вулканические области.",orb:"volcanic"},
    {name:"Thessara",seed:554093,preset:"temperate",category:"Terrestrial",description:"Контрастные континенты и умеренные широты.",orb:"temperate"},
    {name:"Nacre",seed:802671,preset:"archipelago",category:"Oceanic",description:"Цепочки островов над глубокими океанами.",orb:"archipelago"},
    {name:"Solenne",seed:388104,preset:"desert",category:"Arid",description:"Сухие плато с редкими зелёными долинами.",orb:"desert"},
    {name:"Eirlys",seed:271846,preset:"ice",category:"Cryogenic",description:"Холодная планета с ледяными материками.",orb:"ice"},
    {name:"Verdancia",seed:743215,preset:"alien",category:"Exotic",description:"Влажный чужой мир с обширными биомами.",orb:"alien"},
    {name:"Morvane",seed:619431,preset:"volcanic",category:"Volcanic",description:"Вулканический мир с резкими высотными переходами.",orb:"volcanic"}
  ];
  const $ = (id) => document.getElementById(id);
  const canvas = $("planetCanvas");
  const glCanvas = $("globe3dCanvas");
  const mapCanvas = $("mapCanvas");
  const globe3D = window.PlanetForgeGlobe3D ? window.PlanetForgeGlobe3D.create(glCanvas) : null;
  if (!globe3D || !globe3D.ready) glCanvas.hidden = true;
  const planetStage = $("planetStage");
  const ctx = canvas.getContext("2d", { alpha: true });
  const mapCtx = mapCanvas.getContext("2d", { alpha: false });
  const textureCanvas = document.createElement("canvas");
  textureCanvas.width = MAP_W;
  textureCanvas.height = MAP_H;
  const textureCtx = textureCanvas.getContext("2d", { alpha: false });
  // A 2x atlas texture gives the WebGL globe sub-cell antialiasing for the same
  // political paths that are drawn over the equirectangular map.
  const globeTextureCanvas = document.createElement("canvas");
  globeTextureCanvas.width = MAP_W * 2;
  globeTextureCanvas.height = MAP_H * 2;
  const globeTextureCtx = globeTextureCanvas.getContext("2d", { alpha: false });
  const textureImage = textureCtx.createImageData(MAP_W, MAP_H);
  let texturePixels = textureImage.data;
  let globeBuffer = null;
  let globeBufferSize = 0;
  let mapData = null;
  let textureRevision = 0;
  let vectorBorderCacheRevision = -1;
  let vectorBorderCache = null;
  let resizeObserver = null;
  let regenTimer = 0;
  let animationId = 0;
  let lastFrame = 0;
  let toastTimer = 0;
  let autosaveTimer = 0;
  let pointerState = null;
  let dragMoved = false;
  let borderPaintPointer = null;
  let lastBorderPaintPoint = null;
  let lastBorderPaintAt = 0;
  let terrainPaintPointer = null;
  let lastTerrainPaintPoint = null;
  let terrainPaintAt = 0;
  let terrainStrokeBase = null;
  let terrainStrokeTarget = 0;
  let terrainStrokeOverrideCount = 0;
  let exportMenu = null;
  let activeData = null;
  let stats = null;
  let terrainWorker = null;
  let pendingTerrainJob = null;
  let terrainJobSequence = 0;
  let exportWorker = null;
  let exportJobSequence = 0;

  const state = {
    ...DEFAULTS, view:"globe", layer:"biome", rotation:0, rotationX:0, zoom:1,
    rotating:true, isGenerating:false, civilizationSeed:(DEFAULTS.seed^0x51ed1234)>>>0,
    showRivers:true,showLakes:true,showDeltas:true,showCities:true,showRoutes:true,showBorders:true,
    editBorders:false,borderCountry:0,selectedCountry:0,moveCapital:false,
    customTerritories:{},countryNames:{},countryMerges:{},countryCapitals:{},
    editTerrain:false,terrainBrush:"raise",terrainBrushSize:8,terrainBrushStrength:45,customHeightOverrides:{},
    tectonics:56,erosion:28,season:50,customCities:[],cityNames:{}
  };
  const editHistory=window.PlanetForgeHistory?window.PlanetForgeHistory.create({
    capture:projectJSON,restore:restoreProject,onChange:updateHistoryButtons,limit:70
  }):null;
  function checkpointHistory(){if(editHistory)editHistory.checkpoint();}
  function scheduleAutosave(){
    clearTimeout(autosaveTimer);
    autosaveTimer=window.setTimeout(()=>{
      try{
        localStorage.setItem(AUTOSAVE_KEY,JSON.stringify(projectJSON()));
        const now=new Date();
        $("autosaveStatus").textContent="LOCAL SAVE · "+now.toLocaleTimeString([], {hour:"2-digit",minute:"2-digit"});
        $("autosaveStatus").title="Последний автосейв: "+now.toLocaleString();
      }catch(_){
        $("autosaveStatus").textContent="LOCAL SAVE · UNAVAILABLE";
        $("autosaveStatus").title="Браузер не разрешил записать автосохранение.";
      }
    },650);
  }
  function readAutosave(){
    try{
      const saved=JSON.parse(localStorage.getItem(AUTOSAVE_KEY)||"null");
      return saved&&saved.format==="planetforge-world"?saved:null;
    }catch(_){return null;}
  }
  function updateHistoryButtons(){const current=editHistory?editHistory.state():{canUndo:false,canRedo:false};$("undoBtn").disabled=!current.canUndo;$("redoBtn").disabled=!current.canRedo;}

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
  // Muted atlas colors distinguish countries without competing with terrain.
  const COUNTRY_COLORS = [
    [103, 128, 112], [159, 133, 96], [91, 119, 146], [158, 111, 100],
    [146, 146, 105], [133, 112, 143], [91, 137, 133], [172, 137, 124],
    [112, 125, 91], [125, 141, 157], [176, 154, 103], [133, 126, 112],
    [102, 141, 116], [158, 122, 139], [108, 131, 151], [169, 143, 114]
  ];

  function generateRivers(height,threshold,seed){
    const size=height.length,downstream=new Int32Array(size),accumulation=new Uint32Array(size);downstream.fill(-1);
    const visited=new Uint8Array(size),filled=new Float32Array(height),landCells=[],heapIndex=[],heapLevel=[];
    function push(index,level){let i=heapIndex.length;heapIndex.push(index);heapLevel.push(level);while(i>0){const parent=(i-1)>>1;if(heapLevel[parent]<=level)break;heapIndex[i]=heapIndex[parent];heapLevel[i]=heapLevel[parent];i=parent;}heapIndex[i]=index;heapLevel[i]=level;}
    function pop(){const result={index:heapIndex[0],level:heapLevel[0]},lastIndex=heapIndex.pop(),lastLevel=heapLevel.pop();if(heapIndex.length){let i=0;while(true){let child=i*2+1;if(child>=heapIndex.length)break;if(child+1<heapIndex.length&&heapLevel[child+1]<heapLevel[child])child++;if(heapLevel[child]>=lastLevel)break;heapIndex[i]=heapIndex[child];heapLevel[i]=heapLevel[child];i=child;}heapIndex[i]=lastIndex;heapLevel[i]=lastLevel;}return result;}
    for(let i=0;i<size;i++){if(height[i]<=threshold){visited[i]=1;push(i,height[i]);}else{landCells.push(i);accumulation[i]=1;}}
    // Priority-flood drainage resolves closed depressions and directs each land
    // cell toward a sea-level cell instead of allowing rivers to stop in pits.
    while(heapIndex.length){const node=pop(),x=node.index%MAP_W,y=Math.floor(node.index/MAP_W);
      for(let dy=-1;dy<=1;dy++){const ny=y+dy;if(ny<0||ny>=MAP_H)continue;for(let dx=-1;dx<=1;dx++){if(dx===0&&dy===0)continue;const nx=(x+dx+MAP_W)%MAP_W,next=ny*MAP_W+nx;if(visited[next])continue;visited[next]=1;const spill=Math.max(height[next],node.level+0.000001);filled[next]=spill;downstream[next]=node.index;push(next,spill);}}
    }
    const order=landCells.slice().sort((a,b)=>filled[b]-filled[a]);for(const index of order){const next=downstream[index];if(next>=0)accumulation[next]+=accumulation[index];}
    const mask=new Uint8Array(size),lakeMask=new Uint8Array(size),deltaMask=new Uint8Array(size),cutoff=Math.max(18,Math.round(landCells.length/1800));let count=0,lakeCount=0,deltaCount=0;
    for(const index of landCells){
      if(accumulation[index]>=cutoff&&downstream[index]>=0){mask[index]=1;count++;}
      // Filled depressions become stylized lakes; a depth threshold filters single-cell noise.
      if(filled[index]-height[index]>.0035){lakeMask[index]=1;lakeCount++;}
    }
    for(const index of landCells){
      const next=downstream[index];
      if(mask[index]&&next>=0&&height[next]<=threshold&&accumulation[index]>=cutoff*1.4){
        deltaMask[index]=1;deltaCount++;
        const x=index%MAP_W,y=Math.floor(index/MAP_W);
        for(let dy=-1;dy<=1;dy++){const ny=y+dy;if(ny<0||ny>=MAP_H)continue;for(let dx=-1;dx<=1;dx++){const nx=(x+dx+MAP_W)%MAP_W,neighbor=ny*MAP_W+nx;if(height[neighbor]>threshold&&mask[neighbor]&&!deltaMask[neighbor]){deltaMask[neighbor]=1;deltaCount++;}}}
      }
    }
    return{mask,count,filledHeight:filled,lakeMask,lakeCount,deltaMask,deltaCount};
  }

  function generateCivilization(height, temperature, moisture, biome, riverMask, threshold, landCount, civilizationSeed) {
    const rand = seededRandom(Number(civilizationSeed) >>> 0);
    const candidates = [];
    const prefixes = ["Ael", "Nor", "Vel", "Cyr", "Eld", "Thal", "Or", "Vey", "Mer", "Sol", "Ar", "Cal", "Ith", "Zer", "Kael", "Lun", "Rav", "Eri"];
    const suffixes = ["oria", "haven", "aris", "mere", "dara", "eth", "holm", "gate", "wyn", "ora", "is", "ent", "ara", "ion", "vale", "crest", "port", "heim"];

    for (let y = 12; y < MAP_H - 12; y += 4) {
      const latitude = 90 - ((y + 0.5) / MAP_H) * 180;
      if (Math.abs(latitude) > 70) continue;
      for (let x = 0; x < MAP_W; x += 4) {
        const index = y * MAP_W + x;
        if (height[index] <= threshold + 0.008 || biome[index] === 5 || biome[index] === 3) continue;
        const t = temperature[index];
        if (t < -25 || t > 43) continue;

        let nearCoast = false, nearRiver = riverMask[index] === 1;
        for (let dy = -1; dy <= 1; dy++) {
          const ny = y + dy;
          if (ny < 0 || ny >= MAP_H) continue;
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = (x + dx + MAP_W) % MAP_W;
            const neighbor = ny * MAP_W + nx;
            if (height[neighbor] <= threshold) nearCoast = true;
            if (riverMask[neighbor]) nearRiver = true;
          }
        }
        const temperatureFit = 1 - Math.min(1, Math.abs(t - 17) / 58);
        const moistureFit = 1 - Math.min(1, Math.abs(moisture[index] - 0.52) / 0.68);
        const score = temperatureFit * 0.34 + moistureFit * 0.20 +
          (nearCoast ? 0.22 : 0) + (nearRiver ? 0.24 : 0) + rand() * 0.24;
        candidates.push({ x, y, index, latitude, longitude: ((x + 0.5) / MAP_W) * 360 - 180, score });
      }
    }

    candidates.sort((a, b) => b.score - a.score);
    const targetCount = clamp(Math.round(landCount / (MAP_W * MAP_H) * 30), 8, 28);
    const cities = [], usedNames = new Set();
    for (const candidate of candidates) {
      if (cities.length >= targetCount) break;
      const spaced = cities.every((city) => {
        let dx = Math.abs(city.x - candidate.x);
        dx = Math.min(dx, MAP_W - dx);
        dx *= Math.cos(((city.lat + candidate.latitude) * 0.5) * Math.PI / 180);
        const dy = city.y - candidate.y;
        return dx * dx + dy * dy >= 17 * 17;
      });
      if (!spaced) continue;
      let name = prefixes[Math.floor(rand() * prefixes.length)] + suffixes[Math.floor(rand() * suffixes.length)];
      if (usedNames.has(name)) name += "-" + (cities.length + 1);
      usedNames.add(name);
      cities.push({
        id: cities.length, name, x: candidate.x, y: candidate.y,
        lat: candidate.latitude, lon: candidate.longitude,
        score: candidate.score, type: "settlement", countryId: 0,
        population: Math.round(1800 + rand() * 85000)
      });
    }

    const countryCount = cities.length ? clamp(Math.round(cities.length / 4), 1, 6) : 0;
    for(let id=0;id<countryCount;id++){
      const position=state.countryCapitals&&state.countryCapitals[String(id)];
      if(!position)continue;
      const x=clampInt(position.x,0,MAP_W-1,0),y=clampInt(position.y,0,MAP_H-1,0);
      if(height[y*MAP_W+x]<=threshold)continue;
      const city=cities[id];
      city.x=x;city.y=y;city.lat=90-((y+.5)/MAP_H)*180;city.lon=((x+.5)/MAP_W)*360-180;
    }
    const capitals = cities.slice(0, countryCount);
    const vectorFor = (lat, lon) => {
      const latitude = lat * Math.PI / 180, longitude = lon * Math.PI / 180;
      const cosLat = Math.cos(latitude);
      return { x: cosLat * Math.cos(longitude), y: Math.sin(latitude), z: cosLat * Math.sin(longitude) };
    };
    const anchors = capitals.map((city, id) => ({ ...vectorFor(city.lat, city.lon), id, city }));
    const warpTerritoryVector = (x, y, z) => {
      const seed = Number(civilizationSeed) >>> 0;
      const broad = noise3(x * 2.6, y * 2.6, z * 2.6, seed ^ 0x2c1b3c6d) - 0.5;
      const detail = noise3(x * 4.1 + 11.7, y * 4.1 - 3.8, z * 4.1 + 6.2, seed ^ 0x5f356495) - 0.5;
      const wx = x + broad * 0.34 + detail * 0.10;
      const wy = y + detail * 0.20 - broad * 0.08;
      const wz = z - broad * 0.14 + detail * 0.16;
      const length = Math.hypot(wx, wy, wz) || 1;
      return { x: wx / length, y: wy / length, z: wz / length };
    };
    cities.forEach((city, i) => {
      city.type = i < countryCount ? "capital" : (i < countryCount + Math.max(2, Math.round(cities.length * 0.22)) ? "city" : "settlement");
      const raw = vectorFor(city.lat, city.lon);
      const vector = warpTerritoryVector(raw.x, raw.y, raw.z);
      let bestDot = -Infinity;
      for (const anchor of anchors) {
        const dot = vector.x * anchor.x + vector.y * anchor.y + vector.z * anchor.z;
        if (dot > bestDot) { bestDot = dot; city.countryId = anchor.id; }
      }
    });

    const territories = new Uint8Array(height.length);
    territories.fill(255);
    for (let y = 0; y < MAP_H; y++) {
      const latitude = Math.PI / 2 - ((y + 0.5) / MAP_H) * Math.PI;
      const latSin = Math.sin(latitude), latCos = Math.cos(latitude);
      for (let x = 0; x < MAP_W; x++) {
        const index = y * MAP_W + x;
        if (height[index] <= threshold || anchors.length === 0) continue;
        const longitude = ((x + 0.5) / MAP_W) * Math.PI * 2 - Math.PI;
        const vx = latCos * Math.cos(longitude), vz = latCos * Math.sin(longitude);
        const warped = warpTerritoryVector(vx, latSin, vz);
        let bestDot = -Infinity, bestId = 0;
        for (const anchor of anchors) {
          const dot = warped.x * anchor.x + warped.y * anchor.y + warped.z * anchor.z;
          if (dot > bestDot) { bestDot = dot; bestId = anchor.id; }
        }
        territories[index] = bestId;
      }
    }

    const borders = new Uint8Array(height.length);
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const index = y * MAP_W + x;
        if (height[index] <= threshold || territories[index] === 255) continue;
        const right = y * MAP_W + ((x + 1) % MAP_W);
        const left = y * MAP_W + ((x - 1 + MAP_W) % MAP_W);
        const up = Math.max(0, y - 1) * MAP_W + x;
        const down = Math.min(MAP_H - 1, y + 1) * MAP_W + x;
        const owner = territories[index];
        if ((height[right] > threshold && territories[right] !== owner) ||
            (height[left] > threshold && territories[left] !== owner) ||
            (height[up] > threshold && territories[up] !== owner) ||
            (height[down] > threshold && territories[down] !== owner)) borders[index] = 1;
      }
    }

    const routes = [], routeKeys = new Set();
    const distance = (a, b) => {
      const latA = a.lat * Math.PI / 180, latB = b.lat * Math.PI / 180;
      const dLat = latB - latA;
      let dLon = (b.lon - a.lon) * Math.PI / 180;
      dLon = ((dLon + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
      return Math.sin(dLat / 2) ** 2 + Math.cos(latA) * Math.cos(latB) * Math.sin(dLon / 2) ** 2;
    };
    for (const city of cities) {
      const nearest = cities
        .filter((other) => other.id !== city.id && other.countryId === city.countryId)
        .map((other) => ({ other, distance: distance(city, other) }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, city.type === "capital" ? 2 : 1);
      for (const item of nearest) {
        const a = Math.min(city.id, item.other.id), b = Math.max(city.id, item.other.id);
        const key = a + ":" + b;
        if (!routeKeys.has(key)) { routeKeys.add(key); routes.push({ from: a, to: b, countryId: city.countryId }); }
      }
    }
    return { cities, routes, territories, borders, countryCount };
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
  const TECTONIC_STOPS = [[0,[18,31,43]],[.08,[31,66,80]],[.22,[70,120,116]],[.45,[181,139,85]],[.7,[216,107,70]],[1,[239,70,63]]];

  function applyCustomCities(civ){
    civ.cities.forEach(city=>{const label=state.cityNames&&state.cityNames[String(city.id)];if(label)city.name=String(label).slice(0,48);});
    const capitals=civ.cities.filter(city=>city.type==="capital"),routes=civ.routes,routeKeys=new Set(routes.map(r=>[String(r.from),String(r.to)].sort().join(":")));
    const d2=(a,b)=>{let dx=Math.abs(a.x-b.x);dx=Math.min(dx,MAP_W-dx)*Math.cos((a.lat+b.lat)*0.5*Math.PI/180);const dy=a.y-b.y;return dx*dx+dy*dy;};
    for(const item of(state.customCities||[]).slice(0,100)){
      const x=clampInt(item.x,0,MAP_W-1,0),y=clampInt(item.y,0,MAP_H-1,0),lat=90-((y+0.5)/MAP_H)*180,lon=((x+0.5)/MAP_W)*360-180;
      let countryId=capitals.length?capitals[0].countryId:0,best=-Infinity;
      for(const capital of capitals){const a=lat*Math.PI/180,b=lon*Math.PI/180,c=capital.lat*Math.PI/180,d=capital.lon*Math.PI/180;const dot=Math.sin(a)*Math.sin(c)+Math.cos(a)*Math.cos(c)*Math.cos(b-d);if(dot>best){best=dot;countryId=capital.countryId;}}
      const city={id:"user-"+String(item.id),customKey:String(item.id),custom:true,name:String(item.name||"New Haven").slice(0,48),x,y,lat,lon,type:"city",countryId,population:0};civ.cities.push(city);
      const nearest=civ.cities.filter(other=>other.id!==city.id&&other.countryId===countryId).map(other=>({other,distance:d2(city,other)})).sort((a,b)=>a.distance-b.distance).slice(0,2);
      for(const entry of nearest){const key=[String(city.id),String(entry.other.id)].sort().join(":");if(routeKeys.has(key))continue;routeKeys.add(key);routes.push({from:city.id,to:entry.other.id,countryId});}
    }
    return civ;
  }
  function resolveCountryId(value){
    let id=Number(value);
    if(!Number.isInteger(id)||id<0||id>=32)return 0;
    const merges=state.countryMerges||{},seen=new Set();
    while(Object.prototype.hasOwnProperty.call(merges,String(id))&&!seen.has(id)){
      seen.add(id);
      const target=Number(merges[String(id)]);
      if(!Number.isInteger(target)||target<0||target>=32||target===id)break;
      id=target;
    }
    return id;
  }
  function countryDisplayName(civ,id){
    id=resolveCountryId(id);
    const custom=state.countryNames&&state.countryNames[String(id)];
    if(custom&&String(custom).trim())return String(custom).trim().slice(0,48);
    const capital=(civ&&civ.cities||[]).find(city=>city.type==="capital"&&resolveCountryId(city.countryId)===id);
    return capital?String(capital.name):"Государство "+(id+1);
  }
  function rebuildTradeRoutes(cities){
    const routes=[],keys=new Set();
    const distance=(a,b)=>{
      const latA=a.lat*Math.PI/180,latB=b.lat*Math.PI/180;
      const dLat=latB-latA;let dLon=(b.lon-a.lon)*Math.PI/180;
      dLon=((dLon+Math.PI)%(Math.PI*2)+Math.PI*2)%(Math.PI*2)-Math.PI;
      return Math.sin(dLat/2)**2+Math.cos(latA)*Math.cos(latB)*Math.sin(dLon/2)**2;
    };
    for(const city of cities){
      const nearest=cities.filter(other=>other.id!==city.id&&resolveCountryId(other.countryId)===resolveCountryId(city.countryId))
        .map(other=>({other,distance:distance(city,other)}))
        .sort((a,b)=>a.distance-b.distance).slice(0,city.type==="capital"?2:1);
      for(const item of nearest){
        const key=[String(city.id),String(item.other.id)].sort().join(":");
        if(keys.has(key))continue;keys.add(key);
        routes.push({from:city.id,to:item.other.id,countryId:resolveCountryId(city.countryId)});
      }
    }
    return routes;
  }

  function applyCustomTerritories(civ,heightField,threshold){
    const territories=civ.territories;
    const baseCountryCount=civ.countryCount;
    for(let i=0;i<territories.length;i++)if(territories[i]!==255)territories[i]=resolveCountryId(territories[i]);
    for(const [key,value] of Object.entries(state.customTerritories||{})){
      const index=Number(key),country=Number(value);
      if(Number.isInteger(index)&&index>=0&&index<territories.length&&Number.isInteger(country)&&country>=0&&country<32&&heightField[index]>threshold)territories[index]=resolveCountryId(country);
    }

    for(const city of civ.cities||[]){
      const rawCountry=Number(city.countryId),canonical=resolveCountryId(rawCountry);
      if(city.type==="capital"&&canonical!==rawCountry)city.type="city";
      city.countryId=canonical;
      const index=clampInt(city.y,0,MAP_H-1,0)*MAP_W+clampInt(city.x,0,MAP_W-1,0);
      if(heightField[index]>threshold&&territories[index]!==255){
        const owner=resolveCountryId(territories[index]);
        if(owner!==city.countryId&&city.type==="capital")city.type="city";
        city.countryId=owner;
      }
    }

    for(const [key,value] of Object.entries(state.countryCapitals||{})){
      const country=Number(key);
      if(!Number.isInteger(country)||country<baseCountryCount||country>=32||resolveCountryId(country)!==country)continue;
      const x=clampInt(value&&value.x,0,MAP_W-1,0),y=clampInt(value&&value.y,0,MAP_H-1,0),index=y*MAP_W+x;
      if(heightField[index]<=threshold)continue;
      if(territories[index]!==country)territories[index]=country;
      if(!(civ.cities||[]).some(city=>city.type==="capital"&&resolveCountryId(city.countryId)===country)){
        civ.cities.push({id:"capital-"+country,name:countryDisplayName(civ,country),x,y,lat:90-((y+.5)/MAP_H)*180,lon:((x+.5)/MAP_W)*360-180,type:"capital",countryId:country,population:25000});
      }
    }

    const occupied=new Set();
    for(let i=0;i<territories.length;i++)if(heightField[i]>threshold&&territories[i]!==255){territories[i]=resolveCountryId(territories[i]);occupied.add(territories[i]);}
    civ.countryCount=occupied.size;
    civ.routes=rebuildTradeRoutes(civ.cities||[]);
    civ.borders=new Uint8Array(territories.length);
    for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++){
      const i=y*MAP_W+x;if(heightField[i]<=threshold||territories[i]===255)continue;
      const right=y*MAP_W+(x+1)%MAP_W,left=y*MAP_W+(x-1+MAP_W)%MAP_W;
      const up=Math.max(0,y-1)*MAP_W+x,down=Math.min(MAP_H-1,y+1)*MAP_W+x,owner=territories[i];
      if((heightField[right]>threshold&&territories[right]!==owner)||(heightField[left]>threshold&&territories[left]!==owner)||(heightField[up]>threshold&&territories[up]!==owner)||(heightField[down]>threshold&&territories[down]!==owner))civ.borders[i]=1;
    }
    return civ;
  }
  function updateCountryEditor(civ){
    if(!civ)return;
    const selected=resolveCountryId(state.selectedCountry);
    const nameInput=$("countryNameInput");
    if(document.activeElement!==nameInput)nameInput.value=countryDisplayName(civ,selected);
    const mergeSelect=$("mergeCountrySelect");
    const previousMerge=mergeSelect.value;
    mergeSelect.replaceChildren();
    const placeholder=document.createElement("option");placeholder.value="";placeholder.textContent="Выберите государство";mergeSelect.appendChild(placeholder);
    const ids=new Set();
    for(let i=0;i<civ.territories.length;i++){const id=civ.territories[i];if(id!==255)ids.add(resolveCountryId(id));}
    for(const city of civ.cities||[])if(city.type==="capital")ids.add(resolveCountryId(city.countryId));
    for(const id of [...ids].sort((a,b)=>a-b)){
      if(id===selected)continue;
      const option=document.createElement("option");option.value=String(id);option.textContent=countryDisplayName(civ,id);mergeSelect.appendChild(option);
    }
    if([...mergeSelect.options].some(option=>option.value===previousMerge))mergeSelect.value=previousMerge;
    else mergeSelect.value="";
    let landCells=0,total=0;
    if(civ.heightField&&Number.isFinite(civ.threshold)){
      for(let i=0;i<civ.territories.length;i++){
        const id=civ.territories[i];
        if(civ.heightField[i]>civ.threshold){total++;if(id!==255&&resolveCountryId(id)===selected)landCells++;}
      }
    }
    $("countryAreaStat").textContent=total?((landCells/total)*100).toFixed(1)+"% суши":"—";
    const capital=(civ.cities||[]).find(city=>city.type==="capital"&&resolveCountryId(city.countryId)===selected);
    $("countryCapitalStat").textContent=capital?capital.name:"—";
    $("countryEditorHint").textContent=state.moveCapital?"Режим переноса столицы: нажмите на сушу карты, чтобы переместить столицу выбранной страны.":"Выберите страну кликом по карте или глобусу. Названия и изменение границ сохраняются в проекте.";
    $("moveCapitalToggle").checked=state.moveCapital;
  }
  function updateBorderCountryOptions(civ){
    const select=$("borderCountrySelect"),ids=new Set();
    for(let i=0;i<civ.territories.length;i++){const id=civ.territories[i];if(id!==255)ids.add(resolveCountryId(id));}
    for(const city of civ.cities||[])if(city.type==="capital")ids.add(resolveCountryId(city.countryId));
    const sorted=[...ids].sort((a,b)=>a-b);
    if(!sorted.length){sorted.push(0);}
    state.selectedCountry=resolveCountryId(state.selectedCountry);
    if(!ids.has(state.selectedCountry))state.selectedCountry=sorted[0];
    state.borderCountry=resolveCountryId(state.borderCountry);
    if(!ids.has(state.borderCountry))state.borderCountry=state.selectedCountry;
    select.replaceChildren();
    for(const id of sorted){const option=document.createElement("option");option.value=String(id);option.textContent=countryDisplayName(civ,id);select.appendChild(option);}
    select.value=String(state.borderCountry);
    updateCountryEditor(civ);
  }
  function refreshCivilization(){if(!activeData)return;const civ=applyCustomTerritories(applyCustomCities(generateCivilization(activeData.heightField,activeData.temperature,activeData.moisture,activeData.biome,activeData.riverMask,activeData.threshold,activeData.landCount,state.civilizationSeed)),activeData.heightField,activeData.threshold);Object.assign(activeData,civ);updateBorderCountryOptions(civ);stats={...activeData};drawTexture();updateStats();renderCurrentView();scheduleAutosave();}
  function editOrAddCity(event){
    if(state.editBorders&&state.view==="map")return;
    if(!activeData)return;const point=pointerCoordinates(event);if(!point)return;
    const x=clamp(Math.floor((point.lon+180)/360*MAP_W),0,MAP_W-1),y=clamp(Math.floor((90-point.lat)/180*MAP_H),0,MAP_H-1),lat=90-((y+0.5)/MAP_H)*180;
    const near=(activeData.cities||[]).map(city=>{let dx=Math.abs(city.x-x);dx=Math.min(dx,MAP_W-dx)*Math.cos((lat+city.lat)*.5*Math.PI/180);const dy=city.y-y;return{city,distance:Math.sqrt(dx*dx+dy*dy)};}).sort((a,b)=>a.distance-b.distance)[0];
    if(near&&near.distance<Math.max(7,13/state.zoom)){
      const answer=window.prompt("Новое название для «"+near.city.name+"». Для пользовательского поселения введите DELETE, чтобы удалить.",near.city.name);
      if(answer===null||!answer.trim())return;
      if(answer.trim().toUpperCase()==="DELETE"&&near.city.custom){checkpointHistory();state.customCities=state.customCities.filter(item=>String(item.id)!==String(near.city.customKey));refreshCivilization();showToast("Пользовательское поселение удалено");return;}
      checkpointHistory();const name=answer.trim().slice(0,48);
      if(near.city.custom){const item=state.customCities.find(row=>String(row.id)===String(near.city.customKey));if(item)item.name=name;}else state.cityNames[String(near.city.id)]=name;
      refreshCivilization();showToast("Поселение переименовано");return;
    }
    if(activeData.heightField[y*MAP_W+x]<=activeData.threshold){showToast("Города можно размещать только на суше");return;}
    const name=window.prompt("Название нового поселения","New Haven");if(name===null||!name.trim())return;
    checkpointHistory();state.customCities.push({id:String(Date.now())+"-"+String(Math.floor(Math.random()*100000)),name:name.trim().slice(0,48),x,y});refreshCivilization();showToast("Поселение добавлено на карту");
  }

  function terrainSettings() {
    return {
      width: MAP_W, height: MAP_H, seed: Number(state.seed) >>> 0,
      temperature: Number(state.temperature), humidity: Number(state.humidity), relief: Number(state.relief),
      tectonics: Number(state.tectonics), erosion: Number(state.erosion), season: Number(state.season),
      seaLevel: Number(state.seaLevel), landmass: Number(state.landmass),
      heightOverrides: state.customHeightOverrides,
      heightOverrideWidth: MAP_W, heightOverrideHeight: MAP_H
    };
  }

  function reportGenerationError(error) {
    console.error("PlanetForge generation failed:", error);
    $("renderOverlay").classList.add("hidden");
    state.isGenerating = false;
    $("statusText").textContent = "Ошибка генерации";
    showToast("Не удалось сформировать мир. Попробуйте другой seed.");
  }

  function finishPlanetFields(fields, started) {
    const size = MAP_W * MAP_H;
    const height = fields.heightField instanceof Float32Array ? fields.heightField : new Float32Array(fields.heightField);
    const temperature = fields.temperature instanceof Float32Array ? fields.temperature : new Float32Array(fields.temperature);
    const moisture = fields.moisture instanceof Float32Array ? fields.moisture : new Float32Array(fields.moisture);
    const biome = fields.biome instanceof Uint8Array ? fields.biome : new Uint8Array(fields.biome);
    const counts = fields.counts instanceof Uint32Array ? fields.counts : new Uint32Array(fields.counts);
    const tectonicField = fields.tectonicField instanceof Float32Array ? fields.tectonicField : new Float32Array(fields.tectonicField || size);
    const threshold = fields.threshold, landCount = fields.landCount, totalTemp = fields.totalTemp;
    const seed = Number(fields.seed ?? state.seed) >>> 0;
    const riverData = generateRivers(height, threshold, seed);
    const civilization = applyCustomTerritories(applyCustomCities(generateCivilization(height, temperature, moisture, biome, riverData.mask, threshold, landCount, state.civilizationSeed)), height, threshold);
    updateBorderCountryOptions(civilization);
    const meanTemp = totalTemp / size, landPercent = landCount / size * 100;
    const rand = seededRandom(seed);
    const radius = Math.round(3400 + rand() * 7300);
    const dayHours = Math.round((10 + rand() * 50) * 10) / 10;
    const tilt = Math.round(rand() * 47 * 10) / 10;
    const moons = Math.floor(rand() * 5);
    let uniqueBiomes = 0;
    for (let i = 0; i < counts.length; i++) if (counts[i] > size * 0.0001) uniqueBiomes++;
    activeData = { width: MAP_W, height: MAP_H, heightField: height, temperature, moisture, tectonicField, biome, threshold, counts, landCount, meanTemp, landPercent, waterPercent: 100-landPercent, uniqueBiomes, radius, dayHours, tilt, moons, riverMask: riverData.mask, riverCount: riverData.count, lakeMask:riverData.lakeMask, lakeCount:riverData.lakeCount, deltaMask:riverData.deltaMask, deltaCount:riverData.deltaCount, filledHeight:riverData.filledHeight, ...civilization, generatedMs: performance.now()-started };
    stats = { ...activeData };
    updateBorderCountryOptions(activeData);
    drawTexture(); updateStats(); updateInterface(); renderCurrentView();
    $("resolutionLabel").textContent = "PROCEDURAL SURFACE · " + MAP_W + " × " + MAP_H;
    $("statusText").textContent = "Мир сформирован · " + state.name;
    $("renderOverlay").classList.add("hidden");
    state.isGenerating = false;
    $("perfReadout").textContent = (globe3D && globe3D.ready ? "WEBGL GLOBE · " : "CANVAS FALLBACK · ") + Math.round(activeData.generatedMs) + " MS";
    startAnimation();
  }

  function runTerrainFallback(job) {
    try {
      if (!window.PlanetForgeGenerator) throw new Error("Процедурный генератор не загружен");
      finishPlanetFields(window.PlanetForgeGenerator.generateFields(job.settings), job.started);
    } catch (error) { reportGenerationError(error); }
  }

  function createTerrainWorker() {
    if (typeof Worker === "undefined") return null;
    try {
      const worker = new Worker("assets/js/planet-worker.js");
      worker.onmessage = (event) => {
        const job = pendingTerrainJob, message = event.data || {};
        if (!job || job.worker !== worker || message.jobId !== job.id) return;
        pendingTerrainJob = null;
        // A slider can change before its debounce fires. Never paint a result for
        // settings that no longer match the controls; the pending debounce will rerun it.
        if (JSON.stringify(job.settings) !== JSON.stringify(terrainSettings())) return;
        if (message.error) { runTerrainFallback(job); return; }
        try { finishPlanetFields(message.fields, job.started); }
        catch (error) { reportGenerationError(error); }
      };
      worker.onerror = (event) => {
        const job = pendingTerrainJob;
        if (!job || job.worker !== worker) return;
        pendingTerrainJob = null;
        worker.terminate();
        if (terrainWorker === worker) terrainWorker = null;
        runTerrainFallback(job);
      };
      return worker;
    } catch (_) { return null; }
  }

  function generatePlanet() {
    const started = performance.now(), settings = terrainSettings();
    const job = { id: ++terrainJobSequence, started, settings, worker: null };
    // Cancel a stale request when a user keeps dragging sliders; only the most
    // recent parameter set should consume CPU and update the visible world.
    if (pendingTerrainJob) {
      pendingTerrainJob.worker.terminate();
      if (terrainWorker === pendingTerrainJob.worker) terrainWorker = null;
      pendingTerrainJob = null;
    }
    if (!terrainWorker) terrainWorker = createTerrainWorker();
    if (!terrainWorker) { runTerrainFallback(job); return; }
    job.worker = terrainWorker;
    pendingTerrainJob = job;
    try { terrainWorker.postMessage({ jobId: job.id, settings }); }
    catch (_) {
      pendingTerrainJob = null;
      terrainWorker.terminate();
      terrainWorker = null;
      runTerrainFallback(job);
    }
  }

  function drawTexture() {
    const { heightField, temperature, moisture, tectonicField, biome, threshold, riverMask, lakeMask, deltaMask, territories, borders } = activeData;
    const pureLayer=["heightmap","tectonics","temperature","moisture"].includes(state.layer);
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
        } else if (state.layer === "heightmap") {
          const gray = Math.round(clamp(h, 0, 1) * 255);
          color = [gray, gray, gray];
        } else if (state.layer === "tectonics") {
          color = hueColor(tectonicField ? tectonicField[i] : 0, TECTONIC_STOPS);
        } else if (state.layer === "temperature") {
          color = hueColor((temperature[i] + 35) / 72, TEMP_STOPS);
        } else if (state.layer === "moisture") {
          color = hueColor(moisture[i], MOIST_STOPS);
        } else if (state.layer === "hydrology") {
          color = h <= threshold
            ? [Math.round(8 + clamp((threshold - h) * 95, 0, 20)), Math.round(27 + clamp((threshold - h) * 110, 0, 30)), Math.round(47 + clamp((threshold - h) * 150, 0, 45))]
            : hueColor(clamp((h - threshold + 0.18) / 0.46, 0, 1), HEIGHT_STOPS);
        } else if (state.layer === "political") {
          color = h <= threshold ? [7, 17, 29] : (territories && territories[i] !== 255 ? COUNTRY_COLORS[territories[i] % COUNTRY_COLORS.length].slice() : [91, 99, 105]);
        } else {
          color = BIOMES[biome[i]].color.slice();
          const ocean = biome[i] <= 2;
          const hillShade = ocean ? clamp(0.87 + (threshold - h) * 0.9, 0.75, 1.02) : slope;
          color[0] = Math.round(color[0] * hillShade);
          color[1] = Math.round(color[1] * hillShade);
          color[2] = Math.round(color[2] * hillShade);
        }
        if(!pureLayer&&territories&&territories[i]!==255&&resolveCountryId(territories[i])===resolveCountryId(state.selectedCountry)){
          const amount=state.layer==="political"?.23:.09,selection=[211,194,155];
          color[0]=Math.round(lerp(color[0],selection[0],amount));
          color[1]=Math.round(lerp(color[1],selection[1],amount));
          color[2]=Math.round(lerp(color[2],selection[2],amount));
        }
        if (!pureLayer && lakeMask && lakeMask[i] && (state.showLakes || state.layer === "hydrology")) color = [42, 127, 170];
        if (!pureLayer && deltaMask && deltaMask[i] && (state.showDeltas || state.layer === "hydrology")) color = [88, 182, 160];
        if (!pureLayer && riverMask && riverMask[i] && (state.showRivers || state.layer === "hydrology")) {
          color = state.layer === "hydrology" ? [75, 201, 229] : [76, 181, 211];
        }

        // Draw borders as a fine double line: a dark casing protects legibility
        // over every biome, with a quiet warm highlight on the actual frontier.
        // WebGL receives smooth vector lines from the 2x atlas; retain the raster
        // fallback only for browsers where WebGL is unavailable.
        if ((!globe3D || !globe3D.ready) && !pureLayer && borders && (state.showBorders || state.layer === "political")) {
          const left = y * MAP_W + (x - 1 + MAP_W) % MAP_W;
          const right = y * MAP_W + (x + 1) % MAP_W;
          const up = Math.max(0, y - 1) * MAP_W + x;
          const down = Math.min(MAP_H - 1, y + 1) * MAP_W + x;
          const isCore = borders[i] !== 0;
          const upLeft = Math.max(0, y - 1) * MAP_W + (x - 1 + MAP_W) % MAP_W;
          const upRight = Math.max(0, y - 1) * MAP_W + (x + 1) % MAP_W;
          const downLeft = Math.min(MAP_H - 1, y + 1) * MAP_W + (x - 1 + MAP_W) % MAP_W;
          const downRight = Math.min(MAP_H - 1, y + 1) * MAP_W + (x + 1) % MAP_W;
          const neighborCount = Number(!!borders[left]) + Number(!!borders[right]) +
            Number(!!borders[up]) + Number(!!borders[down]) +
            Number(!!borders[upLeft]) + Number(!!borders[upRight]) +
            Number(!!borders[downLeft]) + Number(!!borders[downRight]);
          const borderHalo = !isCore && neighborCount > 0;
          if (isCore) {
            const mix = state.layer === "political" ? 0.52 : 0.32;
            const edge = state.layer === "political" ? [229, 219, 196] : [194, 204, 192];
            color[0] = Math.round(lerp(color[0], edge[0], mix));
            color[1] = Math.round(lerp(color[1], edge[1], mix));
            color[2] = Math.round(lerp(color[2], edge[2], mix));
          } else if (borderHalo) {
            const mix = (state.layer === "political" ? 0.10 : 0.055) + neighborCount * 0.018;
            const casing = state.layer === "political" ? [24, 30, 32] : [22, 31, 32];
            color[0] = Math.round(lerp(color[0], casing[0], mix));
            color[1] = Math.round(lerp(color[1], casing[1], mix));
            color[2] = Math.round(lerp(color[2], casing[2], mix));
          }
        }
        const j = i * 4;
        texturePixels[j] = color[0];
        texturePixels[j + 1] = color[1];
        texturePixels[j + 2] = color[2];
        texturePixels[j + 3] = 255;
      }
    }
    textureCtx.putImageData(textureImage, 0, 0);
    textureRevision++;
    mapData = texturePixels;
    renderGlobeTexture();
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
    canvas.dataset.rotationX = String(state.rotationX);
    canvas.dataset.rotationY = String(state.rotation);
    ctx.clearRect(0, 0, w, h);
    const cx = w * 0.5;
    const cy = h * 0.51;
    const baseRadius = Math.min(w, h) * 0.355;
    const radius = Math.max(35, Math.min(Math.min(w, h) * 0.46, baseRadius * state.zoom));
    if (globe3D && globe3D.ready && globe3D.render(globeTextureCanvas, textureRevision, state.rotation, state.rotationX, radius, w, h, cy, Number(state.seed), activeData.heightField, activeData.threshold)) {
      drawCivilizationGlobe(cx, cy, radius);
      return;
    }
    const glow = ctx.createRadialGradient(cx, cy, radius * 0.55, cx, cy, radius * 1.25);
    glow.addColorStop(0, "rgba(105,119,100,.09)");
    glow.addColorStop(.72, "rgba(103,121,130,.035)");
    glow.addColorStop(1, "rgba(29,94,132,0)");
    ctx.fillStyle = glow;
    ctx.beginPath(); ctx.arc(cx, cy, radius * 1.3, 0, TAU); ctx.fill();
    const halo = ctx.createRadialGradient(cx - radius * .25, cy - radius * .35, radius * .08, cx, cy, radius * 1.08);
    halo.addColorStop(0, "rgba(171,183,158,.075)");
    halo.addColorStop(.82, "rgba(113,132,137,.025)");
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
    const rotation = state.rotation, rotationX = state.rotationX;
    const cosY = Math.cos(rotation), sinY = Math.sin(rotation);
    const cosX = Math.cos(rotationX), sinX = Math.sin(rotationX);
    for (let py = 0; py < diameter; py++) {
      const ny = (r - py - 0.5) / r;
      for (let px = 0; px < diameter; px++) {
        const nx = (px + 0.5 - r) / r;
        const rr = nx * nx + ny * ny;
        const out = (py * diameter + px) * 4;
        if (rr > 1) {
          data[out + 3] = 0;
          continue;
        }
        const nz = Math.sqrt(1 - rr);
        // Convert the screen-space normal back into the planet's local coordinates.
        const yLocal = ny * cosX + nz * sinX;
        const zAfterPitch = -ny * sinX + nz * cosX;
        const xLocal = nx * cosY + zAfterPitch * sinY;
        const zLocal = -nx * sinY + zAfterPitch * cosY;
        const lat = Math.asin(clamp(yLocal, -1, 1));
        const v = clamp(Math.floor((0.5 - lat / Math.PI) * MAP_H), 0, MAP_H - 1);
        const lon = Math.atan2(xLocal, zLocal);
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
    drawCivilizationGlobe(cx, cy, radius);
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
    mapCtx.strokeStyle = "rgba(190,198,180,.08)";
    mapCtx.lineWidth = 1;
    for (let i = 1; i < 6; i++) {
      const x = (w - outW) / 2 + outW * i / 6;
      mapCtx.beginPath(); mapCtx.moveTo(x, (h - outH) / 2); mapCtx.lineTo(x, (h + outH) / 2); mapCtx.stroke();
    }
    for (let i = 1; i < 4; i++) {
      const y = (h - outH) / 2 + outH * i / 4;
      mapCtx.beginPath(); mapCtx.moveTo((w - outW) / 2, y); mapCtx.lineTo((w + outW) / 2, y); mapCtx.stroke();
    }
    mapCtx.strokeStyle = "rgba(190,198,180,.16)";
    mapCtx.strokeRect((w - outW) / 2, (h - outH) / 2, outW, outH);
    drawPoliticalBorders(w, h, outW, outH);
    drawCivilizationMap(w, h, outW, outH);
  }

  function buildBoundaryPolylines(edges) {
    const nodes = new Map();
    const keyFor = point => point[0] + "," + point[1];
    const edgeNodes = [];
    edges.forEach((edge, id) => {
      const a = keyFor(edge[0]), b = keyFor(edge[1]);
      edgeNodes[id] = [a, b];
      for (const [key, point] of [[a, edge[0]], [b, edge[1]]]) {
        if (!nodes.has(key)) nodes.set(key, { point, edges: [] });
        nodes.get(key).edges.push(id);
      }
    });
    const used = new Uint8Array(edges.length), paths = [];
    function trace(startKey, firstEdge) {
      const points = [nodes.get(startKey).point];
      let currentKey = startKey, edgeId = firstEdge, guard = 0;
      while (edgeId !== undefined && !used[edgeId] && guard++ <= edges.length) {
        used[edgeId] = 1;
        const [a, b] = edgeNodes[edgeId], nextKey = a === currentKey ? b : a;
        points.push(nodes.get(nextKey).point);
        if (nextKey === startKey) break;
        const nextNode = nodes.get(nextKey);
        if (nextNode.edges.length !== 2) break;
        const nextEdge = nextNode.edges.find(id => !used[id]);
        if (nextEdge === undefined) break;
        currentKey = nextKey; edgeId = nextEdge;
      }
      if (points.length > 1) paths.push(points);
    }
    for (const [key, node] of nodes) {
      if (node.edges.length === 2) continue;
      for (const edgeId of node.edges) if (!used[edgeId]) trace(key, edgeId);
    }
    for (let edgeId = 0; edgeId < edges.length; edgeId++) if (!used[edgeId]) trace(edgeNodes[edgeId][0], edgeId);
    return paths;
  }

  function buildPoliticalBoundaryPaths(data) {
    const { heightField, territories, threshold } = data;
    if (!heightField || !territories) return [];
    const edges = [];
    const addEdge = (x1, y1, x2, y2) => edges.push([[x1, y1], [x2, y2]]);
    const isLand = index => heightField[index] > threshold && territories[index] !== 255;
    for (let y = 0; y < MAP_H; y++) {
      const row = y * MAP_W, nextRow = Math.min(MAP_H - 1, y + 1) * MAP_W;
      for (let x = 0; x < MAP_W; x++) {
        const index = row + x;
        if (!isLand(index)) continue;
        const right = row + (x + 1) % MAP_W;
        if (isLand(right) && territories[right] !== territories[index]) {
          addEdge(x + 1, y, x + 1, y + 1);
          if (x === MAP_W - 1) addEdge(0, y, 0, y + 1);
        }
        if (y + 1 < MAP_H) {
          const down = nextRow + x;
          if (isLand(down) && territories[down] !== territories[index]) addEdge(x, y + 1, x + 1, y + 1);
        }
      }
    }
    return buildBoundaryPolylines(edges);
  }

  function currentBoundaryPaths(){
    if(vectorBorderCacheRevision!==textureRevision){
      vectorBorderCache=buildPoliticalBoundaryPaths(activeData);
      vectorBorderCacheRevision=textureRevision;
    }
    return vectorBorderCache||[];
  }
  function renderPoliticalPaths(context,paths,width,height,left,top,outW,outH,lineScale,politicalLayer){
    if(!paths||!paths.length)return;
    const drawPaths=()=>{
      context.beginPath();
      for(const points of paths){
        const point=p=>({x:left+p[0]/MAP_W*outW,y:top+p[1]/MAP_H*outH});
        const first=point(points[0]),last=point(points[points.length-1]);
        context.moveTo(first.x,first.y);
        if(points.length===2){context.lineTo(last.x,last.y);continue;}
        for(let i=1;i<points.length-1;i++){
          const current=point(points[i]),next=point(points[i+1]);
          context.quadraticCurveTo(current.x,current.y,(current.x+next.x)/2,(current.y+next.y)/2);
        }
        context.lineTo(last.x,last.y);
      }
      context.stroke();
    };
    context.save();context.lineCap="round";context.lineJoin="round";
    context.strokeStyle="rgba(15,20,17,.90)";context.lineWidth=2.15*lineScale;drawPaths();
    context.strokeStyle=politicalLayer?"rgba(229,219,196,.97)":"rgba(194,204,192,.88)";
    context.lineWidth=(politicalLayer?1.05:.78)*lineScale;drawPaths();
    context.restore();
  }
  function renderGlobeTexture(){
    const width=globeTextureCanvas.width,height=globeTextureCanvas.height;
    globeTextureCtx.clearRect(0,0,width,height);
    globeTextureCtx.drawImage(textureCanvas,0,0,width,height);
    if(!activeData||["heightmap","tectonics","temperature","moisture"].includes(state.layer)||(!state.showBorders&&state.layer!=="political"))return;
    renderPoliticalPaths(globeTextureCtx,currentBoundaryPaths(),width,height,0,0,width,height,2,state.layer==="political");
  }
  function drawPoliticalBorders(w,h,outW,outH){
    if(!activeData||["heightmap","tectonics","temperature","moisture"].includes(state.layer)||(!state.showBorders&&state.layer!=="political"))return;
    const dpr=window.devicePixelRatio||1,left=(w-outW)/2,top=(h-outH)/2;
    renderPoliticalPaths(mapCtx,currentBoundaryPaths(),w,h,left,top,outW,outH,dpr,state.layer==="political");
  }

  function drawCivilizationGlobe(cx, cy, radius) {
    if (!activeData || ["heightmap","tectonics","temperature","moisture"].includes(state.layer) || (!state.showCities && !state.showRoutes)) return;
    const dpr = window.devicePixelRatio || 1;
    const visible = new Map();
    for (const city of activeData.cities || []) {
      const lat = city.lat * Math.PI / 180;
      const lon = city.lon * Math.PI / 180 - state.rotation;
      const cosLat = Math.cos(lat);
      const nx = cosLat * Math.sin(lon), baseY = Math.sin(lat), baseZ = cosLat * Math.cos(lon);
      const ny = baseY * Math.cos(state.rotationX) - baseZ * Math.sin(state.rotationX);
      const nz = baseY * Math.sin(state.rotationX) + baseZ * Math.cos(state.rotationX);
      if (nz > 0.035) visible.set(city.id, { x: cx + nx * radius, y: cy - ny * radius, z: nz, city });
    }

    ctx.save();
    if (state.showRoutes) {
      ctx.lineWidth = 1.25 * dpr;
      ctx.strokeStyle = "rgba(195, 181, 139, .48)";
      ctx.setLineDash([3.5 * dpr, 3 * dpr]);
      ctx.beginPath();
      for (const route of activeData.routes || []) {
        const a = visible.get(route.from), b = visible.get(route.to);
        if (a && b) { ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); }
      }
      ctx.stroke();
      ctx.setLineDash([]);
    }
    if (state.showCities) {
      for (const point of visible.values()) {
        const city = point.city, capital = city.type === "capital";
        const size = (capital ? 3.6 : city.type === "city" ? 2.8 : 2.1) * dpr;
        ctx.beginPath();
        ctx.fillStyle = capital ? "#d8c49a" : city.type === "city" ? "#b7c5ba" : "#aeb8b2";
        ctx.shadowColor = capital ? "rgba(103,255,219,.95)" : "rgba(109,220,238,.6)";
        ctx.shadowBlur = (capital ? 9 : 4) * dpr;
        ctx.arc(point.x, point.y, size, 0, TAU);
        ctx.fill();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = "rgba(7,18,30,.9)";
        ctx.lineWidth = 1 * dpr;
        ctx.stroke();
        if (capital || (city.type === "city" && state.zoom > 0.92)) {
          ctx.font = (10 * dpr) + "px ui-monospace, SFMono-Regular, monospace";
          ctx.textAlign = "left"; ctx.textBaseline = "middle";
          ctx.lineWidth = 3 * dpr; ctx.strokeStyle = "rgba(4,12,22,.92)";
          ctx.strokeText(city.name, point.x + 6 * dpr, point.y - 5 * dpr);
          ctx.fillStyle = "#e2e4d9";
          ctx.fillText(city.name, point.x + 6 * dpr, point.y - 5 * dpr);
        }
      }
    }
    ctx.restore();
  }

  function drawCivilizationMap(w, h, outW, outH) {
    if (!activeData || ["heightmap","tectonics","temperature","moisture"].includes(state.layer) || (!state.showCities && !state.showRoutes)) return;
    const dpr = window.devicePixelRatio || 1;
    const left = (w - outW) / 2, top = (h - outH) / 2;
    const points = new Map((activeData.cities || []).map((city) => [city.id, {
      x: left + (city.x + 0.5) / MAP_W * outW,
      y: top + (city.y + 0.5) / MAP_H * outH,
      city
    }]));
    mapCtx.save();
    if (state.showRoutes) {
      mapCtx.strokeStyle = "rgba(195, 181, 139, .64)";
      mapCtx.lineWidth = 1.15 * dpr;
      mapCtx.setLineDash([4 * dpr, 3 * dpr]);
      mapCtx.beginPath();
      for (const route of activeData.routes || []) {
        const a = points.get(route.from), b = points.get(route.to);
        if (!a || !b || Math.abs(a.x - b.x) > outW / 2) continue;
        mapCtx.moveTo(a.x, a.y); mapCtx.lineTo(b.x, b.y);
      }
      mapCtx.stroke(); mapCtx.setLineDash([]);
    }
    if (state.showCities) {
      for (const point of points.values()) {
        const city = point.city, capital = city.type === "capital";
        const size = (capital ? 3.2 : city.type === "city" ? 2.4 : 1.7) * dpr;
        mapCtx.beginPath();
        mapCtx.fillStyle = capital ? "#d8c49a" : city.type === "city" ? "#b7c5ba" : "#aeb8b2";
        mapCtx.arc(point.x, point.y, size, 0, TAU); mapCtx.fill();
        if (capital || city.type === "city") {
          mapCtx.font = (9 * dpr) + "px ui-monospace, SFMono-Regular, monospace";
          mapCtx.textAlign = "left"; mapCtx.textBaseline = "middle";
          mapCtx.lineWidth = 3 * dpr; mapCtx.strokeStyle = "rgba(4,12,22,.92)";
          mapCtx.strokeText(city.name, point.x + 5 * dpr, point.y - 4 * dpr);
          mapCtx.fillStyle = "#e2e4d9"; mapCtx.fillText(city.name, point.x + 5 * dpr, point.y - 4 * dpr);
        }
      }
    }
    mapCtx.restore();
  }

  function renderCurrentView() {
    if (state.view === "globe") {
      canvas.hidden = false;
      glCanvas.hidden = !globe3D || !globe3D.ready;
      mapCanvas.hidden = true;
      drawGlobe();
    } else {
      canvas.hidden = true;
      glCanvas.hidden = true;
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
    $("cityCountStat").textContent = String((stats.cities || []).length);
    $("countryCountStat").textContent = String(stats.countryCount || 0);
    $("riverCountStat").textContent = Number(stats.riverCount || 0).toLocaleString("ru-RU");
    $("lakeCountStat").textContent = Number(stats.lakeCount || 0).toLocaleString("ru-RU");
    $("deltaCountStat").textContent = Number(stats.deltaCount || 0).toLocaleString("ru-RU");
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
    $("tectonics").value = state.tectonics;
    $("erosion").value = state.erosion;
    $("season").value = state.season;
    $("seaLevelOut").textContent = state.seaLevel + "%";
    $("landmassOut").textContent = (state.landmass > 0 ? "+" : "") + state.landmass;
    $("reliefOut").textContent = ["", "Низкая", "Низкая", "Низкая", "Средняя", "Средняя", "Средняя", "Высокая", "Высокая", "Горная", "Горная"][state.relief] || "Средняя";
    $("temperatureOut").textContent = (state.temperature > 0 ? "+" : "") + state.temperature + " °C";
    $("humidityOut").textContent = state.humidity + "%";
    $("tectonicsOut").textContent = state.tectonics + "%";
    $("erosionOut").textContent = state.erosion + "%";
    $("seasonOut").textContent = state.season < 12.5 || state.season >= 87.5 ? "Северная зима" : state.season < 37.5 ? "Весенний переход" : state.season < 62.5 ? "Северное лето" : "Осенний переход";
    document.querySelectorAll('input[type="range"]').forEach((input) => {
      const min = Number(input.min), max = Number(input.max), val = Number(input.value);
      input.style.setProperty("--range-fill", ((val - min) / (max - min) * 100) + "%");
    });
    document.querySelectorAll(".preset-card").forEach((button) => button.classList.toggle("active", button.dataset.preset === state.preset));
    $("rotationSwitch").classList.toggle("on", state.rotating);
    $("rotateBtn").setAttribute("aria-pressed", String(state.rotating));
    $("mapLayer").value = state.layer;
    $("editBorders").checked = state.editBorders;
    $("editTerrain").checked = state.editTerrain;
    $("terrainBrushMode").value = state.terrainBrush;
    $("terrainBrushSize").value = state.terrainBrushSize;
    $("terrainBrushStrength").value = state.terrainBrushStrength;
    $("terrainBrushSizeOut").textContent = state.terrainBrushSize + " ячеек";
    $("terrainBrushStrengthOut").textContent = state.terrainBrushStrength + "%";
    $("terrainEditorHint").textContent = state.editTerrain ? "Кисть активна: рисуйте по карте мира. Биомы и климат обновятся после завершения мазка." : "Переключитесь на «Карта мира», включите кисть и рисуйте мышью или пальцем.";
    mapCanvas.classList.toggle("painting",state.view==="map"&&(state.editBorders||state.editTerrain));
    mapCanvas.dataset.terrainEditing=String(state.view==="map"&&state.editTerrain);
    state.selectedCountry=resolveCountryId(state.selectedCountry);
    state.borderCountry=resolveCountryId(state.borderCountry);
    $("borderCountrySelect").value = String(state.borderCountry);
    $("borderEditorHint").textContent = state.editBorders ? "Кисть активна: нажмите и ведите по суше на карте." : "Включите кисть и выберите государство, чтобы рисовать границы.";
    $("moveCapitalToggle").checked=state.moveCapital;
    if(activeData&&document.activeElement!==$("countryNameInput"))$("countryNameInput").value=countryDisplayName(activeData,state.selectedCountry);
    mapCanvas.classList.toggle("painting", state.view === "map" && (state.editBorders||state.editTerrain||state.moveCapital));
    $("showRivers").checked = state.showRivers;
    $("showLakes").checked = state.showLakes;
    $("showDeltas").checked = state.showDeltas;
    $("showCities").checked = state.showCities;
    $("showRoutes").checked = state.showRoutes;
    $("showBorders").checked = state.showBorders;
    $("zoomLabel").textContent = Math.round(state.zoom * 100) + "%";
    $("viewModeLabel").textContent = state.view === "globe" ? "PLANET VIEW / 3D RENDER" : "CARTOGRAPHY / EQUIRECTANGULAR";
    updateLegend();
    scheduleAutosave();
  }

  function updateLegend() {
    const labels = {
      biome: [['Океан','#1b5d82'],['Леса','#44805f'],['Пустыни','#c59b57'],['Горы','#b9c2bc'],['Лёд','#cbe8ed']],
      elevation: [['Глубины','#12375a'],['Низменность','#4e8d79'],['Возвышенность','#a28b67'],['Горы','#c5ccc7'],['Вершины','#f6faf7']],
      temperature: [['Холод','#1f407d'],['Прохладно','#7dbdb7'],['Умеренно','#b3cb8f'],['Жарко','#d97d4d'],['Экстремум','#97373e']],
      moisture: [['Засуха','#976b43'],['Сухо','#c29b5b'],['Умеренно','#afb869'],['Влажно','#369281'],['Очень влажно','#2e70a3']],
      heightmap: [['Минимальная высота','#252525'],['Низина','#696969'],['Плато','#adadad'],['Горы','#e2e2e2']],
      tectonics: [['Спокойная кора','#1f4250'],['Плиты','#467874'],['Сжатие','#b58b55'],['Активная граница','#ef463f']],
      hydrology: [['Океан','#12375a'],['Озёра','#2a7faa'],['Дельты','#58b6a0'],['Реки','#4bc9e5'],['Возвышенность','#a28b67']],
      political: [['Территория A','#378494'],['Территория B','#7767ac'],['Территория C','#a97943'],['Границы','#c4e1e3'],['Поселения','#d8c49a']]
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
    if(view!=="map"){state.editBorders=false;state.editTerrain=false;}
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
    exportMenu.innerHTML = '<strong>ЭКСПОРТ МИРА</strong><button data-export="png"><span>▧</span><i><b>PNG-карта · 512 × 256</b><small>Быстрый вариант</small></i></button><button data-export="png2k"><span>2K</span><i><b>PNG · 2048 × 1024</b><small>Новая процедурная детализация в Worker</small></i></button><button data-export="png4k"><span>4K</span><i><b>PNG · 4096 × 2048</b><small>Новая процедурная детализация в Worker</small></i></button><button data-export="heightmap"><span>HM</span><i><b>Heightmap PNG · 512 × 256</b><small>8-bit preview</small></i></button><button data-export="zip"><span>ZIP</span><i><b>Полный набор ресурсов</b><small>8 карт, JSON проекта и CSV-данные</small></i></button><button data-export="json"><span>{ }</span><i><b>JSON-проект</b><small>Настройки, города и seed</small></i></button><button data-export="csv"><span>▤</span><i><b>CSV-статистика</b><small>Доли поверхности по биомам</small></i></button><button data-export="geo"><span>⌖</span><i><b>CSV-география</b><small>Координаты городов и торговых путей</small></i></button>';
    $("exportBtn").parentElement.style.position = "relative";
    $("exportBtn").parentElement.appendChild(exportMenu);
    exportMenu.addEventListener("click", (event) => {
      const button = event.target.closest("[data-export]");
      if (!button) return;
      const type = button.dataset.export;
      exportMenu.remove(); exportMenu = null;
      if (type === "png") exportPNG(1);
      if (type === "png2k") exportNativePNG(4);
      if (type === "png4k") exportNativePNG(8);
      if (type === "heightmap") exportHeightmapPNG();
      if (type === "zip") exportResourcePackZip();
      if (type === "json") exportJSON();
      if (type === "csv") exportCSV();
      if (type === "geo") exportGeographyCSV();
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
  function exportPNG(scale=1,sourceTexture=textureCanvas,renderState=state,renderData=activeData){
    if(!renderData)return;scale=[1,4,8].includes(Number(scale))?Number(scale):1;
    const output=document.createElement("canvas");output.width=MAP_W*scale;output.height=MAP_H*scale;
    const out=output.getContext("2d");out.drawImage(sourceTexture,0,0,output.width,output.height);
    if(sourceTexture===textureCanvas&&renderData&&renderState.showBorders&&!["heightmap","tectonics","temperature","moisture"].includes(renderState.layer)&&activeData){
      const paths=buildPoliticalBoundaryPaths(activeData);
      renderPoliticalPaths(out,paths,output.width,output.height,0,0,output.width,output.height,scale,renderState.layer==="political");
    }
    const points=new Map((renderData.cities||[]).map(city=>[city.id,{x:(city.x+.5)*scale,y:(city.y+.5)*scale,city}]));
    const includeOverlays=!["heightmap","tectonics","temperature","moisture"].includes(renderState.layer);
    if(includeOverlays&&renderState.showRoutes){out.strokeStyle="rgba(195,181,139,.72)";out.lineWidth=1.1*scale;out.setLineDash([2.6*scale,2.2*scale]);out.beginPath();for(const route of renderData.routes||[]){const a=points.get(route.from),b=points.get(route.to);if(!a||!b||Math.abs(a.x-b.x)>output.width/2)continue;out.moveTo(a.x,a.y);out.lineTo(b.x,b.y);}out.stroke();out.setLineDash([]);}
    if(includeOverlays&&renderState.showCities)for(const p of points.values()){const city=p.city,capital=city.type==="capital";out.beginPath();out.fillStyle=capital?"#d8c49a":city.type==="city"?"#b7c5ba":"#aeb8b2";out.arc(p.x,p.y,(capital?2.2:city.type==="city"?1.7:1.1)*scale,0,TAU);out.fill();if(capital||city.type==="city"){out.font=(6*scale)+"px ui-monospace, monospace";out.lineWidth=1.7*scale;out.strokeStyle="rgba(4,12,22,.92)";out.strokeText(city.name,p.x+3*scale,p.y-2.5*scale);out.fillStyle="#e2e4d9";out.fillText(city.name,p.x+3*scale,p.y-2.5*scale);}}
    output.toBlob(blob=>{if(blob){downloadBlob(blob,cleanFileName(renderState.name)+"-"+scale+"x-"+renderState.layer+".png");$("statusText").textContent="Экспорт готов";showToast("PNG экспортирован: "+output.width+" × "+output.height);}else showToast("Не удалось экспортировать PNG");},"image/png");
  }
  function exportNativePNG(scale){
    if(!activeData)return;
    const width=MAP_W*scale,height=MAP_H*scale,jobId=++exportJobSequence;
    const snapshotState={...state},snapshotData={cities:(activeData.cities||[]).map(city=>({...city})),routes:(activeData.routes||[]).map(route=>({...route}))};
    const settings={...terrainSettings(),width,height,seed:Number(state.seed)>>>0};
    const options={baseWidth:MAP_W,baseHeight:MAP_H,layer:state.layer,showRivers:state.showRivers,showLakes:state.showLakes,showDeltas:state.showDeltas,showBorders:state.showBorders,
      riverMask:activeData.riverMask?activeData.riverMask.slice():null,lakeMask:activeData.lakeMask?activeData.lakeMask.slice():null,deltaMask:activeData.deltaMask?activeData.deltaMask.slice():null,territories:activeData.territories?activeData.territories.slice():null,borders:activeData.borders?activeData.borders.slice():null};
    if(exportWorker){exportWorker.terminate();exportWorker=null;}
    try{
      const worker=new Worker("assets/js/export-worker.js");exportWorker=worker;
      $("statusText").textContent="Генерируем детальную карту "+width+" × "+height+"…";
      showToast("Экспорт высокого разрешения выполняется отдельно от интерфейса");
      worker.onmessage=event=>{
        const result=event.data||{};if(result.jobId!==jobId||exportWorker!==worker)return;
        exportWorker=null;worker.terminate();
        if(result.error){$("statusText").textContent="Ошибка экспорта";showToast("Не удалось создать детальную карту: "+result.error);return;}
        try{
          const source=document.createElement("canvas");source.width=result.width;source.height=result.height;
          const sourceCtx=source.getContext("2d",{alpha:false}),imageData=sourceCtx.createImageData(result.width,result.height);
          imageData.data.set(new Uint8ClampedArray(result.pixels));sourceCtx.putImageData(imageData,0,0);
          exportPNG(scale,source,snapshotState,snapshotData);
        }catch(error){console.error(error);$("statusText").textContent="Ошибка экспорта";showToast("Не удалось подготовить PNG");}
      };
      worker.onerror=()=>{
        if(exportWorker!==worker)return;exportWorker=null;worker.terminate();$("statusText").textContent="Резервный экспорт";
        showToast("Worker экспорта недоступен; будет сохранена увеличенная текущая карта");exportPNG(scale,textureCanvas,snapshotState,snapshotData);
      };
      worker.postMessage({jobId,settings,options});
    }catch(error){
      console.warn("Native-resolution exporter unavailable",error);
      if(exportWorker){exportWorker.terminate();exportWorker=null;}
      showToast("Worker недоступен; будет сохранена увеличенная текущая карта");exportPNG(scale,textureCanvas,snapshotState,snapshotData);
    }
  }
  function exportGeographyCSV(){
    if(!activeData)return;const lines=["record_type,id,name,latitude,longitude,country_id,from_id,to_id,population"];
    for(const city of activeData.cities||[])lines.push(["city",city.id,'"'+String(city.name).replace(/"/g,'""')+'"',city.lat.toFixed(5),city.lon.toFixed(5),city.countryId,"","",city.population||0].join(","));
    for(const route of activeData.routes||[])lines.push(["trade_route","","","","",route.countryId,route.from,route.to,""].join(","));
    downloadBlob(new Blob(["\uFEFF"+lines.join("\r\n")],{type:"text/csv;charset=utf-8"}),cleanFileName(state.name)+"-geography.csv");showToast("География экспортирована в CSV");
  }
  function projectJSON() {
    return {
      format: "planetforge-world",
      version: 4,
      name: state.name,
      seed: Number(state.seed),
      preset: state.preset,
      settings: { seaLevel: state.seaLevel, landmass: state.landmass, relief: state.relief, temperature: state.temperature, humidity: state.humidity, tectonics: state.tectonics, erosion: state.erosion, season: state.season },
      civilizationSeed: Number(state.civilizationSeed),
      customCities: state.customCities,
      cityNames: state.cityNames,
      customTerritories: state.customTerritories,
      countryNames: state.countryNames,
      countryMerges: state.countryMerges,
      countryCapitals: state.countryCapitals,
      customHeightOverrides: state.customHeightOverrides,
      terrainBrush: { mode: state.terrainBrush, size: state.terrainBrushSize, strength: state.terrainBrushStrength },
      view: { layer: state.layer, zoom: state.zoom, showRivers: state.showRivers, showLakes: state.showLakes, showDeltas: state.showDeltas, showCities: state.showCities, showRoutes: state.showRoutes, showBorders: state.showBorders, editBorders: state.editBorders, editTerrain: state.editTerrain, borderCountry: state.borderCountry, selectedCountry: state.selectedCountry, moveCapital: state.moveCapital },
      exportedAt: new Date().toISOString()
    };
  }
  function exportJSON() {
    const blob = new Blob([JSON.stringify(projectJSON(), null, 2)], { type: "application/json;charset=utf-8" });
    downloadBlob(blob, cleanFileName(state.name) + ".planetforge.json");
    showToast("Проект сохранён в JSON");
  }
  function zipStoredFiles(entries){
    const encoder=new TextEncoder(),localParts=[],centralParts=[];let offset=0;
    const crc32=bytes=>{let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let bit=0;bit<8;bit++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;};
    for(const entry of entries){
      const name=encoder.encode(entry.name),data=entry.bytes instanceof Uint8Array?entry.bytes:new Uint8Array(entry.bytes),crc=crc32(data);
      const local=new Uint8Array(30+name.length),lv=new DataView(local.buffer);
      lv.setUint32(0,0x04034b50,true);lv.setUint16(4,20,true);lv.setUint16(6,0x0800,true);lv.setUint16(8,0,true);lv.setUint16(10,0,true);lv.setUint16(12,0x21,true);
      lv.setUint32(14,crc,true);lv.setUint32(18,data.length,true);lv.setUint32(22,data.length,true);lv.setUint16(26,name.length,true);lv.setUint16(28,0,true);local.set(name,30);
      localParts.push(local,data);
      const central=new Uint8Array(46+name.length),cv=new DataView(central.buffer);
      cv.setUint32(0,0x02014b50,true);cv.setUint16(4,20,true);cv.setUint16(6,20,true);cv.setUint16(8,0x0800,true);cv.setUint16(10,0,true);cv.setUint16(12,0,true);cv.setUint16(14,0x21,true);
      cv.setUint32(16,crc,true);cv.setUint32(20,data.length,true);cv.setUint32(24,data.length,true);cv.setUint16(28,name.length,true);cv.setUint16(30,0,true);cv.setUint16(32,0,true);cv.setUint16(34,0,true);cv.setUint16(36,0,true);cv.setUint32(38,0,true);cv.setUint32(42,offset,true);central.set(name,46);
      centralParts.push(central);offset+=local.length+data.length;
    }
    const centralOffset=offset,centralSize=centralParts.reduce((sum,part)=>sum+part.length,0),end=new Uint8Array(22),ev=new DataView(end.buffer);
    ev.setUint32(0,0x06054b50,true);ev.setUint16(4,0,true);ev.setUint16(6,0,true);ev.setUint16(8,entries.length,true);ev.setUint16(10,entries.length,true);ev.setUint32(12,centralSize,true);ev.setUint32(16,centralOffset,true);ev.setUint16(20,0,true);
    const zip=new Uint8Array(offset+centralSize+end.length);let cursor=0;
    for(const part of localParts){zip.set(part,cursor);cursor+=part.length;}
    for(const part of centralParts){zip.set(part,cursor);cursor+=part.length;}
    zip.set(end,cursor);return zip;
  }
  async function canvasPNGBytes(width,height,pixels){
    const canvas=document.createElement("canvas");canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext("2d",{alpha:false}),image=ctx.createImageData(width,height);
    image.data.set(new Uint8ClampedArray(pixels));ctx.putImageData(image,0,0);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,"image/png"));
    if(!blob)throw new Error("PNG conversion failed");
    return new Uint8Array(await blob.arrayBuffer());
  }
  function buildBiomeCSV(){
    const total=MAP_W*MAP_H,lines=["biome_id,biome,share_percent,pixel_count"];
    activeData.counts.forEach((count,id)=>lines.push([id,'"'+BIOMES[id].name.replace(/"/g,'""')+'"',(count/total*100).toFixed(3),count].join(",")));
    return "\uFEFF"+lines.join("\r\n");
  }
  function buildGeographyCSV(){
    const lines=["record_type,id,name,latitude,longitude,country_id,from_id,to_id,population"];
    for(const city of activeData.cities||[])lines.push(["city",city.id,'"'+String(city.name).replace(/"/g,'""')+'"',city.lat.toFixed(5),city.lon.toFixed(5),city.countryId,"","",city.population||0].join(","));
    for(const route of activeData.routes||[])lines.push(["trade_route","","","","",route.countryId,route.from,route.to,""].join(","));
    return "\uFEFF"+lines.join("\r\n");
  }
  function buildHeightmap16Raw(){
    const field=activeData.heightField;let min=Infinity,max=-Infinity;
    for(const value of field){if(value<min)min=value;if(value>max)max=value;}
    const range=Math.max(1e-9,max-min),bytes=new Uint8Array(field.length*2),view=new DataView(bytes.buffer);
    for(let i=0;i<field.length;i++)view.setUint16(i*2,Math.round(clamp((field[i]-min)/range,0,1)*65535),false);
    return{bytes,min,max,seaLevelSample:Math.round(clamp((activeData.threshold-min)/range,0,1)*65535)};
  }
  function buildNormalMapPixels(){
    const field=activeData.heightField,pixels=new Uint8ClampedArray(field.length*4);
    for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++){
      const i=y*MAP_W+x,left=y*MAP_W+(x-1+MAP_W)%MAP_W,right=y*MAP_W+(x+1)%MAP_W;
      const up=Math.max(0,y-1)*MAP_W+x,down=Math.min(MAP_H-1,y+1)*MAP_W+x;
      let nx=(field[left]-field[right])*18,ny=(field[up]-field[down])*18,nz=1;
      const length=Math.sqrt(nx*nx+ny*ny+nz*nz)||1;nx/=length;ny/=length;nz/=length;
      const p=i*4;pixels[p]=Math.round((nx*.5+.5)*255);pixels[p+1]=Math.round((ny*.5+.5)*255);pixels[p+2]=Math.round((nz*.5+.5)*255);pixels[p+3]=255;
    }
    return pixels;
  }
  function buildBiomeIndexPixels(){
    const pixels=new Uint8ClampedArray(activeData.biome.length*4);
    for(let i=0;i<activeData.biome.length;i++){const p=i*4;pixels[p]=activeData.biome[i];pixels[p+1]=0;pixels[p+2]=0;pixels[p+3]=255;}
    return pixels;
  }
  function buildLandWaterMaskPixels(){
    const pixels=new Uint8ClampedArray(activeData.heightField.length*4);
    for(let i=0;i<activeData.heightField.length;i++){const value=activeData.heightField[i]>activeData.threshold?255:0,p=i*4;pixels[p]=pixels[p+1]=pixels[p+2]=value;pixels[p+3]=255;}
    return pixels;
  }
  async function exportResourcePackZip(){
    if(!activeData){showToast("Мир ещё не готов к экспорту");return;}
    if(exportWorker){exportWorker.terminate();exportWorker=null;}
    const jobId=++exportJobSequence,worker=new Worker("assets/js/export-worker.js");exportWorker=worker;
    const layers=["biome","elevation","heightmap","tectonics","temperature","moisture","hydrology","political"];
    const settings={...terrainSettings(),width:MAP_W,height:MAP_H,seed:Number(state.seed)>>>0};
    const options={baseWidth:MAP_W,baseHeight:MAP_H,showRivers:state.showRivers,showLakes:state.showLakes,showDeltas:state.showDeltas,showBorders:state.showBorders,
      riverMask:activeData.riverMask?activeData.riverMask.slice():null,lakeMask:activeData.lakeMask?activeData.lakeMask.slice():null,deltaMask:activeData.deltaMask?activeData.deltaMask.slice():null,
      territories:activeData.territories?activeData.territories.slice():null,borders:activeData.borders?activeData.borders.slice():null};
    const project=JSON.stringify(projectJSON(),null,2),biomeCSV=buildBiomeCSV(),geographyCSV=buildGeographyCSV();
    $("statusText").textContent="Готовим архив ресурсов…";showToast("Создаём 8 карт в отдельном Worker");
    worker.onerror=()=>{if(exportWorker!==worker)return;exportWorker=null;worker.terminate();$("statusText").textContent="Ошибка экспорта";showToast("Не удалось создать архив ресурсов");};
    worker.onmessage=async event=>{
      const result=event.data||{};if(result.jobId!==jobId||exportWorker!==worker)return;
      exportWorker=null;worker.terminate();
      if(result.error||!Array.isArray(result.layers)){showToast("Не удалось сгенерировать карты для архива");return;}
      try{
        const encoder=new TextEncoder(),elevation16=buildHeightmap16Raw();
        const [normalPNG,biomeIndexPNG,landWaterPNG]=await Promise.all([
          canvasPNGBytes(MAP_W,MAP_H,buildNormalMapPixels()),
          canvasPNGBytes(MAP_W,MAP_H,buildBiomeIndexPixels()),
          canvasPNGBytes(MAP_W,MAP_H,buildLandWaterMaskPixels())
        ]);
        const manifest={
          format:"planetforge-resource-pack",version:1,worldName:state.name,seed:Number(state.seed),
          resolution:{width:MAP_W,height:MAP_H},projection:"equirectangular",
          orientation:{row0:"90 degrees north",column0:"180 degrees west",longitudeWrap:true},
          heightmap16:{file:"heightmap16.raw",sampleType:"unsigned 16-bit integer",byteOrder:"big-endian",normalization:"(elevation-min)/(max-min)",min:elevation16.min,max:elevation16.max,seaLevelSample:elevation16.seaLevelSample},
          normalMap:{file:"normal-map.png",channels:"RGB tangent-space normal; +X east, +Y north, +Z outward"},
          biomeIndex:{file:"biome-index.png",channel:"R contains biome ID",biomes:BIOMES.map((biome,id)=>({id,name:biome.name}))},
          landWaterMask:{file:"land-water-mask.png",channel:"RGB; white=land, black=water"},
          terrain:{seaLevelThreshold:activeData.threshold,manualHeightCells:Object.keys(state.customHeightOverrides).length}
        };
        const entries=[
          {name:"planetforge-world.json",bytes:encoder.encode(project)},
          {name:"planetforge-manifest.json",bytes:encoder.encode(JSON.stringify(manifest,null,2))},
          {name:"biome-statistics.csv",bytes:encoder.encode(biomeCSV)},
          {name:"cities-and-trade-routes.csv",bytes:encoder.encode(geographyCSV)},
          {name:"heightmap16.raw",bytes:elevation16.bytes},
          {name:"normal-map.png",bytes:normalPNG},
          {name:"biome-index.png",bytes:biomeIndexPNG},
          {name:"land-water-mask.png",bytes:landWaterPNG},
          {name:"README.txt",bytes:encoder.encode("PlanetForge resource pack\n\nEight thematic PNG layers plus RAW16 elevation, tangent-space normals, a biome-ID mask and a land/water mask.\nRead planetforge-manifest.json for coordinate orientation, value ranges, sea level and biome IDs.\nRAW16 values are unsigned big-endian samples normalized linearly to the elevation range.\nAll files are generated locally in the browser.\n")}
        ];
        for(const layer of result.layers)entries.push({name:layer.layer+".png",bytes:await canvasPNGBytes(layer.width,layer.height,layer.pixels)});
        const zip=zipStoredFiles(entries);
        downloadBlob(new Blob([zip],{type:"application/zip"}),cleanFileName(state.name)+"-planetforge-resources.zip");
        $("statusText").textContent="Архив ресурсов готов";showToast("ZIP готов: 12 карт/масок, RAW16, manifest, JSON и CSV");
      }catch(error){console.error(error);$("statusText").textContent="Ошибка архива";showToast("Не удалось упаковать ресурсы в ZIP");}
    };
    worker.postMessage({jobId,settings,layers,options});
  }
  function exportHeightmapPNG(){
    if(!activeData)return;
    const field=activeData.heightField,width=MAP_W,height=MAP_H,output=document.createElement("canvas");
    output.width=width;output.height=height;
    const context=output.getContext("2d",{alpha:false}),image=context.createImageData(width,height);
    let min=Infinity,max=-Infinity;
    for(const value of field){if(value<min)min=value;if(value>max)max=value;}
    const threshold=activeData.threshold,below=Math.max(.000001,threshold-min),above=Math.max(.000001,max-threshold);
    for(let i=0;i<field.length;i++){
      const h=field[i],gray=h<=threshold?Math.round(clamp((h-min)/below,0,1)*127):128+Math.round(clamp((h-threshold)/above,0,1)*127),out=i*4;
      image.data[out]=image.data[out+1]=image.data[out+2]=gray;image.data[out+3]=255;
    }
    context.putImageData(image,0,0);
    output.toBlob(blob=>{if(blob){downloadBlob(blob,cleanFileName(state.name)+"-heightmap.png");showToast("Heightmap PNG экспортирован · 512 × 256");}else showToast("Не удалось экспортировать heightmap");},"image/png");
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
    const world = { id: String(Date.now()) + "-" + String(Math.floor(Math.random() * 100000)), ...projectJSON(), savedAt: new Date().toISOString(), stats: stats ? { landPercent: Number(stats.landPercent.toFixed(2)), meanTemp: Number(stats.meanTemp.toFixed(1)), uniqueBiomes: stats.uniqueBiomes } : null };
    const worlds=readSavedWorlds(),matching=worlds.filter(item=>item.seed===world.seed&&item.name===world.name);
    world.revision=matching.length?Math.max(...matching.map(item=>Number(item.revision)||1))+1:1;
    worlds.unshift(world);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(worlds.slice(0,30)));
      showToast("Снимок v"+world.revision+" мира «"+world.name+"» сохранён в локальный архив");
    } catch (_) {
      showToast("Не удалось сохранить: хранилище браузера недоступно");
    }
  }
  function renderGalleryWorlds() {
    const list=$("galleryWorldsList"),query=$("gallerySearch").value.trim().toLocaleLowerCase(),category=$("galleryCategory").value;
    const worlds=GALLERY_WORLDS.map((world,index)=>({...world,index})).filter(world=>
      (category==="all"||world.category===category)&&
      (!query||(world.name+" "+world.seed+" "+world.category+" "+world.description).toLocaleLowerCase().includes(query))
    );
    $("galleryResultsSummary").textContent=worlds.length+" из "+GALLERY_WORLDS.length+" миров";
    if(!worlds.length){list.innerHTML='<div class="gallery-empty">Нет планет по этому запросу. Измените поиск или тип мира.</div>';return;}
    list.innerHTML=worlds.map(world=>
      '<article class="gallery-card">' +
        '<div class="gallery-preview gallery-orb-' + world.orb + '"><span class="gallery-orb"></span><span class="gallery-starfield"></span><span class="gallery-category">' + escapeHTML(world.category) + '</span></div>' +
        '<div class="gallery-card-copy"><div class="gallery-card-title"><strong>' + escapeHTML(world.name) + '</strong><small>SEED ' + world.seed + '</small></div>' +
        '<p>' + escapeHTML(world.description) + '</p>' +
        '<button class="button button-quiet gallery-load-button" data-gallery-index="' + world.index + '" type="button">Открыть мир</button></div></article>'
    ).join("");
  }
  function openGalleryDialog() {
    renderGalleryWorlds();
    $("galleryDialog").showModal();
  }
    function loadGalleryWorld(index) {
    const world = GALLERY_WORLDS[index];
    if (!world || !PRESETS[world.preset]) return;
    checkpointHistory();
    state.name = world.name;
    state.seed = world.seed;
    state.customHeightOverrides = {};
    state.preset = world.preset;
    Object.assign(state, PRESETS[world.preset]);
    state.civilizationSeed = (world.seed ^ 0x51ed1234) >>> 0;
    state.customCities = [];
    state.customTerritories = {};
    state.cityNames = {};
    resetCountryEdits();
    state.layer = "biome";
    state.view = "globe";
    state.rotation = 0;
    state.rotationX = 0;
    state.zoom = 1;
    updateInterface();
    setView("globe");
    $("galleryDialog").close();
    scheduleGenerate();
    showToast("Открываем мир «" + world.name + "»");
  }
  function comparisonStats(input){
    const defaults=PRESETS[input.preset]||PRESETS.temperate,settings=input.settings||input;
    const fields=window.PlanetForgeGenerator.generateFields({width:128,height:64,seed:normalizeSeed(input.seed),...defaults,...settings});
    const size=fields.width*fields.height,landPercent=fields.landCount/size*100;
    return{name:String(input.name||"Безымянный мир"),seed:normalizeSeed(input.seed),landPercent,waterPercent:100-landPercent,meanTemp:fields.totalTemp/size,uniqueBiomes:Array.from(fields.counts).filter(count=>count>size*.0001).length};
  }
  function fillCompareCard(prefix,world){
    $(prefix+"Name").textContent=world.name;
    $(prefix+"Seed").textContent="SEED "+world.seed;
    $(prefix+"Land").textContent=world.landPercent.toFixed(1)+"%";
    $(prefix+"Water").textContent=world.waterPercent.toFixed(1)+"%";
    $(prefix+"Temp").textContent=world.meanTemp.toFixed(1)+" °C";
    $(prefix+"Biomes").textContent=String(world.uniqueBiomes);
  }
  function renderComparison(){
    if(!window.PlanetForgeGenerator)return;
    const current=comparisonStats(projectJSON()),value=$("compareTarget").value;
    let target=null;
    if(value.startsWith("saved:")){
      const saved=readSavedWorlds().find(world=>String(world.id)===value.slice(6));
      if(saved)target=comparisonStats(saved);
    }else if(value.startsWith("gallery:")){
      const world=GALLERY_WORLDS[Number(value.slice(8))];
      if(world)target=comparisonStats({...world,settings:PRESETS[world.preset]});
    }
    if(!target){$("compareSummary").textContent="Выберите доступный мир для сравнения.";return;}
    fillCompareCard("compareCurrent",current);fillCompareCard("compareTarget",target);
    const delta=current.landPercent-target.landPercent;
    $("compareSummary").textContent=(delta>=0?"У текущего мира суши больше на ":"У текущего мира суши меньше на ")+Math.abs(delta).toFixed(1)+" п. п. · Сетка 128 × 64 для обоих миров.";
  }
  function openCompareDialog(){
    const select=$("compareTarget"),saved=readSavedWorlds().filter(world=>!(Number(world.seed)===Number(state.seed)&&world.name===state.name));
    const options=[];
    saved.forEach(world=>options.push({value:"saved:"+world.id,label:"Сохранённый · "+String(world.name||"Безымянный мир")+" · "+Number(world.seed)}));
    GALLERY_WORLDS.forEach((world,index)=>{if(Number(world.seed)!==Number(state.seed))options.push({value:"gallery:"+index,label:"Пример · "+world.name+" · "+world.seed});});
    select.innerHTML=options.map(option=>'<option value="'+escapeHTML(option.value)+'">'+escapeHTML(option.label)+'</option>').join("");
    if(!options.length){$("compareSummary").textContent="Нет доступных миров для сравнения.";return;}
    select.value=options[0].value;renderComparison();$("compareDialog").showModal();
  }
  function openSavedDialog() {
    drawSavedWorlds();
    $("savedDialog").showModal();
  }
  function drawSavedWorlds() {
    const worlds=readSavedWorlds(),list=$("savedWorldsList"),query=$("savedSearch").value.trim().toLocaleLowerCase();
    if(!worlds.length){
      list.innerHTML='<div class="empty-archive"><strong>Архив пока пуст</strong>Сохраните планету, чтобы она появилась здесь.<br>Миры остаются на этом устройстве.</div>';
      return;
    }
    const filtered=worlds.filter(world=>(String(world.name||"").toLocaleLowerCase().includes(query)||String(world.seed).includes(query)||("v"+(world.revision||1)).includes(query)));
    if(!filtered.length){list.innerHTML='<div class="empty-archive"><strong>Ничего не найдено</strong>Измените запрос или очистите поле поиска.</div>';return;}
    list.innerHTML=filtered.map(world=>{
      const date=world.savedAt?new Date(world.savedAt).toLocaleDateString():"";
      return '<div class="saved-item"><span class="saved-thumb"></span><div class="saved-item-main"><strong>'+escapeHTML(world.name||"Безымянный мир")+' <small class="snapshot-version">v'+Number(world.revision||1)+'</small></strong><small>SEED '+Number(world.seed)+' · '+date+'</small></div><div class="saved-item-actions"><button data-load="'+escapeHTML(world.id)+'">Открыть</button><button data-delete="'+escapeHTML(world.id)+'" aria-label="Удалить сохранённый снимок">×</button></div></div>';
    }).join("");
    list.querySelectorAll("[data-load]").forEach(button=>button.addEventListener("click",()=>{
      const world=readSavedWorlds().find(item=>item.id===button.dataset.load);if(!world)return;
      restoreProject(world);$("savedDialog").close();showToast("Загружен снимок v"+Number(world.revision||1)+" мира «"+state.name+"»");
    }));
    list.querySelectorAll("[data-delete]").forEach(button=>button.addEventListener("click",()=>{
      const worldsNow=readSavedWorlds().filter(item=>item.id!==button.dataset.delete);
      localStorage.setItem(STORAGE_KEY,JSON.stringify(worldsNow));drawSavedWorlds();showToast("Снимок удалён");
    }));
  }
  function restoreProject(input) {
    const settings = input.settings || input;
    state.name = String(input.name || "Untitled World").slice(0, 48);
    state.seed = normalizeSeed(input.seed);
    state.civilizationSeed = input.civilizationSeed === undefined ? ((state.seed ^ 0x51ed1234) >>> 0) : normalizeSeed(input.civilizationSeed);
    state.preset = PRESETS[input.preset] ? input.preset : "custom";
    state.seaLevel = clampInt(settings.seaLevel, 34, 67, 50);
    state.landmass = clampInt(settings.landmass, -12, 12, 0);
    state.relief = clampInt(settings.relief, 1, 10, 5);
    state.temperature = clampInt(settings.temperature, -40, 40, 0);
    state.humidity = clampInt(settings.humidity, 0, 100, 50);
    state.tectonics = clampInt(settings.tectonics, 0, 100, 56);
    state.erosion = clampInt(settings.erosion, 0, 100, 28);
    state.season = clampInt(settings.season, 0, 100, 50);
    state.customCities = Array.isArray(input.customCities) ? input.customCities.slice(0,100).filter(city=>city&&typeof city==="object").map((city,index)=>({id:String(city.id||index),name:String(city.name||"New Haven").slice(0,48),x:clampInt(city.x,0,MAP_W-1,0),y:clampInt(city.y,0,MAP_H-1,0)})) : [];
    state.customHeightOverrides = {};
    if(input.customHeightOverrides&&typeof input.customHeightOverrides==="object"&&!Array.isArray(input.customHeightOverrides)){
      let accepted=0;
      for(const [key,value] of Object.entries(input.customHeightOverrides)){
        if(accepted>=18000)break;
        const index=Number(key),elevation=Number(value);
        if(/^\d+$/.test(key)&&index>=0&&index<MAP_W*MAP_H&&Number.isFinite(elevation)){
          state.customHeightOverrides[key]=Number(clamp(elevation,0,1.15).toFixed(5));accepted++;
        }
      }
    }
    const brush=input.terrainBrush||{};
    state.terrainBrush=["raise","lower","smooth","plateau","crater","land","water"].includes(brush.mode)?brush.mode:"raise";
    state.terrainBrushSize=clampInt(brush.size,2,28,8);
    state.terrainBrushStrength=clampInt(brush.strength,5,100,45);
    state.countryNames={};
    if(input.countryNames&&typeof input.countryNames==="object"&&!Array.isArray(input.countryNames))Object.entries(input.countryNames).slice(0,32).forEach(([key,value])=>{if(/^\d+$/.test(key)&&Number(key)<32)state.countryNames[key]=String(value||"").trim().slice(0,48);});
    state.countryMerges={};
    if(input.countryMerges&&typeof input.countryMerges==="object"&&!Array.isArray(input.countryMerges))Object.entries(input.countryMerges).slice(0,32).forEach(([key,value])=>{const source=Number(key),target=Number(value);if(/^\d+$/.test(key)&&Number.isInteger(source)&&source>=0&&source<32&&Number.isInteger(target)&&target>=0&&target<32&&source!==target)state.countryMerges[String(source)]=target;});
    state.countryCapitals={};
    if(input.countryCapitals&&typeof input.countryCapitals==="object"&&!Array.isArray(input.countryCapitals))Object.entries(input.countryCapitals).slice(0,32).forEach(([key,value])=>{const id=Number(key);if(/^\d+$/.test(key)&&id>=0&&id<32&&value&&typeof value==="object")state.countryCapitals[key]={x:clampInt(value.x,0,MAP_W-1,0),y:clampInt(value.y,0,MAP_H-1,0)};});
    state.customTerritories = {};
    if(input.customTerritories&&typeof input.customTerritories==="object"&&!Array.isArray(input.customTerritories)){
      Object.entries(input.customTerritories).slice(0,MAP_W*MAP_H).forEach(([key,value])=>{
        const index=Number(key),country=Number(value);
        if(/^\d+$/.test(key)&&index>=0&&index<MAP_W*MAP_H&&Number.isInteger(country)&&country>=0&&country<32)state.customTerritories[key]=country;
      });
    }
    state.editBorders = !!(input.view&&input.view.editBorders);
    state.editTerrain = !!(input.view&&input.view.editTerrain);
    state.moveCapital = !!(input.view&&input.view.moveCapital);
    if(state.editTerrain&&state.editBorders)state.editBorders=false;
    if(state.moveCapital){state.editBorders=false;state.editTerrain=false;}
    state.selectedCountry = clampInt(input.view&&input.view.selectedCountry,0,31,0);
    state.borderCountry = clampInt(input.view&&input.view.borderCountry,0,31,0);
    state.cityNames = {};
    if(input.cityNames&&typeof input.cityNames==="object"&&!Array.isArray(input.cityNames))Object.keys(input.cityNames).slice(0,100).forEach(key=>{if(/^\d+$/.test(key))state.cityNames[key]=String(input.cityNames[key]).slice(0,48);});
    state.layer = input.view && ["biome", "elevation", "heightmap", "tectonics", "temperature", "moisture", "hydrology", "political"].includes(input.view.layer) ? input.view.layer : "biome";
    state.zoom = input.view && Number.isFinite(input.view.zoom) ? clamp(input.view.zoom, .65, 1.55) : 1;
    state.showRivers = input.view && typeof input.view.showRivers === "boolean" ? input.view.showRivers : true;
    state.showLakes = input.view && typeof input.view.showLakes === "boolean" ? input.view.showLakes : true;
    state.showDeltas = input.view && typeof input.view.showDeltas === "boolean" ? input.view.showDeltas : true;
    state.showCities = input.view && typeof input.view.showCities === "boolean" ? input.view.showCities : true;
    state.showRoutes = input.view && typeof input.view.showRoutes === "boolean" ? input.view.showRoutes : true;
    state.showBorders = input.view && typeof input.view.showBorders === "boolean" ? input.view.showBorders : true;
    state.rotation = 0;
    state.rotationX = 0;
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

  $("planetName").addEventListener("focus", checkpointHistory);
  $("planetName").addEventListener("input", () => {
    state.name = $("planetName").value.slice(0, 48);
    $("statsPlanetName").textContent = state.name || "Безымянный мир";
    $("statusText").textContent = state.name ? "Редактирование · " + state.name : "Безымянный мир";
    scheduleAutosave();
  });
  $("seedInput").addEventListener("change", () => {
    checkpointHistory();
    state.seed = normalizeSeed($("seedInput").value);
    state.customHeightOverrides = {};
    state.civilizationSeed = (state.seed ^ 0x51ed1234) >>> 0;
    state.customCities = [];
    state.customTerritories = {};
    state.cityNames = {};
    resetCountryEdits();
    state.preset = "custom";
    updateInterface(); scheduleGenerate();
  });
  $("randomSeedBtn").addEventListener("click", () => {
    checkpointHistory();
    state.seed = Math.floor(Math.random() * 900000000) + 100000000;
    state.customHeightOverrides = {};
    state.customCities = [];
    state.customTerritories = {};
    state.cityNames = {};
    resetCountryEdits();
    state.civilizationSeed = (state.seed ^ 0x51ed1234) >>> 0;
    state.preset = "custom";
    updateInterface(); scheduleGenerate();
  });
  $("regenerateBtn").addEventListener("click", () => {
    checkpointHistory();
    state.seed = Math.floor(Math.random() * 900000000) + 100000000;
    state.customHeightOverrides = {};
    state.customCities = [];
    state.customTerritories = {};
    state.cityNames = {};
    resetCountryEdits();
    state.civilizationSeed = (state.seed ^ 0x51ed1234) >>> 0;
    state.preset = "custom";
    state.rotation = 0;
    state.rotationX = 0;
    updateInterface(); scheduleGenerate();
  });
  document.querySelectorAll(".preset-card").forEach((button) => button.addEventListener("click", () => {
    checkpointHistory();
    state.customCities = [];
    state.customTerritories = {};
    state.cityNames = {};
    resetCountryEdits();
    state.preset = button.dataset.preset;
    state.customHeightOverrides = {};
    Object.assign(state, PRESETS[state.preset]);
    state.seed = Math.floor(Math.random() * 900000000) + 100000000;
    state.civilizationSeed = (state.seed ^ 0x51ed1234) >>> 0;
    state.rotation = 0;
    state.rotationX = 0;
    updateInterface(); scheduleGenerate();
  }));
  ["seaLevel", "landmass", "relief", "temperature", "humidity", "tectonics", "erosion", "season"].forEach((key) => {
    $(key).addEventListener("pointerdown", checkpointHistory);
    $(key).addEventListener("keydown", event => { if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown","Home","End","PageUp","PageDown"].includes(event.key))checkpointHistory(); });
    $(key).addEventListener("input", () => {
      state[key] = Number($(key).value);
      state.preset = "custom";
      updateInterface();
      clearTimeout(regenTimer);
      regenTimer = window.setTimeout(scheduleGenerate, 140);
    });
  });
  $("mapLayer").addEventListener("change", () => {
    checkpointHistory();
    state.layer = $("mapLayer").value;
    updateInterface();
    if (activeData) { drawTexture(); renderCurrentView(); }
  });
  $("editBorders").addEventListener("change",()=>{
    checkpointHistory();state.editBorders=$("editBorders").checked;
    if(state.editBorders){state.editTerrain=false;setView("map");}else{updateInterface();renderCurrentView();}
    showToast(state.editBorders?"Кисть границ включена":"Редактирование границ выключено");
  });
  $("editTerrain").addEventListener("change",()=>{
    checkpointHistory();
    const enable=$("editTerrain").checked;
    state.editTerrain=enable;
    if(enable){
      state.editBorders=false;
      setView("map");
      // Keep the requested tool enabled after the view refresh as well. This
      // makes mode transitions deterministic when restoring saved edit states.
      state.editTerrain=true;
      updateInterface();
    }else{
      updateInterface();renderCurrentView();
    }
    showToast(state.editTerrain?"Кисть рельефа включена":"Редактирование рельефа выключено");
  });
  $("terrainBrushMode").addEventListener("change",()=>{
    checkpointHistory();state.terrainBrush=$("terrainBrushMode").value;scheduleAutosave();
  });
  [["terrainBrushSize","terrainBrushSize"],["terrainBrushStrength","terrainBrushStrength"]].forEach(([id,key])=>{
    $(id).addEventListener("input",()=>{
      state[key]=Number($(id).value);
      $(id+"Out").textContent=key==="terrainBrushSize"?state[key]+" ячеек":state[key]+"%";
      updateInterface();scheduleAutosave();
    });
  });
  $("clearTerrainEditsBtn").addEventListener("click",()=>{
    if(!Object.keys(state.customHeightOverrides).length){showToast("Ручных изменений рельефа нет");return;}
    checkpointHistory();state.customHeightOverrides={};state.editTerrain=false;updateInterface();scheduleGenerate();showToast("Рельеф восстановлен по генератору");
  });
  $("borderCountrySelect").addEventListener("change",()=>{
    const selected=resolveCountryId($("borderCountrySelect").value);
    state.borderCountry=selected;state.selectedCountry=selected;
    if(activeData)updateCountryEditor(activeData);
    if(activeData){drawTexture();renderCurrentView();}
    scheduleAutosave();
  });
  $("renameCountryBtn").addEventListener("click",renameSelectedCountry);
  $("mergeCountryBtn").addEventListener("click",mergeSelectedCountry);
  $("splitCountryBtn").addEventListener("click",splitSelectedCountry);
  $("moveCapitalToggle").addEventListener("change",()=>{
    checkpointHistory();state.moveCapital=$("moveCapitalToggle").checked;
    if(state.moveCapital){state.editBorders=false;state.editTerrain=false;if(state.view!=="map")setView("map");}
    updateInterface();
    showToast(state.moveCapital?"Нажмите на сушу карты, чтобы перенести столицу":"Перенос столицы выключен");
  });
  [["showRivers", "showRivers"], ["showLakes", "showLakes"], ["showDeltas", "showDeltas"], ["showCities", "showCities"], ["showRoutes", "showRoutes"], ["showBorders", "showBorders"]].forEach(([id, key]) => {
    $(id).addEventListener("change", () => {
      checkpointHistory();
      state[key] = $(id).checked;
      if (activeData) { drawTexture(); renderCurrentView(); }
      updateInterface();
    });
  });
  $("regenerateCivBtn").addEventListener("click", () => {
    checkpointHistory();
    state.civilizationSeed = Math.floor(Math.random() * 2147483646) + 1;
    state.customCities = [];
    state.customTerritories = {};
    state.cityNames = {};
    resetCountryEdits();
    refreshCivilization();
    showToast("Цивилизации и торговые пути пересозданы");
  });
  document.querySelectorAll(".view-tab").forEach((button) => button.addEventListener("click", () => setView(button.dataset.view)));
  $("rotateBtn").addEventListener("click", () => {
    state.rotating = !state.rotating;
    updateInterface(); startAnimation();
    if (!state.rotating && state.view === "globe") drawGlobe();
  });
  $("zoomInBtn").addEventListener("click", () => { checkpointHistory(); state.zoom = clamp(state.zoom * 1.12, .65, 1.55); $("zoomLabel").textContent = Math.round(state.zoom * 100) + "%"; renderCurrentView(); });
  $("zoomOutBtn").addEventListener("click", () => { checkpointHistory(); state.zoom = clamp(state.zoom / 1.12, .65, 1.55); $("zoomLabel").textContent = Math.round(state.zoom * 100) + "%"; renderCurrentView(); });
  $("resetViewBtn").addEventListener("click", () => { checkpointHistory(); state.zoom = 1; state.rotation = 0; state.rotationX = 0; canvas.dataset.rotationX = "0"; canvas.dataset.rotationY = "0"; $("zoomLabel").textContent = "100%"; renderCurrentView(); });
  $("fullscreenBtn").addEventListener("click", async () => {
    try {
      if (!document.fullscreenElement) await planetStage.requestFullscreen();
      else await document.exitFullscreen();
    } catch (_) { showToast("Полноэкранный режим недоступен в этом браузере"); }
  });
  $("exportBtn").addEventListener("click", createExportMenu);
  $("importBtn").addEventListener("click", () => $("importFile").click());
  $("undoBtn").addEventListener("click",()=>{if(editHistory&&editHistory.undo())showToast("Изменение отменено");});
  $("redoBtn").addEventListener("click",()=>{if(editHistory&&editHistory.redo())showToast("Изменение повторено");});
  $("shareBtn").addEventListener("click",async()=>{
    if(!window.PlanetForgeShare){showToast("Обмен ссылками недоступен");return;}
    const url=window.PlanetForgeShare.createURL(projectJSON());
    try{await navigator.clipboard.writeText(url);showToast("Ссылка на мир скопирована в буфер обмена");}catch(_){window.prompt("Скопируйте ссылку на свой мир:",url);}
  });
  document.addEventListener("keydown",event=>{
    if(!(event.ctrlKey||event.metaKey)||event.altKey)return;const target=event.target;if(target&&/^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))return;
    if(event.key.toLowerCase()==="z"){event.preventDefault();if(event.shiftKey){if(editHistory)editHistory.redo();}else if(editHistory)editHistory.undo();}
    else if(event.key.toLowerCase()==="y"){event.preventDefault();if(editHistory)editHistory.redo();}
  });
  $("importFile").addEventListener("change", async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error("Файл слишком большой");
      const parsed = JSON.parse(await file.text());
      if (parsed.format && parsed.format !== "planetforge-world") throw new Error("Это не проект PlanetForge");
      checkpointHistory();
      restoreProject(parsed);
      showToast("Проект «" + state.name + "» импортирован");
    } catch (error) {
      showToast(error.message === "Файл слишком большой" ? error.message : "Не удалось прочитать JSON-проект");
    } finally { event.target.value = ""; }
  });
  $("saveWorldBtn").addEventListener("click", saveWorld);
  $("savedWorldsBtn").addEventListener("click", openSavedDialog);
  $("savedSearch").addEventListener("input",drawSavedWorlds);
  $("closeSavedBtn").addEventListener("click", () => $("savedDialog").close());
  $("galleryBtn").addEventListener("click", openGalleryDialog);
  $("gallerySearch").addEventListener("input",renderGalleryWorlds);
  $("galleryCategory").addEventListener("change",renderGalleryWorlds);
  $("closeGalleryBtn").addEventListener("click", () => $("galleryDialog").close());
  $("galleryWorldsList").addEventListener("click", event => {
    const button = event.target.closest("[data-gallery-index]");
    if (button) loadGalleryWorld(Number(button.dataset.galleryIndex));
  });
  $("compareBtn").addEventListener("click",openCompareDialog);
  $("closeCompareBtn").addEventListener("click",()=> $("compareDialog").close());
  $("compareTarget").addEventListener("change",renderComparison);
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

  function resetCountryEdits(){
    state.countryNames={};state.countryMerges={};state.countryCapitals={};
    state.selectedCountry=0;state.borderCountry=0;state.moveCapital=false;
  }
  function selectCountry(id){
    const selected=resolveCountryId(id);
    state.selectedCountry=selected;state.borderCountry=selected;
    if(activeData)updateBorderCountryOptions(activeData);
    if(activeData){drawTexture();renderCurrentView();}
    updateInterface();scheduleAutosave();
  }
  function selectCountryAtPoint(point){
    if(!activeData||state.editBorders||state.editTerrain||state.moveCapital)return;
    const cell=mapCellFromPoint(point),index=cell.y*MAP_W+cell.x;
    if(activeData.heightField[index]<=activeData.threshold||activeData.territories[index]===255)return;
    selectCountry(activeData.territories[index]);
  }
  function moveSelectedCapitalTo(cell){
    if(!activeData)return;
    const index=cell.y*MAP_W+cell.x;
    if(activeData.heightField[index]<=activeData.threshold){showToast("Столицу можно переносить только на сушу");return;}
    const country=resolveCountryId(state.selectedCountry);
    checkpointHistory();
    state.countryCapitals[String(country)]={x:cell.x,y:cell.y};
    if(country>=6)state.customTerritories[String(index)]=country;
    state.moveCapital=false;
    refreshCivilization();
    updateInterface();
    showToast("Столица перемещена; территории пересчитаны");
  }
  function renameSelectedCountry(){
    if(!activeData)return;
    const country=resolveCountryId(state.selectedCountry),name=$("countryNameInput").value.trim().slice(0,48);
    if(!name){showToast("Название страны не должно быть пустым");return;}
    checkpointHistory();state.countryNames[String(country)]=name;
    refreshCivilization();showToast("Государство переименовано");
  }
  function mergeSelectedCountry(){
    if(!activeData)return;
    const selectedTarget=$("mergeCountrySelect").value;
    if(selectedTarget===""){showToast("Сначала выберите государство, с которым нужно объединить");return;}
    const source=resolveCountryId(state.selectedCountry),target=resolveCountryId(selectedTarget);
    if(!Number.isInteger(target)||target<0||target>=32||source===target){showToast("Выберите другое государство для объединения");return;}
    const exists=activeData.territories.some(value=>value!==255&&resolveCountryId(value)===target);
    if(!exists){showToast("Выбранная страна больше не имеет территории");return;}
    checkpointHistory();
    state.countryMerges[String(source)]=target;
    state.selectedCountry=target;state.borderCountry=target;state.moveCapital=false;
    refreshCivilization();showToast("Государства объединены");
  }
  function splitSelectedCountry(){
    if(!activeData)return;
    const source=resolveCountryId(state.selectedCountry),cells=[];
    for(let i=0;i<activeData.territories.length;i++)if(activeData.territories[i]!==255&&resolveCountryId(activeData.territories[i])===source&&activeData.heightField[i]>activeData.threshold)cells.push(i);
    if(cells.length<80){showToast("На выбранной территории недостаточно суши для разделения");return;}
    const occupied=new Set();
    for(let i=0;i<activeData.territories.length;i++)if(activeData.territories[i]!==255)occupied.add(resolveCountryId(activeData.territories[i]));
    for(const key of Object.keys(state.countryCapitals||{}))occupied.add(Number(key));
    for(const key of Object.keys(state.countryMerges||{}))occupied.add(Number(key));
    for(const value of Object.values(state.countryMerges||{}))occupied.add(Number(value));
    let next=-1;for(let id=6;id<32;id++)if(!occupied.has(id)){next=id;break;}
    if(next<0){showToast("Достигнут предел пользовательских государств (32)");return;}
    let sin=0,cos=0;
    for(const index of cells){const x=index%MAP_W,angle=(x+.5)/MAP_W*TAU;sin+=Math.sin(angle);cos+=Math.cos(angle);}
    const center=((Math.atan2(sin,cos)/TAU*MAP_W)%MAP_W+MAP_W)%MAP_W;
    const offset=index=>{const x=index%MAP_W;return(x-center+MAP_W)%MAP_W;};
    cells.sort((a,b)=>offset(a)-offset(b)||Math.floor(a/MAP_W)-Math.floor(b/MAP_W));
    const newCells=cells.slice(Math.floor(cells.length/2));
    if(newCells.length<30||cells.length-newCells.length<30){showToast("Выбранная область слишком мала для разделения");return;}
    const capitalIndex=newCells[Math.floor(newCells.length/2)],x=capitalIndex%MAP_W,y=Math.floor(capitalIndex/MAP_W);
    checkpointHistory();
    for(const index of newCells)state.customTerritories[String(index)]=next;
    state.countryNames[String(next)]="Новое государство "+(next-5);
    state.countryCapitals[String(next)]={x,y};
    state.selectedCountry=next;state.borderCountry=next;state.moveCapital=false;
    refreshCivilization();updateInterface();
    showToast("Создано новое государство; граница раздела сохранена");
  }

  function mapCellFromPoint(point){
    return{x:((Math.floor((point.lon+180)/360*MAP_W)%MAP_W)+MAP_W)%MAP_W,y:clamp(Math.floor((90-point.lat)/180*MAP_H),0,MAP_H-1)};
  }
  function terrainBrushSettings(){return{mode:state.terrainBrush,radius:state.terrainBrushSize,strength:state.terrainBrushStrength/100};}
  function stampTerrainBrush(center){
    if(!activeData||!state.editTerrain)return;
    const data=activeData,{mode,radius,strength}=terrainBrushSettings(),height=data.heightField,base=terrainStrokeBase||height;
    const changed=new Set(),latitude=(90-(center.y+.5)/MAP_H*180)*Math.PI/180,cosLat=Math.max(.25,Math.cos(latitude));
    const yRadius=radius,xRadius=Math.ceil(radius/cosLat);
    for(let oy=-yRadius;oy<=yRadius;oy++){
      const y=center.y+oy;if(y<0||y>=MAP_H)continue;
      for(let ox=-xRadius;ox<=xRadius;ox++){
        const x=((center.x+ox)%MAP_W+MAP_W)%MAP_W,dx=ox*cosLat,dist=Math.sqrt(dx*dx+oy*oy)/radius;
        if(dist>1)continue;
        const index=y*MAP_W+x,falloff=Math.pow(Math.max(0,1-dist*dist),1.6),current=height[index],original=base[index],amount=strength*falloff;
        let next=current;
        if(mode==="raise")next=current+.045*amount;
        else if(mode==="lower")next=current-.045*amount;
        else if(mode==="smooth"){
          const left=y*MAP_W+(x-1+MAP_W)%MAP_W,right=y*MAP_W+(x+1)%MAP_W,up=Math.max(0,y-1)*MAP_W+x,down=Math.min(MAP_H-1,y+1)*MAP_W+x;
          const average=(base[left]+base[right]+base[up]+base[down]+original)/5;
          next=lerp(current,average,clamp(amount*.9,0,.9));
        }else if(mode==="plateau")next=lerp(current,terrainStrokeTarget,clamp(amount,0,1));
        else if(mode==="crater")next=current-.06*amount*Math.max(0,1-dist*1.22)+.022*strength*Math.exp(-Math.pow((dist-.76)/.12,2));
        else if(mode==="land")next=lerp(current,data.threshold+.035,clamp(amount*2.4,0,1));
        else if(mode==="water")next=lerp(current,data.threshold-.035,clamp(amount*2.4,0,1));
        next=clamp(next,0,1.15);
        if(Math.abs(next-current)<.00005)continue;
        const key=String(index),wasStored=Object.prototype.hasOwnProperty.call(state.customHeightOverrides,key);
        if(!wasStored&&terrainStrokeOverrideCount>=18000)continue;
        height[index]=next;state.customHeightOverrides[key]=Number(next.toFixed(5));if(!wasStored)terrainStrokeOverrideCount++;
        changed.add(index);
      }
    }
    if(changed.size){
      mapCanvas.dataset.terrainCellsChanged=String((Number(mapCanvas.dataset.terrainCellsChanged)||0)+changed.size);
      if(!terrainStrokePointerBatch){drawTexture();renderCurrentView();}
      $("statusText").textContent="Правка рельефа · "+Object.keys(state.customHeightOverrides).length+" изменённых ячеек";
    }
    return changed.size;
  }
  let terrainStrokePointerBatch=false;
  function paintTerrainSegment(start,end){
    if(!activeData||!state.editTerrain||state.view!=="map")return;
    let dx=end.x-start.x;if(dx>MAP_W/2)dx-=MAP_W;else if(dx< -MAP_W/2)dx+=MAP_W;
    const dy=end.y-start.y,steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))));
    let changed=0;terrainStrokePointerBatch=true;
    try{
      for(let step=0;step<=steps;step++){
        const t=step/steps,x=((Math.round(start.x+dx*t)%MAP_W)+MAP_W)%MAP_W,y=clamp(Math.round(start.y+dy*t),0,MAP_H-1);
        changed+=stampTerrainBrush({x,y});
      }
    }finally{terrainStrokePointerBatch=false;}
    if(changed){drawTexture();renderCurrentView();}
  }
  function updatePaintedBorders(data,changed){
    const affected=new Set(),heightField=data.heightField,territories=data.territories,borders=data.borders,threshold=data.threshold;
    for(const index of changed){
      const x=index%MAP_W,y=Math.floor(index/MAP_W);
      affected.add(index);affected.add(y*MAP_W+(x+1)%MAP_W);affected.add(y*MAP_W+(x-1+MAP_W)%MAP_W);
      affected.add(Math.max(0,y-1)*MAP_W+x);affected.add(Math.min(MAP_H-1,y+1)*MAP_W+x);
    }
    for(const index of affected){
      if(heightField[index]<=threshold||territories[index]===255){borders[index]=0;continue;}
      const x=index%MAP_W,y=Math.floor(index/MAP_W),owner=territories[index];
      const right=y*MAP_W+(x+1)%MAP_W,left=y*MAP_W+(x-1+MAP_W)%MAP_W;
      const up=Math.max(0,y-1)*MAP_W+x,down=Math.min(MAP_H-1,y+1)*MAP_W+x;
      borders[index]=((heightField[right]>threshold&&territories[right]!==owner)||(heightField[left]>threshold&&territories[left]!==owner)||(heightField[up]>threshold&&territories[up]!==owner)||(heightField[down]>threshold&&territories[down]!==owner))?1:0;
    }
  }
  function paintBorderSegment(start,end){
    if(!activeData||!state.editBorders||state.view!=="map")return;
    const country=resolveCountryId(clampInt(state.borderCountry,0,31,0)),changed=new Set();
    let dx=end.x-start.x;if(dx>MAP_W/2)dx-=MAP_W;else if(dx< -MAP_W/2)dx+=MAP_W;
    const dy=end.y-start.y,steps=Math.max(1,Math.ceil(Math.max(Math.abs(dx),Math.abs(dy))));
    for(let step=0;step<=steps;step++){
      const t=step/steps,cx=((Math.round(start.x+dx*t)%MAP_W)+MAP_W)%MAP_W,cy=clamp(Math.round(start.y+dy*t),0,MAP_H-1);
      for(let oy=-2;oy<=2;oy++)for(let ox=-2;ox<=2;ox++){
        if(ox*ox+oy*oy>5)continue;
        const y=cy+oy;if(y<0||y>=MAP_H)continue;
        const x=(cx+ox+MAP_W)%MAP_W,index=y*MAP_W+x;
        if(activeData.heightField[index]<=activeData.threshold||activeData.territories[index]===country)continue;
        activeData.territories[index]=country;state.customTerritories[String(index)]=country;changed.add(index);
      }
    }
    if(changed.size){
      updatePaintedBorders(activeData,changed);stats={...activeData};drawTexture();updateStats();renderCurrentView();
      $("statusText").textContent="Ручная правка границ · "+Object.keys(state.customTerritories).length+" клеток";
    }
  }
  function pointerCoordinates(event) {
    const rect = (state.view === "globe" ? canvas : mapCanvas).getBoundingClientRect();
    if (state.view === "globe") {
      const r = Math.min(rect.width, rect.height) * .355 * state.zoom;
      const nx = (event.clientX - (rect.left + rect.width / 2)) / r;
      const ny = ((rect.top + rect.height * .51) - event.clientY) / r;
      if (nx * nx + ny * ny > 1) return null;
      const nz = Math.sqrt(Math.max(0, 1 - nx * nx - ny * ny));
      const cosX = Math.cos(state.rotationX), sinX = Math.sin(state.rotationX);
      const cosY = Math.cos(state.rotation), sinY = Math.sin(state.rotation);
      const localY = ny * cosX + nz * sinX;
      const zAfterPitch = -ny * sinX + nz * cosX;
      const localX = nx * cosY + zAfterPitch * sinY;
      const localZ = -nx * sinY + zAfterPitch * cosY;
      const lat = Math.asin(clamp(localY, -1, 1)) * 180 / Math.PI;
      let lon = Math.atan2(localX, localZ) * 180 / Math.PI;
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
    pointerState = { x: event.clientX, y: event.clientY, rotation: state.rotation, rotationX: state.rotationX };
    dragMoved = false;
    canvas.setPointerCapture(event.pointerId);
    canvas.dataset.dragging = "true";
    if (state.rotating) { state.rotating = false; updateInterface(); startAnimation(); }
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!pointerState) { updateCoordinates(event); return; }
    const dx = event.clientX - pointerState.x;
    const dy = event.clientY - pointerState.y;
    if (Math.abs(dx) > 2 || Math.abs(dy) > 2) dragMoved = true;
    if (dragMoved) {
      // Invert yaw so the visible surface follows the pointer in the same direction.
      // Pitch is deliberately unbounded: the globe can pass either pole and keep turning.
      state.rotation = pointerState.rotation - dx / Math.max(160, canvas.clientWidth) * TAU;
      state.rotationX = pointerState.rotationX + dy / Math.max(160, canvas.clientHeight) * TAU;
      canvas.dataset.rotationY = String(state.rotation);
      canvas.dataset.rotationX = String(state.rotationX);
      drawGlobe();
    }
    updateCoordinates(event);
  });
  const endPointer = () => {
    pointerState = null;
    delete canvas.dataset.dragging;
    if (state.rotating) startAnimation();
  };
  canvas.addEventListener("pointerup", endPointer);
  canvas.addEventListener("pointercancel", endPointer);
  canvas.addEventListener("click",event=>{
    if(dragMoved||state.view!=="globe"||state.moveCapital)return;
    const point=pointerCoordinates(event);if(point)selectCountryAtPoint(point);
  });
  canvas.addEventListener("dblclick", editOrAddCity);
  mapCanvas.addEventListener("pointerdown", event=>{
    if(state.editTerrain&&state.view==="map"&&event.button===0){
      const point=pointerCoordinates(event);if(!point)return;
      event.preventDefault();checkpointHistory();terrainPaintPointer=event.pointerId;lastTerrainPaintPoint=mapCellFromPoint(point);
      mapCanvas.dataset.terrainPointerStarted="true";
      terrainStrokeBase=activeData.heightField.slice();terrainStrokeTarget=activeData.heightField[lastTerrainPaintPoint.y*MAP_W+lastTerrainPaintPoint.x];
      terrainStrokeOverrideCount=Object.keys(state.customHeightOverrides).length;
      terrainPaintAt=performance.now();mapCanvas.setPointerCapture(event.pointerId);paintTerrainSegment(lastTerrainPaintPoint,lastTerrainPaintPoint);return;
    }
    if(event.button!==0||state.view!=="map")return;
    const point=pointerCoordinates(event);if(!point)return;
    const cell=mapCellFromPoint(point);
    if(state.moveCapital){moveSelectedCapitalTo(cell);return;}
    if(!state.editBorders){selectCountryAtPoint(point);return;}
    event.preventDefault();checkpointHistory();borderPaintPointer=event.pointerId;lastBorderPaintPoint=cell;lastBorderPaintAt=performance.now();
    mapCanvas.setPointerCapture(event.pointerId);paintBorderSegment(lastBorderPaintPoint,lastBorderPaintPoint);
  });
  mapCanvas.addEventListener("pointermove", event=>{
    updateCoordinates(event);
    if(terrainPaintPointer===event.pointerId&&state.editTerrain){
      const now=performance.now();if(now-terrainPaintAt<28)return;
      const point=pointerCoordinates(event);if(!point)return;
      const cell=mapCellFromPoint(point);if(lastTerrainPaintPoint)paintTerrainSegment(lastTerrainPaintPoint,cell);
      lastTerrainPaintPoint=cell;terrainPaintAt=now;return;
    }
    if(borderPaintPointer!==event.pointerId||!state.editBorders)return;
    const now=performance.now();if(now-lastBorderPaintAt<24)return;
    const point=pointerCoordinates(event);if(!point)return;
    const cell=mapCellFromPoint(point);if(lastBorderPaintPoint)paintBorderSegment(lastBorderPaintPoint,cell);
    lastBorderPaintPoint=cell;lastBorderPaintAt=now;
  });
  const finishTerrainPaint=event=>{
    if(terrainPaintPointer!==event.pointerId)return;
    terrainPaintPointer=null;lastTerrainPaintPoint=null;terrainStrokeBase=null;
    if(state.editTerrain){scheduleAutosave();scheduleGenerate();showToast("Рельеф изменён: пересчитываем климат, биомы и реки");}
  };
  const finishBorderPaint=event=>{
    if(borderPaintPointer!==event.pointerId)return;
    borderPaintPointer=null;lastBorderPaintPoint=null;scheduleAutosave();
  };
  mapCanvas.addEventListener("pointerup",finishTerrainPaint);
  mapCanvas.addEventListener("pointercancel",finishTerrainPaint);
  mapCanvas.addEventListener("pointerup",finishBorderPaint);
  mapCanvas.addEventListener("pointercancel",finishBorderPaint);
  mapCanvas.addEventListener("dblclick", editOrAddCity);
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
    updateInterface();if(editHistory)editHistory.reset();
    $("renderOverlay").classList.remove("hidden");
    const shared=window.PlanetForgeShare?window.PlanetForgeShare.readFromLocation():null;
    if(shared){restoreProject(shared);if(editHistory)editHistory.reset();return;}
    const draft=readAutosave();
    if(draft){restoreProject(draft);if(editHistory)editHistory.reset();return;}
    window.setTimeout(()=>{
      try{generatePlanet();}
      catch(error){console.error(error);$("renderOverlay").classList.add("hidden");showToast("Ошибка генерации. Обновите страницу и попробуйте снова.");}
    },70);
  }

  initialize();
})();