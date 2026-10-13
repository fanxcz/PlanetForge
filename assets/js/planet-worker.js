"use strict";
importScripts("./generator.js");
self.onmessage=(event)=>{
 const job=event.data||{};
 try{
  const fields=self.PlanetForgeGenerator.generateFields(job.settings||{});
  const transfer=[fields.heightField.buffer,fields.temperature.buffer,fields.moisture.buffer,fields.tectonicField.buffer,fields.biome.buffer,fields.counts.buffer];
  self.postMessage({jobId:job.jobId,fields},transfer);
 }catch(error){
  self.postMessage({jobId:job.jobId,error:error&&error.message?error.message:String(error)});
 }
};
