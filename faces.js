// Agent portraits on the room card. Each face is one still image; blinking, smiling and a slight tilt are drawn
// over it in code. A face only moves while NAYRA is really speaking about that agent (`aera:agent-presented`);
// otherwise it rests. Nothing here invents activity.
const images={
  MAYA:new URL('./assets/agents/maya.jpg',import.meta.url).href,
  NOA:new URL('./assets/agents/noa.jpg',import.meta.url).href,
  JOHN:new URL('./assets/agents/john.jpg',import.meta.url).href,
  LEO:new URL('./assets/agents/leo.jpg',import.meta.url).href,
  NINA:new URL('./assets/agents/nina.jpg',import.meta.url).href,
  ARI:new URL('./assets/agents/ari.jpg',import.meta.url).href
};
// Measured on each portrait, as fractions of the image: eyes [x, y, half width, half height], mouth [x, y, half width],
// crop [centre x, centre y, size] and the lid colour sampled from the skin under each eye.
const marks={
  MAYA:{eyes:[[.382,.418,.066,.027],[.612,.418,.066,.027]],mouth:[.5,.578,.071],crop:[.5,.43,.78],lid:['#885131','#a7795c']},
  NOA:{eyes:[[.398,.35,.05,.029],[.605,.35,.05,.029]],mouth:[.502,.488,.055],crop:[.5,.37,.74],lid:['#8a5834','#b0835b']},
  JOHN:{eyes:[[.42,.42,.036,.019],[.562,.418,.036,.019]],mouth:[.495,.575,.07],crop:[.49,.4,.8],lid:['#6c422f','#3e1d10']},
  LEO:{eyes:[[.432,.302,.034,.02],[.57,.302,.034,.02]],mouth:[.5,.433,.05],crop:[.5,.33,.66],lid:['#915e42','#c4967a']},
  NINA:{eyes:[[.4,.416,.047,.028],[.602,.416,.047,.028]],mouth:[.5,.545,.075],crop:[.5,.4,.8],lid:['#703c1f','#976345']},
  ARI:{eyes:[[.418,.382,.042,.022],[.582,.382,.042,.022]],mouth:[.5,.552,.06],crop:[.5,.37,.74],lid:['#9a6f4f','#b69175']}
};
const SIZE=192,still=matchMedia('(prefers-reduced-motion: reduce)');
const faces=new Set();let presented=new Set(),speaking=false,raf=0;
export function hasFace(name){return !!marks[name];}

