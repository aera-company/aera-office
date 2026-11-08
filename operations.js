// Real work is owned by the server. Closing this panel or orbiting never cancels a job.
export function initOperations({onOpen=()=>{},onClose=()=>{},onBusy=()=>{},onStage=()=>{},onStopFollowing=()=>{},onJob=()=>{},onTab=()=>{},onReplay=()=>{},selection=()=>({client_id:'',project_id:''})}={}) {
  const $=s=>document.querySelector(s);
  let connection={ready:false,verified:false},current=null,selectedId='',jobs=[],poll=null,following=true,lastStage='',lastRender='',listSignature='',deliverySignature='',stoppedJob='',sending=false;
  try{selectedId=localStorage.getItem('aera.selectedJob')||'';}catch{}
  const active=new Set(['queued','planning','running','reviewing','revision_queued','canceling','em_sessao']);
  const labels={queued:'Na fila',scheduled:'Agendado',planning:'ARI está planejando',needs_input:'Aguardando suas respostas',awaiting_estimate:'Estimativa para confirmar',running:'Especialistas em execução',reviewing:'ARI está revisando',awaiting_approval:'Entrega para sua revisão',approved:'Aprovado',revision_queued:'Ajuste na fila',failed:'Precisa de atenção',canceled:'Cancelado',canceling:'Encerrando a etapa',interrupted:'Execução interrompida',em_sessao:'Em sessão no Claude Code'};
  const cardLabels={aguardando:'Pronto para sua decisão',parcial:'Parcial · pendente',aprovado:'Aprovado',ajuste:'Ajuste em andamento',descartado:'Descartado',superado:'Superado'};
  const channelLabels={'instagram-feed':'Instagram feed · 4:5','instagram-stories':'Instagram stories · 9:16','linkedin-feed':'LinkedIn feed · 16:9'};
  async function api(path,{method='GET',body}={}) {
    let response;
    try{response=await fetch('/api/'+path,{method,headers:body?{'Content-Type':'application/json','X-Aera-Client':'1'}:undefined,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(path==='connect'?70000:12000)});}
    catch{throw new Error('O serviço local não respondeu. Inicie a versão atual com INICIAR_DEMO.command.');}
    let result;
    try{result=await response.json();}catch{throw new Error('O servidor aberto ainda é a versão estática. Reinicie pelo INICIAR_DEMO.command atualizado.');}
    if(!response.ok){const e=new Error(result.error||'Não foi possível concluir o pedido.');e.code=result.code;throw e;}
    return result;
  }
  function notice(text,error=false){$('#ops-notice').textContent=text;$('#ops-notice').classList.toggle('is-error',error);}
  function connectionUI(){
    $('#ops-connection-label').textContent=connection.fixture?'Transporte de teste':connection.ready?(connection.verified?'Claude conectado':'Claude configurado'):'Conectar Claude';
    $('#ops-send').disabled=sending||!connection.ready;
    const image=connection.image||{};
    $('#ops-credentials-state').textContent=(connection.ready?`${connection.provider} · ${connection.model}`:'Uma conexão de IA é necessária para executar pedidos.')+' · Imagem: '+(image.fixture?'transporte de teste':image.ready?`${image.provider} · ${image.model}`:'não conectada');
    $('#ops-image-state').textContent=image.fixture?'Transporte de teste: as imagens são arquivos marcados, sem gerador real.':image.ready?`${image.provider} conectado · modelo ${image.model}. Cada imagem é uma ação paga, contada na estimativa.`:(image.reason||'Executor de imagem não conectado.')+' Sem ele, as peças saem com prompt e ficam pendentes.';
    $('#ops-image-connect').hidden=!!image.ready||!!image.fixture;$('#ops-image-disconnect').hidden=!image.ready||!!image.fixture;
    $('#system-mode').textContent=connection.fixture?'TESTE SEM IA':connection.ready?(connection.verified?'IA CONECTADA':'IA CONFIGURADA'):'IA DESCONECTADA';
    $('#system-mode').dataset.live=String(!!connection.ready&&!connection.fixture);
    $('#ops-fixture').hidden=!connection.fixture;
    if(connection.ready&&$('#ops-notice').textContent==='Conecte a IA para transformar um pedido em entregas.')notice(connection.fixture?'Ambiente de teste: valide o fluxo sem chamadas de IA reais.':'Conexão disponível. Envie um pedido para iniciar.');
    $('#ops-disconnect').hidden=!connection.ready;
  }
  const tabs=['new','jobs','team','caps'];
  function setTab(tab){
    for(const t of tabs){$('#ops-'+(t==='team'?'team-panel':t)).hidden=t!==tab;$('#ops-tab-'+t).setAttribute('aria-selected',String(t===tab));}
    onTab(tab);
  }
  function stopPoll(){clearTimeout(poll);poll=null;}
  function startPoll(){stopPoll();poll=setTimeout(async()=>{await refresh(false);if(!document.hidden&&(selectedId||!$('#brief-panel').hidden))startPoll();},1100);}
  async function refresh(showError=true){
    try{
      connection=await api('status');connectionUI();
      jobs=(await api('jobs')).jobs;renderList();
      if(selectedId){
        try{current=await api('jobs/'+selectedId);renderCurrent();}
        catch(error){
          // In presentation mode another client's job answers 404: it simply leaves the screen.
          if(error.code!=='not_found')throw error;
          selectedId='';current=null;lastRender='';try{localStorage.removeItem('aera.selectedJob');}catch{}
          $('#ops-selected').hidden=true;$('#ops-empty-selection').hidden=false;renderList();
        }
      }
      onBusy(!!current&&active.has(current.status));
    }catch(error){if(showError)notice(error.message,true);}
  }
  function renderList(){
    const signature=JSON.stringify(jobs)+':'+selectedId;if(signature===listSignature)return;listSignature=signature;
    const container=$('#ops-job-list');container.replaceChildren();
    $('#ops-job-count').textContent=String(jobs.length);
    if(!jobs.length){const p=document.createElement('p');p.className='ops-muted';p.textContent='Os pedidos e entregas ficam guardados aqui, inclusive depois de fechar o navegador.';container.append(p);return;}
    for(const job of jobs){
      const button=document.createElement('button');button.className='ops-job-card';button.dataset.selected=String(job.id===selectedId);
      const title=document.createElement('strong'),status=document.createElement('span'),date=document.createElement('small');
      title.textContent=job.title;status.textContent=labels[job.status]||job.status;status.dataset.status=job.status;date.textContent=job.status==='scheduled'&&job.execute_at?'Executar em '+new Date(job.execute_at).toLocaleString('pt-BR'):new Date(job.created).toLocaleString('pt-BR');
      button.append(title,status,date);button.onclick=()=>selectJob(job.id);container.append(button);
    }
  }
  function stageFor(job){
    if(job.status==='planning')return {key:job.id+':plan:'+job.answers.length,agent:'ARI',zone:'control',partner:'MAYA',partnerZone:'think'};
    if(job.status==='em_sessao'&&job.phase?.startsWith('agent:')){
      // Claude Code session (bridge C43): the character named in the last recorded step is the one working.
      const agent=job.phase.slice(6),zones={ARI:'control',MAYA:'think',NOA:'create',JOHN:'create',LEO:'build',NINA:'grow'};
      if(zones[agent])return {key:job.id+':'+job.phase+':'+job.events.length,agent,zone:zones[agent],partner:agent==='ARI'?'NOA':'ARI',partnerZone:agent==='ARI'?'create':'control'};
    }
    if(job.phase){
      // Card jobs have no task rows: the phase says who is working, and the building follows it.
      if(job.phase==='pauta')return {key:job.id+':pauta',agent:'MAYA',zone:'think',partner:'NOA',partnerZone:'create'};
      if(job.phase.startsWith('post'))return {key:job.id+':'+job.phase+':'+(job.cards.find(c=>c.ordinal===Number(job.phase.split(':')[1]))?.version||1),agent:'NOA',zone:'create',partner:'ARI',partnerZone:'control'};
      if(job.phase==='review')return {key:job.id+':review',agent:'ARI',zone:'control',partner:'NOA',partnerZone:'create'};
    }
    const task=job.tasks.find(t=>t.status==='running');
    if(task){const next=job.tasks.find(t=>t.ordinal>task.ordinal)||{agent:'ARI',zone:'control'};return {key:job.id+':'+task.id+':'+task.started,agent:task.agent,zone:task.zone,partner:next.agent,partnerZone:next.zone};}
    if(job.status==='reviewing')return {key:job.id+':review:'+job.revision,agent:'ARI',zone:'control',partner:'NOA',partnerZone:'create'};
    return null;
  }
  // Image batches JOHN proposed for this job (C71): Tiago releases or declines each one here or in NAYRA.
  function renderBatches(){
    const box=$('#ops-batches'),list=current.batches||[];box.replaceChildren();box.hidden=!list.length;
    const states={proposto:'aguarda o seu ok',liberado:'liberado · a sessão gera',recusado:'recusado',gerado:'gerado'};
    for(const b of list){
      const div=document.createElement('div');div.className='ops-batch';div.dataset.state=b.state;
      const t=document.createElement('strong');t.textContent=`${b.agent} · lote de ${b.count} ${b.count===1?'imagem':'imagens'} · ${states[b.state]||b.state}`;
      const p=document.createElement('p');p.textContent=b.description.replace(/[.\s]*$/,'.')+(b.credits?` Estimativa: ${String(b.credits).replace('.',',')} créditos${b.model?' · '+b.model:''}.`:'')+(b.state==='gerado'&&b.files?.length?` Arquivos: ${b.files.length}.`:'');
      div.append(t,p);
      if(b.state==='proposto'){
        const actions=document.createElement('div');actions.className='ops-batch-actions';
        const ok=document.createElement('button');ok.type='button';ok.className='primary-batch';ok.textContent=`Liberar lote (${b.count} ${b.count===1?'imagem':'imagens'})`;
        const no=document.createElement('button');no.type='button';no.textContent='Recusar';
        const decide=async release=>{ok.disabled=no.disabled=true;try{await api(`jobs/${current.id}/batches/${b.id}/${release?'release':'decline'}`,{method:'POST',body:{}});current=await api(`jobs/${current.id}`);renderCurrent();}catch(e){ok.disabled=no.disabled=false;p.textContent=e.message;}};
        ok.onclick=()=>decide(true);no.onclick=()=>decide(false);actions.append(ok,no);div.append(actions);
      }
      box.append(div);
    }
  }
  function renderCurrent(){
    if(!current)return;
    const signature=current.updated+':'+current.status+':'+current.events.length+':'+(current.batches||[]).map(b=>b.state).join(',')+':'+current.tasks.map(t=>t.status).join(',')+':'+current.cards.map(c=>c.state+c.version+c.items.length+(c.review?1:0)).join(',');
    $('#ops-empty-selection').hidden=true;$('#ops-selected').hidden=false;
    $('#ops-selected-title').textContent=current.title;$('#ops-selected-status').textContent=labels[current.status]||current.status;$('#ops-selected-status').dataset.status=current.status;
    const session=current.job_type==='sessao';
    $('#ops-question-form').hidden=current.status!=='needs_input'||session;
    $('#ops-session-note').hidden=!session;
    $('#ops-session-note').textContent=current.status==='needs_input'?'Pergunta de uma sessão do Claude Code: '+(current.questions||[]).join(' ')+' Responda à NAYRA no Claude Code.':'Trabalho feito numa sessão do Claude Code. Aprove aqui; ajustes e respostas você pede à NAYRA no Claude Code.';
    renderBatches();
    $('#ops-replay').hidden=active.has(current.status)||!(current.cards.length||current.deliveries.length);
    $('#ops-estimate').hidden=!(current.status==='awaiting_estimate'&&current.estimate);
    if(current.status==='awaiting_estimate'&&current.estimate){const e=current.estimate;$('#ops-estimate-text').textContent=`${e.job}: cerca de ${e.calls} chamadas de texto (até ${e.max_output_tokens.toLocaleString('pt-BR')} tokens de saída) e ${e.images} imagens${e.images?' no executor de imagem':''}. Teto desta rodada: ${e.ceiling_calls} chamadas.`;}
    $('#ops-cancel').hidden=!['scheduled',...active,'needs_input','failed','interrupted'].includes(current.status);
    $('#ops-resume').hidden=!['failed','interrupted'].includes(current.status)||session;
    $('#ops-resume-help').hidden=!['failed','interrupted'].includes(current.status)||session;
    $('#ops-job-error').hidden=!current.error;$('#ops-job-error').textContent=current.error;
    const latest=current.deliveries.at(-1);
    $('#ops-delivery').hidden=!latest;
    $('#ops-cards-section').hidden=!current.cards.length&&!current.pauta?.length;
    if(signature!==lastRender&&(current.cards.length||current.pauta?.length)){
      const pauta=$('#ops-pauta');pauta.replaceChildren();
      for(const [i,post] of (current.pauta||[]).entries()){const li=document.createElement('li');li.innerHTML='';const b=document.createElement('strong'),s=document.createElement('span');b.textContent=`${i+1}. ${post.title}`;s.textContent=`${post.theme} · ${post.angle} · ${post.channel_focus}`;li.append(b,s);pauta.append(li);}
      $('#ops-pauta-wrap').hidden=!(current.pauta||[]).length;
      const cards=$('#ops-cards');cards.replaceChildren();
      const decidable=['awaiting_approval','approved'].includes(current.status);
      for(const card of current.cards){
        const article=document.createElement('article');article.className='ops-card';article.dataset.state=card.state;
        const head=document.createElement('div');head.className='ops-card-head';
        const title=document.createElement('h4'),state=document.createElement('span');title.textContent=`Post ${card.ordinal} · ${card.title}`;state.textContent=`${cardLabels[card.state]||card.state}${card.pending&&card.state==='parcial'?' · '+card.pending:''} · v${card.version} · ${card.owner_agent}`;state.className='ops-state';state.dataset.status=card.state==='aprovado'?'approved':card.state;
        head.append(title,state);article.append(head);
        if(card.brief?.key_message){const km=document.createElement('p');km.className='ops-card-brief';km.textContent=card.brief.key_message;article.append(km);}
        if(!card.pieces.length){const p=document.createElement('p');p.className='ops-muted';p.textContent=card.state==='ajuste'?'NOA está aplicando o ajuste pedido.':'NOA ainda não produziu este post.';state.textContent=(card.state==='ajuste'?'Ajuste em andamento':'Em produção')+' · v'+card.version+' · '+card.owner_agent;article.append(p);}
        const pieces=document.createElement('div');pieces.className='ops-pieces';
        for(const piece of card.pieces){
          const d=document.createElement('details'),s=document.createElement('summary'),body=document.createElement('div');d.className='ops-piece';
          const artifact=piece.artifact_id?current.artifacts.find(a=>a.id===piece.artifact_id):null;
          s.textContent=`${channelLabels[piece.channel]||piece.channel}`;const img=document.createElement('small');img.textContent=piece.image_state==='gerada'?(artifact?.state==='final'?'imagem final':'imagem · preview'):'imagem pendente';s.append(img);
          const h=document.createElement('strong'),t=document.createElement('p'),c=document.createElement('p'),v=document.createElement('p'),pr=document.createElement('p');
          h.textContent=piece.headline;t.textContent=piece.text;c.innerHTML='';c.textContent='Legenda / roteiro: '+piece.caption;v.textContent='Direção visual: '+piece.visual_direction;pr.textContent='Prompt de imagem: '+piece.image_prompt;c.className=v.className=pr.className='ops-piece-meta';
          if(artifact){const fig=document.createElement('figure');fig.className='ops-piece-image';const im=document.createElement('img');im.src=`/api/artifacts/${artifact.id}/file`;im.alt=`Imagem ${piece.channel} do post ${card.ordinal}, versão ${card.version}`;im.loading='lazy';const cap=document.createElement('figcaption');cap.textContent=artifact.state==='final'?'Arquivo final no disco':'PREVIEW · material de aprovação';fig.append(im,cap);body.append(fig);}
          body.append(h,t,c,v,pr);d.append(s,body);pieces.append(d);
        }
        article.append(pieces);
        if(card.review){const r=document.createElement('p');r.className='ops-card-review';r.textContent='ARI: '+card.review;article.append(r);}
        if(card.feedback.length){const f=document.createElement('p');f.className='ops-muted';f.textContent='Último ajuste pedido: '+card.feedback.at(-1).text;article.append(f);}
        if(decidable&&['parcial','aguardando'].includes(card.state)&&card.pieces.length){
          const actions=document.createElement('div');actions.className='ops-card-actions';
          const approve=document.createElement('button'),discard=document.createElement('button');approve.className='primary';approve.textContent='Aprovar post ✓';discard.textContent='Descartar';
          approve.onclick=()=>cardAction(card.id,'approve');discard.onclick=()=>{const reason=prompt('Motivo do descarte (opcional). Fica na memória do cliente.')??null;if(reason!==null)cardAction(card.id,'discard',{reason});};
          actions.append(approve,discard);article.append(actions);
        }
        if(decidable&&['parcial','aguardando','aprovado'].includes(card.state)&&card.pieces.length){
          const form=document.createElement('form');form.className='ops-card-revise';const ta=document.createElement('textarea'),btn=document.createElement('button');ta.rows=2;ta.maxLength=4000;ta.placeholder=`Ajuste para o post ${card.ordinal}. Volta a ${card.owner_agent}; os outros posts não mudam.`;ta.required=true;btn.type='submit';btn.textContent='Pedir ajuste ↗';
          form.onsubmit=e=>{e.preventDefault();cardAction(card.id,'revise',{text:ta.value.trim()});};form.append(ta,btn);article.append(form);
        }
        cards.append(article);
      }
      const pendingPieces=current.cards.filter(c=>!['descartado','superado'].includes(c.state)).flatMap(c=>c.pieces.filter(p=>p.image_state!=='gerada')).length;
      $('#ops-images-pending').hidden=!pendingPieces;
      if(pendingPieces){$('#ops-images-pending-text').textContent=`${pendingPieces} ${pendingPieces===1?'imagem pendente':'imagens pendentes'}.`+(connection.image?.ready?' Gerar agora conta na estimativa desta rodada.':' Conecte o executor de imagem para gerar.');$('#ops-images-generate').disabled=!connection.image?.ready||!['awaiting_approval','approved'].includes(current.status);}
    }
    if(latest){
      $('#ops-delivery-version').textContent=`Versão ${latest.revision} · ${latest.model}`;
      if($('#ops-delivery-text').textContent!==latest.text)$('#ops-delivery-text').textContent=latest.text;
      $('#ops-export').href='/api/jobs/'+current.id+'/export';
      $('#ops-approve').hidden=current.status!=='awaiting_approval';
      $('#ops-revise-form').hidden=!['awaiting_approval','approved'].includes(current.status)||session;
      $('#ops-approved-note').hidden=current.status!=='approved';
      $('#ops-delivery-awaiting').hidden=current.status==='approved';
      const versions=$('#ops-versions');const ds=current.id+JSON.stringify(current.deliveries);
      if(ds!==deliverySignature){deliverySignature=ds;versions.replaceChildren();
      for(const delivery of current.deliveries){const d=document.createElement('details'),s=document.createElement('summary'),p=document.createElement('pre');s.textContent=`Versão ${delivery.revision}${delivery.status==='approved'?' · aprovada':''}`;p.textContent=delivery.text;d.append(s,p);versions.append(d);}}
    }
    if(signature!==lastRender){
      $('#ops-plan-summary').textContent=current.plan?.summary||'';$('#ops-plan-summary').hidden=!current.plan;
      const questions=$('#ops-questions');questions.replaceChildren();for(const text of current.questions||[]){const li=document.createElement('li');li.textContent=text;questions.append(li);}
      const tasks=$('#ops-tasks');tasks.replaceChildren();
      if(['planning','needs_input'].includes(current.status)){const p=document.createElement('p');p.className='ops-muted';p.textContent=current.status==='planning'?'ARI está lendo seu pedido. A lista de tarefas aparece quando o plano for recebido.':'ARI precisa destas informações antes de encaminhar o trabalho.';tasks.append(p);}
      for(const task of current.tasks){
        const detail=document.createElement('details'),summary=document.createElement('summary'),agent=document.createElement('span'),state=document.createElement('small'),instruction=document.createElement('p'),output=document.createElement('pre');
        detail.className='ops-task';detail.dataset.status=task.status;agent.textContent=task.agent;state.textContent={pending:'Na sequência',running:'Em execução',done:'Contribuição recebida',failed:'Etapa interrompida'}[task.status]||task.status;instruction.textContent=task.instruction;output.textContent=task.output;
        summary.append(agent,state);detail.append(summary,instruction);if(task.output)detail.append(output);tasks.append(detail);
      }
      const timeline=$('#ops-events');timeline.replaceChildren();
      for(const event of current.events.slice(-30).reverse()){const li=document.createElement('li'),label=document.createElement('span'),message=document.createElement('p');label.textContent=new Date(event.created).toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'})+(event.data.agent?' · '+event.data.agent:'');message.textContent=event.data.message||(event.kind==='model_response'?`Resposta recebida de ${event.data.model} · ${event.data.usage?.input_tokens||0} tokens de entrada / ${event.data.usage?.output_tokens||0} de saída`:event.kind);li.append(label,message);timeline.append(li);}
      lastRender=signature;
      onJob(current);
    }
    const stage=stageFor(current);
    if(following&&stage&&stage.key!==lastStage){lastStage=stage.key;onStage(stage);}
    if(!active.has(current.status)){const key=current.id+':'+current.status+':'+current.revision;if(stoppedJob!==key){stoppedJob=key;onStopFollowing();}if(current.status==='awaiting_approval')$('#open-brief').textContent='Entrega para revisar';else if(current.status==='needs_input')$('#open-brief').textContent=current.job_type==='sessao'?'Pergunta para você':'ARI precisa de você';else if(['failed','interrupted'].includes(current.status))$('#open-brief').textContent='Operação: atenção';else if(current.status==='scheduled')$('#open-brief').textContent='Trabalho agendado';else $('#open-brief').textContent='Operação';}else stoppedJob='';
  }
  async function selectJob(id){
    if(selectedId!==id){$('#ops-answer').value='';$('#ops-revision').value='';}selectedId=id;lastRender='';lastStage='';try{localStorage.setItem('aera.selectedJob',id);}catch{}
    setTab('jobs');await refresh();startPoll();
  }
  async function cardAction(cardId,name,body={}){
    if(!current)return;
    for(const b of document.querySelectorAll('#ops-cards button'))b.disabled=true;
    try{current=await api(`jobs/${current.id}/cards/${cardId}/${name}`,{method:'POST',body});notice(name==='approve'?'Post aprovado. Arquivos gravados na pasta do projeto; imagem segue pendente até conectar o executor.':name==='discard'?'Post descartado e registrado na memória do cliente.':'Ajuste encaminhado à estação responsável. Os outros posts não mudam.');lastRender='';await refresh();startPoll();}
    catch(error){notice(error.message,true);}finally{for(const b of document.querySelectorAll('#ops-cards button'))b.disabled=false;}
  }
  async function action(name,body={}){
    if(!current)return;
    for(const b of document.querySelectorAll('#ops-selected button'))b.disabled=true;
    try{current=await api('jobs/'+current.id+'/'+name,{method:'POST',body});if(name==='answer')$('#ops-answer').value='';if(name==='revise')$('#ops-revision').value='';notice(name==='approve'?'Entrega aprovada e registrada neste escritório.':name==='cancel'?'Cancelamento solicitado.':'Pedido atualizado.');lastRender='';await refresh();startPoll();}
    catch(error){notice(error.message,true);}finally{for(const b of document.querySelectorAll('#ops-selected button'))b.disabled=false;}
  }
  async function open(){onOpen();$('#brief-panel').hidden=false;$('#open-brief').setAttribute('aria-expanded','true');await refresh();startPoll();}
  function close(){$('#brief-panel').hidden=true;$('#open-brief').setAttribute('aria-expanded','false');onClose();}
  $('#ops-close').onclick=close;for(const t of tabs)$('#ops-tab-'+t).onclick=()=>setTab(t);
  $('#ops-follow').onchange=()=>{following=$('#ops-follow').checked;lastStage='';if(following&&current)renderCurrent();else onStopFollowing();};
  $('#ops-example').onclick=()=>{$('#ops-brief').value='Crie um roteiro de vídeo de 30 segundos e três posts para apresentar o AERA AI OFFICE a empresas B2B. Público: diretores de marketing. Objetivo: convidar para uma demonstração. Fatos: escritório 3D com coordenação de pedidos e revisão de entregas. Tom: claro e sofisticado. Não prometa resultados financeiros.';$('#ops-brief').focus();};
  let submissionKey='';
  $('#ops-form').onsubmit=async e=>{
    e.preventDefault();if(sending||!connection.ready)return;
    const brief=$('#ops-brief').value.trim();if(!brief)return;
    sending=true;connectionUI();notice('Guardando seu pedido e encaminhando para ARI…');
    submissionKey=submissionKey||crypto.randomUUID();
    try{
      const schedule=$('#ops-schedule').value;
      const job=await api('jobs',{method:'POST',body:{brief,context:$('#ops-context').value.trim(),idempotency_key:submissionKey,execute_at:schedule?new Date(schedule).toISOString():null,job_type:$('#ops-job-type').value,...selection()}});
      submissionKey='';following=true;$('#ops-follow').checked=true;onBusy(true);await selectJob(job.id);notice(job.status==='scheduled'?'Pedido agendado. Mantenha o serviço local em execução.':'Pedido recebido. A operação continua mesmo ao fechar este painel.');
    }catch(error){notice(error.message,true);}finally{sending=false;connectionUI();}
  };
  $('#ops-brief').addEventListener('input',()=>{submissionKey='';});$('#ops-context').addEventListener('input',()=>{submissionKey='';});$('#ops-schedule').addEventListener('input',()=>{submissionKey='';});
  $('#ops-job-type').addEventListener('change',()=>{submissionKey='';$('#ops-job-help').textContent=$('#ops-job-type').value==='conteudo-semana'?'Três posts, cada um em Instagram feed, stories e LinkedIn. ARI mostra a estimativa antes de rodar; você aprova post a post.':'ARI monta de 1 a 4 tarefas e reúne uma entrega em texto para sua revisão.';});
  $('#ops-question-form').onsubmit=e=>{e.preventDefault();action('answer',{text:$('#ops-answer').value.trim()});};
  $('#ops-revise-form').onsubmit=e=>{e.preventDefault();action('revise',{text:$('#ops-revision').value.trim()});};
  $('#ops-approve').onclick=()=>action('approve');$('#ops-resume').onclick=()=>action('resume');$('#ops-cancel').onclick=()=>action('cancel');
  $('#ops-estimate-confirm').onclick=()=>action('confirm-estimate');
  $('#ops-replay').onclick=()=>{if(current)onReplay(current);};
  $('#ops-images-generate').onclick=async()=>{
    if(!current)return;$('#ops-images-generate').disabled=true;notice('Gerando as imagens pendentes…');
    try{const result=await api(`jobs/${current.id}/images`,{method:'POST',body:{}});notice(`${result.generated} ${result.generated===1?'imagem gerada':'imagens geradas'}${result.failed?`, ${result.failed} ${result.failed===1?'continua pendente':'continuam pendentes'}`:''}.`);lastRender='';await refresh();startPoll();}
    catch(error){notice(error.message,true);}finally{$('#ops-images-generate').disabled=false;}
  };
  $('#ops-image-connect').onclick=async()=>{
    $('#ops-image-connect').disabled=true;$('#ops-connect-notice').textContent='Preparando o login do Magnific…';
    try{const result=await api('image/connect',{method:'POST',body:{}});window.open(result.login_url,'_blank','noopener');$('#ops-connect-notice').textContent='Autorize na aba que abriu. O token volta ao servidor local; esta tela atualiza sozinha.';}
    catch(error){$('#ops-connect-notice').textContent=error.message;}finally{$('#ops-image-connect').disabled=false;}
  };
  $('#ops-image-disconnect').onclick=async()=>{try{await api('image/disconnect',{method:'POST',body:{}});await refresh(false);$('#ops-connect-notice').textContent='Executor de imagem desconectado.';}catch(error){$('#ops-connect-notice').textContent=error.message;}};
  const dialog=$('#connection-dialog');
  function sourceUI(){$('#ops-key-row').hidden=false;$('#ops-source-help').textContent='A chave fica no servidor local e, se disponível, no Chaves do macOS. Ela não é salva no navegador.';}
  $('#ops-source').onchange=sourceUI;
  // C79: NAYRA's voice key (ElevenLabs). Typed here, kept in the Keychain by the server, never sent back.
  function voiceUI(v){$('#ops-voice-state').textContent=v.ready?'Chave de voz salva. Cada conversa da NAYRA abre com uma senha temporária.':'Sem chave de voz. A NAYRA abre a conversa pelo ID público do agente; com a autenticação ligada no ElevenLabs, ela só conecta depois de salvar a chave.';$('#ops-voice-remove').hidden=!v.ready;}
  async function refreshVoice(){try{voiceUI(await api('nayra/voice-status'));}catch(error){$('#ops-voice-state').textContent=error.message;}}
  $('#ops-voice-save').onclick=async()=>{
    const key=$('#ops-voice-key').value;$('#ops-voice-key').value='';$('#ops-voice-save').disabled=true;$('#ops-connect-notice').textContent='Verificando a chave no ElevenLabs…';
    try{const v=await api('nayra/voice-key',{method:'POST',body:{key}});voiceUI(v);$('#ops-connect-notice').textContent=v.warning||'Chave de voz salva. Agora você pode ligar a autenticação do agente no ElevenLabs.';}
    catch(error){$('#ops-connect-notice').textContent=error.message;}finally{$('#ops-voice-save').disabled=false;}
  };
  $('#ops-voice-remove').onclick=async()=>{try{voiceUI(await api('nayra/voice-key-remove',{method:'POST',body:{}}));$('#ops-connect-notice').textContent='Chave de voz removida deste escritório.';}catch(error){$('#ops-connect-notice').textContent=error.message;}};
  $('#ops-connect-open').onclick=()=>{sourceUI();refreshVoice();$('#ops-connect-notice').textContent='';dialog.showModal();};$('#ops-connect-close').onclick=()=>dialog.close();dialog.addEventListener('close',()=>{$('#ops-key').value='';$('#ops-voice-key').value='';});
  $('#ops-connect-form').onsubmit=async e=>{
    e.preventDefault();const key=$('#ops-key').value;$('#ops-key').value='';$('#ops-connect-submit').disabled=true;$('#ops-connect-notice').textContent='Verificando acesso ao modelo…';
    try{connection=await api('connect',{method:'POST',body:{source:$('#ops-source').value,key}});connectionUI();$('#ops-connect-notice').textContent=connection.warning||'Conexão verificada. Você já pode enviar um pedido real.';await refresh(false);}
    catch(error){$('#ops-connect-notice').textContent=error.message;}finally{$('#ops-connect-submit').disabled=false;}
  };
  $('#ops-disconnect').onclick=async()=>{try{connection=await api('disconnect',{method:'POST',body:{}});connectionUI();$('#ops-connect-notice').textContent='Desconectado deste escritório.';}catch(error){$('#ops-connect-notice').textContent=error.message;}};
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stopPoll();else if(selectedId||!$('#brief-panel').hidden){refresh(false);startPoll();}});
  if(selectedId)setTab('jobs');refresh(false);if(selectedId)startPoll();
  return {open,close,api,notice,setTab,selectJob,refresh,isOpen:()=>!$('#brief-panel').hidden,isWorking:()=>!!current&&active.has(current.status),
    setFollowing(value){following=value;$('#ops-follow').checked=value;if(!value)onStopFollowing();else{lastStage='';if(current)renderCurrent();}},get current(){return current;}};
}
