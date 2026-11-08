// NAYRA, first cut (C37 to C45; voice F1 in C80). Speaks only when called; on open the office shows a count, nothing more.
// The script comes from /api/nayra/briefing (rows of the office store). The orb pulses on the words she says.
export function initNayra({api,openJob,openPanel}) {
  const $=s=>document.querySelector(s);
  const el=(tag,props={},...children)=>{const n=document.createElement(tag);Object.assign(n,props);n.append(...children);return n;};
  const stage=$('#nayra-stage'),orb=$('#nayra-orb'),caption=$('#nayra-caption'),cards=$('#nayra-cards'),note=$('#nayra-note');
  const synth='speechSynthesis' in window?window.speechSynthesis:null;
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  let data=null,playing=false,run=0,level=0,raf=0,countTimer=0,voice=null,lastFocus=null;
  // C80: the briefing speaks with the NAYRA voice (ElevenLabs, made by the office server). Luciana stays as the fallback.
  let audio=null,analyser=null,wave=null,source=null,f1Failed='';

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
  function tick(){
    level*=.9;
    // While the F1 voice plays, the light follows the real loudness of her audio.
    if(source&&analyser&&!reduce.matches){analyser.getByteTimeDomainData(wave);let sum=0;for(const v of wave){const d=(v-128)/128;sum+=d*d;}level=Math.max(level,Math.min(1,Math.sqrt(sum/wave.length)*4.5));}
    orb.style.setProperty('--level',level.toFixed(3));raf=requestAnimationFrame(tick);
  }
  // The audio context is created inside the click that opens the briefing, so Safari lets it play after the network wait.
  function unlockAudio(){
    try{const C=window.AudioContext||window.webkitAudioContext;if(!C)return;
      if(!audio){audio=new C();analyser=audio.createAnalyser();analyser.fftSize=512;wave=new Uint8Array(analyser.fftSize);analyser.connect(audio.destination);}
      audio.resume?.();}catch{audio=null;}
  }
  async function fetchVoice(text){
    const r=await fetch('/api/nayra/speak',{method:'POST',headers:{'Content-Type':'application/json','X-Aera-Client':'1'},body:JSON.stringify({text}),signal:AbortSignal.timeout(25000)});
    if(!r.ok){let m='';try{m=(await r.json()).error;}catch{}throw new Error(m||'voz indisponível');}
    return audio.decodeAudioData(await r.arrayBuffer());
  }
  function stopVoice(){try{source?.stop();}catch{}source=null;}
  const bump=()=>{if(!reduce.matches)level=Math.min(1,level+.55);};

  async function say(text,id,pending){
    if(id!==run)return;
    if(pending&&!f1Failed){
      try{
        const buffer=await pending;if(id!==run)return;
        caption.textContent=text;
        await new Promise(resolve=>{
          const s=audio.createBufferSource();s.buffer=buffer;s.connect(analyser);source=s;orb.classList.add('speaking');
          s.onended=()=>{if(source===s)source=null;orb.classList.remove('speaking');resolve();};s.start();
        });
        return;
      }catch(e){
        if(id!==run)return;
        f1Failed=e.message||'voz indisponível';note.textContent=`${f1Failed.replace(/\.$/,'')}. Por enquanto, o briefing usa a voz do Mac.`;
        api('nayra/client-log',{method:'POST',body:{event:'briefing',detail:'voz F1 falhou: '+f1Failed,agent:navigator.userAgent.slice(0,160)}}).catch(()=>{});
      }
    }
    return sayMac(text,id);
  }
  function sayMac(text,id){
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
    const id=++run;playing=true;synth?.cancel();stopVoice();unlockAudio();f1Failed='';cards.replaceChildren();caption.textContent='';note.textContent='';
    try{data=await api(query());}catch(e){caption.textContent='Não consegui ler o escritório agora.';note.textContent=e.message;playing=false;return;}
    // If the browser keeps the sound locked (briefing not opened by a click), the Mac voice speaks instead.
    try{await Promise.race([audio?.resume?.(),new Promise(r=>setTimeout(r,600))]);}catch{}
    let f1=false;try{f1=audio?.state==='running'&&(await api('nayra/voice-status')).ready;}catch{}
    await voiceReady();if(id!==run)return;
    note.textContent=f1?'':!synth?'Este navegador não fala; o briefing segue em texto.':!voice?'Voz em português não encontrada; o briefing segue em texto.':/luciana/i.test(voice.name)?'':`Voz Luciana não encontrada; usando ${voice.name}.`;
    const nodes=data.items.map((item,i)=>card(item,i));cards.append(...nodes);
    // All sentences are asked for at once, so the next one is ready while the current one plays.
    const lines=[data.opening,...data.items.map(i=>i.text),...(data.closing?[data.closing]:[])];
    const pending=f1?lines.map(text=>{const p=fetchVoice(text);p.catch(()=>{});return p;}):[];
    await say(data.opening,id,pending[0]);
    for(const [i,item] of data.items.entries()){
      if(id!==run)return;
      nodes[i].classList.add('shown');
      await say(item.text,id,pending[i+1]);
    }
    if(data.closing)await say(data.closing,id,pending[lines.length-1]);
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
    run++;playing=false;synth?.cancel();stopVoice();cancelAnimationFrame(raf);orb.classList.remove('speaking');
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