function cropOf(m){const [cx,cy,s]=m.crop,x=Math.max(0,Math.min(1-s,cx-s/2)),y=Math.max(0,Math.min(1-s,cy-s/2));return {x,y,s};}
function prepare(face){
  const m=marks[face.name],c=cropOf(m),k=SIZE/c.s,ctx=face.ctx;
  ctx.setTransform(1,0,0,1,0,0);ctx.drawImage(face.image,c.x*face.image.naturalWidth,c.y*face.image.naturalHeight,c.s*face.image.naturalWidth,c.s*face.image.naturalHeight,0,0,SIZE,SIZE);
  face.base=ctx.getImageData(0,0,SIZE,SIZE);
  face.eyes=m.eyes.map(([x,y,rx,ry],i)=>({x:(x-c.x)*k,y:(y-c.y)*k,rx:rx*k,ry:ry*k,lid:m.lid[i]}));
  face.mouth={x:(m.mouth[0]-c.x)*k,y:(m.mouth[1]-c.y)*k,hw:m.mouth[2]*k};
}
// The mouth corners rise and the centre dips a little: the same pixels, moved along a smile curve.
function smile(face,amount){
  const {x:mx,y:my,hw}=face.mouth,bw=hw*1.5,bh=hw*.95,x0=Math.max(0,Math.floor(mx-bw)),x1=Math.min(SIZE,Math.ceil(mx+bw)),y0=Math.max(0,Math.floor(my-bh)),y1=Math.min(SIZE,Math.ceil(my+bh));
  const w=x1-x0,h=y1-y0;if(w<=0||h<=0)return;
  const src=face.base.data,out=face.ctx.createImageData(w,h),dst=out.data,lift=hw*.36*amount;
  for(let y=y0;y<y1;y++){
    const v=(y-my)/bh,wy=(1-v*v)*(1-v*v);
    for(let x=x0;x<x1;x++){
      const u=Math.min(1,Math.abs(x-mx)/bw),curve=Math.sin(Math.PI*Math.pow(u,1.9))-.28*Math.max(0,1-u/.34);
      const sy=y+lift*curve*wy,ya=Math.max(0,Math.min(SIZE-1,Math.floor(sy))),yb=Math.min(SIZE-1,ya+1),t=sy-Math.floor(sy);
      const a=(ya*SIZE+x)*4,b=(yb*SIZE+x)*4,o=((y-y0)*w+(x-x0))*4;
      for(let c=0;c<3;c++)dst[o+c]=src[a+c]*(1-t)+src[b+c]*t;
      dst[o+3]=255;
    }
  }
  face.ctx.putImageData(out,x0,y0);
}
// Upper lids close over the eyes; `closed` goes from 0 (open) to 1 (shut).
function lids(face,closed){
  if(closed<=.01)return;
  const ctx=face.ctx;
  for(const e of face.eyes){
    const rx=e.rx*1.12,ry=e.ry*1.22,control=e.y-2*ry+closed*3.9*ry;
    ctx.save();ctx.beginPath();ctx.ellipse(e.x,e.y,rx,ry,0,0,Math.PI*2);ctx.clip();
    ctx.beginPath();ctx.moveTo(e.x-rx*1.2,e.y-ry*3);ctx.lineTo(e.x+rx*1.2,e.y-ry*3);ctx.lineTo(e.x+rx*1.2,e.y);ctx.quadraticCurveTo(e.x,control,e.x-rx*1.2,e.y);ctx.closePath();
    const shade=ctx.createLinearGradient(0,e.y-ry,0,e.y+ry);shade.addColorStop(0,'rgba(0,0,0,.2)');shade.addColorStop(.55,'rgba(0,0,0,0)');
    ctx.fillStyle=e.lid;ctx.fill();ctx.fillStyle=shade;ctx.fill();
    ctx.restore();
    ctx.beginPath();ctx.moveTo(e.x-rx*.98,e.y);ctx.quadraticCurveTo(e.x,control,e.x+rx*.98,e.y);
    ctx.strokeStyle=`rgba(22,14,10,${Math.min(1,closed*2.4)})`;ctx.lineWidth=Math.max(1.2,SIZE*.011);ctx.lineCap='round';ctx.stroke();
  }
}
function draw(face,time){
  if(!face.base)return;
  face.ctx.putImageData(face.base,0,0);
  if(face.amount>.004)smile(face,face.amount);
  lids(face,Math.max(face.blink,face.amount*.16));
  const sway=still.matches?0:Math.sin(time/1000*1.25+face.seed);
  face.canvas.style.transform=face.amount>.004&&!still.matches?`rotate(${(-1.9+sway*1.1)*face.amount}deg) translateY(${(-1.2+sway*.5)*face.amount}%) scale(${1+.04*face.amount})`:'';
}
function wanted(face){return speaking&&presented.has(face.name);}
function tick(time){
  raf=0;let busy=false;
  for(const face of faces){
    if(!face.canvas.isConnected){faces.delete(face);continue;}
    const target=wanted(face)?1:0,dt=Math.min(.05,(time-(face.last||time))/1000);face.last=time;
    if(still.matches){face.amount=target;face.blink=0;}
    else{
      face.amount+=(target-face.amount)*Math.min(1,dt*5.5);if(Math.abs(target-face.amount)<.004)face.amount=target;
      if(target){
        if(time>=face.nextBlink){face.blinkStart=time;face.nextBlink=time+2300+Math.random()*2600;}
        const p=(time-face.blinkStart)/170;face.blink=p>=0&&p<1?Math.sin(Math.PI*p):0;
      }else face.blink=0;
    }
    draw(face,time);
    if(!still.matches&&(target||face.amount>0))busy=true;else face.last=0;
  }
  if(busy)raf=requestAnimationFrame(tick);
}
function wake(){if(!raf)raf=requestAnimationFrame(tick);}

// Puts the agent's face in `element`, or the initial when there is no portrait for that name.
export function mountFace(element,name){
  if(element.dataset.agent===name&&(element.firstChild||!marks[name]))return;
  for(const face of faces)if(face.element===element)faces.delete(face);
  element.dataset.agent=name;element.replaceChildren();
  if(!marks[name]){element.classList.remove('agent-face');element.textContent=(name||'')[0]||'';return;}
  const canvas=document.createElement('canvas');canvas.width=canvas.height=SIZE;
  const face={name,element,canvas,ctx:canvas.getContext('2d',{willReadFrequently:true}),image:new Image(),base:null,amount:0,blink:0,blinkStart:-1e9,nextBlink:0,seed:name.charCodeAt(0),last:0};
  element.classList.add('agent-face');element.append(canvas);faces.add(face);
  face.image.onload=()=>{prepare(face);face.nextBlink=performance.now()+700;wake();};
  face.image.onerror=()=>{faces.delete(face);element.classList.remove('agent-face');element.textContent=name[0];};
  face.image.src=images[name];
}
// Test hook: draws one fixed pose (no animation), to check the lids and the smile of a portrait.
export function poseFace(element,{smile:amount=0,blink=0}={}){for(const face of faces)if(face.element===element&&face.base){face.amount=amount;face.blink=blink;draw(face,0);face.amount=0;face.blink=0;}}
// The only way a face animates: NAYRA is speaking and her sentence names the agent.
export function setPresented(names,isSpeaking){presented=new Set(names||[]);speaking=!!isSpeaking;wake();}
window.addEventListener('aera:agent-presented',e=>setPresented(e.detail?.names,e.detail?.speaking));
still.addEventListener('change',wake);
