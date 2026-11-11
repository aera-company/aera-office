// What hangs on the walls and shows on the screens inside the rooms. Drawn on canvases, in the house typeface.
// Two kinds of surface, kept apart on purpose:
// - the method of each room (research wall, mood board, opportunity map): fixed, it says how the room works, never
//   that something is happening;
// - the live surfaces (the agents' monitors and the operation board in Comando): they show only what the office
//   server reports. With no task running a monitor rests on its standby screen, and the board shows empty columns.
const FONT='"Instrument Sans Variable","Helvetica Neue",sans-serif',MONO='"SFMono-Regular",Menlo,monospace';
const INK='#eee9df',MUTED='#9fb0b5',FAINT='#5f6f74',WARM='#e6b27b';

function fit(ctx,text,width){
  let t=String(text||'');if(ctx.measureText(t).width<=width)return t;
  while(t.length>1&&ctx.measureText(t+'…').width>width)t=t.slice(0,-1);
  return t.trimEnd()+'…';
}
function lines(ctx,text,width,max){
  const words=String(text||'').split(/\s+/).filter(Boolean),out=[];let line='';
  for(const w of words){const next=line?line+' '+w:w;if(ctx.measureText(next).width>width&&line){out.push(line);line=w;}else line=next;}
  if(line)out.push(line);
  if(out.length>max){out.length=max;out[max-1]=fit(ctx,out[max-1]+' …',width);}
  return out;
}
function seeded(seed){let s=seed;return ()=>{s=(s*16807)%2147483647;return s/2147483647;};}

// THINK: the research wall. Three columns of the method with notes pinned under them; the notes carry no content.
export function drawResearchWall(ctx,w,h){
  ctx.fillStyle='#d9d1c1';ctx.fillRect(0,0,w,h);
  const r=seeded(31);
  for(let i=0;i<5000;i++){ctx.fillStyle=r()>.5?'rgba(255,255,255,.06)':'rgba(80,60,30,.05)';ctx.fillRect(r()*w,r()*h,2,2);}
  const columns=['Contexto','Público','Ângulo'],colors=[['#f1d98a','#efe4b6'],['#a9cfc0','#cfe3d9'],['#e9b49a','#f2d3c3']];
  const cw=w/3;
  columns.forEach((title,c)=>{
    const x0=c*cw+cw*.08;
    ctx.fillStyle='#2b2b28';ctx.font=`600 ${h*.085}px ${FONT}`;ctx.fillText(title,x0,h*.16);
    ctx.fillStyle='#2b2b2833';ctx.fillRect(x0,h*.2,cw*.84,3);
    for(let i=0;i<5;i++){
      const nx=x0+(i%2)*cw*.43+r()*8,ny=h*.27+Math.floor(i/2)*h*.22+r()*10,nw=cw*.38,nh=h*.17,rot=(r()-.5)*.07;
      ctx.save();ctx.translate(nx+nw/2,ny+nh/2);ctx.rotate(rot);
      ctx.fillStyle='rgba(0,0,0,.12)';ctx.fillRect(-nw/2+4,-nh/2+5,nw,nh);
      ctx.fillStyle=colors[c][i%2];ctx.fillRect(-nw/2,-nh/2,nw,nh);
      ctx.strokeStyle='rgba(40,40,40,.35)';ctx.lineWidth=3;
      for(let k=0;k<3;k++){ctx.beginPath();ctx.moveTo(-nw*.38,-nh*.22+k*nh*.2);ctx.lineTo(-nw*.38+nw*(.45+r()*.3),-nh*.22+k*nh*.2);ctx.stroke();}
      ctx.restore();
    }
  });
  ctx.strokeStyle='rgba(60,50,40,.25)';ctx.lineWidth=3;ctx.setLineDash([10,10]);
  for(const c of [1,2]){ctx.beginPath();ctx.moveTo(c*cw,h*.08);ctx.lineTo(c*cw,h*.94);ctx.stroke();}
  ctx.setLineDash([]);
}

