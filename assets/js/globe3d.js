(() => {
"use strict";
const VERTEX=`
attribute vec3 aPosition;
attribute vec2 aUV;
uniform vec2 uScale;
uniform vec2 uCenter;
uniform float uMode;
uniform float uRotation;
varying vec2 vUV;
varying vec3 vNormal;
void main(){
 float radius=1.0;if(uMode>0.5&&uMode<1.5)radius=1.016;if(uMode>1.5)radius=1.043;
 vec3 p=aPosition*radius;vNormal=normalize(p);
 vUV=vec2(aUV.x+0.5+uRotation/6.28318530718,aUV.y);
 gl_Position=vec4(p.x*uScale.x+uCenter.x,p.y*uScale.y+uCenter.y,-p.z*0.55,1.0);
}`;
const FRAGMENT=`
precision mediump float;
uniform sampler2D uSurface;uniform float uMode;uniform float uTime;uniform float uSeed;
varying vec2 vUV;varying vec3 vNormal;
float hash3(vec3 p){p=fract(p*0.3183099+vec3(0.1,0.2,0.3));p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float noise3(vec3 p){
 vec3 i=floor(p),f=fract(p);f=f*f*(3.0-2.0*f);
 float n000=hash3(i+vec3(0.,0.,0.)),n100=hash3(i+vec3(1.,0.,0.)),n010=hash3(i+vec3(0.,1.,0.)),n110=hash3(i+vec3(1.,1.,0.));
 float n001=hash3(i+vec3(0.,0.,1.)),n101=hash3(i+vec3(1.,0.,1.)),n011=hash3(i+vec3(0.,1.,1.)),n111=hash3(i+vec3(1.,1.,1.));
 float a=mix(mix(n000,n100,f.x),mix(n010,n110,f.x),f.y),b=mix(mix(n001,n101,f.x),mix(n011,n111,f.x),f.y);
 return mix(a,b,f.z);
}
float cloudNoise(vec3 p){float value=0.,amplitude=.5;for(int octave=0;octave<4;octave++){value+=noise3(p)*amplitude;p*=2.03;amplitude*=.5;}return value;}
void main(){
 vec3 n=normalize(vNormal);
 if(uMode<.5){
  vec3 tex=texture2D(uSurface,vUV).rgb,lightDir=normalize(vec3(-.42,.31,.852));
  float diffuse=max(dot(n,lightDir),0.),shade=.18+diffuse*.9;
  float oceanMask=smoothstep(.025,.25,tex.b-tex.r*.65);
  float specular=pow(max(dot(reflect(-lightDir,n),vec3(0.,0.,1.)),0.),30.)*oceanMask*.22;
  vec3 color=tex*shade+vec3(.33,.63,.8)*specular;
  float edge=smoothstep(0.,.035,n.z+.025);gl_FragColor=vec4(color,edge);
 }else if(uMode<1.5){
  vec3 p=n*7.5+vec3(uSeed*.013,uTime*.018,uTime*.006);float clouds=cloudNoise(p);
  float alpha=smoothstep(.54,.72,clouds)*.36*smoothstep(-.2,.32,n.z);
  vec3 light=vec3(.76,.87,.96)*(.72+max(dot(n,normalize(vec3(-.42,.31,.852))),0.)*.28);
  gl_FragColor=vec4(light,alpha);
 }else{
  float facing=max(n.z,0.),rim=pow(1.-facing,2.35);
  float night=1.-smoothstep(-.05,.3,dot(n,normalize(vec3(-.42,.31,.852))));
  float alpha=clamp(rim*.62+pow(rim,4.)*.20,0.,.78);
  vec3 atmosphere=mix(vec3(.14,.38,.75),vec3(.2,.88,.92),clamp(rim*1.4,0.,1.));
  gl_FragColor=vec4(atmosphere*(1.-night*.15),alpha);
 }
}`;
function compile(gl,type,source){const shader=gl.createShader(type);gl.shaderSource(shader,source);gl.compileShader(shader);if(!gl.getShaderParameter(shader,gl.COMPILE_STATUS)){const message=gl.getShaderInfoLog(shader)||"Unknown shader compilation error";gl.deleteShader(shader);throw new Error(message);}return shader;}
function createProgram(gl){const program=gl.createProgram();gl.attachShader(program,compile(gl,gl.VERTEX_SHADER,VERTEX));gl.attachShader(program,compile(gl,gl.FRAGMENT_SHADER,FRAGMENT));gl.linkProgram(program);if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw new Error(gl.getProgramInfoLog(program)||"Unable to link WebGL program");return program;}
function makeSphere(){
 const positions=[],uvs=[],columns=112,rows=56;
 function vertex(row,col){const lat=-Math.PI/2+row/rows*Math.PI,lon=col/columns*Math.PI*2,c=Math.cos(lat);positions.push(c*Math.sin(lon),Math.sin(lat),c*Math.cos(lon));uvs.push(col/columns,row/rows);}
 for(let row=0;row<rows;row++)for(let col=0;col<columns;col++){vertex(row,col);vertex(row+1,col);vertex(row,col+1);vertex(row,col+1);vertex(row+1,col);vertex(row+1,col+1);}
 return{positions:new Float32Array(positions),uvs:new Float32Array(uvs),count:positions.length/3};
}
function create(canvas){
 let gl;try{gl=canvas.getContext("webgl",{alpha:true,antialias:true,premultipliedAlpha:false,powerPreference:"high-performance"})||canvas.getContext("experimental-webgl",{alpha:true,antialias:true});}catch(_){return null;}
 if(!gl)return null;
 try{
  const program=createProgram(gl),sphere=makeSphere(),positionBuffer=gl.createBuffer(),uvBuffer=gl.createBuffer(),texture=gl.createTexture();
  gl.bindBuffer(gl.ARRAY_BUFFER,positionBuffer);gl.bufferData(gl.ARRAY_BUFFER,sphere.positions,gl.STATIC_DRAW);
  gl.bindBuffer(gl.ARRAY_BUFFER,uvBuffer);gl.bufferData(gl.ARRAY_BUFFER,sphere.uvs,gl.STATIC_DRAW);
  gl.bindTexture(gl.TEXTURE_2D,texture);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);
  const loc={position:gl.getAttribLocation(program,"aPosition"),uv:gl.getAttribLocation(program,"aUV"),scale:gl.getUniformLocation(program,"uScale"),center:gl.getUniformLocation(program,"uCenter"),mode:gl.getUniformLocation(program,"uMode"),rotation:gl.getUniformLocation(program,"uRotation"),surface:gl.getUniformLocation(program,"uSurface"),time:gl.getUniformLocation(program,"uTime"),seed:gl.getUniformLocation(program,"uSeed")};
  let uploadedRevision=-1,lastTexture=null,lost=false;
  canvas.addEventListener("webglcontextlost",event=>{event.preventDefault();lost=true;});
  canvas.addEventListener("webglcontextrestored",()=>{lost=false;uploadedRevision=-1;});
  function draw(mode,sx,sy,yOffset,rotation,time,seed){gl.uniform1f(loc.mode,mode);gl.uniform2f(loc.scale,sx,sy);gl.uniform2f(loc.center,0,yOffset);gl.uniform1f(loc.rotation,rotation);gl.uniform1f(loc.time,time);gl.uniform1f(loc.seed,seed%100003);gl.drawArrays(gl.TRIANGLES,0,sphere.count);}
  return{ready:true,render(surfaceCanvas,revision,rotation,radius,width,height,centerY,seed){
   if(lost||!gl)return false;
   if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;}
   gl.viewport(0,0,width,height);gl.clearColor(0,0,0,0);gl.clearDepth(1);gl.clear(gl.COLOR_BUFFER_BIT|gl.DEPTH_BUFFER_BIT);
   gl.enable(gl.DEPTH_TEST);gl.depthFunc(gl.LEQUAL);gl.enable(gl.BLEND);gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);gl.useProgram(program);
   gl.activeTexture(gl.TEXTURE0);gl.bindTexture(gl.TEXTURE_2D,texture);
   if(revision!==uploadedRevision||surfaceCanvas!==lastTexture){gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL,true);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,surfaceCanvas);uploadedRevision=revision;lastTexture=surfaceCanvas;}
   gl.uniform1i(loc.surface,0);gl.bindBuffer(gl.ARRAY_BUFFER,positionBuffer);gl.enableVertexAttribArray(loc.position);gl.vertexAttribPointer(loc.position,3,gl.FLOAT,false,0,0);gl.bindBuffer(gl.ARRAY_BUFFER,uvBuffer);gl.enableVertexAttribArray(loc.uv);gl.vertexAttribPointer(loc.uv,2,gl.FLOAT,false,0,0);
   const sx=radius/(width/2),sy=radius/(height/2),yOffset=1-2*centerY/height,now=performance.now()/1000;
   gl.depthMask(true);draw(0,sx,sy,yOffset,rotation,now,seed);gl.depthMask(false);draw(1,sx,sy,yOffset,rotation,now,seed);draw(2,sx,sy,yOffset,rotation,now,seed);gl.depthMask(true);return true;
  }};
 }catch(error){console.error("PlanetForge WebGL renderer unavailable; using Canvas fallback.",error);return null;}
}
window.PlanetForgeGlobe3D={create};
})();
