// NAYRA, first cut (C37 to C45). Speaks only when called; on open the office shows a count, nothing more.
// The script comes from /api/nayra/briefing (rows of the office store). The orb pulses on the words she says.
export function initNayra({api,openJob,openPanel}) {
  const $=s=>document.querySelector(s);
  const el=(tag,props={},...children)=>{const n=document.createElement(tag);Object.assign(n,props);n.append(...children);return n;};
  const stage=$('#nayra-stage'),orb=$('#nayra-orb'),caption=$('#nayra-caption'),cards=$('#nayra-cards'),note=$('#nayra-note');
  const synth='speechSynthesis' in window?window.speechSynthesis:null;
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  let data=null,playing=false,run=0,level=0,raf=0,countTimer=0,voice=null,lastFocus=null;

  const heard=()=>{try{return localStorage.getItem('aera.nayra.heard')||'';}catch{return '';}};
  const markHeard=()=>{try{localStorage.setItem('aera.nayra.heard',new Date().toISOString());}catch{}};
  const query=()=>'nayra/briefing'+(heard()?'?since='+encodeURIComponent(heard()):'');

  async function refreshCount(){
    if(playing||document.hidden)return;
    try{const b=await api(query());const badge=$('#nayra-count');badge.hidden=!b.count;badge.textContent=String(b.count);$('#nayra-call').dataset.attention=String(!!b.attention);
      $('#nayra-call').title=b.count?`NAYRA tem ${b.count} ${b.count===1?'item':'itens'} para você. Clique para ouvir.`:'NAYRA · nada pendente. Clique para ouvir.';}
    catch{$('#nayra-count').hidden=true;}
  }

  // Luciana is the voice chosen in C40. Voices load asynchronously in Chrome; wait briefly for them.
  function pickVoice(){
    if(!synth)return null;const voices=synth.getVoices();
    return voices.find(v=>/luciana/i.test(v.name))||voices.find(v=>v.lang==='pt-BR')||voices.find(v=>v.lang?.startsWith('pt'))||null;
  }
  function voiceReady(){
    return new Promise(resolve=>{
      voice=pickVoice();if(voice||!synth){resolve();return;}
      const done=()=>{voice=pickVoice();synth.removeEventListener('voiceschanged',done);resolve();};
      synth.addEventListener('voiceschanged',done);setTimeout(done,1200);
    });
  }

  // Pulse: each spoken word (boundary event) lifts the light; it decays between words. No sound analysis, no invention.
  function tick(){level*=.9;orb.style.setProperty('--level',level.toFixed(3));raf=requestAnimationFrame(tick);}
  const bump=()=>{if(!reduce.matches)level=Math.min(1,level+.55);};

  function say(text,id){
    return new Promise(resolve=>{
      if(id!==run){resolve();return;}
      caption.textContent=text;
      if(!synth||!voice){
        // No speech available: the briefing still plays as text, paced by its length.
        const words=text.split(/\s+/).length;let i=0;const beat=setInterval(()=>{bump();if(++i>=words)clearInterval(beat);},260);
        setTimeout(()=>{clearInterval(beat);resolve();},Math.max(1800,words*300));return;
      }
      const u=new SpeechSynthesisUtterance(text);u.voice=voice;u.lang=voice.lang||'pt-BR';u.rate=1.03;u.pitch=1;
      u.onboundary=bump;u.onstart=()=>{orb.classList.add('speaking');bump();};
      u.onend=u.onerror=()=>{orb.classList.remove('speaking');resolve();};
      synth.speak(u);
    });
  }

  function card(item,index){
    const li=el('li',{className:'nayra-card'});li.dataset.group=item.group;li.dataset.index=String(index);
    const head=el('div',{className:'nayra-card-head'},el('span',{className:'agent-monogram',textContent:item.agent[0]}),
      el('div',{},el('strong',{textContent:item.agent}),el('small',{textContent:{voce:'depende de você',pronto:'pronto',travado:'travou',resto:'no painel'}[item.group]+(item.role?' · '+item.role:'')})));
    li.append(head,el('p',{textContent:item.text}));
    if(item.hint)li.append(el('small',{className:'nayra-hint',textContent:item.hint}));
    const actions=el('div',{className:'nayra-actions'});
    for(const a of item.actions){
      if(a==='approve'){
        const b=el('button',{type:'button',className:'primary',textContent:'Aprovar ✓'});
        b.onclick=async()=>{b.disabled=true;try{await api(`jobs/${item.job_id}/approve`,{method:'POST',body:{}});b.textContent='Aprovado ✓';li.dataset.group='feito';refreshCount();}catch(e){b.disabled=false;li.querySelector('.nayra-error')?.remove();li.append(el('small',{className:'nayra-error',textContent:e.message}));}};
        actions.append(b);
      }
      if(a==='release'&&item.batch_id){
        // Tiago's ok to one image batch (C71). The office only records it; the Claude Code session generates.
        const b=el('button',{type:'button',className:'primary',textContent:'Liberar lote ✓'});
        const no=el('button',{type:'button',textContent:'Recusar'});
        const decide=async(release)=>{b.disabled=no.disabled=true;try{await api(`jobs/${item.job_id}/batches/${item.batch_id}/${release?'release':'decline'}`,{method:'POST',body:{}});b.textContent=release?'Liberado ✓':'Recusado';no.remove();li.dataset.group='feito';refreshCount();}catch(e){b.disabled=no.disabled=false;li.querySelector('.nayra-error')?.remove();li.append(el('small',{className:'nayra-error',textContent:e.message}));}};
        b.onclick=()=>decide(true);no.onclick=()=>decide(false);actions.append(b,no);
      }
      if(a==='open'&&item.job_id)actions.append(el('button',{type:'button',textContent:'Abrir ↗',onclick:()=>{close();openJob(item.job_id);}}));
      if(a==='panel')actions.append(el('button',{type:'button',textContent:'Abrir operação ↗',onclick:()=>{close();openPanel();}}));
    }
    if(actions.children.length)li.append(actions);
    return li;
  }

  async function play(){
    const id=++run;playing=true;synth?.cancel();cards.replaceChildren();caption.textContent='';note.textContent='';
    try{data=await api(query());}catch(e){caption.textContent='Não consegui ler o escritório agora.';note.textContent=e.message;playing=false;return;}
    await voiceReady();if(id!==run)return;
    note.textContent=!synth?'Este navegador não fala; o briefing segue em texto.':!voice?'Voz em português não encontrada; o briefing segue em texto.':/luciana/i.test(voice.name)?'':`Voz Luciana não encontrada; usando ${voice.name}.`;
    const nodes=data.items.map((item,i)=>card(item,i));cards.append(...nodes);
    await say(data.opening,id);
    for(const [i,item] of data.items.entries()){
      if(id!==run)return;
      nodes[i].classList.add('shown');
      await say(item.text,id);
    }
    if(data.closing)await say(data.closing,id);
    if(id===run){playing=false;markHeard();for(const n of nodes)n.classList.add('shown');}
  }

  function open(){
    if(!stage.hidden){play();return;}
    lastFocus=document.activeElement;stage.hidden=false;document.body.classList.add('nayra-open');
    cancelAnimationFrame(raf);raf=requestAnimationFrame(tick);$('#nayra-close').focus({preventScroll:true});play();
  }
  function close(){
    if(stage.hidden)return;
    if(data)markHeard();
    run++;playing=false;synth?.cancel();cancelAnimationFrame(raf);orb.classList.remove('speaking');
    stage.hidden=true;document.body.classList.remove('nayra-open');lastFocus?.focus?.({preventScroll:true});refreshCount();
  }

  $('#nayra-call').onclick=open;$('#nayra-close').onclick=close;$('#nayra-replay').onclick=play;
  // While the stage is open it owns the keyboard: Esc closes it and the building shortcuts stay quiet.
  window.addEventListener('keydown',e=>{
    if(stage.hidden)return;
    if(e.key==='Escape'){e.preventDefault();close();}
    if(e.key!=='Tab')e.stopImmediatePropagation();
  },true);
  document.addEventListener('visibilitychange',()=>{if(document.hidden&&!stage.hidden)close();else refreshCount();});
  refreshCount();countTimer=setInterval(refreshCount,15000);
  return {open,close,refreshCount,get playing(){return playing;}};
}