// CREATE: the mood board. Palette, type specimen, image tiles and a layout grid; all abstract.
export function drawMoodboard(ctx,w,h){
  ctx.fillStyle='#ece6da';ctx.fillRect(0,0,w,h);
  const r=seeded(57),pin=(x,y)=>{ctx.fillStyle='#b74b3a';ctx.beginPath();ctx.arc(x,y,6,0,Math.PI*2);ctx.fill();};
  const tile=(x,y,tw,th,draw)=>{ctx.save();ctx.fillStyle='rgba(0,0,0,.14)';ctx.fillRect(x+5,y+6,tw,th);ctx.beginPath();ctx.rect(x,y,tw,th);ctx.clip();draw(x,y,tw,th);ctx.restore();pin(x+tw/2,y+10);};
  // Image tiles: sea and dusk gradients, a sun, a hill line.
  tile(w*.03,h*.08,w*.2,h*.5,(x,y,tw,th)=>{const g=ctx.createLinearGradient(0,y,0,y+th);g.addColorStop(0,'#2f4f6e');g.addColorStop(.55,'#e2a983');g.addColorStop(.56,'#1f5866');g.addColorStop(1,'#123643');ctx.fillStyle=g;ctx.fillRect(x,y,tw,th);ctx.fillStyle='#ffe2b8';ctx.beginPath();ctx.arc(x+tw*.62,y+th*.5,tw*.08,0,Math.PI*2);ctx.fill();});
  tile(w*.26,h*.12,w*.16,h*.36,(x,y,tw,th)=>{ctx.fillStyle='#c98a4f';ctx.fillRect(x,y,tw,th);ctx.fillStyle='#2c3b33';ctx.beginPath();ctx.moveTo(x,y+th);ctx.quadraticCurveTo(x+tw*.3,y+th*.25,x+tw*.55,y+th*.55);ctx.quadraticCurveTo(x+tw*.8,y+th*.2,x+tw,y+th*.6);ctx.lineTo(x+tw,y+th);ctx.fill();});
  tile(w*.03,h*.64,w*.39,h*.28,(x,y,tw,th)=>{ctx.fillStyle='#1d2327';ctx.fillRect(x,y,tw,th);ctx.strokeStyle='#e6b27b';ctx.lineWidth=2;for(let i=0;i<6;i++){ctx.beginPath();ctx.moveTo(x+tw*(.08+i*.15),y+th*.2);ctx.lineTo(x+tw*(.08+i*.15),y+th*.8);ctx.stroke();}});
  // Type specimen.
  tile(w*.46,h*.08,w*.24,h*.42,(x,y,tw,th)=>{ctx.fillStyle='#f7f3ea';ctx.fillRect(x,y,tw,th);ctx.fillStyle='#1d2327';ctx.font=`500 ${th*.5}px ${FONT}`;ctx.fillText('Aa',x+tw*.1,y+th*.62);ctx.font=`500 ${th*.07}px ${FONT}`;ctx.fillStyle='#5b6266';ctx.fillText('Instrument Sans',x+tw*.1,y+th*.82);});
  // Palette.
  const palette=['#0f1c23','#26475a','#e6b27b','#c9563f','#eee9df'];
  palette.forEach((c,i)=>{const x=w*.46+i*w*.05,y=h*.58,sw=w*.044,sh=h*.3;ctx.fillStyle='rgba(0,0,0,.12)';ctx.fillRect(x+4,y+5,sw,sh);ctx.fillStyle=c;ctx.fillRect(x,y,sw,sh);});
  ctx.fillStyle='#5b6266';ctx.font=`500 ${h*.05}px ${FONT}`;ctx.fillText('Paleta',w*.46,h*.95);
  // Layout grid.
  tile(w*.74,h*.08,w*.23,h*.84,(x,y,tw,th)=>{ctx.fillStyle='#fbf8f1';ctx.fillRect(x,y,tw,th);ctx.strokeStyle='#c9563f55';ctx.lineWidth=1.5;for(let i=1;i<4;i++){ctx.beginPath();ctx.moveTo(x+tw*i/4,y);ctx.lineTo(x+tw*i/4,y+th);ctx.stroke();}ctx.fillStyle='#d8cfbf';ctx.fillRect(x+tw*.08,y+th*.08,tw*.84,th*.32);ctx.fillStyle='#1d2327';for(let k=0;k<5;k++)ctx.fillRect(x+tw*.08,y+th*(.48+k*.07),tw*(.5+r()*.34),th*.025);});
}

// GROW: the opportunity map. The path of the room, from audience to relationship, as a drawn funnel.
export function drawFunnel(ctx,w,h){
  ctx.fillStyle='#f4f1ea';ctx.fillRect(0,0,w,h);
  ctx.strokeStyle='#cfc8bb';ctx.lineWidth=6;ctx.strokeRect(3,3,w-6,h-6);
  const steps=['Públicos','Oportunidades','Relacionamento'],colors=['#9c5b4b','#c98a4f','#5f7d6d'];
  ctx.font=`600 ${h*.11}px ${FONT}`;
  steps.forEach((s,i)=>{
    const top=h*(.14+i*.25),bh=h*.18,inset=w*(.06+i*.09);
    ctx.fillStyle=colors[i];ctx.beginPath();ctx.moveTo(inset,top);ctx.lineTo(w-inset-w*.18,top);ctx.lineTo(w-inset-w*.18-w*.04,top+bh);ctx.lineTo(inset+w*.04,top+bh);ctx.closePath();ctx.fill();
    ctx.fillStyle='#fbf8f2';ctx.fillText(s,inset+w*.06,top+bh*.7);
  });
  ctx.strokeStyle='#2b2b28';ctx.lineWidth=4;ctx.setLineDash([12,10]);
  ctx.beginPath();ctx.moveTo(w*.86,h*.22);ctx.quadraticCurveTo(w*.97,h*.5,w*.86,h*.78);ctx.stroke();ctx.setLineDash([]);
  ctx.beginPath();ctx.moveTo(w*.86,h*.78);ctx.lineTo(w*.88,h*.7);ctx.moveTo(w*.86,h*.78);ctx.lineTo(w*.92,h*.75);ctx.stroke();
}

