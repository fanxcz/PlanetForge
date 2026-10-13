(() => {
"use strict";
function encode(text){
 const bytes=new TextEncoder().encode(text);let binary="";
 for(let i=0;i<bytes.length;i+=0x4000)binary+=String.fromCharCode(...bytes.subarray(i,i+0x4000));
 return btoa(binary).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"");
}
function decode(text){
 const normalized=text.replace(/-/g,"+").replace(/_/g,"/");
 const padded=normalized+"=".repeat((4-normalized.length%4)%4);
 const bytes=Uint8Array.from(atob(padded),c=>c.charCodeAt(0));
 return new TextDecoder().decode(bytes);
}
function createURL(project){const url=new URL(window.location.href);url.hash="pf="+encode(JSON.stringify(project));return url.toString();}
function readFromLocation(){
 try{const hash=window.location.hash.replace(/^#/,"");if(!hash.startsWith("pf="))return null;
 const project=JSON.parse(decode(hash.slice(3)));return project&&typeof project==="object"&&project.format==="planetforge-world"?project:null;
 }catch(error){console.warn("Invalid PlanetForge share link",error);return null;}
}
window.PlanetForgeShare={createURL,readFromLocation};
})();
