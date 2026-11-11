import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {layoutStations,pickWaypoint,floorOfY,roomSpecs,routeTiming,routeProgress,WALK_SPEED} from '../stations.js';
import {lightsCommand,agentsMentioned,agentMentions,enterCommand,leaveCommand,createSpeechTimeline} from '../commands.js';
import {isWalkable,floorSpecs} from '../navigation.js';

const registry=JSON.parse(readFileSync(new URL('../scripts/office/capabilities.json',import.meta.url),'utf8'));

test('Toda estação do registro recebe posição dentro da sala do seu personagem',()=>{
  const placed=layoutStations(registry.stations);
  assert.equal(placed.length,registry.stations.length);
  for(const s of placed){
    const r=roomSpecs[s.zone];const [x,,z]=s.position;const [left,right,back,front]=r.bounds;
    assert(x>=left&&x<=right&&z>=back&&z<=front,`${s.id} fora da sala ${s.zone}`);
    assert(Math.abs(s.position[1]-floorSpecs[r.floor].base)<3,`${s.id} altura fora do pavimento`);
  }
  const ids=new Set(placed.map(s=>s.id));assert.equal(ids.size,placed.length);
});

test('Pontos de circulação são andáveis, no mesmo pavimento e alcançáveis em linha reta',()=>{
  let seed=7;const random=()=>{seed=(seed*9301+49297)%233280;return seed/233280;};
  for(const [floor,home] of [['upper',[-3.0,1.55]],['upper',[3.0,2.65]],['lower',[-6.05,2.8]],['top',[.5,3.4]]]){
    let found=0;
    for(let i=0;i<20;i++){const p=pickWaypoint(random,floor,home);if(!p)continue;found++;assert(isWalkable(p[0],p[1],floor));assert(Math.hypot(p[0]-home[0],p[1]-home[1])>=1.6);}
    assert(found>=10,`poucos pontos em ${floor}`);
  }
  assert.equal(pickWaypoint(random,'nope',[0,0]),null);
});

test('Altura do personagem resolve o pavimento certo',()=>{
  assert.equal(floorOfY(5.07),'upper');assert.equal(floorOfY(.79),'lower');assert.equal(floorOfY(9.35),'top');assert.equal(floorOfY(13.63),'terrace');
});

test('Agentes caminham, nunca correm: a velocidade fica em passo e cobre o trajeto inteiro',()=>{
  for(const distance of [.2,.5,1.6,6,18]){
    const route=routeTiming(distance);let previous=0;
    for(let t=0;t<=route.duration+.001;t+=1/24){
      const covered=routeProgress(route,t);
      assert(covered>=previous-1e-9);assert((covered-previous)*24<=WALK_SPEED+1e-6,`speed over walking pace at ${distance} m`);previous=covered;
    }
    assert.equal(routeProgress(route,route.duration),distance);assert.equal(routeProgress(route,0),0);
    assert(route.duration>=distance/WALK_SPEED);
  }
  assert(WALK_SPEED<=1.2);
});
test('Pontos de circulação respeitam a distância máxima do passeio',()=>{
  let seed=7;const random=()=>{seed=(seed*9301+49297)%233280;return seed/233280;};
  for(let i=0;i<30;i++){const p=pickWaypoint(random,'lower',[3.3,.5],{maxDistance:6});if(p)assert(Math.hypot(p[0]-3.3,p[1]-.5)<=6);}
});

test('Comando de voz das luzes: apagar, acender e nada quando não é pedido',()=>{
  for(const t of ['NAYRA, apaga as luzes do office','Pode apagar a luz, por favor?','Desliga as luzes do escritório','apague a iluminação'])assert.equal(lightsCommand(t),'off',t);
  for(const t of ['Acende as luzes','NAYRA, liga a luz do office de novo','acenda as luzes do escritório'])assert.equal(lightsCommand(t),'on',t);
  for(const t of ['Agora pode acender de novo.','Acende, por favor','liga de volta'])assert.equal(lightsCommand(t,{lightsOff:true}),'on',t);
  for(const t of ['Agora pode acender de novo.','Não acende ainda'])assert.equal(lightsCommand(t),null,t);
  assert.equal(lightsCommand('Não acende ainda',{lightsOff:true}),null);
  for(const t of ['Não apaga as luzes','Como está o job da AERA?','A luz do fim de tarde ficou linda','apaga esse post','',null])assert.equal(lightsCommand(t),null,String(t));
});

