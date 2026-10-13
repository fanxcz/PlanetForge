"use strict";
importScripts("./generator.js");
self.onmessage=(event)=>{
 const job=event.data||{};
 try{
  const result=self.PlanetForgeGenerator.renderTexture(job.settings||{},job.options&&job.options.layer||"biome",job.options||{});
  self.postMessage({jobId:job.jobId,width:result.width,height:result.height,pixels:result.pixels.buffer},[result.pixels.buffer]);
 }catch(error){self.postMessage({jobId:job.jobId,error:error&&error.message?error.message:String(error)});}
};
