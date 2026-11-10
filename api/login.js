// Site login (C89): user and password checked on the server; a signed, HttpOnly cookie opens the full NAYRA.
import {sameOrigin,clientIp,count,same,sessionCookie,clearCookie,loginReady} from './_session.js';

const WINDOW_MS=15*60*1000,MAX_WRONG=6;

export default function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST')return res.status(405).json({error:'Método não permitido.'});
  if(!sameOrigin(req))return res.status(403).json({error:'Origem não autorizada.'});
  if(req.body?.logout===true){res.setHeader('Set-Cookie',clearCookie());return res.status(200).json({logged:false});}
  if(!loginReady())return res.status(503).json({error:'O login ainda não foi ligado neste site.'});
  const now=Date.now(),wrong=count('login:'+clientIp(req),now,WINDOW_MS);
  if(wrong.length>=MAX_WRONG)return res.status(429).json({error:'Muitas tentativas. Tente de novo em alguns minutos.'});
  const user=typeof req.body?.user==='string'?req.body.user.trim():'';
  const password=typeof req.body?.password==='string'?req.body.password:'';
  // Both are always compared, so a wrong user takes as long as a wrong password.
  const okUser=same(user.toLowerCase(),process.env.OFFICE_LOGIN_USER.trim().toLowerCase());
  const okPassword=password.length<=200&&same(password,process.env.OFFICE_LOGIN_PASSWORD);
  if(!user||!okUser||!okPassword){wrong.push(now);return res.status(401).json({error:'Usuário ou senha incorretos.'});}
  res.setHeader('Set-Cookie',sessionCookie(now));
  return res.status(200).json({logged:true});
}
