import '@fontsource-variable/instrument-sans';
import {initOperations} from './operations.js';
import {initClients} from './clients.js';
import {initPanel} from './panel.js';
import {initNayra} from './nayra.js';
import {initNayraVoz} from './nayra-voz.js';
import {mountOrb} from './orb.js';
import {VITRINE} from './vitrine.js';
import {floorSpecs,roomSpecs} from './navigation.js';
const $=selector=>document.querySelector(selector);
const reduceMotion=matchMedia('(prefers-reduced-motion: reduce)');
const profiles = {
  all: {name:'MAYA',role:'Estratégia & inteligência',description:'Pesquisa, cenário competitivo e posicionamento para transformar informação em direção.',delivery:'Diagnóstico → Direção estratégica',index:'01 / 05',location:'O escritório conectado',subtitle:'Pavilhão AERA · Três pavimentos, uma operação'},
  think: {name:'MAYA',role:'Estratégia & inteligência',description:'Lê contextos, organiza perguntas e define prioridades para o próximo movimento de uma marca.',delivery:'Pesquisa → Posicionamento → Direção',index:'01 / 05',location:'THINK / Estúdio de estratégia',subtitle:'Pavimento superior · Pesquisa e visão de negócio'},
  create: {name:'NOA',role:'Texto & conceito',description:'Traduz a direção estratégica em narrativas, textos e roteiros com uma linguagem comum.',delivery:'Direção → Narrativa → Texto',index:'02 / 05',location:'CREATE / Atelier de ideias',subtitle:'Pavimento superior · NOA no texto, JOHN na arte'},
  build: {name:'LEO',role:'Sistemas & experiências digitais',description:'Conecta interfaces, processos e tecnologia em uma estrutura de execução clara e mensurável.',delivery:'Conceito → Jornada → Plano de execução',index:'03 / 05',location:'BUILD / Laboratório de sistemas',subtitle:'Pavimento térreo · Tecnologia a serviço da operação'},
  grow: {name:'NINA',role:'Crescimento & novos negócios',description:'Organiza públicos, oportunidades e jornadas comerciais para aproximar a marca dos seus próximos clientes.',delivery:'Públicos → Oportunidades → Relacionamento',index:'04 / 05',location:'GROW / Sala de oportunidades',subtitle:'Pavimento térreo · Inteligência comercial'},
  control: {name:'ARI',role:'Orquestração & continuidade',description:'Recebe o briefing, conecta as especialidades e organiza a sequência de contribuições de cada agente.',delivery:'Briefing → Encadeamento → Entrega',index:'05 / 05',location:'COMANDO / Andar 02',subtitle:'Direção, aprovação e apresentação · O terraço fica acima'}
};
const rooms={
  think:{title:'Estúdio de estratégia',description:'Um lugar para ampliar o contexto, organizar perguntas e escolher uma direção.'},
  create:{title:'Atelier de ideias',description:'Onde uma direção ganha linguagem, expressão e presença.'},
  build:{title:'Laboratório de sistemas',description:'Conceitos ganham estrutura, interfaces e caminhos de execução.'},
  grow:{title:'Sala de oportunidades',description:'Um espaço de encontro entre inteligência comercial e novos negócios.'},
  control:{title:'Comando',description:'Andar 02. O pedido chega aqui, a equipe é montada e a aprovação acontece na mesa longa, com a parede de apresentação ao fundo.'}
};
let office,operations,selected='all',mode='intro',floor='all',working=false,visualMode=false;
let tour={active:false,paused:false,index:0,start:0,elapsed:0,raf:0};
let interior=false;
const order=['all','control','think','create','build','grow','all'];
function setMode(value){
  mode=value;for(const c of ['intro','explore','focus','walk','tour'])document.body.classList.toggle(`mode-${c}`,c===value);
  $('#intro').hidden=value!=='intro';$('#detail-panel').hidden=value!=='focus'||!$('#brief-panel').hidden;
  $('#tour-caption').hidden=value!=='tour';$('#walk-hint').hidden=value!=='walk';$('#walk-controls').hidden=value!=='walk';$('#mini-map').hidden=value!=='walk';
}
// Capabilities registry: the same answer the panel's list reads. Stations, states and the honest line on each character.
let caps=null,catalog=null,team=null,capsTimer=0,stationId='';
async function syncCaps(){
  if(!operations)return;
  try{caps=await operations.api('capabilities');if(!catalog)catalog=(await operations.api('jobs/catalog')).jobs;team=(await operations.api('team')).characters;}catch{return;}
  if(office&&!visualMode){
    if(!office._stationsLoaded){office.setStations(caps.stations);office._stationsLoaded=true;}
    office.setStationStates(Object.fromEntries(caps.stations.map(s=>[s.id,{state:s.state,state_label:s.state_label}])));
    office.setCharacterStates(caps.characters);
  }
  if(mode==='focus')renderProfileState(selected);
}
// Create is shared: NOA writes, JOHN makes the art. The ficha shows one of them at a time.
const people={JOHN:{name:'JOHN',role:'Design & arte',description:'Faz a direção visual e a arte das peças seguindo o DNA do cliente. Propõe cada lote de imagens e só gera depois do ok do Tiago.',delivery:'Texto → Direção visual → Lote → Arte'}};
let createPerson='NOA';
function characterOf(zone){return zone==='create'?createPerson:{think:'MAYA',build:'LEO',grow:'NINA',control:'ARI'}[zone];}
function profileOf(zone){const base=profiles[zone]||profiles.all;return zone==='create'&&people[createPerson]?{...base,...people[createPerson]}:base;}
function setCreatePerson(name){if(createPerson===name)return;createPerson=name;if(selected==='create')updateProfile('create');}
document.querySelectorAll('#agent-switch button').forEach(b=>b.onclick=()=>setCreatePerson(b.dataset.person));
function renderProfileState(zone){
  const name=characterOf(zone);const c=caps?.characters?.[name];const state=$('#agent-state');
  if(!c){state.textContent='';$('#station-list').replaceChildren();return;}
  const ambientAway=office?.diagnostics?.().agents?.away?.includes(name);
  state.textContent=c.state==='em_tarefa'?`Em tarefa: ${c.task?.instruction||c.current_station}${c.task?.title?' · '+c.task.title:''}`:`Disponível${ambientAway?', circulando':''}. Nenhuma tarefa em execução.`;
  state.dataset.state=c.state;
  renderActivity(name);
  const list=$('#station-list');list.replaceChildren();
  for(const s of caps.stations.filter(s=>s.character===name)){
    const chip=document.createElement('button');chip.type='button';chip.className='station-chip';chip.dataset.state=s.state;chip.dataset.station=s.id;chip.textContent=s.name;chip.title=s.state_label;chip.classList.toggle('selected',s.id===stationId);
    chip.onclick=()=>showStation(s.id);list.append(chip);
  }
  const comando=$('#comando');comando.hidden=zone!=='control'||!catalog;
  if(zone==='control'&&catalog){const wrap=$('#comando-list');wrap.replaceChildren();for(const job of catalog){const row=document.createElement('div');row.className='comando-job';row.dataset.executable=String(job.executable);const t=document.createElement('strong'),s=document.createElement('small'),a=document.createElement('code');t.textContent=job.name;s.textContent=job.status;a.textContent=job.how_to_ask;row.append(t,s,a);wrap.append(row);}}
}
// Activity in the ficha: the same card the panel shows, reduced to client, counts and the last three real events.
function renderActivity(name){
  const box=$('#agent-activity');const c=team?.find(t=>t.name===name);
  if(!c){box.hidden=true;return;}
  $('#agent-client').textContent=c.client_mode==='ativo'?`Cliente ativo · ${c.client}`:c.client_mode==='ultimo'?`Último cliente · ${c.client}`:'Sem cliente até agora';
  const nums=$('#agent-numbers');nums.replaceChildren();
  for(const n of c.numbers){const s=document.createElement('span'),b=document.createElement('b'),l=document.createElement('small');b.textContent=String(n.value);l.textContent=n.label;s.append(b,l);nums.append(s);}
  nums.hidden=!c.numbers.length;
  const log=$('#agent-log');log.replaceChildren();
  for(const p of c.pending){const li=document.createElement('li');li.className='team-pending';li.textContent=p;log.append(li);}
  for(const e of c.log.slice(0,3)){const li=document.createElement('li'),t=document.createElement('span'),m=document.createElement('p'),k=document.createElement('b');t.textContent=new Date(e.created).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});m.textContent=e.message+(e.client?' · '+e.client:'');k.textContent=e.done?'✓':'·';k.className=e.done?'done':'';li.append(t,m,k);log.append(li);}
  if(!c.log.length&&!c.pending.length){const li=document.createElement('li');li.className='ops-muted';li.textContent='Nenhuma atividade registrada ainda.';log.append(li);}
  box.hidden=false;
}
$('#agent-card').onclick=()=>panel?.showTeamCard(characterOf(selected));
function showStation(id){
  const s=caps?.stations.find(x=>x.id===id);const box=$('#station-ficha');
  if(!s){box.hidden=true;stationId='';office?.selectStation('');return;}
  stationId=id;office?.selectStation(id);
  $('#station-name').textContent=s.name;$('#station-state').textContent=s.state_label;$('#station-state').dataset.state=s.state;$('#station-does').textContent=s.does;$('#station-inputs').textContent=s.inputs;$('#station-output').textContent=s.output;$('#station-ask').textContent=s.how_to_ask;
  $('#station-methods').textContent=s.methods?.length?`Método: ${s.methods.length} ${s.methods.length===1?'arquivo':'arquivos'} da biblioteca (${s.methods_found?.length??s.methods.length} ${(s.methods_found?.length??s.methods.length)===1?'encontrado':'encontrados'})`:'Sem método na biblioteca.';
  $('#station-jobs').textContent=s.jobs?.length?'Jobs: '+s.jobs.join(', '):'Sem job neste recorte.';
  $('#station-note').hidden=!s.note;$('#station-note').textContent=s.note||'';
  box.hidden=false;
  const zone={MAYA:'think',NOA:'create',JOHN:'create',LEO:'build',NINA:'grow',ARI:'control'}[s.character]||'control';
  if(zone==='create'&&createPerson!==s.character){createPerson=s.character;if(selected==='create'){updateProfile('create');box.hidden=false;return;}}
  if(selected!==zone){selectZone(zone);} else {renderProfileState(zone);if(mode!=='focus'&&!interior)setMode('focus');}
  box.hidden=false;
}
$('#station-copy').onclick=()=>{navigator.clipboard?.writeText($('#station-ask').textContent);$('#station-copy').textContent='Copiado';setTimeout(()=>$('#station-copy').textContent='Copiar',1200);};
function updateProfile(zone){
  const p=profileOf(zone),r=rooms[zone]||rooms.control;
  const sw=$('#agent-switch');sw.hidden=zone!=='create';sw.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.person===createPerson)));
  $('#agent-name').textContent=p.name;$('#agent-monogram').textContent=p.name[0];$('#agent-role').textContent=p.role;$('#agent-description').textContent=p.description;$('#agent-delivery').textContent=p.delivery;$('#agent-index').textContent=p.index;
  $('#agent-zone').textContent=zone.toUpperCase();$('#room-title').textContent=r.title;$('#room-description').textContent=r.description;
  $('#scene-location').textContent=p.location;$('#scene-subtitle').textContent=p.subtitle;
  if(stationId&&caps?.stations.find(s=>s.id===stationId)?.character!==characterOf(zone)){stationId='';$('#station-ficha').hidden=true;office?.selectStation('');}
  renderProfileState(zone);
}
function syncNav(){document.querySelectorAll('[data-zone]').forEach(b=>{b.classList.toggle('selected',b.dataset.zone===selected);if(b.classList.contains('zone-button'))b.setAttribute('aria-pressed',String(b.dataset.zone===selected));});}
function stopTour(){cancelAnimationFrame(tour.raf);const wasReplay=!!script.stages;tour.active=false;tour.paused=false;$('#tour-controls').hidden=true;office?.setAgentPaused(false);document.body.classList.remove('mode-replay');if(wasReplay){office?.setWorkflow(null);script={order,content:tourContent,timings:tourTimings,stages:null,badge:''};}if(mode==='tour')setMode('explore');}
function stopFollowingWork(){operations?.setFollowing(false);office?.setWorkflow(null);}
function selectZone(zone,{instant=false,keepTour=false,keepWorkflow=false}={}){
  if(!profiles[zone])return;
  if(!keepTour)stopTour();if(!keepWorkflow)stopFollowingWork();
  selected=zone;syncNav();updateProfile(zone);office?.setExploring(true);
  if(zone==='all'){
    interior=false;floor='all';setMode(keepTour?'tour':'explore');office?.focus('all',instant||reduceMotion.matches);
  }else if(interior&&!keepTour&&!keepWorkflow){
    setMode('walk');office?.enter(zone,instant||reduceMotion.matches);
  }else{
    interior=false;setMode(keepTour?'tour':'focus');office?.focus(zone,instant||reduceMotion.matches);
  }
  if(!keepTour&&!keepWorkflow)history.replaceState(null,'',zone==='all'?'#explore':interior?`#inside-${zone}`:`#${zone}`);
}
function explore(){closeBrief();interior=false;selectZone('all');}
function enterRoom(zone=selected){
  if(!office||visualMode)return;stopTour();stopFollowingWork();closeBrief();
  const next=roomSpecs[zone]?zone:'control';selected=next;syncNav();updateProfile(next);interior=true;setMode('walk');office.setExploring(true);office.enter(next,reduceMotion.matches);history.replaceState(null,'',`#inside-${next}`);
}
function chooseFloor(value){
  if(!office||visualMode)return;stopTour();stopFollowingWork();
  if(value==='all'){explore();return;}
  selected='all';floor=value;syncNav();office.setExploring(true);
  setMode(interior?'walk':'explore');history.replaceState(null,'',`#${interior?'inside-floor':'floor'}-${value}`);$('#scene-location').textContent=floorSpecs[value].name;$('#scene-subtitle').textContent=interior?'Explore em altura humana.':'Pavimento aberto · Arraste para explorar.';office.setFloor(value,reduceMotion.matches);
}
function updateNavigation(state){
  const d=office?.diagnostics();
  if(d)$('#scene').dataset.diagnostics=JSON.stringify({mode,selected,working,tour:{active:tour.active,paused:tour.paused,index:tour.index},...d});
  interior=state.mode==='walk';floor=state.floor;
  document.querySelectorAll('[data-floor]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.floor===floor)));
  $('#enter-view').hidden=interior;$('#navigation-hint').textContent=interior?'Arraste para olhar · W A S D para caminhar':'Arraste para orbitar · Role para aproximar';
  if(interior){
    const f=floorSpecs[floor];if(!f)return;
    $('#map-floor').textContent=f.name;$('#map-left').textContent=f.left;$('#map-right').textContent=f.right;
    const [x,,z]=state.position;$('#map-marker').setAttribute('transform',`translate(${9+(x+10.1)/20.2*202} ${8+(z+6)/12*118}) rotate(${-state.yaw*180/Math.PI})`);
    if(state.zone==='all'){$('#scene-location').textContent=f.name;$('#scene-subtitle').textContent='Explore em altura humana.';}
  }
}
function onInteraction(){if(tour.active&&!tour.paused)pauseTour();if(working)stopFollowingWork();}
function closeBrief(){operations?.close();}
function openBrief(){if(VITRINE)return;operations?.open();}
document.querySelectorAll('.zone-button').forEach(b=>b.onclick=e=>selectZone(b.dataset.zone,{instant:e.detail===0}));
document.querySelectorAll('[data-floor]').forEach(b=>b.onclick=()=>chooseFloor(b.dataset.floor));
// Hero key and room strip: hovering a row lights the matching marker on the building; clicking goes there.
function litZone(zone){document.querySelectorAll('#scene-labels .hotspot').forEach(h=>h.classList.toggle('lit',h.dataset.zone===zone));}
document.querySelectorAll('.intro-list button,.room-strip button').forEach(b=>{b.onclick=e=>selectZone(b.dataset.zone,{instant:e.detail===0});b.onmouseenter=()=>litZone(b.dataset.zone);b.onmouseleave=()=>litZone('');b.onfocus=b.onmouseenter;b.onblur=b.onmouseleave;});
$('#intro-tour').onclick=()=>startTour();
$('.brand').onclick=e=>{e.preventDefault();explore();};$('#enter-office').onclick=explore;$('#explore').onclick=explore;$('#reset-camera').onclick=explore;$('#leave-interior').onclick=explore;$('#close-profile').onclick=explore;
$('#enter-room').onclick=()=>enterRoom();$('#enter-view').onclick=()=>{if(floor==='terrace'){interior=true;setMode('walk');office.enter('control',true);office.setFloor('terrace',true);}else if(floor==='upper')enterRoom('think');else enterRoom();};
$('#open-brief').onclick=()=>$('#brief-panel').hidden?openBrief():closeBrief();$('#agent-activate').onclick=openBrief;
$('#zoom-in').onclick=()=>office?.zoom(.84);$('#zoom-out').onclick=()=>office?.zoom(1.18);
function syncMotion(state){$('#agent-motion').textContent=state.reducedMotion?'Agentes em pausa':state.userEnabled?'Agentes animados':'Agentes em pausa';$('#agent-motion').setAttribute('aria-pressed',String(state.enabled));}
$('#agent-motion').onclick=()=>{if(office)syncMotion(office.toggleAgentMotion());};
$('#quality').onclick=()=>{if(office)syncQuality(office.toggleQuality());};
function syncQuality(low){$('#quality').textContent=`Qualidade: ${low?'leve':'alta'}`;$('#quality').setAttribute('aria-pressed',String(low));}
$('#fullscreen').onclick=async()=>{try{if(document.fullscreenElement)await document.exitFullscreen();else await document.documentElement.requestFullscreen();}catch{$('#navigation-hint').textContent='Use a tela cheia do navegador para ampliar.';}};
for(const button of document.querySelectorAll('[data-move]')){
  button.addEventListener('pointerdown',e=>{e.preventDefault();button.setPointerCapture(e.pointerId);office?.move(button.dataset.move,true);});
  for(const event of ['pointerup','pointercancel','lostpointercapture'])button.addEventListener(event,()=>office?.move(button.dataset.move,false));
  button.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();office?.move(button.dataset.move,true);}});
  button.addEventListener('keyup',()=>office?.move(button.dataset.move,false));button.addEventListener('blur',()=>office?.move(button.dataset.move,false));
}
const tourContent=[
  ['Um espaço, várias inteligências.','A operação ganha um lugar.','O pavilhão reúne estratégia, criação, tecnologia e negócios em uma arquitetura conectada.'],
  ['CONTROL / ARI','Tudo começa com uma pergunta.','O briefing chega ao ponto de conexão. ARI organiza prioridades e a sequência de contribuições.'],
  ['THINK / MAYA','Clareza para escolher.','No estúdio de estratégia, o contexto se transforma em perguntas, posicionamento e direção.'],
  ['CREATE / NOA','Uma direção ganha expressão.','O atelier conecta narrativa, identidade e experiências. Uma linguagem comum para uma mesma ideia.'],
  ['BUILD / LEO','Dar estrutura ao movimento.','No laboratório, conceito e tecnologia encontram uma jornada de execução clara.'],
  ['GROW / NINA','A próxima conversa começa aqui.','Públicos, oportunidades e relacionamento conectam o trabalho às possibilidades de crescimento.'],
  ['AERA / The Living Office','Agora, escolha seu caminho.','Entre nos ambientes, explore os pavimentos ou leve um briefing à operação. A operação está disponível pelo painel de pedidos.']
];
const tourTimings=[5200,5200,5600,5600,5600,5200,6500];
// The guided tour and the replay of a real job share one mechanism; the replay is built from recorded events only.
let script={order,content:tourContent,timings:tourTimings,stages:null,badge:''};
function lastStep(){return script.order.length-1;}
function showTourStep(index){
  tour.index=Math.max(0,Math.min(lastStep(),index));tour.start=performance.now();tour.elapsed=0;
  selectZone(script.order[tour.index],{keepTour:true,keepWorkflow:true,instant:reduceMotion.matches});setMode('tour');
  if(script.stages)office?.setWorkflow(script.stages[tour.index]||null);
  const [phase,message,copy]=script.content[tour.index];$('#tour-phase').textContent=(script.badge?script.badge+' · ':'')+phase;$('#tour-message').textContent=message;$('#tour-copy').textContent=copy;
  $('#tour-count').textContent=`${String(tour.index+1).padStart(2,'0')} / ${String(lastStep()+1).padStart(2,'0')}`;$('#tour-prev').disabled=tour.index===0;$('#tour-next').disabled=tour.index===lastStep();$('#tour-progress').style.transform='scaleX(0)';
}
function tickTour(now){
  if(!tour.active)return;
  if(!tour.paused){tour.elapsed=now-tour.start;$('#tour-progress').style.transform=`scaleX(${Math.min(1,tour.elapsed/script.timings[tour.index])})`;if(tour.elapsed>=script.timings[tour.index]){if(tour.index<lastStep())showTourStep(tour.index+1);else{pauseTour();$('#tour-pause').textContent='Rever';}}}
  tour.raf=requestAnimationFrame(tickTour);
}
function runScript(next){
  // stopTour resets the script after a replay, so the next script is installed only after it.
  closeBrief();stopFollowingWork();stopTour();script=next;interior=false;tour={active:true,paused:reduceMotion.matches,index:0,start:performance.now(),elapsed:0,raf:0};
  document.body.classList.toggle('mode-replay',!!script.stages);
  $('#tour-controls').hidden=false;$('#tour-pause').textContent=tour.paused?'Continuar':'Pausar';showTourStep(0);office?.setAgentPaused(tour.paused);tour.raf=requestAnimationFrame(tickTour);
}
function startTour(){runScript({order,content:tourContent,timings:tourTimings,stages:null,badge:''});history.replaceState(null,'','#tour');}
const zoneOfAgent={ARI:'control',MAYA:'think',NOA:'create',JOHN:'create',LEO:'build',NINA:'grow'};
function replayJob(job){
  // One step per recorded event that moved the work; captions quote the event, never invented dialogue.
  const steps=[];const when=e=>new Date(e.created).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  const push=(zone,phase,message,copy,stage)=>steps.push({zone,phase,message,copy,stage});
  push('all',`${job.client_name||'Sem cliente'} · ${job.title}`,'Reprodução de um trabalho real.',`${job.cards.length||job.tasks.length} ${job.cards.length?'cartões':'tarefas'} · ${job.calls_made} chamadas registradas. Nada aqui é simulado: cada passo vem de um evento gravado.`,null);
  for(const e of job.events){
    const d=e.data||{};const agent=d.agent||'';const zone=zoneOfAgent[agent]||'control';
    if(e.kind==='planning')push('control',`${when(e)} · ARI`,'ARI lê o pedido.',d.message||'',{zone:'control',partnerZone:'think',agent:'ARI',partner:'MAYA'});
    else if(e.kind==='questions')push('control',`${when(e)} · ARI`,'ARI pergunta o que falta.',(d.questions||[]).join(' · '),null);
    else if(e.kind==='estimate_ready')push('control',`${when(e)} · ARI`,'Estimativa antes da primeira chamada.',`${d.estimate?.calls||'?'} chamadas · ${d.estimate?.images||0} imagens`,null);
    else if(e.kind==='task_started'&&agent)push(zone,`${when(e)} · ${agent}`,agent==='MAYA'?'MAYA monta a pauta.':agent==='NOA'?'NOA produz o post.':`${agent} em tarefa.`,d.message||'',{zone,partnerZone:zone==='create'?'control':'create',agent,partner:zone==='create'?'ARI':'NOA'});
    else if(e.kind==='pauta_ready')push('think',`${when(e)} · MAYA`,'Pauta entregue.',(d.posts||[]).join(' · '),{zone:'think',partnerZone:'create',agent:'MAYA',partner:'NOA'});
    else if(e.kind==='card_ready')push('create',`${when(e)} · NOA`,`Post ${d.ordinal} pronto.`,d.message||'',{zone:'create',partnerZone:'control',agent:'NOA',partner:'ARI'});
    else if(e.kind==='image_generated')push('create',`${when(e)} · JOHN`,'Imagem gravada no disco.',d.message||'',{zone:'create',partnerZone:'control',agent:'JOHN',partner:'ARI'});
    else if(e.kind==='reviewing')push('control',`${when(e)} · ARI`,'ARI revisa os cartões.',d.message||'',{zone:'control',partnerZone:'create',agent:'ARI',partner:'NOA'});
    else if(e.kind==='cards_ready'||e.kind==='delivery_ready')push('control',`${when(e)} · ARI`,'Pronto para a decisão de Tiago.',d.message||'',null);
    else if(e.kind==='card_approved')push('control',`${when(e)} · Tiago`,`Post ${d.ordinal} aprovado.`,d.message||'',null);
    else if(e.kind==='card_revision_requested')push('control',`${when(e)} · ARI`,`Ajuste do post ${d.ordinal} volta a ${d.owner}.`,d.message||'',{zone:'control',partnerZone:'create',agent:'ARI',partner:'NOA'});
    else if(e.kind==='card_discarded')push('control',`${when(e)} · Tiago`,`Post ${d.ordinal} descartado.`,d.message||'',null);
  }
  push('all','Fim da reprodução','O trabalho continua no painel.','Aprovações, ajustes e pendências ficam registrados no escritório.',null);
  const trimmed=steps.slice(0,40);
  runScript({order:trimmed.map(s=>s.zone),content:trimmed.map(s=>[s.phase,s.message,s.copy]),timings:trimmed.map((s,i)=>i===0||i===trimmed.length-1?5200:4200),stages:trimmed.map(s=>s.stage),badge:'REPRODUÇÃO'});
  history.replaceState(null,'','#replay');
}
function pauseTour(){
  if(!tour.active)return;
  if(tour.index===lastStep()&&tour.elapsed>=script.timings[lastStep()]){tour.paused=false;showTourStep(0);}else if(tour.paused){tour.start=performance.now()-tour.elapsed;tour.paused=false;}else{tour.elapsed=performance.now()-tour.start;tour.paused=true;}
  $('#tour-pause').textContent=tour.paused?'Continuar':'Pausar';office?.setAgentPaused(tour.paused);
}
$('#start-tour').onclick=startTour;$('#tour-pause').onclick=pauseTour;$('#tour-stop').onclick=explore;
$('#tour-prev').onclick=()=>showTourStep(tour.index-1);$('#tour-next').onclick=()=>showTourStep(tour.index+1);
window.addEventListener('keydown',e=>{
  if(e.metaKey||e.ctrlKey||e.altKey||/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)||e.target.isContentEditable||$('dialog[open]'))return;
  if(e.key==='Escape'){e.preventDefault();if(!$('#brief-panel').hidden)closeBrief();else explore();return;}
  if(tour.active&&['ArrowRight','ArrowLeft',' '].includes(e.key)&&!e.target.closest('button,a')){e.preventDefault();if(e.key===' ')pauseTour();else showTourStep(tour.index+(e.key==='ArrowRight'?1:-1));return;}
  if(/^[1-5]$/.test(e.key)){e.preventDefault();selectZone(['think','create','build','grow','control'][Number(e.key)-1],{instant:true});}
  if(e.key.toLowerCase()==='p'){e.preventDefault();startTour();}
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&tour.active&&!tour.paused)pauseTour();});
reduceMotion.addEventListener('change',()=>{if(reduceMotion.matches&&tour.active&&!tour.paused)pauseTour();if(office)syncMotion(office.diagnostics().agents);});
let panel=null,teamTimer=0;
operations=initOperations({
  onOpen(){stopTour();office?.stopMoving();$('#detail-panel').hidden=true;panel?.renderSummary();},
  onClose(){if(mode==='focus')$('#detail-panel').hidden=false;panel?.markSeen();clearInterval(teamTimer);},
  onBusy(value){working=value;},
  onStage(stage){stopTour();interior=false;selectZone(stage.zone,{keepWorkflow:true});office?.setWorkflow(stage);},
  onStopFollowing(){office?.setWorkflow(null);},
  onJob(job){panel?.renderOrg(job);syncCaps();},
  onReplay(job){replayJob(job);},
  onTab(tab){clearInterval(teamTimer);if(tab==='team'){panel?.renderTeam();teamTimer=setInterval(()=>{if(!document.hidden&&operations.isOpen())panel?.renderTeam();},2500);}if(tab==='caps')panel?.renderCaps();},
  selection(){return clients?clients.selection():{client_id:'',project_id:''};}
});
let clients=initClients({api:operations.api,notice:operations.notice});
panel=initPanel({api:operations.api,setTab(tab){if(!operations.isOpen())operations.open();operations.setTab(tab);}});
// NAYRA (C37 to C45): the orb in the header shows a count; the briefing plays only when called.
const nayra=initNayra({api:operations.api,openJob(id){stopTour();if(!operations.isOpen())operations.open();operations.selectJob(id);},openPanel(){stopTour();operations.open();}});
// NAYRA by voice (C49 to C60): "Oi, NAYRA", presentation mode and the live conversation. In presentation the orb button opens the conversation.
const voz=initNayraVoz({api:operations.api,briefing:()=>nayra.open(),closeBriefing:()=>nayra.close(),
  selectZone(zone){if(!office||visualMode)return;selectZone(zone);},
  openJob(id){stopTour();if(!operations.isOpen())operations.open();operations.selectJob(id);},
  onPresentation(){operations.refresh(false);syncCaps();nayra.refreshCount();if(operations.isOpen())panel?.renderSummary();}});
