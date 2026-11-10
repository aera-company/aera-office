// Site login (C89): one shared helper for the login, logout, session and voice functions.
// Secrets live only in the Vercel project: OFFICE_LOGIN_USER, OFFICE_LOGIN_PASSWORD and SESSION_SECRET.
import {createHash,createHmac,timingSafeEqual} from 'node:crypto';

export const COOKIE='aera_nayra';
export const SESSION_SECONDS=12*60*60;
const hits=new Map();

const digest=value=>createHash('sha256').update(String(value)).digest();
export const same=(a,b)=>timingSafeEqual(digest(a),digest(b));
const sign=(value,secret)=>createHmac('sha256',secret).update(value).digest('base64url');

export function sameOrigin(req){
  let origin='';
  try{origin=new URL(req.headers.origin||'').host;}catch{}
  return !!origin&&origin===req.headers.host;
}

export function clientIp(req){
  return String(req.headers['x-forwarded-for']||req.headers['x-real-ip']||'desconhecido').split(',')[0].trim();
}

// Best effort per function instance: it slows guessing and repeated openings, it is not a global counter.
export function count(key,now,windowMs){
  const list=(hits.get(key)||[]).filter(t=>now-t<windowMs);
  hits.set(key,list);
  return list;
}
export function resetLimits(){hits.clear();}

export function sessionCookie(now=Date.now()){
  const secret=process.env.SESSION_SECRET;
  const expires=String(Math.floor(now/1000)+SESSION_SECONDS);
  return `${COOKIE}=${expires}.${sign(expires,secret)}; Path=/api; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=Strict`;
}
export const clearCookie=()=>`${COOKIE}=; Path=/api; Max-Age=0; HttpOnly; Secure; SameSite=Strict`;

// True only for an unexpired session signed with this project's secret.
export function loggedIn(req,now=Date.now()){
  const secret=process.env.SESSION_SECRET;
  if(!secret||secret.length<32)return false;
  const raw=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(COOKIE+'='));
  if(!raw)return false;
  const [expires,signature]=raw.slice(COOKIE.length+1).split('.');
  if(!/^\d{9,12}$/.test(expires||'')||!signature)return false;
  if(Number(expires)*1000<=now)return false;
  return same(signature,sign(expires,secret));
}

export function loginReady(){
  const {OFFICE_LOGIN_USER:user,OFFICE_LOGIN_PASSWORD:password,SESSION_SECRET:secret}=process.env;
  const missing=[!user&&'OFFICE_LOGIN_USER vazio',!(password&&password.length>=10)&&'OFFICE_LOGIN_PASSWORD vazio ou com menos de 10 caracteres',!(secret&&secret.length>=32)&&'SESSION_SECRET vazio ou curto'].filter(Boolean);
  // Names only, never values: the reason lands in the Vercel log, not on the page.
  if(missing.length&&process.env.VERCEL)console.warn('login desligado:',missing.join('; '));
  return !missing.length;
}
