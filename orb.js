// NAYRA's orb: a ring of fine lines that waves like a ribbon and breathes with her voice. With mesh (C81) it adds
// a fine ripple and a faint wire sphere inside. With image (C85) it is NAYRA's picture, and the ring is only the fallback.
// Drawn procedurally on a canvas (no image). The host element carries the voice level in the CSS variable --level (0 to 1);
// nayra.js sets it from the spoken words and nayra-voz.js from the agent's real output volume.
const COLORS={marfim:[241,236,224],violeta:[150,120,255]};

export function mountOrb(host,{lines=52,points=200,color:fixed='',mesh=false,image=''}={}){
  const canvas=document.createElement('canvas');canvas.className='orb-canvas';canvas.setAttribute('aria-hidden','true');
  host.prepend(canvas);
  const ctx=canvas.getContext('2d');
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  let raf=0,t=Math.random()*100,level=0,last=performance.now(),size=0,dpr=1,shade=null,shadeKey='';
  // C85: the orb is Tiago's image of NAYRA, whole (transparent around the sphere). The drawn ring is only the fallback if it fails to load.
  let picture=null;
  if(image){const img=new Image();img.decoding='async';img.onload=()=>{picture=img;if(!raf)draw();};img.src=image;}

  function resize(){
    const box=host.getBoundingClientRect();dpr=Math.min(2,window.devicePixelRatio||1);
    size=Math.max(24,Math.min(box.width,box.height));canvas.width=canvas.height=Math.round(size*dpr);
    canvas.style.width=canvas.style.height=size+'px';shade=null;
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
  // C81: brighter at the top and bottom crests, softer at the sides, like light caught on a wire sphere.
  function crestShade(W,c,R,[r,g,b]){
    const key=W+'|'+r+g+b;if(shade&&shadeKey===key)return shade;
    const s=ctx.createLinearGradient(0,c-R*1.35,0,c+R*1.35);
    s.addColorStop(0,`rgba(${r},${g},${b},1)`);s.addColorStop(.3,`rgba(${r},${g},${b},.55)`);
    s.addColorStop(.5,`rgba(${r},${g},${b},.4)`);s.addColorStop(.7,`rgba(${r},${g},${b},.55)`);s.addColorStop(1,`rgba(${r},${g},${b},1)`);
    shade=s;shadeKey=key;return s;
  }
  // The slow shape every ribbon line shares: three soft lobes that drift.
  const wave=(a,p)=>Math.sin(3*a+t*.9+p*1.2)*.55+Math.sin(5*a-t*1.25+p*1.8)*.3+Math.sin(2*a+t*.45-p*.9)*.35;
  // The four points where the arcs meet in the image (fractions of its width and height).
  const FLARES=[[.25,.19],[.905,.44],[.092,.612],[.712,.848]];
  function drawPicture(W,c,[r,g,b]){
    ctx.clearRect(0,0,W,W);
    // A soft light behind the sphere that opens with her voice.
    const halo=ctx.createRadialGradient(c,c,W*.3,c,c,W*.5);
    halo.addColorStop(0,`rgba(${r},${g},${b},${.04+level*.14})`);halo.addColorStop(1,`rgba(${r},${g},${b},0)`);
    ctx.fillStyle=halo;ctx.fillRect(0,0,W,W);
    // At rest she barely breathes; the voice swells the sphere and lifts its light. Nothing moves the face apart from the whole.
    const s=W*(.985+(reduce.matches?0:Math.sin(t*.7)*.005)+level*.015),o=c-s/2;
    ctx.drawImage(picture,o,o,s,s);
    ctx.globalCompositeOperation='lighter';
    if(level>.01){ctx.globalAlpha=Math.min(.45,level*.45);ctx.drawImage(picture,o,o,s,s);ctx.globalAlpha=1;}
    FLARES.forEach(([fx,fy],i)=>{
      const x=o+fx*s,y=o+fy*s,rad=W*(.035+level*.06),a=(reduce.matches?.2:.16+Math.sin(t*1.1+i*1.7)*.1)+level*.6;
      const g2=ctx.createRadialGradient(x,y,0,x,y,rad);
      g2.addColorStop(0,`rgba(255,246,232,${Math.min(1,a)})`);g2.addColorStop(.35,`rgba(${r},${g},${b},${Math.min(1,a)*.3})`);g2.addColorStop(1,`rgba(${r},${g},${b},0)`);
      ctx.fillStyle=g2;ctx.fillRect(x-rad,y-rad,rad*2,rad*2);
    });
    ctx.globalCompositeOperation='source-over';
  }
  function draw(){
    const W=canvas.width,c=W/2,R=W*0.33,[r,g,b]=color();
    if(picture){drawPicture(W,c,[r,g,b]);return;}
    ctx.clearRect(0,0,W,W);
    // Ring-shaped light under the lines, so the ribbon reads as glowing on dark backgrounds.
    const halo=ctx.createRadialGradient(c,c,R*0.55,c,c,R*1.45);
    halo.addColorStop(0,`rgba(${r},${g},${b},0)`);halo.addColorStop(.42,`rgba(${r},${g},${b},${0.07+level*0.1})`);halo.addColorStop(1,`rgba(${r},${g},${b},0)`);
    ctx.fillStyle=halo;ctx.fillRect(0,0,W,W);
    ctx.globalCompositeOperation='lighter';
    const amp=0.05+level*0.11,lw=Math.max(.5,W/(mesh?800:600));
    if(mesh)sphere(W,c,R,[r,g,b],lw);
    ctx.strokeStyle=mesh?crestShade(W,c,R,[r,g,b]):`rgb(${r},${g},${b})`;ctx.lineWidth=lw;
    // A fine ripple rides on the ribbon (C81); it is calm at rest and grows rough while she speaks.
    const rough=mesh?(0.03+level*0.08):0;
    for(let i=0;i<lines;i++){
      const p=i/(lines-1),twist=(p-.5)*2,ph=i*1.618;
      ctx.beginPath();
      for(let k=0;k<=points;k++){
        const a=k/points*Math.PI*2;
        // The lines spread apart and cross over along the ring, which reads as a twisted ribbon of fine mesh.
        const width=0.16*Math.sin(2*a+t*.6)+0.06*Math.sin(5*a-t*.9);
        const jag=rough?(Math.sin(11*a+t*2.1+ph)*.5+Math.sin(17*a-t*1.7+ph*1.3)*.3+Math.sin(29*a+t*2.9+ph*.7)*.2)*(0.4+Math.abs(twist)):0;
        const rad=R*(1+amp*wave(a,p)+twist*width*(1+level*.6)+rough*jag);
        const x=c+Math.cos(a)*rad,y=c+Math.sin(a)*rad;
        k?ctx.lineTo(x,y):ctx.moveTo(x,y);
      }
      const edge=1-Math.abs(twist)*.85;
      ctx.globalAlpha=(mesh?(0.07+edge*0.2):(0.07+edge*0.2))*(0.85+level*0.5);
      ctx.stroke();
    }
    ctx.globalAlpha=1;
    // One brighter crest line with a glow, the "thread" the eye follows.
    ctx.shadowColor=`rgba(${r},${g},${b},.9)`;ctx.shadowBlur=W/40;
    ctx.beginPath();
    for(let k=0;k<=points;k++){
      const a=k/points*Math.PI*2;
      const rad=R*(1+amp*wave(a,.5));const x=c+Math.cos(a)*rad,y=c+Math.sin(a)*rad;k?ctx.lineTo(x,y):ctx.moveTo(x,y);
    }
    ctx.strokeStyle=`rgba(${r},${g},${b},${0.55+level*0.35})`;ctx.lineWidth=lw*(mesh?2.2:1.6);ctx.stroke();
    ctx.shadowBlur=0;ctx.globalCompositeOperation='source-over';
  }
  // C81: a faint wire sphere inside the ring that turns slowly; meridians and latitudes, breathing with the voice.
  function sphere(W,c,R,[r,g,b],lw){
    const S=R*(0.9+level*0.04),rot=t*.18,tilt=.32,ct=Math.cos(tilt),st=Math.sin(tilt);
    ctx.lineWidth=lw;ctx.strokeStyle=`rgb(${r},${g},${b})`;
    const n=40,steps=48;
    for(let m=0;m<n;m++){
      const phi=m/n*Math.PI*2+rot;
      ctx.beginPath();
      for(let k=0;k<=steps;k++){
        const th=k/steps*Math.PI,wob=1+(0.02+level*0.05)*Math.sin(7*th+m*.9+t*1.4);
        const x0=Math.sin(th)*Math.cos(phi)*S*wob,y0=-Math.cos(th)*S*wob,z0=Math.sin(th)*Math.sin(phi)*S*wob;
        const y=y0*ct-z0*st;
        k?ctx.lineTo(c+x0,c+y):ctx.moveTo(c+x0,c+y);
      }
      // Lines on the far side of the sphere are dimmer, which gives the mesh its depth.
      const front=Math.sin(phi)>0;
      ctx.globalAlpha=(front?0.13:0.05)*(0.8+level*0.9);ctx.stroke();
    }
    for(let j=1;j<14;j++){
      const s=-1+j/7,ry=Math.sqrt(1-s*s)*S;
      ctx.beginPath();
      for(let k=0;k<=72;k++){
        const a=k/72*Math.PI*2,x0=Math.cos(a)*ry,z0=Math.sin(a)*ry,y0=s*S;
        const y=y0*ct-z0*st;k?ctx.lineTo(c+x0,c+y):ctx.moveTo(c+x0,c+y);
      }
      ctx.globalAlpha=0.075*(0.8+level*0.9);ctx.stroke();
    }
    ctx.globalAlpha=1;
  }
  function start(){if(raf)return;resize();last=performance.now();if(reduce.matches){draw();return;}raf=requestAnimationFrame(frame);}
  function stop(){cancelAnimationFrame(raf);raf=0;}
  // Runs only while the host is on screen: the orb costs nothing when its stage is closed.
  const seen=new IntersectionObserver(([e])=>{if(e.isIntersecting)start();else stop();});seen.observe(host);
  window.addEventListener('resize',()=>{size=0;});
  return {start,stop,redraw:draw};
}
