// Site login (C89): only the right user and password, from the site itself, open the full NAYRA; nothing secret comes back.
import test,{beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import login from '../api/login.js';
import session from '../api/session.js';
import voice from '../api/vitrine-session.js';
import {resetLimits,sessionCookie,loggedIn,COOKIE} from '../api/_session.js';

const HOST='aera-office.vercel.app';
const ENV={OFFICE_LOGIN_USER:'Tiago',OFFICE_LOGIN_PASSWORD:'senha-de-teste-123',SESSION_SECRET:'s'.repeat(48),ELEVENLABS_API_KEY:'chave-de-teste',NAYRA_AGENT_ID:'agent_publico',NAYRA_AGENT_ID_TIAGO:'agent_completo'};
let calls,realFetch;
const run=async(handler,{method='POST',body={},cookie='',origin='https://'+HOST,ip='1.1.1.1'}={})=>{
  const out={headers:{},setHeader(k,v){this.headers[k]=v;},status(c){this.code=c;return this;},json(d){this.body=d;return this;}};
  await handler({method,body,headers:{host:HOST,...(origin?{origin}:{}),...(cookie?{cookie}:{}),'x-forwarded-for':ip}},out);
  return out;
};
const cookieOf=r=>String(r.headers['Set-Cookie']||'').split(';')[0];
beforeEach(()=>{resetLimits();Object.assign(process.env,ENV);calls=[];realFetch=globalThis.fetch;
  globalThis.fetch=async(url)=>{calls.push(String(url));return {ok:true,status:200,json:async()=>({token:'tok-unico'})};};});
afterEach(()=>{globalThis.fetch=realFetch;for(const k of Object.keys(ENV))delete process.env[k];});

test('right user and password set a protected session cookie, never the secret',async()=>{
  const r=await run(login,{body:{user:' tiago ',password:'senha-de-teste-123'}});
  assert.equal(r.code,200);assert.deepEqual(r.body,{logged:true});
  const set=r.headers['Set-Cookie'];
  for(const flag of ['HttpOnly','Secure','SameSite=Strict','Path=/api'])assert.ok(set.includes(flag),flag);
  assert.equal(set.includes(ENV.SESSION_SECRET),false);assert.equal(set.includes(ENV.OFFICE_LOGIN_PASSWORD),false);
  assert.equal((await run(session,{method:'GET',cookie:cookieOf(r)})).body.logged,true);
});

test('wrong user or password is refused and repeated tries are cut off',async()=>{
  assert.equal((await run(login,{body:{user:'tiago',password:'errada-errada'}})).code,401);
  assert.equal((await run(login,{body:{user:'outro',password:'senha-de-teste-123'}})).code,401);
  assert.equal((await run(login,{body:{}})).code,401);
  for(let i=0;i<4;i++)await run(login,{body:{user:'tiago',password:'x'+i}});
  assert.equal((await run(login,{body:{user:'tiago',password:'senha-de-teste-123'}})).code,429);
  assert.equal((await run(login,{ip:'2.2.2.2',body:{user:'tiago',password:'senha-de-teste-123'}})).code,200);
});

test('login only from the site, and only when configured',async()=>{
  assert.equal((await run(login,{origin:'https://outro-site.com',body:{user:'tiago',password:'senha-de-teste-123'}})).code,403);
  assert.equal((await run(login,{method:'GET'})).code,405);
  delete process.env.SESSION_SECRET;
  const r=await run(login,{body:{user:'tiago',password:'senha-de-teste-123'}});assert.equal(r.code,503);
  assert.equal((await run(session,{method:'GET'})).body.available,false);
});

test('tampered, foreign or expired cookies are not a session',()=>{
  const good=sessionCookie().split(';')[0];
  assert.equal(loggedIn({headers:{cookie:good}}),true);
  assert.equal(loggedIn({headers:{cookie:good.slice(0,-2)+'xx'}}),false);
  const [, value]=good.split('=');const [exp,sig]=value.split('.');
  assert.equal(loggedIn({headers:{cookie:`${COOKIE}=${Number(exp)+999}.${sig}`}}),false);
  assert.equal(loggedIn({headers:{cookie:good}},(Number(exp)+1)*1000),false);
  process.env.SESSION_SECRET='t'.repeat(48);assert.equal(loggedIn({headers:{cookie:good}}),false);
});

test('logged in, the voice token is for the full agent; logged out, the public one',async()=>{
  const cookie=cookieOf(await run(login,{body:{user:'tiago',password:'senha-de-teste-123'}}));
  const full=await run(voice,{cookie});
  assert.equal(full.code,200);assert.equal(full.body.profile,'completo');assert.match(calls.at(-1),/agent_id=agent_completo/);
  assert.match(full.body.context.text,/base de conhecimento/);assert.deepEqual(full.body.context.jobs,[]);
  const pub=await run(voice);
  assert.equal(pub.body.profile,'apresentacao');assert.match(calls.at(-1),/agent_id=agent_publico/);
  const out=await run(login,{cookie,body:{logout:true}});
  assert.match(out.headers['Set-Cookie'],/Max-Age=0/);
  delete process.env.NAYRA_AGENT_ID_TIAGO;
  assert.equal((await run(voice,{cookie})).body.profile,'apresentacao');
});