test('Agentes citados numa frase da NAYRA: nomes inteiros, sem falso positivo',()=>{
  assert.deepEqual(agentsMentioned('A MAYA cuida da estratégia e passa para o NOA.'),['MAYA','NOA']);
  assert.deepEqual(agentsMentioned('Quem faz a arte é o John, junto com a Nina'),['JOHN','NINA']);
  assert.deepEqual(agentsMentioned('ARI coordena o time.'),['ARI']);
  assert.deepEqual(agentsMentioned('O Leonardo vai variar o canoa amanhã'),[]);
  assert.deepEqual(agentsMentioned(''),[]);
});

test('Hora do dia: postes e janelas apagados de dia, acesos à noite, e sem salto à meia-noite',async()=>{
  const {daylight,sunDirection,hourOf}=await import('../daylight.js');
  assert.equal(daylight(11).lamps,0);assert.equal(daylight(11).windows,0);assert(daylight(11).key>2);
  assert.equal(daylight(19.1).lamps,1);assert.equal(daylight(23).lamps,1);assert.equal(daylight(3).nightLights,1);
  assert(daylight(17.8).lamps>0&&daylight(17.8).lamps<1);
  const before=daylight(23.99),after=daylight(.01);assert.equal(before.haze,after.haze);assert.equal(before.key,after.key);
  for(let h=0;h<24;h+=.25){const s=daylight(h);assert.match(s.zenith,/^#[0-9a-f]{6}$/);assert.match(s.sea,/^#[0-9a-f]{6}$/);assert(Math.abs(Math.hypot(...s.sun)-1)<1e-9);assert(s.sun[1]>0);}
  assert(sunDirection(12)[1]>sunDirection(8)[1]&&sunDirection(12)[1]>sunDirection(16)[1]);
  assert(sunDirection(7)[0]>0&&sunDirection(17)[0]<0);
  assert.equal(daylight(35).hour,11);assert.equal(hourOf(new Date(2026,10,11,11,30,0)),11.5);
});

test('NAYRA apresentando a equipe: agentes na ordem da fala, entrar e sair da sala só quando pedido',()=>{
  const m=agentMentions('Começo pela MAYA, que cuida da estratégia. Depois vem o NOA no texto e, por fim, a NINA.');
  assert.deepEqual(m.map(x=>x.name),['MAYA','NOA','NINA']);assert(m[0].at<m[1].at&&m[1].at<m[2].at&&m[2].at<1);
  assert.deepEqual(agentMentions('Nada de agentes aqui.'),[]);
  assert.equal(enterCommand('NAYRA, entra na sala da MAYA'),'think');
  assert.equal(enterCommand('me leva para a sala do Leo'),'build');
  assert.equal(enterCommand('quero ver por dentro'),'current');
  assert.equal(enterCommand('entra na sala'),'current');
  for(const t of ['Não precisa entrar na sala','Como está a entrega da MAYA?','Me mostra a MAYA','A NINA entrou em contato'])assert.equal(enterCommand(t),null,t);
  assert.equal(leaveCommand('sai da sala, por favor'),true);assert.equal(leaveCommand('volta para fora do prédio'),true);assert.equal(leaveCommand('a MAYA volta amanhã'),false);
});

test('Sincronia da fala: o nome do agente sai com o instante exato em que é dito, mesmo cortado entre trechos',()=>{
  const chunk=(text,per=60)=>({chars:[...text],char_start_times_ms:[...text].map((_,i)=>i*per),char_durations_ms:[...text].map(()=>per)});
  const t=createSpeechTimeline();
  assert.deepEqual(t.push(chunk('Começando pela ARI, que coordena. ')),[{name:'ARI',at:15*60}]);
  const first=t.duration;assert.equal(first,34*60);
  assert.deepEqual(t.push(chunk('Depois a MA')),[]);
  assert.deepEqual(t.push(chunk('YA, e o Leonardo não conta, mas o LEO sim.')),[{name:'MAYA',at:first+9*60},{name:'LEO',at:first+11*60+34*60}]);
  assert.deepEqual(t.push(chunk(' Por fim a NINA')),[]);
  assert.deepEqual(t.push(chunk('.')).map(x=>x.name),['NINA']);
  assert.deepEqual(createSpeechTimeline().push({chars:[]}),[]);
});

test('Quadro da operação: cada trabalho real na coluna do seu estágio, concluídos de fora',async()=>{
  const {boardColumns}=await import('../interiors.js');
  const jobs=[{title:'a',status:'queued'},{title:'b',status:'running'},{title:'c',status:'em_sessao'},{title:'d',status:'reviewing'},{title:'e',status:'awaiting_approval'},{title:'f',status:'done'},{title:'g',status:'canceled'},{title:'h',status:'approved'}];
  const cols=boardColumns(jobs);
  assert.deepEqual(cols.map(c=>c.title),['Na fila','Em produção','Em revisão','Para aprovar']);
  assert.deepEqual(cols.map(c=>c.jobs.map(j=>j.title).join('')),['a','bc','d','e']);
  assert.deepEqual(boardColumns([]).map(c=>c.jobs.length),[0,0,0,0]);assert.deepEqual(boardColumns(undefined).map(c=>c.jobs.length),[0,0,0,0]);
});

import {fromMetNo,weatherFromQuery,weatherize,loadWeather,PRESETS,CLEAR} from '../weather.js';
import {daylight as daylightAt} from '../daylight.js';
const metno=(details,symbol,mm=0)=>({properties:{timeseries:[{time:'2026-11-11T19:00:00Z',data:{instant:{details},next_1_hours:{summary:{symbol_code:symbol},details:{precipitation_amount:mm}}}}]}});

test('clima: previsão do MET Norway vira nuvens, chuva e vento', ()=>{
  const clear=fromMetNo(metno({cloud_area_fraction:11.7,wind_speed:3},'clearsky_day'));
  assert.equal(clear.rain,0);assert.ok(clear.cloud<.2);assert.equal(clear.windFrom,160);
  assert.equal(fromMetNo(metno({cloud_area_fraction:10,wind_speed:11.3,wind_from_direction:103},'clearsky_day')).label,'Vento forte');assert.equal(clear.label,'Céu limpo');assert.equal(clear.source,'MET Norway');
  const drizzle=fromMetNo(metno({cloud_area_fraction:96,wind_speed:5},'lightrain',.3));
  assert.ok(drizzle.rain>.2&&drizzle.rain<.5);assert.ok(drizzle.cloud>.9);assert.equal(drizzle.label,'Chuva fina');
  const storm=fromMetNo(metno({cloud_area_fraction:100,wind_speed:14},'heavyrainandthunder',6));
  assert.ok(storm.rain>.7);assert.equal(storm.wind,1);
  assert.equal(fromMetNo({}),null);
});

test('clima: prévia por endereço só aceita os climas conhecidos', ()=>{
  assert.equal(weatherFromQuery('?clima=chuva').rain,PRESETS.chuva.rain);
  assert.equal(weatherFromQuery('?clima=NUBLADO').label,'Nublado');
  assert.equal(weatherFromQuery('?clima=granizo'),null);assert.equal(weatherFromQuery(''),null);
});

test('clima: céu limpo não muda a luz; nublado tira o sol e chuva acende a rua mais cedo', ()=>{
  const noon=daylightAt(12),clear=weatherize(noon,CLEAR);
  for(const key of ['key','zenith','bright','lamps'])assert.equal(clear[key],noon[key]);
  assert.equal(clear.fogFar,330);
  const grey=weatherize(noon,PRESETS.nublado);
  assert.ok(grey.key<noon.key*.4);assert.equal(grey.disc,0);assert.ok(grey.bright<noon.bright);
  const dusk=daylightAt(17.6),wet=weatherize(dusk,PRESETS.chuva);
  assert.ok(wet.lamps>dusk.lamps);assert.ok(wet.fogFar<300);assert.equal(wet.rain,PRESETS.chuva.rain);
});

test('clima: ao vivo fica guardado por meia hora', async ()=>{
  let calls=0;const kept={};const storage={getItem:k=>kept[k]??null,setItem:(k,v)=>{kept[k]=v;}};
  const fetchImpl=async url=>{calls++;assert.match(url,/api\.met\.no\/weatherapi\/locationforecast\/2\.0\/compact\?lat=-22\.987&lon=-43\.222$/);return {ok:true,json:async()=>metno({cloud_area_fraction:80,wind_speed:6},'cloudy')};};
  const first=await loadWeather({storage,fetchImpl,now:0}),again=await loadWeather({storage,fetchImpl,now:20*60*1000});
  assert.equal(calls,1);assert.deepEqual(again,first);
  await loadWeather({storage,fetchImpl,now:31*60*1000});assert.equal(calls,2);
});
