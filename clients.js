// Client and project context. The server owns the records; this panel only shows and confirms them.
export function initClients({api,notice=()=>{}}) {
  const $=s=>document.querySelector(s);
  let clients=[],current=null,selection={client_id:'',project_id:''},connection={ready:false};
  try{selection=JSON.parse(localStorage.getItem('aera.selection')||'{}');}catch{}
  selection={client_id:selection.client_id||'',project_id:selection.project_id||''};
  const kinds={fato:'Fato',preferencia:'Preferência',decisao:'Decisão',nota:'Nota'};
  const states={proposto:'Proposto · aguarda você',confirmado:'Confirmado',superado:'Superado',descartado:'Descartado',relato:'Relato'};
  function remember(){try{localStorage.setItem('aera.selection',JSON.stringify(selection));}catch{}}
  function el(tag,props={},...children){const node=document.createElement(tag);Object.assign(node,props);node.append(...children);return node;}
  async function load(){
    try{clients=(await api('clients')).clients;}catch{clients=[];}
    const select=$('#ops-client-select');select.replaceChildren(el('option',{value:'',textContent:'Sem cliente · pedido solto'}));
    for(const c of clients)select.append(el('option',{value:c.id,textContent:c.name}));
    if(selection.client_id&&!clients.some(c=>c.id===selection.client_id))selection={client_id:'',project_id:''};
    select.value=selection.client_id;await loadCurrent();
  }
  async function loadCurrent(){
    current=selection.client_id?await api('clients/'+selection.client_id).catch(()=>null):null;
    const projects=$('#ops-project-select');projects.replaceChildren(el('option',{value:'',textContent:'Todo o cliente'}));
    projects.disabled=!current;$('#ops-project-new').hidden=!current;$('#ops-known').hidden=!current;
    if(!current){selection.project_id='';remember();return;}
    for(const p of current.projects)projects.append(el('option',{value:p.id,textContent:p.name}));
    if(!current.projects.some(p=>p.id===selection.project_id))selection.project_id='';
    projects.value=selection.project_id;remember();renderKnown();
  }
  function renderKnown(){
    const facts=current.notes.filter(n=>n.level===1&&n.state==='confirmado'),proposed=current.notes.filter(n=>n.state==='proposto');
    const read=current.materials.filter(m=>m.state==='lido').length,unread=current.materials.length-read;
    $('#ops-known-count').textContent=`${facts.length} fato${facts.length===1?'':'s'} · ${read} material${read===1?'':'is'} lido${read===1?'':'s'}${unread?` · ${unread} não lido${unread===1?'':'s'}`:''}${proposed.length?` · ${proposed.length} a confirmar`:''}`;
    const body=$('#ops-known-body');body.replaceChildren();
    if(current.summary)body.append(el('p',{className:'ops-known-summary',textContent:current.summary}));
    if(!facts.length)body.append(el('p',{className:'ops-muted',textContent:proposed.length?'ARI propôs fatos que aguardam sua confirmação. Abra o cadastro para revisar.':'Nenhum fato confirmado ainda. ARI parte do que você contar e do que o cadastro tiver.'}));
    for(const n of facts)body.append(el('p',{className:'ops-known-fact'},el('span',{textContent:kinds[n.kind]||n.kind}),document.createTextNode(n.text)));
  }
  // ---- Cadastro (dialog) ----
  const dialog=$('#client-dialog');let editing=null,busy=false;
  function dnotice(text,error=false){$('#client-notice').textContent=text;$('#client-notice').classList.toggle('is-error',error);}
  function setBusy(value){busy=value;for(const b of dialog.querySelectorAll('button,input,textarea,select'))if(b.id!=='client-close')b.disabled=value;}
  async function openDialog(id=''){
    editing=id?await api('clients/'+id).catch(()=>null):null;
    try{connection=await api('status');}catch{connection={ready:false};}
    $('#client-name').value=editing?.name||'';$('#client-site').value=editing?.site_url||'';$('#client-hint').value='';
    $('#client-create-form').hidden=!!editing;$('#client-existing').hidden=!editing;$('#client-title').textContent=editing?editing.name:'Cadastrar cliente';
    dnotice(editing?'':'ARI lê o site e propõe os fatos. Nada vira memória sem a sua confirmação.');
    renderEditing();dialog.showModal();
  }
  function renderEditing(){
    if(!editing)return;
    const mats=$('#client-materials');mats.replaceChildren();
    if(!editing.materials.length)mats.append(el('p',{className:'ops-muted',textContent:'Nenhum material ainda.'}));
    for(const m of editing.materials){
      const row=el('div',{className:'client-material'});row.dataset.state=m.state;
      row.append(el('strong',{textContent:m.name}),el('span',{textContent:m.state==='lido'?`Lido · ${m.extracted_chars||m.content?.length||0} caracteres${m.reason?' · '+m.reason:''}`:`Não lido · ${m.reason}`}),el('small',{textContent:(m.kind==='link'?m.origin:m.origin)+' · '+new Date(m.created).toLocaleString('pt-BR')}));
      mats.append(row);
    }
    const notes=$('#client-notes');notes.replaceChildren();
    const visible=editing.notes.filter(n=>n.state!=='descartado');
    if(!visible.length)notes.append(el('p',{className:'ops-muted',textContent:editing.materials.some(m=>m.state==='lido')?'Peça a proposta a ARI ou adicione um fato você mesmo.':'Adicione um material legível ou escreva o que sabe para ARI propor o cadastro.'}));
    for(const n of visible){
      const row=el('div',{className:'client-note'});row.dataset.state=n.state;
      const head=el('div',{className:'client-note-head'},el('span',{textContent:(kinds[n.kind]||n.kind)+(n.level===2?' · passagem':'')}),el('small',{textContent:states[n.state]||n.state}));
      row.append(head,el('p',{textContent:n.text}),el('small',{className:'client-note-source',textContent:n.source}));
      if(n.state==='proposto'){
        const actions=el('div',{className:'client-note-actions'});
        actions.append(el('button',{type:'button',textContent:'Confirmar ✓',onclick:()=>noteAction(n.id,'confirm')}),el('button',{type:'button',textContent:'Descartar',onclick:()=>noteAction(n.id,'reject')}));
        row.append(actions);
      }else if(n.state==='confirmado'){
        const actions=el('div',{className:'client-note-actions'});
        actions.append(el('button',{type:'button',textContent:'Corrigir',onclick:()=>correct(n)}));row.append(actions);
      }
      notes.append(row);
    }
    const projects=$('#client-projects');projects.replaceChildren();
    for(const p of editing.projects)projects.append(el('li',{textContent:p.name}));
    if(!editing.projects.length)projects.append(el('li',{className:'ops-muted',textContent:'Nenhum projeto. O pedido pode usar o cliente inteiro.'}));
    $('#client-propose').disabled=!connection.ready;
    $('#client-propose-help').textContent=connection.ready?(connection.fixture?'Transporte de teste: a proposta é um exercício sem IA real.':'Uma chamada à IA, só para propor. Nada é confirmado sem você.'):'Conecte o Claude para ARI propor os fatos. Você pode adicionar fatos manualmente enquanto isso.';
  }
  async function refreshEditing(){editing=await api('clients/'+editing.id);renderEditing();if(editing.id===selection.client_id){current=editing;renderKnown();}await load();$('#ops-client-select').value=selection.client_id;}
  async function noteAction(noteId,action){
    setBusy(true);
    try{await api(`clients/${editing.id}/notes/${noteId}/${action}`,{method:'POST',body:{}});await refreshEditing();dnotice(action==='confirm'?'Fato confirmado. ARI passa a usá-lo neste cliente.':'Proposta descartada. Fica registrada como descartada.');}
    catch(error){dnotice(error.message,true);}finally{setBusy(false);}
  }
  async function correct(note){
    const text=prompt('Correção para este fato. O anterior fica registrado como superado.',note.text);
    if(!text||!text.trim()||text.trim()===note.text)return;
    setBusy(true);
    try{await api(`clients/${editing.id}/notes/${note.id}/supersede`,{method:'POST',body:{text:text.trim()}});await refreshEditing();dnotice('Fato corrigido. A versão anterior ficou como superada.');}
    catch(error){dnotice(error.message,true);}finally{setBusy(false);}
  }
  $('#client-create-form').onsubmit=async e=>{
    e.preventDefault();if(busy)return;const name=$('#client-name').value.trim(),site_url=$('#client-site').value.trim();if(!name)return;
    setBusy(true);dnotice(site_url?'Criando o cliente e lendo o site…':'Criando o cliente…');
    try{editing=await api('clients',{method:'POST',body:{name,site_url}});selection={client_id:editing.id,project_id:''};remember();await load();
      $('#client-create-form').hidden=true;$('#client-existing').hidden=false;$('#client-title').textContent=editing.name;renderEditing();
      const site=editing.materials[0];dnotice(site?(site.state==='lido'?'Site lido pelo servidor. Peça a proposta a ARI ou adicione fatos.':'O site não pôde ser lido: '+site.reason):'Cliente criado. Adicione materiais ou fatos.');}
    catch(error){dnotice(error.message,true);}finally{setBusy(false);}
  };
  $('#client-propose').onclick=async()=>{
    if(busy||!editing)return;setBusy(true);dnotice('ARI está lendo o material e propondo os fatos…');
    try{const result=await api(`clients/${editing.id}/propose`,{method:'POST',body:{hint:$('#client-hint').value.trim()}});await refreshEditing();dnotice(`${result.notes.length} fatos propostos por ${result.model}. Confirme ou descarte um a um.`);}
    catch(error){dnotice(error.message,true);}finally{setBusy(false);}
  };
  $('#client-fact-form').onsubmit=async e=>{
    e.preventDefault();if(busy||!editing)return;const text=$('#client-fact').value.trim();if(!text)return;setBusy(true);
    try{await api(`clients/${editing.id}/notes`,{method:'POST',body:{text,kind:$('#client-fact-kind').value,level:1}});$('#client-fact').value='';await refreshEditing();dnotice('Fato registrado como confirmado, com origem "Tiago, no painel".');}
    catch(error){dnotice(error.message,true);}finally{setBusy(false);}
  };
  $('#client-material-form').onsubmit=async e=>{
    e.preventDefault();if(busy||!editing)return;const kind=$('#client-material-kind').value,value=$('#client-material-value').value.trim();if(!value)return;setBusy(true);dnotice(kind==='link'?'Lendo o link…':'Guardando o texto…');
    try{const m=await api(`clients/${editing.id}/materials`,{method:'POST',body:kind==='link'?{kind,url:value,name:$('#client-material-name').value.trim()}:{kind:'texto',content:value,name:$('#client-material-name').value.trim()}});$('#client-material-value').value='';$('#client-material-name').value='';await refreshEditing();dnotice(m.state==='lido'?'Material lido e vinculado ao cliente.':'Material registrado como não lido: '+m.reason);}
    catch(error){dnotice(error.message,true);}finally{setBusy(false);}
  };
  $('#client-project-form').onsubmit=async e=>{
    e.preventDefault();if(busy||!editing)return;const name=$('#client-project-name').value.trim();if(!name)return;setBusy(true);
    try{const p=await api(`clients/${editing.id}/projects`,{method:'POST',body:{name}});$('#client-project-name').value='';selection.project_id=p.id;await refreshEditing();$('#ops-project-select').value=p.id;dnotice('Projeto criado e selecionado.');}
    catch(error){dnotice(error.message,true);}finally{setBusy(false);}
  };
  $('#client-close').onclick=()=>dialog.close();
  $('#ops-client-new').onclick=()=>openDialog();$('#ops-client-open').onclick=()=>openDialog(selection.client_id);$('#ops-project-new').onclick=()=>openDialog(selection.client_id);
  $('#ops-client-select').onchange=async()=>{selection={client_id:$('#ops-client-select').value,project_id:''};remember();await loadCurrent();notice(selection.client_id?'ARI vai usar o contexto confirmado deste cliente.':'Pedido sem cliente: só o que você escrever entra na chamada.');};
  $('#ops-project-select').onchange=()=>{selection.project_id=$('#ops-project-select').value;remember();};
  load();
  return {selection:()=>({...selection}),reload:load,client:()=>current};
}