// A monitor at rest: the AERA mark and whose desk it is. Nothing suggests work in progress.
export function drawStandby(ctx,w,h,{label=''}={}){
  const g=ctx.createLinearGradient(0,0,w,h);g.addColorStop(0,'#0e1a20');g.addColorStop(1,'#16262d');ctx.fillStyle=g;ctx.fillRect(0,0,w,h);
  ctx.fillStyle=INK;ctx.font=`300 ${h*.2}px ${FONT}`;ctx.textAlign='center';ctx.fillText('AERA',w/2,h*.52);
  if(label){ctx.fillStyle=FAINT;ctx.font=`500 ${h*.075}px ${FONT}`;ctx.fillText(label,w/2,h*.74);}
  ctx.textAlign='left';
}
// A monitor with a real task: who, what and a moving progress line. `tick` advances the line; it is only called while
// the server reports the task as running.
export function drawActive(ctx,w,h,{agent,title,phase='Em tarefa',tick=0}){
  ctx.fillStyle='#0d171c';ctx.fillRect(0,0,w,h);
  ctx.fillStyle='#16262d';ctx.fillRect(0,0,w,h*.17);
  ctx.fillStyle=WARM;ctx.beginPath();ctx.arc(w*.06,h*.085,h*.03,0,Math.PI*2);ctx.fill();
  ctx.fillStyle=INK;ctx.font=`600 ${h*.08}px ${FONT}`;ctx.fillText(fit(ctx,`${agent} · ${phase}`,w*.86),w*.1,h*.115);
  ctx.fillStyle=INK;ctx.font=`500 ${h*.105}px ${FONT}`;
  lines(ctx,title,w*.86,2).forEach((l,i)=>ctx.fillText(l,w*.07,h*(.36+i*.14)));
  // Working lines: a block of text being written, revealed line by line.
  const r=seeded(97),visible=tick%9;
  for(let i=0;i<6;i++){
    const y=h*(.66+i*.055),len=w*(.25+r()*.55);
    ctx.fillStyle=i<visible?'#5f7d86':'#24363d';ctx.fillRect(w*.07,y,len,h*.022);
  }
  ctx.fillStyle='#24363d';ctx.fillRect(w*.07,h*.95,w*.86,h*.012);
  ctx.fillStyle=WARM;ctx.fillRect(w*.07,h*.95,w*.86*((tick%40)/40),h*.012);
}

// COMANDO: the operation board. Columns of the real jobs, by stage; empty columns stay empty.
export const BOARD_COLUMNS=[
  ['Na fila',['queued','scheduled','awaiting_estimate','revision_queued']],
  ['Em produção',['planning','running','em_sessao','needs_input']],
  ['Em revisão',['reviewing']],
  ['Para aprovar',['awaiting_approval']]
];
export function boardColumns(jobs){
  return BOARD_COLUMNS.map(([title,statuses])=>({title,jobs:(jobs||[]).filter(j=>statuses.includes(j.status))}));
}
export function drawBoard(ctx,w,h,jobs){
  ctx.fillStyle='#0c161b';ctx.fillRect(0,0,w,h);
  ctx.fillStyle=INK;ctx.font=`500 ${h*.065}px ${FONT}`;ctx.fillText('Operação',w*.035,h*.11);
  const columns=boardColumns(jobs),total=columns.reduce((n,c)=>n+c.jobs.length,0);
  ctx.fillStyle=MUTED;ctx.font=`500 ${h*.036}px ${FONT}`;ctx.textAlign='right';
  ctx.fillText(total?`${total} ${total===1?'trabalho em andamento':'trabalhos em andamento'}`:'Nada em andamento agora',w*.965,h*.105);ctx.textAlign='left';
  const cw=(w*.93)/4,top=h*.19;
  columns.forEach((col,i)=>{
    const x=w*.035+i*cw;
    ctx.fillStyle='#14232a';ctx.fillRect(x+6,top,cw-12,h*.76);
    ctx.fillStyle=col.jobs.length?WARM:FAINT;ctx.font=`600 ${h*.038}px ${FONT}`;ctx.fillText(col.title,x+22,top+h*.07);
    ctx.fillStyle=FAINT;ctx.textAlign='right';ctx.fillText(String(col.jobs.length),x+cw-26,top+h*.07);ctx.textAlign='left';
    col.jobs.slice(0,4).forEach((job,k)=>{
      const y=top+h*(.11+k*.155);
      ctx.fillStyle='#1d3038';ctx.fillRect(x+18,y,cw-36,h*.13);
      ctx.fillStyle=INK;ctx.font=`500 ${h*.036}px ${FONT}`;
      lines(ctx,job.title||'Sem título',cw-64,2).forEach((l,n)=>ctx.fillText(l,x+30,y+h*(.05+n*.045)));
    });
    if(col.jobs.length>4){ctx.fillStyle=MUTED;ctx.font=`500 ${h*.03}px ${FONT}`;ctx.fillText(`mais ${col.jobs.length-4}`,x+30,top+h*.74);}
  });
}
