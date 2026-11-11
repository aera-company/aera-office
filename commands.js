// Spoken office commands, recognised in the user's own words. Pure: no browser or rendering dependency.
const norm=t=>String(t||'').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g,'').replace(/[^a-z0-9 ]/g,' ').replace(/\s+/g,' ').trim();

// "apaga as luzes do office" -> 'off'; "acende a luz" -> 'on'; anything else, or a negated request -> null.
// With the lights already off, "pode acender de novo" is enough: the follow-up does not have to name them again.
export function lightsCommand(text,{lightsOff=false}={}){
  const t=norm(text);
  if(lightsOff&&!/\bnao\b.{0,14}\b(acend|lig)/.test(t)&&(/\b(re)?acend\w*\b/.test(t)||/\b(re)?lig\w*\b.{0,12}\b(de novo|de volta|novamente)\b/.test(t)))return 'on';
  if(!/\b(luz|luzes|iluminacao)\b/.test(t))return null;
  if(/\bnao\b.{0,14}\b(apag|deslig|acend|lig)/.test(t))return null;
  if(/\b(apag\w*|deslig\w*)\b.{0,40}\b(luz|luzes|iluminacao)\b/.test(t))return 'off';
  if(/\b(acend\w*|lig\w*|religa\w*)\b.{0,40}\b(luz|luzes|iluminacao)\b/.test(t))return 'on';
  return null;
}

// Which agents a sentence names, in the order of the team. Used to know whose face NAYRA is presenting.
const AGENTS=[['ARI',/\bari\b/],['MAYA',/\bmaya\b/],['NOA',/\bnoa\b/],['JOHN',/\b(john|jon)\b/],['LEO',/\bleo\b/],['NINA',/\bnina\b/]];
export function agentsMentioned(text){const t=norm(text);return AGENTS.filter(([,word])=>word.test(t)).map(([name])=>name);}

// Where each agent is named in a sentence, as a fraction of its length (0 at the start, 1 at the end), in speaking order.
// NAYRA's whole reply arrives at once; this lets the office follow her as she goes from one agent to the next.
export function agentMentions(text){
  const t=norm(text),out=[];
  for(const [name,word] of AGENTS){const m=t.match(word);if(m)out.push({name,at:t.length?m.index/t.length:0});}
  return out.sort((a,b)=>a.at-b.at);
}
// "Entra na sala da MAYA", "me leva para dentro": the room to enter, 'current' for the one on screen, or null.
const ROOMS=[['think',/\b(think|maya|estrategia)\b/],['create',/\b(create|noa|john|jon|criacao)\b/],['build',/\b(build|leo|tecnologia)\b/],['grow',/\b(grow|nina|negocios)\b/],['control',/\b(comando|control|ari)\b/]];
export function enterCommand(text){
  const t=norm(text);
  if(/\bnao\b.{0,12}\b(entr|lev|mostr)/.test(t))return null;
  if(!/\b(entra|entrar|entre|entrando|me leva|me levar|leva a gente|vamos entrar|mostra por dentro|mostrar por dentro|ver por dentro)\b/.test(t))return null;
  const room=ROOMS.find(([,word])=>word.test(t));
  if(room)return room[0];
  return /\b(sala|ambiente|dentro)\b/.test(t)?'current':null;
}
// "Sai da sala", "volta para fora": back to the outside view.
export function leaveCommand(text){
  const t=norm(text);
  return /\b(sai|sair|saia|volta|voltar|volte)\b.{0,24}\b(sala|fora|predio|edificio|visao geral|lado de fora)\b/.test(t);
}
