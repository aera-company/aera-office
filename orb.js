// NAYRA's orb: a ring of fine lines that waves like a ribbon and breathes with her voice.
// Drawn procedurally on a canvas (no image). The host element carries the voice level in the CSS variable --level (0 to 1);
// nayra.js sets it from the spoken words and nayra-voz.js from the agent's real output volume.
const COLORS={marfim:[241,236,224],violeta:[150,120,255]};

export function mountOrb(host,{lines=52,points=200,color:fixed=''}={}){
  const canvas=document.createElement('canvas');canvas.className='orb-canvas';canvas.setAttribute('aria-hidden','true');
  host.prepend(canvas);
  const ctx=canvas.getContext('2d');
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  let raf=0,t=Math.random()*100,level=0,last=performance.now(),size=0,dpr=1;

  function resize(){
    const box=host.getBoundingClientRect();dpr=Math.min(2,window.devicePixelRatio||1);
    size=Math.max(24,Math.min(box.width,box.height));canvas.width=canvas.height=Math.round(size*dpr);
    canvas.style.width=canvas.style.height=size+'px';
  }
  function color(){
    const name=fixed||getComputedStyle(document.documentElement).getPropertyValue('--orb-color').trim()||'marfim';
    return COLORS[name]||COLORS.marfim;
  }
  function frame(now){
    const dt=Math.min(.05,(now-last)/1000);last=now;
    if(!size)resize();
    // data-level-hold lets a review capture the speaking state; normally the voice drives --level.
    const target=Math.max(Number(host.style.getPropertyValue('--level'))||0,Number(host.dataset.levelHold)||0);
    level+=(target-level)*Math.min(1,dt*10);
    t+=dt*(0.55+level*1.6);
    draw();
    raf=requestAnimationFrame(frame);
  }
  function draw(){
    const W=canvas.width,c=W/2,R=W*0.33,[r,g,b]=color();
    ctx.clearRect(0,0,W,W);
    // Ring-shaped light under the lines, so the ribbon reads as glowing on dark backgrounds.
    const halo=ctx.createRadialGradient(c,c,R*0.55,c,c,R*1.45);
    halo.addColorStop(0,`rgba(${r},${g},${b},0)`);halo.addColorStop(.42,`rgba(${r},${g},${b},${0.07+level*0.1})`);halo.addColorStop(1,`rgba(${r},${g},${b},0)`);
    ctx.fillStyle=halo;ctx.fillRect(0,0,W,W);
    ctx.globalCompositeOperation='lighter';
    const amp=0.05+level*0.11,lw=Math.max(.5,W/600);
    for(let i=0;i<lines;i++){
      const p=i/(lines-1),twist=(p-.5)*2;
      ctx.beginPath();
      for(let k=0;k<=points;k++){
        const a=k/points*Math.PI*2;
        // Slow waves shared by every line, plus a width that swells and pinches along the ring:
        // the lines spread apart and cross over, which reads as a twisted ribbon of fine mesh.
        const wave=Math.sin(3*a+t*.9+p*1.2)*.55+Math.sin(5*a-t*1.25+p*1.8)*.3+Math.sin(2*a+t*.45-p*.9)*.35;
        const width=0.16*Math.sin(2*a+t*.6)+0.06*Math.sin(5*a-t*.9);
        const rad=R*(1+amp*wave+twist*width*(1+level*.6));
        const x=c+Math.cos(a)*rad,y=c+Math.sin(a)*rad;
        k?ctx.lineTo(x,y):ctx.moveTo(x,y);
      }
      const edge=1-Math.abs(twist)*.85;
      ctx.strokeStyle=`rgba(${r},${g},${b},${(0.07+edge*0.2)*(0.85+level*0.5)})`;
      ctx.lineWidth=lw;ctx.stroke();
    }
    // One brighter crest line with a glow, the "thread" the eye follows.
    ctx.shadowColor=`rgba(${r},${g},${b},.9)`;ctx.shadowBlur=W/40;
    ctx.beginPath();
    for(let k=0;k<=points;k++){
      const a=k/points*Math.PI*2,p=.5;
      const wave=Math.sin(3*a+t*.9+p*1.2)*.55+Math.sin(5*a-t*1.25+p*1.8)*.3+Math.sin(2*a+t*.45-p*.9)*.35;
      const rad=R*(1+amp*wave);const x=c+Math.cos(a)*rad,y=c+Math.sin(a)*rad;k?ctx.lineTo(x,y):ctx.moveTo(x,y);
    }
    ctx.strokeStyle=`rgba(${r},${g},${b},${0.55+level*0.35})`;ctx.lineWidth=lw*1.6;ctx.stroke();
    ctx.shadowBlur=0;ctx.globalCompositeOperation='source-over';
  }
  function start(){if(raf)return;resize();last=performance.now();if(reduce.matches){draw();return;}raf=requestAnimationFrame(frame);}
  function stop(){cancelAnimationFrame(raf);raf=0;}
  // Runs only while the host is on screen: the orb costs nothing when its stage is closed.
  const seen=new IntersectionObserver(([e])=>{if(e.isIntersecting)start();else stop();});seen.observe(host);
  window.addEventListener('resize',()=>{size=0;});
  return {start,stop,redraw:draw};
}
