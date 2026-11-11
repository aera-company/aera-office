import {VITRINE} from './vitrine.js';
import {lightsCommand,agentMentions,enterCommand,leaveCommand} from './commands.js';
// NAYRA by voice (C49 to C60): presentation mode, the "Oi, NAYRA" listener and the live conversation with the ElevenLabs agent.
// The listener is the browser's speech recognition (audio goes to Google in Chrome, Apple in Safari) and only waits for phrases.
// The conversation itself runs on the ElevenLabs agent; credits are spent only while it is open.
export function initNayraVoz({api,briefing,closeBriefing=()=>{},selectZone,presentAgent=()=>{},enterRoom=()=>false,leaveRoom=()=>false,settle=()=>{},openJob,onPresentation=()=>{}}) {
  // Safari (and Chrome before any click) keeps audio contexts suspended unless started by a click or key.
  // The conversation starts by voice, so every audio context the page creates is tracked and resumed on the next interaction.
  const contexts=new Set();
  const Native=window.AudioContext||window.webkitAudioContext;
  if(Native&&!Native.__nayraTracked){
    const Tracked=function(...args){const c=new Native(...args);contexts.add(c);return c;};
    Tracked.prototype=Native.prototype;Tracked.__nayraTracked=true;
    window.AudioContext=Tracked;if(window.webkitAudioContext)window.webkitAudioContext=Tracked;
  }
  function unlockAudio(){
    for(const c of contexts)if(c.state==='suspended')c.resume().catch(()=>{});
    if(!unlockAudio.done&&Native){unlockAudio.done=true;try{const c=new Native();const b=c.createBuffer(1,1,22050);const src=c.createBufferSource();src.buffer=b;src.connect(c.destination);src.start(0);c.resume().catch(()=>{});setTimeout(()=>c.close().catch(()=>{}),500);}catch{}}
    if(audioHeld){audioHeld=false;note('');}
  }
  let audioHeld=false;
  for(const type of ['pointerdown','keydown','touchstart'])window.addEventListener(type,unlockAudio,{capture:true,passive:true});
  const $=s=>document.querySelector(s);
  const el=(tag,props={},...children)=>{const n=document.createElement(tag);Object.assign(n,props);n.append(...children);return n;};
  const Recognition=window.SpeechRecognition||window.webkitSpeechRecognition;
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  const SILENCE_MS=20000,MAX_MS=10*60*1000;
  let agentSpoke=false,presenting=false,listening=false,muted=false,denied=false,recog=null,restartTimer=0,listenReported=false,lastListenError='';
  let convo=null,starting=false,ctx=null,silenceTimer=0,maxTimer=0,farewell=false,raf=0,lastZone='';
  try{muted=localStorage.getItem('aera.nayra.listen')==='off';}catch{}

  const norm=t=>(t||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();
  // Speech engines spell the name in several ways.
  const NAME=/\b(nayra|naira|naiara|nahira|naila|nayara|naiyra|mayra|maira|naya|nyra|neyra|nay|nai)\b/;

  // ---------------------------------------------------------------- presentation mode
  async function setPresentation(on){
    try{const r=await api('presentation',{method:'POST',body:{on}});presenting=r.on;}catch(e){note(e.message);return;}
    if(!presenting&&convo)await endConversation();
    document.body.classList.toggle('presenting',presenting);
    $('#present-toggle').textContent=presenting?'Sair da apresentação':'Apresentar';
    $('#present-toggle').setAttribute('aria-pressed',String(presenting));
    $('#present-badge').hidden=!presenting;
    onPresentation(presenting);
  }
  async function syncPresentation(){
    try{const r=await api('presentation');presenting=r.on;document.body.classList.toggle('presenting',presenting);$('#present-badge').hidden=!presenting;$('#present-toggle').textContent=presenting?'Sair da apresentação':'Apresentar';$('#present-toggle').setAttribute('aria-pressed',String(presenting));}catch{}
  }

  // ---------------------------------------------------------------- listener
  function indicator(){
    const b=$('#voice-listen');
    const state=!Recognition?'indisponivel':denied?'negado':muted?'silenciado':convo?'conversa':listening?'ouvindo':'parado';
    b.dataset.state=state;
    b.querySelector('span:last-child').textContent={indisponivel:'voz indisponível',negado:'sem microfone',silenciado:'silenciado',conversa:'em conversa',ouvindo:'ouvindo',parado:'ouvindo…'}[state];
    b.title=state==='negado'?'O navegador negou o microfone. Libere o microfone para este endereço e clique aqui.':state==='indisponivel'?'Este navegador não reconhece fala. Use o botão NAYRA.':state==='silenciado'?'Clique para voltar a ouvir "Oi, NAYRA"':'Clique para silenciar. Enquanto ouve, o navegador manda o áudio ao serviço de reconhecimento dele.';
    b.disabled=!Recognition;
  }
  function startListening(){
    if(VITRINE)return; // C86: the public site never listens; a conversation there starts only with the access code.
    clearTimeout(restartTimer);
    if(!Recognition||muted||denied||convo||starting||document.hidden||listening)return indicator();
    recog=new Recognition();recog.lang='pt-BR';recog.continuous=true;recog.interimResults=false;
    recog.onresult=e=>{for(let i=e.resultIndex;i<e.results.length;i++)if(e.results[i].isFinal){const said=e.results[i][0].transcript;heard(said,hear(said));}};
    recog.onend=()=>{listening=false;indicator();restartTimer=setTimeout(startListening,700);};
    recog.onerror=e=>{if(e.error!==lastListenError){lastListenError=e.error;report('ouvinte erro',e.error);}if(e.error==='not-allowed'||e.error==='service-not-allowed'){denied=true;clearTimeout(restartTimer);indicator();}};
    recog.onstart=()=>{if(!listenReported){listenReported=true;report('ouvinte','ligado');}};
    try{recog.start();listening=true;}catch(err){listening=false;report('ouvinte erro','start: '+(err?.message||err));}
    indicator();
  }
  function stopListening(){clearTimeout(restartTimer);if(recog){recog.onend=null;try{recog.abort();}catch{}}recog=null;listening=false;indicator();}

  // Commands (C57, C58, C59). Matching is on normalized text; the name must be present.
  // What the browser understood, shown for a few seconds next to the indicator: the first thing to check when she does not answer.
  let heardTimer=0;
  function heard(text,command){
    const b=$('#voice-listen'),label=b.querySelector('span:last-child');
    console.info('[NAYRA] ouvi:',text,command?'→ '+command:'(sem comando)');
    report('ouvi',text.trim().slice(0,80)+(command?' → '+command:' (sem comando)'));
    b.dataset.heard=command?'comando':'frase';
    label.textContent=(command?'✓ ':'ouvi: ')+'"'+text.trim().slice(0,38)+'"';
    clearTimeout(heardTimer);heardTimer=setTimeout(()=>{delete b.dataset.heard;indicator();},5000);
  }
  function hear(text){
    const t=norm(text);if(!t||!NAME.test(t))return false;
    if(/(sair|encerrar|fechar|terminar)( d[ao])? (modo )?apresentacao/.test(t)){setPresentation(false);return 'sair';}
    if(/modo apresentacao|apresentacao|apresentar/.test(t)){if(!presenting)setPresentation(true);return 'apresentar';}
    // A goodbye heard after a conversation closed must not reopen it.
    if(/\b(obrigad[oa]|tchau|ate mais|ate logo)\b/.test(t))return false;
    // Any other sentence with her name opens the conversation; if there is a question in it, it goes along (C63).
    const question=text.replace(/\b(nayra|naira|naiara|nahira|naila|nayara|naiyra|mayra|maira|naya|nyra|neyra|nay|nai)\b/gi,' ')
      .replace(/^[\s,.!?;:-]*((oi|olá|ola|e aí|e ai|ei|hey|bom dia|boa tarde|boa noite)\b)?[\s,.!?;:-]*/i,'').replace(/\s+/g,' ').trim();
    if(question.split(' ').filter(Boolean).length>=2){converse(question);return 'pergunta';}
    converse();return 'oi';
    return false;
  }

  // ---------------------------------------------------------------- conversation (presentation only)
  const live=()=>$('#nayra-live');
  function note(text){const n=$('#nayra-live-note');if(n){n.textContent=text||'';n.hidden=!text;}}
  function caption(who,text){$('#nayra-live-caption').textContent=text;$('#nayra-live-caption').dataset.who=who;}
  function armSilence(){clearTimeout(silenceTimer);silenceTimer=setTimeout(()=>endConversation('silêncio'),SILENCE_MS);}
  function pulse(){const o=$('#nayra-live-orb');let v=0;try{v=convo?.getOutputVolume?.()||0;}catch{}o.style.setProperty('--level',reduce.matches?'0':Math.min(1,v*2.2).toFixed(3));raf=requestAnimationFrame(pulse);}

  async function converse(question='',preset=null){
    if(convo||starting)return;
    closeBriefing();
    starting=true;stopListening();farewell=false;lastZone='';lastAgent='';agentSpoke=false;
    live().hidden=false;document.body.classList.add('nayra-live-on');caption('nayra','Conectando…');note('');$('#nayra-live-card').replaceChildren();
    let session=null;
    try{
      // C79: the office server hands a one-time token made with the ElevenLabs key it keeps; the key never comes here.
      // C84: with Tiago, the whole office and the Tiago agent; with a client (presentation), only that client.
      // C87: on the public site the token and the context were already handed over after the access code.
      const [s,context]=preset?[preset,preset.context]:await Promise.all([voiceSession('webrtc'),api(presenting?'nayra/demo-context':'nayra/office-context')]);session=s;ctx=context;
      const {Conversation}=await import('@elevenlabs/client');
      convo=await Conversation.startSession({
        // WebRTC is the SDK default for voice: the browser itself plays her audio, which is what works in Safari.
        ...(session.token?{conversationToken:session.token}:{agentId:session.agent_id}),connectionType:'webrtc',
        dynamicVariables:{estado_escritorio:context.text,cliente:context.client},
        onConnect(p){report('conectou',(p?.conversationId||'')+(session.protected?' · protegida':' · sem chave de voz')+' · '+(session.profile||''));
          // If the browser kept the sound suspended, say so on screen: one click anywhere releases it.
          setTimeout(()=>{const states=[...contexts].map(c=>c.state);report('áudio',states.join(',')||'sem contexto');
            if(states.includes('suspended')){audioHeld=true;note('O navegador segurou o som. Clique em qualquer lugar da tela para ouvir a NAYRA.');}},1500);caption('nayra','');armSilence();cancelAnimationFrame(raf);raf=requestAnimationFrame(pulse);indicator();},
        onDisconnect(d){
          // Closed by us (goodbye, silence, button): just close. Closed by the other side: keep the reason on screen.
          if(d?.reason==='user'||!convo){finish();return;}
          const why=d?.message||d?.closeReason||d?.reason||'conexão encerrada';
          report('desconectou',JSON.stringify({reason:d?.reason,message:why,code:d?.closeCode||d?.context?.code||''}));
          convo=null;caption('nayra','');note('A conversa caiu: '+why);setTimeout(()=>{if(!convo)finish();},9000);
        },
        onError(message,context){report('erro',message+' '+(context?String(context?.message||JSON.stringify(context)).slice(0,300):''));note('Falha na conversa: '+message);},
        onModeChange({mode}){
          $('#nayra-live-orb').classList.toggle('speaking',mode==='speaking');speaking(mode==='speaking');
          if(mode==='speaking')clearTimeout(silenceTimer);
          else if(farewell)setTimeout(()=>endConversation('despedida'),900);
          else armSilence();
        },
        onMessage(m){
          const role=m.role||(m.source==='ai'?'agent':'user');
          if(role==='user'){caption('cliente',m.message);armSilence();lights(m.message);rooms(m.message);const t=norm(m.message);if(NAME.test(t)&&/\b(obrigad[oa]|tchau|ate mais|encerra|pode encerrar)\b/.test(t))farewell=true;}
          // Expressive voice tags such as [warm] guide the voice; they are not shown on screen.
          else{const said=String(m.message||'').replace(/\[[a-zà-ú ]{2,24}\]\s*/gi,'').trim();caption('nayra',said);react(said);walkThrough(said);if(!agentSpoke){agentSpoke=true;report('agente respondeu',m.message.slice(0,70));}}
        }
      });
      brief(convo);
      // The question asked together with her name goes in as Tiago's first message.
      if(question){try{caption('cliente',question);lights(question);convo.sendUserMessage(question);}catch{}}
      // The public site gets a shorter conversation, to keep the spend of a demo small.
      // C89: logged in on the site, the full conversation gets the office limit.
      const short=VITRINE&&session.profile!=='completo';
      clearTimeout(maxTimer);maxTimer=setTimeout(()=>endConversation(short?'5 minutos':'10 minutos'),short?5*60*1000:MAX_MS);
    }catch(e){
      report('falhou ao abrir',String(e?.name||'')+': '+String(e?.message||e));
      caption('nayra','');note(e.code==='not_found'?'O agente de voz da NAYRA ainda não foi criado.':'Não consegui abrir a conversa: '+(e.message||e)+(session&&!session.protected?' Se a autenticação está ligada no ElevenLabs, salve a chave de voz em Operação › Conectar.':''));
      convo=null;setTimeout(()=>{if(!convo)finish();},9000);
    }finally{starting=false;indicator();}
  }
  function voiceSession(connection){return api('nayra/voice-session',{method:'POST',body:{connection}});}
  // Diagnostics go to the office server log, so a failed demo can be read afterwards. No audio, no transcript.
  function report(event,detail){api('nayra/client-log',{method:'POST',body:{event,detail:String(detail||'').slice(0,600),agent:navigator.userAgent.slice(0,160)}}).catch(()=>{});}
  async function endConversation(reason){
    const c=convo;convo=null;
    if(c)report('fim',(typeof reason==='string'?reason:'botão ou esc')+(agentSpoke?'':' · o agente não respondeu'));
    if(c){try{await c.endSession();}catch{}}
    finish();
  }
  function finish(){
    convo=null;clearTimeout(silenceTimer);clearTimeout(maxTimer);cancelAnimationFrame(raf);
    live().hidden=true;document.body.classList.remove('nayra-live-on');$('#nayra-live-orb').classList.remove('speaking');for(const t of followTimers)clearTimeout(t);followTimers=[];lastAgent='';present([],false);settle();
    indicator();setTimeout(startListening,600);
  }

  // "Mostra e conduz" (C53): the office follows what she says. Only reading and navigation, never a change.
  const ZONES=[['maya','think'],['estrategia','think'],['noa','create'],['john','create'],['jon','create'],['criacao','create'],['leo','build'],['tecnologia','build'],['nina','grow'],['negocios','grow'],['ari','control'],['comando','control']];
  // What the agent is told when a conversation opens; the live conversation and the text test share it.
  function brief(conversation){
    // C62: outside presentation it is Tiago talking, not a client; the agent is told so at the start. C83: she calls him Chefe.
    if(!presenting&&!VITRINE){try{conversation.sendContextualUpdate('Quem está falando agora é o próprio Tiago, fundador da AERA, no uso do dia a dia, não um cliente em demonstração. Quando falar com ele, chame-o de Chefe, nunca de Tiago, e vá direto ao ponto.');}catch{}}
    // The 3D office obeys one spoken command; she is told so, to confirm instead of saying she cannot do it.
    try{conversation.sendContextualUpdate('O escritório 3D na tela obedece a comandos de voz: quando a pessoa pedir para apagar ou acender as luzes do escritório, o próprio office faz isso ao ouvir o pedido. Confirme em uma frase curta e não diga que não consegue.');}catch{}
    try{conversation.sendContextualUpdate('Quando você fala de um agente pelo nome (ARI, MAYA, NOA, JOHN, LEO ou NINA), a tela mostra o card dele e a câmera vai até onde ele está no prédio, sem entrar na sala. Se a pessoa pedir para entrar numa sala, o office entra sozinho; se pedir para sair, volta para fora. Confirme em uma frase curta. Ao apresentar a equipe, fale de um agente por vez, chamando cada um pelo nome.');}catch{}
  }
  // Whose face moves on the room card: the agents named in what NAYRA is saying, and only while she is speaking.
  let presentedNames=[],nayraSpeaking=false,followTimers=[],lastAgent='';
  function present(names,isSpeaking){
    if(names)presentedNames=names;if(isSpeaking!==undefined)nayraSpeaking=isSpeaking;
    window.dispatchEvent(new CustomEvent('aera:agent-presented',{detail:{names:presentedNames,speaking:nayraSpeaking}}));
  }
  // Her whole reply arrives at once; the office walks through the agents she names in the order and at roughly the pace
  // she says them (about 3 words a second, counted from when her voice started). Each one gets the card, the camera
  // and, while she speaks, the face.
  function walkThrough(said,conversation=convo){
    for(const t of followTimers)clearTimeout(t);followTimers=[];
    const mentions=agentMentions(said);if(!mentions.length)return;
    const seconds=String(said).trim().split(/\s+/).length/3,already=nayraSpeaking&&speakingSince?performance.now()-speakingSince:0;
    for(const {name,at} of mentions)followTimers.push(setTimeout(()=>{if(conversation&&conversation!==convo&&conversation!==testConvo)return;if(name!==lastAgent){lastAgent=name;presentAgent(name);}present([name]);},Math.max(0,at*seconds*1000-already-200)));
  }
  let speakingSince=0;
  function speaking(on){if(on&&!nayraSpeaking)speakingSince=performance.now();present(undefined,on);if(!on)settle();}
  function rooms(text,conversation=convo){
    const zone=enterCommand(text);
    if(zone&&enterRoom(zone)){try{conversation?.sendContextualUpdate('A pessoa pediu e a tela entrou na sala.');}catch{}return;}
    if(leaveCommand(text)&&leaveRoom()){try{conversation?.sendContextualUpdate('A pessoa pediu e a tela voltou para a vista de fora do prédio.');}catch{}}
  }
  let testConvo=null;
  let lightsOff=false;
  // "Apaga as luzes": the request itself is the event. The scene answers whether it obeyed, and only then is NAYRA told.
  function lights(text,conversation=convo){
    const command=lightsCommand(text,{lightsOff});if(!command)return;
    const event=new CustomEvent('aera:lights',{detail:{on:command==='on',handled:false}});window.dispatchEvent(event);
    if(event.detail.handled){lightsOff=command==='off';try{conversation?.sendContextualUpdate(command==='on'?'As luzes do escritório acabam de ser acesas na tela.':'As luzes do escritório acabam de ser apagadas na tela.');}catch{}}
  }
  function react(text){
    const t=' '+norm(text)+' ';
    let best=null;for(const [word,zone] of ZONES){const i=t.indexOf(' '+word+' ');if(i>=0&&(!best||i<best.i))best={i,zone};}
    if(best&&best.zone!==lastZone){lastZone=best.zone;selectZone(best.zone);}
    const job=(ctx?.jobs||[]).find(j=>t.includes(' '+norm(j.title)+' ')||t.includes(norm(j.title)));
    if(job)showJob(job);
  }
  const statusPt={em_sessao:'em andamento',needs_input:'aguarda resposta',awaiting_approval:'aguarda aprovação',approved:'aprovado',failed:'travou'};
  function showJob(job){
    const box=$('#nayra-live-card');if(box.dataset.job===job.id)return;box.dataset.job=job.id;box.replaceChildren(
      el('small',{textContent:'Trabalho registrado · AERA'}),el('strong',{textContent:job.title}),el('span',{textContent:statusPt[job.status]||job.status}),
      el('button',{type:'button',textContent:'Abrir ↗',onclick:()=>openJob(job.id)}));
  }

  // ---------------------------------------------------------------- wiring
  $('#present-toggle').onclick=()=>setPresentation(!presenting);
  $('#voice-listen').onclick=()=>{if(denied){denied=false;muted=false;startListening();return;}muted=!muted;try{localStorage.setItem('aera.nayra.listen',muted?'off':'on');}catch{}if(muted)stopListening();else startListening();indicator();};
  $('#nayra-live-end').onclick=()=>endConversation();
  document.addEventListener('visibilitychange',()=>{if(document.hidden){stopListening();if(convo)endConversation();}else startListening();});
  window.addEventListener('keydown',e=>{if(!live().hidden&&e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();endConversation();}},true);
  if(!Recognition)report('ouvinte','indisponível neste navegador');
  if(!VITRINE)syncPresentation();indicator();startListening();
  // C88: public site. One click asks the Vercel function for a one-time token and opens the conversation.
  async function publicTalk(){
    let r;
    try{r=await fetch('/api/vitrine-session',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(15000)});}
    catch{throw new Error('Não consegui abrir a conversa agora.');}
    let data={};try{data=await r.json();}catch{}
    if(!r.ok)throw new Error(data.error||'Não consegui abrir a conversa agora.');
    await converse('',{token:data.token,protected:true,profile:data.profile||'apresentacao',context:data.context});
  }
  // Test hook: what the office does when NAYRA says this sentence (camera and job card), without opening a conversation.
  async function follow(text){if(!ctx)ctx=await api(presenting?'nayra/demo-context':'nayra/office-context');lastZone='';react(text);return {zone:lastZone,job:$('#nayra-live-card').dataset.job||''};}
  // Test hook: a real conversation with the agent in text only (no microphone), with the real AERA context.
  // Used to verify behaviour before a live demo; it spends a little of the ElevenLabs credits like any conversation.
  // Some agents do not allow the text-only override; `textOnly:false` opens the normal voice session with the microphone muted.
  async function textTest(questions,wait=25000,{textOnly=true}={}){
    const [session,context]=await Promise.all([voiceSession('websocket'),api(presenting?'nayra/demo-context':'nayra/office-context')]);ctx=context;lastZone='';
    const {Conversation}=await import('@elevenlabs/client');
    const log=[];let turn=null;
    const next=()=>new Promise(res=>{turn=res;setTimeout(()=>res('timeout'),wait);});
    const first=next();
    const c=await Conversation.startSession({...(session.signed_url?{signedUrl:session.signed_url}:{agentId:session.agent_id}),textOnly,connectionType:'websocket',
      dynamicVariables:{estado_escritorio:context.text,cliente:context.client},
      onMessage(m){const role=m.role||(m.source==='ai'?'agent':'user');log.push({role,text:m.message,at:Math.round(performance.now())});if(role!=='user'){const said=String(m.message||'').replace(/\[[a-zà-ú ]{2,24}\]\s*/gi,'').trim();react(said);walkThrough(said,testConvo);log.push({zone:lastZone,card:$('#nayra-live-card').dataset.job||''});if(textOnly)turn?.('ok');}},
      onModeChange({mode}){log.push({mode,at:Math.round(performance.now())});speaking(mode==='speaking');if(mode==='listening'&&!textOnly)turn?.('ok');},
      onConnect(p){log.push({connected:p?.conversationId||true});},
      onDisconnect(d){log.push({disconnected:JSON.parse(JSON.stringify(d||{}))});turn?.('closed');},
      onError(message,context){log.push({error:message,context:context?String(context?.message||JSON.stringify(context)).slice(0,300):''});turn?.('error');}});
    testConvo=c;lastAgent='';
    if(!textOnly){try{c.setMicMuted(true);}catch{}}
    await first;brief(c);
    for(const q of questions){const r=next();lights(q,c);rooms(q,c);c.sendUserMessage(q);if(await r!=='ok')break;}
    testConvo=null;speaking(false);
    try{await c.endSession();}catch{}
    return log;
  }
  return {hear,converse,publicTalk,follow,walkThrough:said=>walkThrough(said,null),speaking,textTest,endConversation,setPresentation,get presenting(){return presenting;},get listening(){return listening;},get talking(){return !!convo;}};
}
