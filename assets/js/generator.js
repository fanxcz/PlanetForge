(() => {
"use strict";
const TAU=Math.PI*2;
function clamp(v,min,max){return Math.max(min,Math.min(max,v));}
function lerp(a,b,t){return a+(b-a)*t;}
function smooth(t){return t*t*(3-2*t);}
function hash3(x,y,z,seed){let h=Math.imul(x|0,374761393)+Math.imul(y|0,668265263)+Math.imul(z|0,2147483647)+Math.imul(seed|0,1274126177);h=Math.imul(h^(h>>>13),1274126177);return((h^(h>>>16))>>>0)/4294967295;}
function noise3(x,y,z,seed){
 const ix=Math.floor(x),iy=Math.floor(y),iz=Math.floor(z),fx=smooth(x-ix),fy=smooth(y-iy),fz=smooth(z-iz);
 const a=lerp(hash3(ix,iy,iz,seed),hash3(ix+1,iy,iz,seed),fx),b=lerp(hash3(ix,iy+1,iz,seed),hash3(ix+1,iy+1,iz,seed),fx);
 const c=lerp(hash3(ix,iy,iz+1,seed),hash3(ix+1,iy,iz+1,seed),fx),d=lerp(hash3(ix,iy+1,iz+1,seed),hash3(ix+1,iy+1,iz+1,seed),fx);
 return lerp(lerp(a,b,fy),lerp(c,d,fy),fz);
}
function fbm3(x,y,z,frequency,octaves,seed){let amp=.5,total=0,weight=0;for(let i=0;i<octaves;i++){total+=noise3(x*frequency,y*frequency,z*frequency,seed+i*1013)*amp;weight+=amp;frequency*=2;amp*=.5;}return total/weight;}
function seededRandom(seed){let x=seed>>>0;return()=>{x+=0x6D2B79F5;let t=x;t=Math.imul(t^(t>>>15),t|1);t^=t+Math.imul(t^(t>>>7),t|61);return((t^(t>>>14))>>>0)/4294967296;};}
const BIOME_COLORS=[[16,48,82],[31,105,137],[74,133,158],[213,237,239],[142,166,151],[144,151,147],[194,151,83],[161,170,91],[105,157,91],[49,119,78],[27,91,71],[58,111,105]];
const COUNTRY_COLORS=[[55,132,148],[119,103,172],[169,121,67],[73,142,105],[170,88,103],[76,119,173]];
const HEIGHT_STOPS=[[0,[8,25,51]],[.30,[17,55,88]],[.48,[40,117,137]],[.50,[52,117,108]],[.56,[88,142,90]],[.64,[143,157,91]],[.73,[166,129,88]],[.84,[137,105,92]],[.94,[178,184,177]],[1,[246,250,247]]];
const TEMP_STOPS=[[0,[31,64,125]],[.2,[62,133,175]],[.36,[121,189,183]],[.5,[179,203,143]],[.64,[228,196,105]],[.8,[217,125,77]],[1,[151,55,62]]];
const MOIST_STOPS=[[0,[151,105,67]],[.2,[194,155,91]],[.4,[175,184,105]],[.6,[98,165,113]],[.8,[54,146,129]],[1,[46,112,163]]];
function hueColor(t,stops){t=clamp(t,0,1);for(let i=1;i<stops.length;i++)if(t<=stops[i][0]){const a=stops[i-1],b=stops[i],q=(t-a[0])/Math.max(.00001,b[0]-a[0]);return[Math.round(lerp(a[1][0],b[1][0],q)),Math.round(lerp(a[1][1],b[1][1],q)),Math.round(lerp(a[1][2],b[1][2],q))];}return stops[stops.length-1][1].slice();}
function renderTexture(config,layer="biome",options={}){
 const fields=generateFields(config),W=fields.width,H=fields.height,size=W*H,threshold=fields.threshold;
 const pixels=new Uint8ClampedArray(size*4),baseW=Math.max(1,Number(options.baseWidth)||512),baseH=Math.max(1,Number(options.baseHeight)||256);
 const riverMask=options.riverMask,lakeMask=options.lakeMask,deltaMask=options.deltaMask,territories=options.territories,borders=options.borders;
 const showRivers=options.showRivers!==false,showLakes=options.showLakes!==false,showDeltas=options.showDeltas!==false,showBorders=options.showBorders!==false;
 for(let y=0;y<H;y++){const baseY=Math.min(baseH-1,Math.floor(y/H*baseH));
  for(let x=0;x<W;x++){
   const i=y*W+x,h=fields.heightField[i],left=y*W+Math.max(0,x-1),right=y*W+Math.min(W-1,x+1);
   const up=Math.max(0,y-1)*W+x,down=Math.min(H-1,y+1)*W+x;
   const slope=clamp(1+(fields.heightField[left]-fields.heightField[right])*4.8+(fields.heightField[up]-fields.heightField[down])*3.2,.72,1.24);
   const baseIndex=baseY*baseW+Math.min(baseW-1,Math.floor(x/W*baseW));let color;
   if(layer==="elevation")color=hueColor(clamp((h-threshold+.18)/.46,0,1),HEIGHT_STOPS);
   else if(layer==="temperature")color=hueColor((fields.temperature[i]+35)/72,TEMP_STOPS);
   else if(layer==="moisture")color=hueColor(fields.moisture[i],MOIST_STOPS);
   else if(layer==="hydrology")color=h<=threshold?[Math.round(8+clamp((threshold-h)*95,0,20)),Math.round(27+clamp((threshold-h)*110,0,30)),Math.round(47+clamp((threshold-h)*150,0,45))]:hueColor(clamp((h-threshold+.18)/.46,0,1),HEIGHT_STOPS);
   else if(layer==="political"){const owner=territories?territories[baseIndex]:255;color=h<=threshold?[7,17,29]:(owner!==255&&owner!==undefined?COUNTRY_COLORS[owner%COUNTRY_COLORS.length].slice():[91,99,105]);}
   else{color=BIOME_COLORS[fields.biome[i]].slice();const ocean=fields.biome[i]<=2,shade=ocean?clamp(.87+(threshold-h)*.9,.75,1.02):slope;color[0]=Math.round(color[0]*shade);color[1]=Math.round(color[1]*shade);color[2]=Math.round(color[2]*shade);}
   if(borders&&borders[baseIndex]&&(showBorders||layer==="political")){const mix=layer==="political"?.72:.38;color[0]=Math.round(lerp(color[0],196,mix));color[1]=Math.round(lerp(color[1],225,mix));color[2]=Math.round(lerp(color[2],227,mix));}
   if(lakeMask&&lakeMask[baseIndex]&&(showLakes||layer==="hydrology"))color=[42,127,170];
   if(deltaMask&&deltaMask[baseIndex]&&(showDeltas||layer==="hydrology"))color=[88,182,160];
   if(riverMask&&riverMask[baseIndex]&&(showRivers||layer==="hydrology"))color=layer==="hydrology"?[75,201,229]:[76,181,211];
   const out=i*4;pixels[out]=color[0];pixels[out+1]=color[1];pixels[out+2]=color[2];pixels[out+3]=255;
  }
 }
 return{width:W,height:H,pixels};
}
function generateFields(config){
 const W=Math.max(32,Math.min(4096,Math.round(Number(config.width)||512))),H=Math.max(16,Math.min(2048,Math.round(Number(config.height)||256)));
 const size=W*H,seed=Number(config.seed)>>>0;
 const val=(key,fallback)=>Number.isFinite(Number(config[key]))?Number(config[key]):fallback;
 const tempOffset=val("temperature",0),humidity=val("humidity",50)/100,relief=val("relief",5);
 const tectonics=val("tectonics",56)/100,erosion=val("erosion",28)/100,seasonPhase=val("season",50)/100*TAU;
 const threshold=.535+(val("seaLevel",50)-50)*.0042-val("landmass",0)*.0045;
 const height=new Float32Array(size),temperature=new Float32Array(size),moisture=new Float32Array(size),biome=new Uint8Array(size),counts=new Uint32Array(12);
 const plateRandom=seededRandom(seed^0x6a09e667);
 const plates=Array.from({length:14},()=>{const lat=Math.asin(plateRandom()*2-1),lon=plateRandom()*TAU-Math.PI;return{x:Math.cos(lat)*Math.cos(lon),y:Math.sin(lat),z:Math.cos(lat)*Math.sin(lon),continental:plateRandom()>.46,mode:Math.floor(plateRandom()*3)};});
 for(let y=0;y<H;y++){
  const lat=Math.PI/2-((y+.5)/H)*Math.PI,latSin=Math.sin(lat),latCos=Math.cos(lat);
  for(let x=0;x<W;x++){
   const lon=((x+.5)/W)*TAU-Math.PI,sx=latCos*Math.cos(lon),sy=latSin,sz=latCos*Math.sin(lon);
   const continent=fbm3(sx,sy,sz,2.25,3,seed+11),detail=fbm3(sx,sy,sz,6.6,2,seed+271),fine=noise3(sx*13.1,sy*13.1,sz*13.1,seed+701);
   let best=-Infinity,second=-Infinity,bestIndex=0,secondIndex=0;
   for(let p=0;p<plates.length;p++){const plate=plates[p],dot=sx*plate.x+sy*plate.y+sz*plate.z;if(dot>best){second=best;secondIndex=bestIndex;best=dot;bestIndex=p;}else if(dot>second){second=dot;secondIndex=p;}}
   const boundary=clamp(1-(best-second)*26,0,1),primary=plates[bestIndex],neighbour=plates[secondIndex];
   let stress;
   if(primary.continental&&neighbour.continental)stress=.085;
   else if(primary.continental!==neighbour.continental)stress=primary.continental ? .052 : -.045;
   else stress=primary.mode===0 ? .058 : primary.mode===1 ? -.047 : .008;
   height[y*W+x]=continent*.68+detail*.24+fine*.08+boundary*stress*tectonics;
  }
 }
 if(erosion>.001){
  let source=height,target=new Float32Array(size);const blend=erosion*.15;
  for(let pass=0;pass<2;pass++){
   for(let y=0;y<H;y++){const up=Math.max(0,y-1)*W,down=Math.min(H-1,y+1)*W,row=y*W;
    for(let x=0;x<W;x++){const left=row+(x-1+W)%W,right=row+(x+1)%W,i=row+x,avg=(source[left]+source[right]+source[up+x]+source[down+x])*.25;target[i]=lerp(source[i],avg,blend);}
   }
   const swap=source;source=target;target=swap;
  }
  height.set(source);
 }
 let landCount=0,totalTemp=0;
 for(let y=0;y<H;y++){
  const lat=Math.PI/2-((y+.5)/H)*Math.PI,latSin=Math.sin(lat),latCos=Math.cos(lat),absLat=Math.abs(lat*180/Math.PI);
  for(let x=0;x<W;x++){
   const lon=((x+.5)/W)*TAU-Math.PI,sx=latCos*Math.cos(lon),sy=latSin,sz=latCos*Math.sin(lon),idx=y*W+x;
   const h=height[idx],alt=h-threshold,seasonal=-Math.cos(seasonPhase)*Math.sin(lat)*12;
   const t=30-absLat*.48+tempOffset+seasonal-Math.max(0,alt)*130,rain=fbm3(sx,sy,sz,4.7,2,seed+1907);
   const east=height[y*W+(x+2)%W],west=height[y*W+(x-2+W)%W],windward=clamp(.5+(east-west)*1.8,0,1);
   const wet=clamp(humidity*.58+rain*.25+(1-Math.abs(latSin))*.15+windward*.12-Math.max(0,alt)*.18,0,1);
   temperature[idx]=t;moisture[idx]=wet;totalTemp+=t;
   let b;if(h<=threshold)b=t<-8?2:(h>threshold-.035?1:0);else if(t<-16)b=3;else if(t<-1)b=4;else if(alt>.135-relief*.0085)b=5;else if(wet<.22&&t>7)b=6;else if(t<7&&wet>.40)b=11;else if(wet<.38&&t>16)b=7;else if(wet>.78&&t>17)b=10;else if(wet>.51&&t>4)b=9;else b=8;
   biome[idx]=b;counts[b]++;if(h>threshold)landCount++;
  }
 }
 return{width:W,height: H,seed,heightField:height,temperature,moisture,biome,counts,landCount,totalTemp,threshold};
}
const root=typeof self!=="undefined"?self:globalThis;
root.PlanetForgeGenerator={generateFields,renderTexture};
})();
