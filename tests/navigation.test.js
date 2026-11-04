import {test} from 'node:test';
import assert from 'node:assert/strict';
import {floorSpecs,roomSpecs,isWalkable,moveWithinFloor} from '../navigation.js';

test('Entradas de ambientes e elevador ficam em áreas livres',()=>{
  for(const [key,f] of Object.entries(floorSpecs))assert(isWalkable(f.spawn[0],f.spawn[2],key),`${key} spawn`);
  for(const [key,r] of Object.entries(roomSpecs))assert(isWalkable(r.entry[0],r.entry[2],r.floor),`${key} entry`);
});
test('Percurso permanece dentro do edifício, inclusive em saltos grandes',()=>{
  const p=moveWithinFloor({x:3,z:4.9},100,0,'lower');assert(p.x<=9.28);assert(isWalkable(p.x,p.z,'lower'));
});
test('Mesa e vazio da escada bloqueiam passagem',()=>{
  assert(!isWalkable(.1,-1.1,'upper'));
  const p=moveWithinFloor({x:-7.6,z:4.8},0,-10,'lower');assert(p.z>=2.08);
});
test('Ao encontrar um obstáculo, caminhada desliza em seu contorno',()=>{
  const p=moveWithinFloor({x:-7.6,z:2.1},1,-1,'lower');assert(p.x> -7.6);assert(p.z>=2.08);
});
test('Coordenadas inválidas e pisos inexistentes são recusados',()=>{
  assert(!isWalkable(NaN,0,'lower'));assert(!isWalkable(0,Infinity,'upper'));assert(!isWalkable(0,0,'unknown'));
});
