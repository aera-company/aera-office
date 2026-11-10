import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {layoutStations,pickWaypoint,floorOfY,roomSpecs,routeTiming,routeProgress,WALK_SPEED} from '../stations.js';
import {lightsCommand} from '../commands.js';
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
  for(const t of ['Não apaga as luzes','Como está o job da AERA?','A luz do fim de tarde ficou linda','apaga esse post','',null])assert.equal(lightsCommand(t),null,String(t));
});
