// Public site voice (C88): one click opens a conversation; each one gets a short-lived ElevenLabs token.
// C89: with a valid login session the token is for the full agent (NAYRA · Tiago), whose knowledge base holds the project dossiers.
// Secrets live only in the Vercel project: ELEVENLABS_API_KEY, NAYRA_AGENT_ID and NAYRA_AGENT_ID_TIAGO.
import context from './_site-context.js';
import {sameOrigin,clientIp,count,loggedIn,resetLimits} from './_session.js';

export {resetLimits};
const WINDOW_MS=10*60*1000,MAX_TOKENS=4,MAX_TOKENS_LOGGED=12;

// No project content here: this repository is public. The projects live in the agent's knowledge base.
const FULL_CONTEXT={client:'AERA',facts:0,jobs:[],text:['DEMONSTRAÇÃO NO SITE DA AERA, COM LOGIN DO TIAGO.',
  'Quem fala, por padrão, é o próprio Tiago: chame-o de Chefe, nunca de Tiago. Se a pessoa disser que é um cliente ou convidado dele, trate-a pelo nome que ela disser.',
  'Os projetos e trabalhos da AERA estão na sua base de conhecimento, nos dossiês. Responda a partir deles e diga quando algo não está registrado.',
  'Os valores comerciais não ficam na base. Se perguntarem preço, diga que isso fica com o Tiago.',
  'Neste site você não vê o escritório ao vivo nem os trabalhos em andamento.'].join('\n')};

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Método não permitido.'});
  if(!sameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
  const {ELEVENLABS_API_KEY:key,NAYRA_AGENT_ID:publicAgent,NAYRA_AGENT_ID_TIAGO:fullAgent}=process.env;
  if(!key||!publicAgent)return res.status(503).json({error:'A conversa ainda não foi ligada neste site.'});
  const full=loggedIn(req)&&!!fullAgent;
  const now=Date.now(),opened=count((full?'full:':'open:')+clientIp(req),now,WINDOW_MS);
  if(opened.length>=(full?MAX_TOKENS_LOGGED:MAX_TOKENS))return res.status(429).json({error:'Muitas conversas seguidas. Tente de novo em alguns minutos.'});
  const agent=full?fullAgent:publicAgent;
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
  return res.status(200).json({token,profile:full?'completo':'apresentacao',context:full?FULL_CONTEXT:context});
}
