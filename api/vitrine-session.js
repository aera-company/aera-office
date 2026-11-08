// Public site voice (C87): a visitor with the access code gets one short-lived ElevenLabs token for the presentation agent.
// Secrets live only in the Vercel project: ELEVENLABS_API_KEY, NAYRA_ACCESS_CODE and NAYRA_AGENT_ID.
import {createHash,timingSafeEqual} from 'node:crypto';
import context from './_site-context.js';

const WINDOW_MS=10*60*1000,MAX_WRONG=8,MAX_TOKENS=12;
const hits=new Map();
const digest=value=>createHash('sha256').update(String(value)).digest();

// Best effort per function instance: it slows guessing and repeated openings, it is not a global counter.
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
  const {ELEVENLABS_API_KEY:key,NAYRA_ACCESS_CODE:access,NAYRA_AGENT_ID:agent}=process.env;
  if(!key||!access||!agent)return res.status(503).json({error:'A conversa ainda não foi ligada neste site.'});
  const ip=String(req.headers['x-forwarded-for']||req.headers['x-real-ip']||'desconhecido').split(',')[0].trim();
  const now=Date.now(),wrong=count('wrong:'+ip,now),opened=count('open:'+ip,now);
  if(wrong.length>=MAX_WRONG||opened.length>=MAX_TOKENS)return res.status(429).json({error:'Muitas tentativas. Tente de novo em alguns minutos.'});
  const code=typeof req.body?.code==='string'?req.body.code.trim():'';
  if(!code||code.length>80||!timingSafeEqual(digest(code),digest(access))){
    wrong.push(now);
    return res.status(401).json({error:'Código incorreto.'});
  }
  let token='';
  try{
    const response=await fetch('https://api.elevenlabs.io/v1/convai/conversation/token?'+new URLSearchParams({agent_id:agent}),{headers:{'xi-api-key':key},signal:AbortSignal.timeout(12000)});
    if(!response.ok){console.error('NAYRA site: ElevenLabs respondeu',response.status);return res.status(502).json({error:'Não foi possível abrir a conversa agora.'});}
    token=(await response.json()).token||'';
  }catch{
    return res.status(502).json({error:'Não foi possível abrir a conversa agora.'});
  }
  if(!token)return res.status(502).json({error:'Não foi possível abrir a conversa agora.'});
  opened.push(now);
  return res.status(200).json({token,context});
}