$('#nayra-call').onclick=()=>voz.presenting?voz.converse():nayra.open();
if(VITRINE){
  document.body.classList.add('vitrine');$('#nayra-call').title='Conhecer a NAYRA';$('#nayra-title').textContent='NAYRA · AERA AI Office';
  // C88: on the public site one click opens the conversation; the limits live in the Vercel function and in the ElevenLabs agent.
  const talk=$('#nayra-talk-open'),error=$('#nayra-talk-error');
  talk.hidden=false;
  talk.onclick=async()=>{
    talk.disabled=true;error.textContent='';
    try{await voz.publicTalk();}
    catch(failure){error.textContent=failure.message;}
    finally{talk.disabled=false;}
  };
}
// The orb is drawn in code (ring of fine lines, reference from Tiago 02/11); it only animates while its stage is on screen.
mountOrb($('#nayra-orb'),{lines:88,points:260,mesh:true,image:'./nayra/orbe.webp'});mountOrb($('#nayra-live-orb'),{lines:44,points:180,mesh:true,image:'./nayra/orbe.webp'});
function finishLoading(){$('#loading').classList.add('finished');setTimeout(()=>$('#loading').hidden=true,300);}
function fallback(reason){$('.intro-note').textContent='Modo visual · Navegação 3D indisponível.';$('#enter-office').firstChild.textContent='Conhecer os ambientes ';$('#explore').textContent='Ambientes';visualMode=true;stopTour();stopFollowingWork();document.body.classList.remove('three-ready');document.body.classList.add('visual-mode');$('#fallback-notice').hidden=false;$('#fallback-reason').textContent=reason;$('#render-status').textContent='Referência visual · Contingência';for(const id of ['enter-room','enter-view','start-tour','intro-tour'])$('#'+id).disabled=true;finishLoading();}
const loadTimer=setTimeout(()=>{if(!office)fallback(VITRINE?'O carregamento está demorando.':'O carregamento está demorando. Os registros offline estão disponíveis.');},15000);
async function boot(){
  if(new URLSearchParams(location.search).has('fallback')){clearTimeout(loadTimer);fallback('Contingência ativada. A imagem é a referência arquitetônica; a navegação 3D não está ativa.');return;}
  try{
    await document.fonts.ready;const {createOffice}=await import('./main.js');
    office=await createOffice({selectZone,onFailure:fallback,onQuality:syncQuality,onNavigation:updateNavigation,onInteraction,onStation:showStation});
    syncCaps();capsTimer=setInterval(()=>{if(!document.hidden)syncCaps();},4000);
    visualMode=false;$('.intro-note').textContent='3D em tempo real. Escolha seu caminho.';$('#enter-office').firstChild.textContent='Explorar o escritório ';$('#explore').textContent='Explorar 3D';document.body.classList.remove('visual-mode');document.body.classList.add('three-ready');$('#fallback-notice').hidden=true;syncMotion(office.diagnostics().agents);clearTimeout(loadTimer);finishLoading();if(operations.isWorking())operations.setFollowing(true);
    const hash=location.hash.slice(1);if(hash.startsWith('inside-floor-')&&floorSpecs[hash.slice(13)]){interior=true;setMode('walk');office.enter('control',true);chooseFloor(hash.slice(13));}else if(hash.startsWith('floor-')&&floorSpecs[hash.slice(6)])chooseFloor(hash.slice(6));else if(hash.startsWith('inside-')&&rooms[hash.slice(7)])enterRoom(hash.slice(7));else if(rooms[hash])selectZone(hash,{instant:true});else if(hash==='tour')startTour();else if(hash==='explore')explore();
  }catch(error){clearTimeout(loadTimer);console.error('AERA: cena indisponível',error);fallback(VITRINE?'Navegação 3D não disponível neste navegador.':'WebGL não disponível. Abra os registros offline para apresentar sem renderização 3D.');}
}
window.aera={selectZone,startTour,enterRoom,nayra,voz,get state(){return {selected,mode,floor,interior,working,visualMode,ready:!!office,tour:{active:tour.active,paused:tour.paused,index:tour.index}};},get diagnostics(){return office?.diagnostics();}};
boot();
