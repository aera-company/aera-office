// Team, capabilities, summary and the live org chart. Everything here is derived from server state and events.
export function initPanel({api,setTab}) {
  const $=s=>document.querySelector(s);
  const el=(tag,props={},...children)=>{const n=document.createElement(tag);Object.assign(n,props);n.append(...children);return n;};
  const zoneOf={ARI:'control',MAYA:'think',NOA:'create',JOHN:'create',LEO:'build',NINA:'grow'};
  const stateLabels={em_tarefa:'Em tarefa',disponivel:'De prontidão'};
  let caps=null,catalog=null,activity=[],summary=null,capsSignature='',teamSignature='',query='';
  const time=iso=>new Date(iso).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  async function loadCaps(){try{caps=await api('capabilities');catalog=(await api('jobs/catalog')).jobs;}catch{caps=null;catalog=null;}}

  // ---- Team: activity cards. Grid of the five with state on top; one card per character with client, counts and the register of real events ----
  let team=null,focusName='';
  async function renderTeam(){
    await loadCaps();try{team=(await api('team')).characters;}catch{team=null;}
    const sig=JSON.stringify([team,focusName]);if(sig===teamSignature)return;teamSignature=sig;
    const grid=$('#ops-team');grid.replaceChildren();
    if(!team){grid.append(el('p',{className:'ops-muted',textContent:'O registro da equipe não respondeu.'}));return;}
    const strip=el('div',{className:'team-grid',role:'list'});
    for(const c of team){
      const chip=el('button',{type:'button',className:'team-chip',onclick:()=>{focusName=c.name;teamSignature='';renderTeam();}});chip.dataset.state=c.state;chip.dataset.pending=String(!!c.pending.length);
      chip.append(el('span',{className:'agent-monogram',textContent:c.name[0]}),el('b',{textContent:c.name}),el('small',{textContent:c.pending.length?'pendente':stateLabels[c.state]||c.state}));
      strip.append(chip);
    }
    grid.append(strip);
    for(const c of team){
      const card=el('article',{className:'team-card',id:'team-card-'+c.name});card.dataset.state=c.state;card.dataset.pending=String(!!c.pending.length);
      const head=el('div',{className:'team-head'},el('span',{className:'agent-monogram',textContent:c.name[0]}),el('div',{},el('h4',{textContent:c.name}),el('p',{textContent:c.role})),el('small',{className:'team-state',textContent:stateLabels[c.state]||c.state}));
      card.append(head);
      card.append(el('p',{className:'team-client',textContent:c.client_mode==='ativo'?`Cliente ativo · ${c.client}`:c.client_mode==='ultimo'?`Último cliente · ${c.client}`:'Sem cliente até agora'}));
      if(c.task)card.append(el('p',{className:'team-task',textContent:`${c.task.instruction||'Em tarefa'} · ${c.task.title||''}`}));
      if(c.numbers.length){const nums=el('div',{className:'team-numbers'});for(const n of c.numbers)nums.append(el('span',{},el('b',{textContent:String(n.value)}),el('small',{textContent:n.label})));card.append(nums);}
      for(const p of c.pending)card.append(el('p',{className:'team-pending',textContent:p}));
      const log=el('ol',{className:'team-log'});
      if(!c.log.length)log.append(el('li',{className:'ops-muted',textContent:'Nenhuma atividade registrada ainda.'}));
      for(const e of c.log)log.append(el('li',{},el('span',{textContent:time(e.created)}),el('p',{textContent:e.message+(e.client?' · '+e.client:'')}),el('b',{textContent:e.done?'✓':'·',className:e.done?'done':''})));
      if(c.events_total>c.log.length)log.append(el('li',{className:'team-more',textContent:`${c.events_total-c.log.length} ${c.events_total-c.log.length===1?'registro anterior':'registros anteriores'}`}));
      card.append(log);
      const stations=(caps?.stations||[]).filter(s=>s.character===c.name);
      if(stations.length)card.append(el('p',{className:'team-stations',textContent:stations.map(s=>s.name).join(' · ')}));
      grid.append(card);
    }
    // The focused card keeps its mark across refreshes; it only scrolls into view when the focus changes.
    if(focusName){const target=$('#team-card-'+focusName);if(target){target.classList.add('focused');if(scrolledTo!==focusName){scrolledTo=focusName;target.scrollIntoView({block:'start',behavior:'smooth'});}}}
  }
  let scrolledTo='';
  function showTeamCard(name){focusName=name;scrolledTo='';teamSignature='';setTab('team');renderTeam();}

  // ---- Capabilities: list + search over the same registry the building reads ----
  function matches(s,q){if(!q)return true;const hay=[s.name,s.does,s.how_to_ask,s.character,s.output,...(s.jobs||[])].join(' ').toLowerCase();return q.split(/\s+/).every(w=>hay.includes(w));}
  async function renderCaps(){
    if(!caps)await loadCaps();
    const sig=JSON.stringify([caps?.stations.map(s=>s.state),query,catalog?.map(j=>j.status)]);if(sig===capsSignature)return;capsSignature=sig;
    const list=$('#ops-caps-list');list.replaceChildren();
    if(!caps){list.append(el('p',{className:'ops-muted',textContent:'O registro de capacidades não respondeu.'}));return;}
    const q=query.trim().toLowerCase();
    const jobsWrap=el('div',{className:'caps-jobs'});
    for(const job of (catalog||[]).filter(j=>!q||[j.name,j.summary,j.how_to_ask].join(' ').toLowerCase().includes(q))){
      const row=el('div',{className:'caps-job'});row.dataset.executable=String(job.executable);
      row.append(el('strong',{textContent:job.name}),el('span',{textContent:job.status}),el('p',{textContent:job.summary}),el('code',{textContent:job.how_to_ask}),el('button',{type:'button',textContent:'Copiar',onclick:()=>navigator.clipboard?.writeText(job.how_to_ask)}));
      jobsWrap.append(row);
    }
    if(jobsWrap.children.length)list.append(el('h4',{textContent:'Jobs'}),jobsWrap);
    for(const [name,c] of Object.entries(caps.characters)){
      const stations=caps.stations.filter(s=>s.character===name&&matches(s,q));if(!stations.length)continue;
      list.append(el('h4',{textContent:`${name} · ${c.role}`}));
      for(const s of stations){
        const row=el('div',{className:'caps-station'});row.dataset.state=s.state;
        row.append(el('div',{className:'caps-station-head'},el('strong',{textContent:s.name}),el('small',{textContent:s.state_label})),el('p',{textContent:s.does}),el('p',{className:'caps-io',textContent:`Entra: ${s.inputs} · Sai: ${s.output}`}));
        const ask=el('div',{className:'caps-ask'},el('code',{textContent:s.how_to_ask}),el('button',{type:'button',textContent:'Copiar',onclick:()=>navigator.clipboard?.writeText(s.how_to_ask)}));
        row.append(ask);
        if(s.jobs?.length)row.append(el('small',{className:'caps-jobs-list',textContent:'Jobs: '+s.jobs.join(', ')}));
        if(s.note)row.append(el('small',{className:'caps-note',textContent:s.note}));
        list.append(row);
      }
    }
    if(list.children.length===0)list.append(el('p',{className:'ops-muted',textContent:'Nada encontrado para "'+query+'".'}));
  }
  $('#ops-caps-search').addEventListener('input',()=>{query=$('#ops-caps-search').value;renderCaps();});

  // ---- Summary: since the last time the panel was opened ----
  async function renderSummary(){
    let since='';try{since=localStorage.getItem('aera.lastSeen')||'';}catch{}
    try{summary=await api('summary'+(since?'?since='+encodeURIComponent(since):''));}catch{summary=null;}
    const box=$('#ops-summary');box.replaceChildren();if(!summary)return;
    const parts=[];
    if(summary.produced)parts.push(`${summary.produced} ${summary.produced===1?'peça produzida':'peças produzidas'}`);
    if(summary.approved)parts.push(`${summary.approved} ${summary.approved===1?'aprovação':'aprovações'}`);
    if(summary.awaiting_approval.length)parts.push(`${summary.awaiting_approval.length} ${summary.awaiting_approval.length===1?'trabalho aguarda':'trabalhos aguardam'} sua decisão`);
    if(summary.batches_awaiting)parts.push(`${summary.batches_awaiting} ${summary.batches_awaiting===1?'lote de imagens do JOHN aguarda':'lotes de imagens do JOHN aguardam'} o seu ok`);
    if(summary.awaiting_you.length)parts.push(`${summary.awaiting_you.length} ${summary.awaiting_you.length===1?'precisa':'precisam'} de resposta sua`);
    if(summary.pending_images)parts.push(`${summary.pending_images} ${summary.pending_images===1?'imagem pendente':'imagens pendentes'}`);
    if(summary.failed.length)parts.push(`${summary.failed.length} com falha ou interrompido`);
    if(summary.missed.length)parts.push(`${summary.missed.length} agendado não rodou`);
    const title=el('strong',{textContent:since?'Enquanto você não estava':'Estado da operação'});
    box.append(title,el('p',{textContent:parts.length?parts.join(' · '):'Nada mudou. Nenhum trabalho aguarda você.'}));
    if(summary.missed.length)box.append(el('small',{className:'ops-muted',textContent:summary.note}));
    box.hidden=false;
  }
  function markSeen(){try{localStorage.setItem('aera.lastSeen',new Date().toISOString());}catch{}}

  // ---- Live org chart for a job: ARI on top, stations lighting up as events arrive ----
  const flows={'conteudo-semana':[{agent:'ARI',station:'Briefing e plano',phase:'planning'},{agent:'MAYA',station:'Pauta e ângulos',phase:'pauta'},{agent:'NOA',station:'Texto e desdobramento',phase:'post'},{agent:'JOHN',station:'Direção visual e imagem',phase:'image'},{agent:'ARI',station:'Revisão',phase:'review'},{agent:'ARI',station:'Roteamento de ajustes',phase:'revise'}],
    pedido:[{agent:'ARI',station:'Briefing e plano',phase:'planning'},{agent:'*',station:'Tarefas',phase:'tasks'},{agent:'ARI',station:'Revisão',phase:'review'}]};
  function nodeState(job,node){
    const kinds=job.events.map(e=>e.kind);const st=job.status;
    if(node.phase==='planning')return st==='planning'?'active':job.plan?'done':st==='needs_input'?'waiting':'pending';
    if(node.phase==='pauta')return job.phase==='pauta'?'active':job.pauta?.length?'done':'pending';
    if(node.phase==='post')return job.phase?.startsWith('post')?'active':job.cards.length&&job.cards.every(c=>c.pieces.length)?'done':'pending';
    if(node.phase==='image')return job.phase?.startsWith('image')?'active':job.cards.length&&job.cards.every(c=>c.state==='descartado'||c.pieces.every(p=>p.image_state==='gerada'))&&job.cards.some(c=>c.pieces.length)?'done':job.cards.some(c=>c.pending==='imagem')?'blocked':'pending';
    if(node.phase==='review')return job.phase==='review'||st==='reviewing'?'active':kinds.includes('cards_ready')||kinds.includes('delivery_ready')?'done':'pending';
    if(node.phase==='revise')return st==='revision_queued'?'active':kinds.includes('card_revision_requested')||kinds.includes('revision_requested')?'done':'idle';
    if(node.phase==='tasks')return job.tasks.some(t=>t.status==='running')?'active':job.tasks.length&&job.tasks.every(t=>t.status==='done')?'done':'pending';
    return 'pending';
  }
  const nodeLabels={active:'agora',done:'feito',pending:'na sequência',waiting:'aguarda você',blocked:'pendente de executor',idle:'quando pedir'};
  function renderOrg(job){
    const wrap=$('#ops-org');if(!wrap)return;wrap.replaceChildren();
    const flow=flows[job.job_type]||flows.pedido;
    const root=el('div',{className:'org-root'},el('span',{className:'agent-monogram',textContent:'A'}),el('div',{},el('strong',{textContent:'ARI'}),el('small',{textContent:'coordena · '+(job.client_name||'sem cliente')})));
    const row=el('div',{className:'org-row'});
    for(const node of flow){
      const state=nodeState(job,node);const n=el('div',{className:'org-node'});n.dataset.state=state;
      const agents=node.agent==='*'?[...new Set(job.tasks.map(t=>t.agent))]:[node.agent];
      n.append(el('strong',{textContent:agents.join(' · ')||'…'}),el('span',{textContent:node.station}),el('small',{textContent:nodeLabels[state]}));
      if(node.phase==='tasks'&&job.tasks.length)n.append(el('em',{textContent:job.tasks.map(t=>`${t.agent}: ${t.status==='done'?'✓':t.status==='running'?'…':'·'}`).join('  ')}));
      row.append(n);
    }
    const cost=job.estimate?.calls?el('p',{className:'org-cost',textContent:`Chamadas: ${job.calls_made} feitas · estimadas ${job.estimate.calls} · teto ${job.ceiling||'sem teto'}`}):el('p',{className:'org-cost',textContent:`Chamadas feitas: ${job.calls_made}`});
    wrap.append(root,row,cost);
  }

  window.addEventListener('keydown',e=>{if((e.metaKey||e.ctrlKey)&&e.key.toLowerCase()==='k'){e.preventDefault();setTab('caps');renderCaps();$('#ops-caps-search').focus();}});
  return {renderTeam,showTeamCard,renderCaps,renderSummary,markSeen,renderOrg,refreshCaps:loadCaps};
}
