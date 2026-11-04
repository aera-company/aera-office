// Pure layout for stations inside rooms and ambient waypoints. No browser or rendering dependency.
import {floorSpecs,roomSpecs,isWalkable} from './navigation.js';

// Where each room's stations sit, as [x, z] slots inside the room, near its front glass so the focused camera reads them.
const slots={
  think:[[-8.4,3.6],[-6.6,3.6],[-4.8,3.6],[-3.0,3.6]],
  create:[[2.5,3.6],[4.2,3.6],[5.9,3.6],[7.6,3.6],[9.0,2.4],[9.0,.6]],
  build:[[-8.4,3.9],[-6.6,3.9]],
  grow:[[4.2,3.9],[6.0,3.9]],
  control:[[-6.2,3.6],[-3.2,3.6],[3.2,3.6],[6.2,3.6]]
};
const labelHeight={think:6.95,create:6.95,build:2.65,grow:2.65,control:11.25};
const zoneOf={ARI:'control',MAYA:'think',NOA:'create',JOHN:'create',LEO:'build',NINA:'grow'};

export function layoutStations(stations){
  const used={};
  return stations.map(s=>{
    const zone=zoneOf[s.character]||'control';const i=used[zone]=(used[zone]||0);used[zone]++;
    const slot=slots[zone][Math.min(i,slots[zone].length-1)];
    return {id:s.id,zone,character:s.character,name:s.name,state:s.state||'sem_job',state_label:s.state_label||'',position:[slot[0],labelHeight[zone],slot[1]]};
  });
}

export function stationZone(character){return zoneOf[character]||'control';}

// Ambient waypoints: a free point on the actor's own floor, reachable in a straight line from where it stands.
export function pickWaypoint(random,floor,from,{minDistance=1.6,attempts=40}={}){
  const f=floorSpecs[floor];if(!f)return null;
  for(let i=0;i<attempts;i++){
    const x=-9+random()*18,z=-4.6+random()*9.8;
    if(!isWalkable(x,z,floor))continue;
    const dist=Math.hypot(x-from[0],z-from[1]);if(dist<minDistance)continue;
    let clear=true;const steps=Math.ceil(dist/.25);
    for(let s=1;s<steps&&clear;s++){const t=s/steps;if(!isWalkable(from[0]+(x-from[0])*t,from[1]+(z-from[1])*t,floor))clear=false;}
    if(clear)return [x,z];
  }
  return null;
}

export function floorOfY(y){return y>12.5?'terrace':y>8.5?'top':y>4?'upper':'lower';}
export {roomSpecs};
