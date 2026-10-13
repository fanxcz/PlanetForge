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
   const h=height[idx],alt=h-threshold,seasonal=Math.sin(seasonPhase)*Math.sin(lat)*12;
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
root.PlanetForgeGenerator={generateFields};
})();
