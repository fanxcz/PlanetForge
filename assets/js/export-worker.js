"use strict";
importScripts("./generator.js");
self.onmessage=(event)=>{
 const job=event.data||{};
 try{
  if(Array.isArray(job.layers)&&job.layers.length){
   const layers=self.PlanetForgeGenerator.renderTexturePack(job.settings||{},job.layers,job.options||{});
   const transfer=layers.map(layer=>layer.pixels.buffer);
   self.postMessage({jobId:job.jobId,layers:layers.map(layer=>({layer:layer.layer,width:layer.width,height:layer.height,pixels:layer.pixels.buffer}))},transfer);
  }else{
   const result=self.PlanetForgeGenerator.renderTexture(job.settings||{},job.options&&job.options.layer||"biome",job.options||{});
   self.postMessage({jobId:job.jobId,width:result.width,height:result.height,pixels:result.pixels.buffer},[result.pixels.buffer]);
  }
 }catch(error){self.postMessage({jobId:job.jobId,error:error&&error.message?error.message:String(error)});}
};
