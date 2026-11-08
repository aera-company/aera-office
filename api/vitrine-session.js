// Public site voice (C88): one click opens a conversation; each one gets a short-lived ElevenLabs token for the presentation agent.
// Secrets live only in the Vercel project: ELEVENLABS_API_KEY and NAYRA_AGENT_ID. The real spending ceiling is the daily limit set on the agent.
import context from './_site-context.js';

const WINDOW_MS=10*60*1000,MAX_TOKENS=4;
const hits=new Map();

// Best effort per function instance: it slows repeated openings, it is not a global counter.
function count(key,now){
  const list=(hits.get(key)||[]).filter(t=>now-t<WINDOW_MS);
  hits.set(key,list);
  return list;
}
export function resetLimits(){hits.clear();}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Método não permitido.'});
  let origin='';
  try{origin=new URL(req.headers.origin||'').host;}catch{}
  if(!origin||origin!==req.headers.host)return res.status(403).json({error:'Origem não autorizada.'});
  const {ELEVENLABS_API_KEY:key,NAYRA_AGENT_ID:agent}=process.env;
  if(!key||!agent)return res.status(503).json({error:'A conversa ainda não foi ligada neste site.'});
  const ip=String(req.headers['x-forwarded-for']||req.headers['x-real-ip']||'desconhecido').split(',')[0].trim();
  const now=Date.now(),opened=count('open:'+ip,now);
  if(opened.length>=MAX_TOKENS)return res.status(429).json({error:'Muitas conversas seguidas. Tente de novo em alguns minutos.'});
  let token='';
  try{
    const response=await fetch('https://api.elevenlabs.io/v1/convai/conversation/token?'+new URLSearchParams({agent_id:agent}),{headers:{'xi-api-key':key},signal:AbortSignal.timeout(12000)});
    if(!response.ok){
      // ElevenLabs says why it refused (for example, which permission is missing); only that reason is logged, never the key.
      let detail={};try{detail=(await response.json()).detail||{};}catch{}
      const reason=typeof detail==='string'?detail:[detail.status,detail.code,detail.message].filter(Boolean).join(' | ');
      console.error('NAYRA site: ElevenLabs respondeu',response.status,String(reason).slice(0,240));
      return res.status(502).json({error:'Não foi possível abrir a conversa agora.'});
    }
    token=(await response.json()).token||'';
  }catch{
    return res.status(502).json({error:'Não foi possível abrir a conversa agora.'});
  }
  if(!token)return res.status(502).json({error:'Não foi possível abrir a conversa agora.'});
  opened.push(now);
  return res.status(200).json({token,context});
}
