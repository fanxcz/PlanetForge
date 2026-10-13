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
    temperate:{seaLevel:50,landmass:0,relief:5,temperature:0,humidity:50,tectonics:56,erosion:28,season:50},
    archipelago:{seaLevel:55,landmass:-3,relief:3,temperature:6,humidity:61,tectonics:68,erosion:35,season:50},
    desert:{seaLevel:48,landmass:2,relief:5,temperature:24,humidity:12,tectonics:45,erosion:18,season:50},
    ice:{seaLevel:52,landmass:-1,relief:5,temperature:-29,humidity:63,tectonics:37,erosion:42,season:50},
    alien:{seaLevel:46,landmass:8,relief:8,temperature:12,humidity:83,tectonics:81,erosion:25,season:50},
    volcanic:{seaLevel:50,landmass:3,relief:10,temperature:9,humidity:30,tectonics:94,erosion:16,season:50}
  };
  const DEFAULTS = { name: "Aurelia", seed: 840271, ...PRESETS.temperate, preset: "temperate" };
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
  const textureImage = textureCtx.createImageData(MAP_W, MAP_H);
  let texturePixels = textureImage.data;
  let globeBuffer = null;
  let globeBufferSize = 0;
  let mapData = null;
  let textureRevision = 0;
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
    ...DEFAULTS, view:"globe", layer:"biome", rotation:0, zoom:1,
    rotating:true, isGenerating:false, civilizationSeed:(DEFAULTS.seed^0x51ed1234)>>>0,
    showRivers:true,showCities:true,showRoutes:true,showBorders:true,
    tectonics:56,erosion:28,season:50,customCities:[],cityNames:{}
  };
  const editHistory=window.PlanetForgeHistory?window.PlanetForgeHistory.create({
    capture:projectJSON,restore:restoreProject,onChange:updateHistoryButtons,limit:70
  }):null;
  function checkpointHistory(){if(editHistory)editHistory.checkpoint();}
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
  const COUNTRY_COLORS = [
    [55, 132, 148], [119, 103, 172], [169, 121, 67],
    [73, 142, 105], [170, 88, 103], [76, 119, 173]
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
    const mask=new Uint8Array(size),cutoff=Math.max(18,Math.round(landCells.length/1800));let count=0;
    for(const index of landCells)if(accumulation[index]>=cutoff&&downstream[index]>=0){mask[index]=1;count++;}
    return{mask,count,filledHeight:filled};
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
        const score = temperatureFit * 0.42 + moistureFit * 0.22 +
          (nearCoast ? 0.15 : 0) + (nearRiver ? 0.19 : 0) + rand() * 0.48;
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
    const capitals = cities.slice(0, countryCount);
    const vectorFor = (lat, lon) => {
      const latitude = lat * Math.PI / 180, longitude = lon * Math.PI / 180;
      const cosLat = Math.cos(latitude);
      return { x: cosLat * Math.cos(longitude), y: Math.sin(latitude), z: cosLat * Math.sin(longitude) };
    };
    const anchors = capitals.map((city, id) => ({ ...vectorFor(city.lat, city.lon), id, city }));
    cities.forEach((city, i) => {
      city.type = i < countryCount ? "capital" : (i < countryCount + Math.max(2, Math.round(cities.length * 0.22)) ? "city" : "settlement");
      const vector = vectorFor(city.lat, city.lon);
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
        let bestDot = -Infinity, bestId = 0;
        for (const anchor of anchors) {
          const dot = vx * anchor.x + latSin * anchor.y + vz * anchor.z;
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
  function refreshCivilization(){if(!activeData)return;const civ=applyCustomCities(generateCivilization(activeData.heightField,activeData.temperature,activeData.moisture,activeData.biome,activeData.riverMask,activeData.threshold,activeData.landCount,state.civilizationSeed));Object.assign(activeData,civ);stats={...activeData};drawTexture();updateStats();renderCurrentView();}
  function editOrAddCity(event){
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

  function generatePlanet() {
    const started = performance.now();
    const seed = Number(state.seed) >>> 0;
    const size = MAP_W * MAP_H;
    const height = new Float32Array(size);
    const temperature = new Float32Array(size);
    const moisture = new Float32Array(size);
    const biome = new Uint8Array(size);
    const tempOffset=Number(state.temperature),humidity=Number(state.humidity)/100,relief=Number(state.relief);
    const tectonics=Number(state.tectonics)/100,erosion=Number(state.erosion)/100,seasonPhase=Number(state.season)/100*TAU;
    const threshold=0.535+(Number(state.seaLevel)-50)*0.0042-Number(state.landmass)*0.0045;
    let landCount=0,totalTemp=0;const counts=new Uint32Array(BIOMES.length);
    const plateRandom=seededRandom(seed^0x6a09e667);
    const plates=Array.from({length:14},()=>{const lat=Math.asin(plateRandom()*2-1),lon=plateRandom()*TAU-Math.PI;return{x:Math.cos(lat)*Math.cos(lon),y:Math.sin(lat),z:Math.cos(lat)*Math.sin(lon),continental:plateRandom()>.46,mode:Math.floor(plateRandom()*3)};});
    for(let y=0;y<MAP_H;y++){const lat=Math.PI/2-((y+.5)/MAP_H)*Math.PI,latSin=Math.sin(lat),latCos=Math.cos(lat);
      for(let x=0;x<MAP_W;x++){const lon=((x+.5)/MAP_W)*TAU-Math.PI,sx=latCos*Math.cos(lon),sy=latSin,sz=latCos*Math.sin(lon);
        const continent=fbm3(sx,sy,sz,2.25,3,seed+11),detail=fbm3(sx,sy,sz,6.6,2,seed+271),fine=noise3(sx*13.1,sy*13.1,sz*13.1,seed+701);
        let best=-Infinity,second=-Infinity,bestIndex=0,secondIndex=0;
        for(let p=0;p<plates.length;p++){const plate=plates[p],dot=sx*plate.x+sy*plate.y+sz*plate.z;if(dot>best){second=best;secondIndex=bestIndex;best=dot;bestIndex=p;}else if(dot>second){second=dot;secondIndex=p;}}
        const boundary=clamp(1-(best-second)*26,0,1),primary=plates[bestIndex],neighbour=plates[secondIndex];
        let stress;if(primary.continental&&neighbour.continental)stress=.085;else if(primary.continental!==neighbour.continental)stress=primary.continental?.052:-.045;else stress=primary.mode===0?.058:primary.mode===1?-.047:.008;
        height[y*MAP_W+x]=continent*.68+detail*.24+fine*.08+boundary*stress*tectonics;
      }
    }
    if(erosion>.001){let source=height,target=new Float32Array(size);const blend=erosion*.15;
      for(let pass=0;pass<2;pass++){for(let y=0;y<MAP_H;y++){const up=Math.max(0,y-1)*MAP_W,down=Math.min(MAP_H-1,y+1)*MAP_W,row=y*MAP_W;
        for(let x=0;x<MAP_W;x++){const left=row+(x-1+MAP_W)%MAP_W,right=row+(x+1)%MAP_W,i=row+x,avg=(source[left]+source[right]+source[up+x]+source[down+x])*.25;target[i]=lerp(source[i],avg,blend);}}
        const swap=source;source=target;target=swap;
      }height.set(source);
    }
    for(let y=0;y<MAP_H;y++){const lat=Math.PI/2-((y+.5)/MAP_H)*Math.PI,latSin=Math.sin(lat),latCos=Math.cos(lat),absLat=Math.abs(lat*180/Math.PI);
      for(let x=0;x<MAP_W;x++){const lon=((x+.5)/MAP_W)*TAU-Math.PI,sx=latCos*Math.cos(lon),sy=latSin,sz=latCos*Math.sin(lon),idx=y*MAP_W+x;
        const h=height[idx],alt=h-threshold,seasonal=Math.sin(seasonPhase)*Math.sin(lat)*12;
        const t=30-absLat*.48+tempOffset+seasonal-Math.max(0,alt)*130,rain=fbm3(sx,sy,sz,4.7,2,seed+1907);
        const east=height[y*MAP_W+(x+2)%MAP_W],west=height[y*MAP_W+(x-2+MAP_W)%MAP_W],windward=clamp(.5+(east-west)*1.8,0,1);
        const wet=clamp(humidity*.58+rain*.25+(1-Math.abs(latSin))*.15+windward*.12-Math.max(0,alt)*.18,0,1);
        temperature[idx]=t;moisture[idx]=wet;totalTemp+=t;
        let b;if(h<=threshold)b=t<-8?2:(h>threshold-.035?1:0);else if(t<-16)b=3;else if(t<-1)b=4;else if(alt>.135-relief*.0085)b=5;else if(wet<.22&&t>7)b=6;else if(t<7&&wet>.40)b=11;else if(wet<.38&&t>16)b=7;else if(wet>.78&&t>17)b=10;else if(wet>.51&&t>4)b=9;else b=8;
        biome[idx]=b;counts[b]++;if(h>threshold)landCount++;
      }
    }
    const riverData = generateRivers(height, threshold, seed);
    const civilization = applyCustomCities(generateCivilization(height, temperature, moisture, biome, riverData.mask, threshold, landCount, state.civilizationSeed));
    const meanTemp = totalTemp / size;
    const landPercent = landCount / size * 100;
    const rand = seededRandom(seed);
    const radius = Math.round(3400 + rand() * 7300);
    const dayHours = Math.round((10 + rand() * 50) * 10) / 10;
    const tilt = Math.round(rand() * 47 * 10) / 10;
    const moons = Math.floor(rand() * 5);
    let uniqueBiomes = 0;
    for (let i = 0; i < counts.length; i++) if (counts[i] > size * 0.0001) uniqueBiomes++;
    activeData = { width: MAP_W, height: MAP_H, heightField: height, temperature, moisture, biome, threshold, counts, landCount, meanTemp, landPercent, waterPercent: 100 - landPercent, uniqueBiomes, radius, dayHours, tilt, moons, riverMask: riverData.mask, riverCount: riverData.count, ...civilization, generatedMs: performance.now() - started };
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
    $("perfReadout").textContent = (globe3D && globe3D.ready ? "WEBGL GLOBE · " : "CANVAS FALLBACK · ") + Math.round(activeData.generatedMs) + " MS";
    startAnimation();
  }

  function drawTexture() {
    const { heightField, temperature, moisture, biome, threshold, riverMask, territories, borders } = activeData;
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
        if (borders && borders[i] && (state.showBorders || state.layer === "political")) {
          const mix = state.layer === "political" ? 0.72 : 0.38;
          color[0] = Math.round(lerp(color[0], 196, mix));
          color[1] = Math.round(lerp(color[1], 225, mix));
          color[2] = Math.round(lerp(color[2], 227, mix));
        }
        if (riverMask && riverMask[i] && (state.showRivers || state.layer === "hydrology")) {
          color = state.layer === "hydrology" ? [75, 201, 229] : [76, 181, 211];
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
    if (globe3D && globe3D.ready && globe3D.render(textureCanvas, textureRevision, state.rotation, radius, w, h, cy, Number(state.seed))) {
      drawCivilizationGlobe(cx, cy, radius);
      return;
    }
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
    drawCivilizationMap(w, h, outW, outH);
  }

  function drawCivilizationGlobe(cx, cy, radius) {
    if (!activeData || (!state.showCities && !state.showRoutes)) return;
    const dpr = window.devicePixelRatio || 1;
    const visible = new Map();
    for (const city of activeData.cities || []) {
      const lat = city.lat * Math.PI / 180;
      const lon = city.lon * Math.PI / 180 - state.rotation;
      const cosLat = Math.cos(lat);
      const nx = cosLat * Math.sin(lon), ny = Math.sin(lat), nz = cosLat * Math.cos(lon);
      if (nz > 0.035) visible.set(city.id, { x: cx + nx * radius, y: cy - ny * radius, z: nz, city });
    }

    ctx.save();
    if (state.showRoutes) {
      ctx.lineWidth = 1.25 * dpr;
      ctx.strokeStyle = "rgba(106, 221, 214, .62)";
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
        ctx.fillStyle = capital ? "#a6ffe5" : city.type === "city" ? "#90def0" : "#d0dae5";
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
          ctx.fillStyle = "#e2f5ff";
          ctx.fillText(city.name, point.x + 6 * dpr, point.y - 5 * dpr);
        }
      }
    }
    ctx.restore();
  }

  function drawCivilizationMap(w, h, outW, outH) {
    if (!activeData || (!state.showCities && !state.showRoutes)) return;
    const dpr = window.devicePixelRatio || 1;
    const left = (w - outW) / 2, top = (h - outH) / 2;
    const points = new Map((activeData.cities || []).map((city) => [city.id, {
      x: left + (city.x + 0.5) / MAP_W * outW,
      y: top + (city.y + 0.5) / MAP_H * outH,
      city
    }]));
    mapCtx.save();
    if (state.showRoutes) {
      mapCtx.strokeStyle = "rgba(103, 224, 211, .78)";
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
        mapCtx.fillStyle = capital ? "#a6ffe5" : city.type === "city" ? "#90def0" : "#d0dae5";
        mapCtx.arc(point.x, point.y, size, 0, TAU); mapCtx.fill();
        if (capital || city.type === "city") {
          mapCtx.font = (9 * dpr) + "px ui-monospace, SFMono-Regular, monospace";
          mapCtx.textAlign = "left"; mapCtx.textBaseline = "middle";
          mapCtx.lineWidth = 3 * dpr; mapCtx.strokeStyle = "rgba(4,12,22,.92)";
          mapCtx.strokeText(city.name, point.x + 5 * dpr, point.y - 4 * dpr);
          mapCtx.fillStyle = "#e2f5ff"; mapCtx.fillText(city.name, point.x + 5 * dpr, point.y - 4 * dpr);
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
    $("seasonOut").textContent = state.season < 25 ? "Северная зима" : state.season < 50 ? "Весенний переход" : state.season < 75 ? "Северное лето" : "Осенний переход";
    document.querySelectorAll('input[type="range"]').forEach((input) => {
      const min = Number(input.min), max = Number(input.max), val = Number(input.value);
      input.style.setProperty("--range-fill", ((val - min) / (max - min) * 100) + "%");
    });
    document.querySelectorAll(".preset-card").forEach((button) => button.classList.toggle("active", button.dataset.preset === state.preset));
    $("rotationSwitch").classList.toggle("on", state.rotating);
    $("rotateBtn").setAttribute("aria-pressed", String(state.rotating));
    $("mapLayer").value = state.layer;
    $("showRivers").checked = state.showRivers;
    $("showCities").checked = state.showCities;
    $("showRoutes").checked = state.showRoutes;
    $("showBorders").checked = state.showBorders;
    $("zoomLabel").textContent = Math.round(state.zoom * 100) + "%";
    $("viewModeLabel").textContent = state.view === "globe" ? "PLANET VIEW / 3D RENDER" : "CARTOGRAPHY / EQUIRECTANGULAR";
    updateLegend();
  }

  function updateLegend() {
    const labels = {
      biome: [['Океан','#1b5d82'],['Леса','#44805f'],['Пустыни','#c59b57'],['Горы','#b9c2bc'],['Лёд','#cbe8ed']],
      elevation: [['Глубины','#12375a'],['Низменность','#4e8d79'],['Возвышенность','#a28b67'],['Горы','#c5ccc7'],['Вершины','#f6faf7']],
      temperature: [['Холод','#1f407d'],['Прохладно','#7dbdb7'],['Умеренно','#b3cb8f'],['Жарко','#d97d4d'],['Экстремум','#97373e']],
      moisture: [['Засуха','#976b43'],['Сухо','#c29b5b'],['Умеренно','#afb869'],['Влажно','#369281'],['Очень влажно','#2e70a3']],
      hydrology: [['Океан','#12375a'],['Низменность','#4e8d79'],['Реки','#4bc9e5'],['Возвышенность','#a28b67'],['Горы','#c5ccc7']],
      political: [['Территория A','#378494'],['Территория B','#7767ac'],['Территория C','#a97943'],['Границы','#c4e1e3'],['Поселения','#a6ffe5']]
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
    exportMenu.innerHTML = '<strong>ЭКСПОРТ МИРА</strong><button data-export="png"><span>▧</span><i><b>PNG-карта · 512 × 256</b><small>Быстрый вариант</small></i></button><button data-export="png2k"><span>2K</span><i><b>PNG-карта · 2048 × 1024</b><small>Высокое разрешение</small></i></button><button data-export="png4k"><span>4K</span><i><b>PNG-карта · 4096 × 2048</b><small>Для игровых текстур</small></i></button><button data-export="json"><span>{ }</span><i><b>JSON-проект</b><small>Настройки, города и seed</small></i></button><button data-export="csv"><span>▤</span><i><b>CSV-статистика</b><small>Доли поверхности по биомам</small></i></button><button data-export="geo"><span>⌖</span><i><b>CSV-география</b><small>Координаты городов и торговых путей</small></i></button>';
    $("exportBtn").parentElement.style.position = "relative";
    $("exportBtn").parentElement.appendChild(exportMenu);
    exportMenu.addEventListener("click", (event) => {
      const button = event.target.closest("[data-export]");
      if (!button) return;
      const type = button.dataset.export;
      exportMenu.remove(); exportMenu = null;
      if (type === "png") exportPNG(1);
      if (type === "png2k") exportPNG(4);
      if (type === "png4k") exportPNG(8);
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
  function exportPNG(scale=1){
    if(!activeData)return;scale=[1,4,8].includes(Number(scale))?Number(scale):1;
    const output=document.createElement("canvas");output.width=MAP_W*scale;output.height=MAP_H*scale;
    const out=output.getContext("2d");out.drawImage(textureCanvas,0,0,output.width,output.height);
    const points=new Map((activeData.cities||[]).map(city=>[city.id,{x:(city.x+.5)*scale,y:(city.y+.5)*scale,city}]));
    if(state.showRoutes){out.strokeStyle="rgba(103,224,211,.9)";out.lineWidth=1.1*scale;out.setLineDash([2.6*scale,2.2*scale]);out.beginPath();for(const route of activeData.routes||[]){const a=points.get(route.from),b=points.get(route.to);if(!a||!b||Math.abs(a.x-b.x)>output.width/2)continue;out.moveTo(a.x,a.y);out.lineTo(b.x,b.y);}out.stroke();out.setLineDash([]);}
    if(state.showCities)for(const p of points.values()){const city=p.city,capital=city.type==="capital";out.beginPath();out.fillStyle=capital?"#a6ffe5":city.type==="city"?"#90def0":"#d0dae5";out.arc(p.x,p.y,(capital?2.2:city.type==="city"?1.7:1.1)*scale,0,TAU);out.fill();if(capital||city.type==="city"){out.font=(6*scale)+"px ui-monospace, monospace";out.lineWidth=1.7*scale;out.strokeStyle="rgba(4,12,22,.92)";out.strokeText(city.name,p.x+3*scale,p.y-2.5*scale);out.fillStyle="#e2f5ff";out.fillText(city.name,p.x+3*scale,p.y-2.5*scale);}}
    output.toBlob(blob=>{if(blob){downloadBlob(blob,cleanFileName(state.name)+"-"+scale+"x-"+state.layer+".png");showToast("PNG экспортирован: "+output.width+" × "+output.height);}else showToast("Не удалось экспортировать PNG");},"image/png");
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
      version: 2,
      name: state.name,
      seed: Number(state.seed),
      preset: state.preset,
      settings: { seaLevel: state.seaLevel, landmass: state.landmass, relief: state.relief, temperature: state.temperature, humidity: state.humidity, tectonics: state.tectonics, erosion: state.erosion, season: state.season },
      civilizationSeed: Number(state.civilizationSeed),
      customCities: state.customCities,
      cityNames: state.cityNames,
      view: { layer: state.layer, zoom: state.zoom, showRivers: state.showRivers, showCities: state.showCities, showRoutes: state.showRoutes, showBorders: state.showBorders },
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
    const world = { id: String(Date.now()) + "-" + String(Math.floor(Math.random() * 100000)), ...projectJSON(), savedAt: new Date().toISOString(), stats: stats ? { landPercent: Number(stats.landPercent.toFixed(2)), meanTemp: Number(stats.meanTemp.toFixed(1)), uniqueBiomes: stats.uniqueBiomes } : null };
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
    state.cityNames = {};
    if(input.cityNames&&typeof input.cityNames==="object"&&!Array.isArray(input.cityNames))Object.keys(input.cityNames).slice(0,100).forEach(key=>{if(/^\d+$/.test(key))state.cityNames[key]=String(input.cityNames[key]).slice(0,48);});
    state.layer = input.view && ["biome", "elevation", "temperature", "moisture", "hydrology", "political"].includes(input.view.layer) ? input.view.layer : "biome";
    state.zoom = input.view && Number.isFinite(input.view.zoom) ? clamp(input.view.zoom, .65, 1.55) : 1;
    state.showRivers = input.view && typeof input.view.showRivers === "boolean" ? input.view.showRivers : true;
    state.showCities = input.view && typeof input.view.showCities === "boolean" ? input.view.showCities : true;
    state.showRoutes = input.view && typeof input.view.showRoutes === "boolean" ? input.view.showRoutes : true;
    state.showBorders = input.view && typeof input.view.showBorders === "boolean" ? input.view.showBorders : true;
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

  $("planetName").addEventListener("focus", checkpointHistory);
  $("planetName").addEventListener("input", () => {
    state.name = $("planetName").value.slice(0, 48);
    $("statsPlanetName").textContent = state.name || "Безымянный мир";
    $("statusText").textContent = state.name ? "Редактирование · " + state.name : "Безымянный мир";
  });
  $("seedInput").addEventListener("change", () => {
    checkpointHistory();
    state.seed = normalizeSeed($("seedInput").value);
    state.civilizationSeed = (state.seed ^ 0x51ed1234) >>> 0;
    state.customCities = [];
    state.cityNames = {};
    state.preset = "custom";
    updateInterface(); scheduleGenerate();
  });
  $("randomSeedBtn").addEventListener("click", () => {
    checkpointHistory();
    state.seed = Math.floor(Math.random() * 900000000) + 100000000;
    state.customCities = [];
    state.cityNames = {};
    state.civilizationSeed = (state.seed ^ 0x51ed1234) >>> 0;
    state.preset = "custom";
    updateInterface(); scheduleGenerate();
  });
  $("regenerateBtn").addEventListener("click", () => {
    checkpointHistory();
    state.seed = Math.floor(Math.random() * 900000000) + 100000000;
    state.customCities = [];
    state.cityNames = {};
    state.civilizationSeed = (state.seed ^ 0x51ed1234) >>> 0;
    state.preset = "custom";
    state.rotation = 0;
    updateInterface(); scheduleGenerate();
  });
  document.querySelectorAll(".preset-card").forEach((button) => button.addEventListener("click", () => {
    checkpointHistory();
    state.customCities = [];
    state.cityNames = {};
    state.preset = button.dataset.preset;
    Object.assign(state, PRESETS[state.preset]);
    state.seed = Math.floor(Math.random() * 900000000) + 100000000;
    state.civilizationSeed = (state.seed ^ 0x51ed1234) >>> 0;
    state.rotation = 0;
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
  [["showRivers", "showRivers"], ["showCities", "showCities"], ["showRoutes", "showRoutes"], ["showBorders", "showBorders"]].forEach(([id, key]) => {
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
    state.cityNames = {};
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
  $("resetViewBtn").addEventListener("click", () => { checkpointHistory(); state.zoom = 1; state.rotation = 0; $("zoomLabel").textContent = "100%"; renderCurrentView(); });
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
  canvas.addEventListener("dblclick", editOrAddCity);
  mapCanvas.addEventListener("pointermove", updateCoordinates);
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
    window.setTimeout(()=>{
      try{generatePlanet();}
      catch(error){console.error(error);$("renderOverlay").classList.add("hidden");showToast("Ошибка генерации. Обновите страницу и попробуйте снова.");}
    },70);
  }

  initialize();
})();