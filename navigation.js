// Pure navigation constraints. No browser or rendering dependency.
// Three storeys plus the roof terrace. Storey rise is 4.28; the helical stair climbs the first two.
export const RISE=4.28;
export const floorSpecs = {
  lower: {name:'Térreo · recepção',base:.79,eye:2.44,spawn:[3.8,2.44,4.85],look:[.5,2.3,-1],left:'BUILD',right:'GROW'},
  upper: {name:'Andar 01 · estratégia e criação',base:5.07,eye:6.72,spawn:[.1,6.72,4.85],look:[-5.8,6.5,-.7],left:'THINK',right:'CREATE'},
  top: {name:'Andar 02 · Comando',base:9.35,eye:11.0,spawn:[.1,11.0,4.85],look:[0,10.7,-1.5],left:'COMANDO',right:'ARI'},
  terrace: {name:'Terraço',base:13.63,eye:15.28,spawn:[2.5,15.28,4.85],look:[0,14.9,-3],left:'ESTAR',right:'JARDIM'}
};
export const roomSpecs = {
  think:{floor:'upper',entry:[-4.7,6.72,4.65],look:[-5.8,6.4,-.7],bounds:[-9.3,-1.6,-4.8,5.2]},
  create:{floor:'upper',entry:[3.2,6.72,4.65],look:[5.6,6.4,.3],bounds:[1.6,9.3,-4.8,5.2]},
  build:{floor:'lower',entry:[-2.7,2.44,4.8],look:[-6.6,2.1,.5],bounds:[-9.3,-1.6,-4.8,5.2]},
  grow:{floor:'lower',entry:[3,2.44,4.8],look:[6.3,2.1,0],bounds:[2,9.3,-4.8,5.2]},
  control:{floor:'top',entry:[3.6,11.0,4.6],look:[0,10.6,-1.5],bounds:[-9.3,9.3,-4.8,5.2]}
};
const obstacles = {
  lower:[[-8.96,-6.24,.38,1.86],[-5.86,-3.14,.38,1.86],[-8.96,-6.24,-3.34,-1.86],[-5.86,-3.14,-3.34,-1.86],[-1.65,2.65,2.62,4.14],[4,7,1.2,2.85],[7.65,9.2,-1.5,1.5],[2.74,5.46,-4.04,-2.56],[5.94,8.66,-4.04,-2.56]],
  upper:[[-8.3,-3.3,-2.6,1.2],[3.1,8.1,-1.2,2.6],[6.3,8.9,-4.1,-2.6]],
  // Comando: long table in the middle, lounge at the east end, presentation wall to the north.
  top:[[-3.6,3.6,-2.6,.2],[6.1,9.1,.6,3.2],[-9.1,-5.5,-4.6,-3.4]],
  terrace:[[-7.65,-4.35,.4,2.1],[-4.35,-1.05,.4,2.1]]
};
export function isWalkable(x,z,floor) {
  if(!Number.isFinite(x)||!Number.isFinite(z)||!floorSpecs[floor])return false;
  const radius=.22;
  if(x< -9.5+radius||x>9.5-radius||z< -4.95+radius||z>5.55-radius)return false;
  if(floor!=='terrace'&&Math.hypot(x-.1,z+1.1)<1.85)return false;
  return !obstacles[floor].some(([left,right,back,front])=>x>left-radius&&x<right+radius&&z>back-radius&&z<front+radius);
}
export function moveWithinFloor(position,dx,dz,floor) {
  let {x,z}=position;
  // Substeps prevent tunnelling through a desk when the window resumes after a pause.
  const steps=Math.max(1,Math.ceil(Math.hypot(dx,dz)/.1));
  for(let i=0;i<steps;i++) {
    if(isWalkable(x+dx/steps,z,floor))x+=dx/steps;
    if(isWalkable(x,z+dz/steps,floor))z+=dz/steps;
  }
  return {x,z};
}
