import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {layoutStations,pickWaypoint,floorOfY,roomSpecs} from '../stations.js';
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
