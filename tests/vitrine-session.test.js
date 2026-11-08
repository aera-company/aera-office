// Public site voice (C87): only the right code, from the site itself, gets a token; nothing secret comes back.
import test,{beforeEach,afterEach} from 'node:test';
import assert from 'node:assert/strict';
import handler,{resetLimits} from '../api/vitrine-session.js';

const HOST='aera-office.vercel.app',KEY='chave-de-teste',ENV={ELEVENLABS_API_KEY:KEY,NAYRA_ACCESS_CODE:'codigo-certo',NAYRA_AGENT_ID:'agent_teste'};
let calls,realFetch,upstream;
const call=async({method='POST',origin='https://'+HOST,body={code:'codigo-certo'},ip='1.1.1.1'}={})=>{
  const out={headers:{},setHeader(k,v){this.headers[k]=v;},status(c){this.code=c;return this;},json(d){this.body=d;return this;}};
  await handler({method,body,headers:{host:HOST,...(origin?{origin}:{}),'x-forwarded-for':ip}},out);
  return out;
};
beforeEach(()=>{resetLimits();Object.assign(process.env,ENV);calls=[];upstream=async()=>({ok:true,status:200,json:async()=>({token:'tok-unico',conversation_id:'c'})});
  realFetch=globalThis.fetch;globalThis.fetch=async(url,options)=>{calls.push({url:String(url),key:options.headers['xi-api-key']});return upstream();};});
afterEach(()=>{globalThis.fetch=realFetch;for(const k of Object.keys(ENV))delete process.env[k];});

test('right code gets one token and the public context, never the key',async()=>{
  const r=await call();
  assert.equal(r.code,200);assert.equal(r.body.token,'tok-unico');assert.equal(r.body.context.client,'AERA');assert.deepEqual(r.body.context.jobs,[]);
  assert.match(calls[0].url,/conversation\/token\?agent_id=agent_teste/);assert.equal(calls[0].key,KEY);
  assert.equal(JSON.stringify(r.body).includes(KEY),false);assert.equal(r.headers['Cache-Control'],'no-store');
});
test('wrong or missing code gets nothing and never reaches ElevenLabs',async()=>{
  for(const body of [{code:'errado'},{},{code:7},null]){const r=await call({body});assert.equal(r.code,401);}
  assert.equal(calls.length,0);
});
test('only POST from the site itself',async()=>{
  assert.equal((await call({method:'GET'})).code,405);
  assert.equal((await call({origin:'https://outro-site.com'})).code,403);
  assert.equal((await call({origin:''})).code,403);
  assert.equal(calls.length,0);
});
test('repeated wrong codes are cut off, also for the right code',async()=>{
  for(let i=0;i<8;i++)await call({body:{code:'errado'+i}});
  assert.equal((await call()).code,429);assert.equal(calls.length,0);
  assert.equal((await call({ip:'2.2.2.2'})).code,200);
});
test('repeated openings are cut off',async()=>{
  for(let i=0;i<12;i++)assert.equal((await call()).code,200);
  assert.equal((await call()).code,429);assert.equal(calls.length,12);
});
test('not configured or ElevenLabs down gives a plain error',async()=>{
  upstream=async()=>({ok:false,status:401,json:async()=>({})});
  assert.equal((await call()).code,502);
  delete process.env.NAYRA_ACCESS_CODE;
  const r=await call();assert.equal(r.code,503);assert.match(r.body.error,/ainda não foi ligada/);
});
test('public context holds no case list or internal work',async()=>{
  const {default:c}=await import('../api/_site-context.js');
  assert.ok(c.facts>0);assert.doesNotMatch(c.text,/\bcases?\b/i);assert.match(c.text,/visitante convidado/);
});
