import * as THREE from 'three';
import {pickWaypoint,floorOfY,routeTiming,routeProgress,WALK_SPEED,STRIDE_LENGTH} from './stations.js';

// Architectural occupants, not autonomous agents. Their choreography is predefined.
// Two layers of motion: ambient circulation (no task) and execution (driven by server events via setWorkflow).
// Shared instanced geometry keeps six articulated rigs to four draw calls.
export function createAgentTeam({scene, contactMaterial, onInvalidate=()=>{}}) {
  const media=matchMedia('(prefers-reduced-motion: reduce)');
  const root=new THREE.Group();root.name='AERA_PROPOSED_AGENTS';scene.add(root);
  const parts={capsule:[],sphere:[],taper:[],shadow:[]},actors=[];
  // Matte, like the clay figures of the portraits: no sheen, so dark hair stays dark under the warm room lights.
  // The rooms are lit by strong warm lamps, and a person standing right under one would wash out to white. The figures
  // compress their own brightness (keeping the hue), so skin, hair and clothes hold the tones of the portraits anywhere.
  const material=new THREE.MeshLambertMaterial({color:new THREE.Color().setScalar(.9)});
  material.onBeforeCompile=shader=>{shader.fragmentShader=shader.fragmentShader.replace('#include <opaque_fragment>','outgoingLight*=1./(1.+max(outgoingLight.r,max(outgoingLight.g,outgoingLight.b))*.95);\n#include <opaque_fragment>');};
  const specs=[
    {name:'MAYA',zone:'think',home:[-3.0,5.07,1.55],work:[-3.0,5.07,.4],look:[-5.8,-.7],color:'#59665c',activity:'table',skin:'#cfa283',hair:'#16120f',style:'full',pants:'#1f2326'},
    {name:'NOA',zone:'create',home:[3.0,5.07,2.65],work:[3.0,5.07,1.4],look:[5.6,.7],color:'#a9803f',activity:'table',skin:'#d3a882',hair:'#4a3020',style:'short',pants:'#29373e'},
    // A `seat` marks the spot (home or work) where the person sits on the chair that is already there, facing the desk.
    // JOHN shares the Create room with NOA: his own desk at the back wall, the worktable when a batch or a review involves him.
    {name:'JOHN',zone:'create',home:[7.6,5.07,-2.4],work:[8.6,5.07,.7],look:[7.6,-4.2],seat:{at:'home',look:[7.6,-3.4]},color:'#5c5a66',activity:'keyboard',skin:'#6f4a36',hair:'#15100d',style:'full',pants:'#23262b'},
    {name:'LEO',zone:'build',home:[-7.6,.79,2.1],work:[-7.6,.79,2.1],look:[-7.6,1.1],seat:{at:'home',look:[-7.6,1.1]},color:'#2f4a6b',activity:'keyboard',skin:'#c99874',hair:'#4a3423',style:'short',pants:'#2d3134'},
    // NINA keeps the Grow lounge: by the low table at rest, between the two desks when a job involves her.
    {name:'NINA',zone:'grow',home:[3.3,.79,.5],work:[4.1,.79,-2.3],look:[5.7,-.25],seat:{at:'work',look:[4.1,-3.3]},color:'#a63f35',activity:'conversation',skin:'#8f5f42',hair:'#17110e',style:'bun',pants:'#26221f',sole:'#2a2724'},
    // ARI lives on the Comando floor: in front of the presentation wall at rest, at the head of the long table when a job runs.
    {name:'ARI',zone:'control',home:[.5,9.35,-4.35],work:[-4.0,9.35,-1.2],look:[.5,-1.2],color:'#d9d2c3',activity:'direction',skin:'#d6b396',hair:'#9a9792',style:'short',pants:'#2a3238',sole:'#2a2724'}
  ];
  const shoe='#1c2327';
  function joint(parent,x=0,y=0,z=0){const node=new THREE.Object3D();node.position.set(x,y,z);parent.add(node);return node;}
  function part(kind,parent,position,scale,color){const node=joint(parent,...position);node.scale.set(...scale);parts[kind].push({node,color:new THREE.Color(color)});return node;}
  function capsule(parent,position,w,h,d,color){return part('capsule',parent,position,[w,h/2,d],color);}
  // Same sizing as a capsule, but narrower at the bottom: a torso from shoulders to waist, a limb from joint to joint.
  function taper(parent,position,w,h,d,color){return part('taper',parent,position,[w,h/2,d],color);}
  const tone=(hex,k)=>'#'+new THREE.Color(hex).multiplyScalar(k).getHexString();
  // A slightly large, rounded head on a slender neck, like the portraits. `front` is where the face surface sits at (x, y).
  const HEAD={y:.07,z:.012,rx:.14,ry:.158,rz:.142};
  const front=(x,y)=>HEAD.z+HEAD.rz*Math.sqrt(Math.max(0,1-(x/HEAD.rx)**2-((y-HEAD.y)/HEAD.ry)**2));
  function bar(parent,position,thick,length,color,axis='x'){const node=capsule(parent,position,thick,length,thick,color);if(axis==='x')node.rotation.z=Math.PI/2;else if(axis==='z')node.rotation.x=Math.PI/2;return node;}
  function glasses(head,color,{round=false,thick=false}={}){
    const hw=round?.037:.04,hh=round?.034:.024,t=thick?.012:.0055,y=.084,z=.154;
    for(const s of [-1,1]){
      bar(head,[s*.05,y+hh,z],t,hw*2,color);bar(head,[s*.05,y-hh,z],t,hw*2,color);
      bar(head,[s*(.05+hw),y,z-.004],t,hh*2,color,'y');bar(head,[s*(.05-hw),y,z],t,hh*2,color,'y');
      bar(head,[s*.126,y+.006,.08],t,.15,color,'z');
    }
    bar(head,[0,y+.004,z],t,.034,color);
  }
  function dress(spec,head,spine){
    const {skin,hair,name}=spec,dark=tone(skin,.8),sphere=(parent,position,scale,color)=>part('sphere',parent,position,scale,color);
    const eyes=[];
    sphere(head,[0,HEAD.y,HEAD.z],[HEAD.rx,HEAD.ry,HEAD.rz],skin);
    for(const s of [-1,1]){
      sphere(head,[s*.139,.056,-.004],[.022,.034,.02],dark);
      eyes.push(sphere(head,[s*.05,.084,front(s*.05,.084)-.005],[.026,.025,.01],'#efe9df'));
      eyes.push(sphere(head,[s*.05,.082,front(s*.05,.082)+.002],[.015,.019,.008],'#18120f'));
      bar(head,[s*.052,.13,front(s*.052,.13)],.015,.064,spec.brow||hair).rotation.z=Math.PI/2+s*.1;
    }
    sphere(head,[0,.046,front(0,.046)-.002],[.016,.02,.016],dark);
    sphere(head,[0,.002,front(0,.002)-.004],[.034,.009,.012],tone(skin,.6));
    if(name==='MAYA'){
      // Black blunt bob with straight bangs and one green streak, small silver hoops, choker, sage jacket over black.
      sphere(head,[0,.108,-.02],[.156,.136,.158],hair);sphere(head,[0,.168,.058],[.138,.056,.1],hair);
      for(const s of [-1,1]){capsule(head,[s*.13,.02,-.002],.06,.27,.17,hair);sphere(head,[s*.153,0,.002],[.012,.022,.022],'#c9ccd0');}
      capsule(head,[0,.02,-.102],.25,.27,.09,hair);capsule(head,[.118,.05,.07],.016,.24,.024,'#3f8a5c');
      sphere(spine,[0,.5,0],[.05,.014,.05],'#111315');
    }else if(name==='NOA'){
      // Short tousled brown hair, clear glasses, a pencil behind the ear, camel overshirt over cream.
      sphere(head,[0,.112,-.026],[.151,.126,.151],hair);sphere(head,[.03,.178,.07],[.085,.046,.072],hair);sphere(head,[-.075,.165,.055],[.07,.04,.07],hair);
      glasses(head,'#cfc8ba',{round:true});bar(head,[-.152,.105,-.012],.014,.17,'#d98a3a','z').rotation.x=1.15;
      // The cream shirt showing down the open front of the overshirt.
      sphere(spine,[0,.25,.104],[.045,.2,.024],'#e6dac4');
    }else if(name==='JOHN'){
      // Round black afro, thick square glasses, short beard, one silver earring, slate hoodie.
      sphere(head,[0,.19,-.05],[.205,.172,.184],hair);sphere(head,[0,-.036,.058],[.102,.076,.086],'#1c1310');
      glasses(head,'#101214',{thick:true});sphere(head,[-.15,.02,0],[.01,.018,.018],'#c9ccd0');
      sphere(spine,[0,.44,-.1],[.15,.1,.11],spec.color);
      // The front pocket of the hoodie and its two drawstrings.
      sphere(spine,[0,.13,.1],[.12,.055,.035],tone(spec.color,.86));
      for(const s of [-1,1])capsule(spine,[s*.035,.4,.118],.01,.1,.01,'#d8d4cc');
    }else if(name==='LEO'){
      // Navy beanie with a cuff over short brown hair, headphones resting around the neck, blue zip sweater.
      sphere(head,[0,.092,-.02],[.147,.12,.149],hair);sphere(head,[0,.168,-.012],[.158,.112,.158],'#1b2233');sphere(head,[0,.152,-.012],[.163,.036,.163],'#26304a');
      for(const s of [-1,1])sphere(spine,[s*.108,.47,.012],[.036,.062,.052],'#15171a');
      bar(spine,[0,.455,-.072],.03,.25,'#15171a');sphere(spine,[0,.455,0],[.088,.036,.088],tone(spec.color,.8));capsule(spine,[0,.25,.119],.012,.3,.012,'#9aa3ad');
    }else if(name==='NINA'){
      // High top bun, gold hoops and necklace, red blazer over a dark top.
      sphere(head,[0,.106,-.03],[.151,.126,.151],hair);sphere(head,[0,.268,-.03],[.076,.076,.076],hair);
      for(const s of [-1,1])sphere(head,[s*.153,-.006,.002],[.012,.031,.031],'#d6a94a');
      sphere(spine,[0,.446,.03],[.072,.008,.06],'#d6a94a');
    }else{
      // ARI: silver hair swept back, thin dark rectangular glasses, cream turtleneck.
      sphere(head,[0,.11,-.03],[.151,.122,.153],hair);sphere(head,[0,.17,.036],[.112,.046,.088],hair);
      glasses(head,'#2b2a2b');capsule(spine,[0,.5,0],.125,.13,.12,spec.color);
    }
    return eyes.map(node=>({node,y:node.scale.y}));
  }
  for(const [index,spec] of specs.entries()){
    const {skin,pants}=spec,sphere=(parent,position,scale,color)=>part('sphere',parent,position,scale,color);
    const rig=joint(root,...spec.home);rig.name=`agent:${spec.name}`;
    const hips=joint(rig,0,.86),spine=joint(hips,0,.11);
    // One pelvis the legs grow out of, and a torso that narrows from the shoulders to the waist.
    sphere(hips,[0,.04,0],[.135,.1,.105],pants);capsule(hips,[0,.08,0],.29,.16,.21,pants);
    const chest=taper(spine,[0,.25,0],.44,.56,.25,spec.color);
    // Head, face and styling follow each agent's portrait on the room card: the same hair, glasses, accessories and clothes.
    capsule(spine,[0,.53,0],.088,.16,.088,skin);
    const head=joint(spine,0,.66);
    const eyes=dress(spec,head,spine);
    const arms=[],legs=[];
    for(const side of [-1,1]){
      // Round shoulder, elbow and knee caps hide the seams between segments; limbs narrow toward the hands and feet.
      const shoulder=joint(spine,side*.198,.42,0);
      sphere(shoulder,[0,-.035,0],[.056,.058,.06],spec.color);
      taper(shoulder,[0,-.15,0],.105,.36,.108,spec.color);
      const elbow=joint(shoulder,0,-.29);
      sphere(elbow,[0,0,0],[.04,.04,.042],spec.color);
      taper(elbow,[0,-.12,0],.09,.3,.092,spec.color);
      // The hand: a flat palm facing the body, the fingers held together and a little curled, the thumb in front.
      const hand=joint(elbow,0,-.265);
      sphere(hand,[0,-.042,0],[.021,.05,.037],skin);
      capsule(hand,[0,-.092,.006],.019,.065,.034,skin).rotation.x=.2;
      capsule(hand,[0,-.036,.038],.018,.055,.018,skin).rotation.x=-.4;
      arms.push({side,shoulder,elbow,hand});
      const hip=joint(hips,side*.088,0,0);
      taper(hip,[0,-.22,0],.155,.52,.16,pants);
      const knee=joint(hip,0,-.41);
      sphere(knee,[0,0,0],[.05,.05,.052],pants);
      taper(knee,[0,-.17,0],.108,.46,.112,pants);
      // A low sneaker on an ankle that rolls: heel down as the leg reaches forward, toes pushing off behind.
      const ankle=joint(knee,0,-.36);
      capsule(ankle,[0,-.045,.05],.088,.24,.072,shoe).rotation.x=Math.PI/2;
      const foot=sphere(ankle,[0,-.074,.05],[.047,.012,.122],spec.sole||'#d8d2c6');
      legs.push({side,hip,knee,ankle,foot});
    }
    const shadow=part('shadow',rig,[0,.012,0],[.8,.65,1],'#ffffff');shadow.rotation.x=-Math.PI/2;
    const lookYaw=Math.atan2(spec.look[0]-spec.home[0],spec.look[1]-spec.home[2]);rig.rotation.y=lookYaw;
    actors.push({...spec,index,rig,hips,spine,chest,chestY:chest.scale.y,head,eyes,arms,legs,lookYaw,blinkAt:1.5+index*.9,home:new THREE.Vector3(...spec.home),work:new THREE.Vector3(...spec.work),route:null,activityWeight:0,walking:false,stride:0,speed:0,sit:0});
  }
  // The taper is a capsule whose lower end is narrower (0.72 of the top), with the same unit size as the capsule.
  function taperGeometry(){
    const points=[],top=.5,bottom=.36,n=6;
    for(let i=0;i<=n;i++){const a=-Math.PI/2+i/n*Math.PI/2;points.push(new THREE.Vector2(i?bottom*Math.cos(a):0,-.5+.5*Math.sin(a)));}
    for(let i=1;i<=n;i++){const a=i/n*Math.PI/2;points.push(new THREE.Vector2(i<n?top*Math.cos(a):0,.5+.5*Math.sin(a)));}
    return new THREE.LatheGeometry(points,14);
  }
  const geometries={capsule:new THREE.CapsuleGeometry(.5,1,3,8),sphere:new THREE.SphereGeometry(1,18,13),taper:taperGeometry(),shadow:new THREE.PlaneGeometry(1,1)};
  const meshes={};
  for(const kind of Object.keys(parts)){
    const mesh=new THREE.InstancedMesh(geometries[kind],kind==='shadow'?contactMaterial:material,parts[kind].length);
    mesh.name=`AERA_AGENT_${kind.toUpperCase()}`;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);mesh.frustumCulled=false;
    // Dynamic occupants use a soft contact decal; the cached architectural shadow stays static.
    mesh.castShadow=false;mesh.receiveShadow=kind!=='shadow';
    if(kind!=='shadow')parts[kind].forEach((p,i)=>mesh.setColorAt(i,p.color));
    scene.add(mesh);meshes[kind]=mesh;
  }
  const order=['control','think','create','grow','build','control'];
  let selected=null,presentation=false,step=0,presentationPaused=false,userEnabled=true;
  let workflow=null,ambient=true;
  let seed=Math.floor(Math.random()*233280);const random=()=>{seed=(seed*9301+49297)%233280;return seed/233280;};
  let time=0,last=performance.now(),invalid=true,updates=0;
  // Nobody leaves the desk at the same moment.
  actors.forEach((a,i)=>{a.nextWander=5+i*3.3+random()*7;});
  const frameInterval=1000/24;
  // The existing UI motion token: cubic-bezier(.77,0,.175,1).
  function easeInOut(x){let lo=0,hi=1,t=x;for(let i=0;i<12;i++){const v=3*(1-t)*(1-t)*t*.77+3*(1-t)*t*t*.175+t*t*t;if(v<x)lo=t;else hi=t;t=(lo+hi)/2;}return 3*(1-t)*t*t+t*t*t;}
  function enabled(){return userEnabled&&!media.matches;}
  function yawToward(actor,x,z,dt,rate=5){const target=Math.atan2(x,z),difference=Math.atan2(Math.sin(target-actor.rig.rotation.y),Math.cos(target-actor.rig.rotation.y));actor.rig.rotation.y+=difference*(1-Math.exp(-dt*rate));return difference;}
  function footClearance(actor,foot){const e=foot.matrixWorld.elements;return e[13]-Math.hypot(e[1],e[5],e[9])-actor.rig.position.y;}
  function writeInstances(){
    root.updateMatrixWorld(true);
    for(const actor of actors)if(actor.walking){
      const lowest=Math.min(...actor.legs.map(leg=>footClearance(actor,leg.foot)));
      actor.hips.position.y+=.005-lowest;actor.hips.updateMatrixWorld(true);
    }
    for(const kind of Object.keys(parts)){parts[kind].forEach((p,i)=>meshes[kind].setMatrixAt(i,p.node.matrixWorld));meshes[kind].instanceMatrix.needsUpdate=true;}
  }
  // Still poses (reduced motion): standing at rest, or seated with the hands on the keyboard.
  function settle(){for(const a of actors){a.route=null;a.walking=false;a.stride=0;a.speed=0;a.rig.position.copy(a.home);a.rig.rotation.set(0,a.lookYaw,0);a.sit=a.seat?.at==='home'?1:0;const keys=a.activity==='keyboard'?a.sit:0;a.hips.position.set(0,.86-.24*a.sit,0);a.hips.rotation.set(0,0,0);a.spine.rotation.set(.12*keys,0,0);a.chest.scale.y=a.chestY;a.head.rotation.set(.04*keys,0,0);for(const e of a.eyes)e.node.scale.y=e.y;for(const arm of a.arms){arm.shoulder.rotation.set(-.32*keys,0,arm.side*(.08+.06*keys));arm.elbow.rotation.set(-.16-.92*keys,0,0);arm.hand.rotation.set(.25*keys,0,0);}for(const leg of a.legs){leg.hip.rotation.set(-1.42*a.sit,0,0);leg.knee.rotation.set(1.46*a.sit,0,0);leg.ankle.rotation.set(-.04*a.sit,0,0);}}writeInstances();}
  function routeTo(actor,target){
    const distance=actor.rig.position.distanceTo(target);
    if(distance<.008){actor.route=null;return;}
    actor.route={from:actor.rig.position.clone(),to:target.clone(),elapsed:0,done:0,...routeTiming(distance)};
  }
  // Two people can share a room (NOA and JOHN in Create): a named agent in the workflow wins over the room.
  function engagedIn(actor){
    if(!workflow)return false;const names=[workflow.agent,workflow.partner];
    if(names.includes(actor.name))return true;
    const shared=actors.some(o=>o!==actor&&o.zone===actor.zone&&names.includes(o.name));
    return !shared&&(actor.zone===workflow.zone||actor.zone===workflow.partnerZone);
  }
  function peerOf(actor){
    if(!workflow||!engagedIn(actor))return null;
    const other=actor.name===workflow.agent?workflow.partner:actor.name===workflow.partner?workflow.agent:null;
    const zone=actor.zone===workflow.zone?workflow.partnerZone:workflow.zone;
    return actors.find(a=>a.name===other)||actors.find(a=>a!==actor&&a.zone===zone&&engagedIn(a))||null;
  }
  function syncRoutes(){if(!enabled())return;for(const actor of actors){const engaged=workflow?engagedIn(actor):presentation&&actor.zone===order[step];actor.wanderUntil=0;actor.nextWander=time+1.5+random()*4;routeTo(actor,engaged?actor.work:actor.home);}}
  // Ambient circulation: a free point on the actor's own floor, then back home. Never carries material, never looks like a task.
  function wander(actor){
    if(!ambient||workflow||presentation||actor.zone===(selected||null)&&selected!=='all'&&selected)return;
    if(actor.route||time<(actor.nextWander||0))return;
    // Nobody wanders off in the middle of being presented.
    if(actor.greet&&time<actor.greet.until+1)return;
    const floor=floorOfY(actor.home.y);
    if(actor.away){actor.away=false;routeTo(actor,actor.home);return;}
    const point=pickWaypoint(random,floor,[actor.rig.position.x,actor.rig.position.z],{maxDistance:6});
    if(!point){actor.nextWander=time+6;return;}
    actor.away=true;routeTo(actor,new THREE.Vector3(point[0],actor.home.y,point[1]));
  }
  // On the chair: at the seat spot, not strolling, not on the way somewhere.
  function seated(actor){
    if(!actor.seat||actor.away)return false;
    return actor.rig.position.distanceTo(actor.seat.at==='home'?actor.home:actor.work)<.06;
  }
  function invalidate(){invalid=true;onInvalidate();}
  function mediaChanged(){last=performance.now();if(media.matches)settle();else syncRoutes();invalidate();}
  media.addEventListener('change',mediaChanged);
  settle();
  function update(now,force=false){
    if(!enabled()||presentationPaused){last=now;if(invalid){invalid=false;return true;}return false;}
    if(!force&&!invalid&&now-last<frameInterval)return false;
    const dt=Math.min(.1,Math.max(0,(now-last)/1000));last=now;time+=dt;invalid=false;updates++;
    for(const actor of actors){
      wander(actor);
      let gait=0,speedEnvelope=0;
      if(actor.route){
        // Turn towards the path first, then walk it at a steady pace; the stride follows the ground actually covered.
        const route=actor.route,off=yawToward(actor,route.to.x-route.from.x,route.to.z-route.from.z,dt,route.elapsed?6:4.5);
        // Seated people stand up before the first step.
        if(route.elapsed||(Math.abs(off)<.45&&actor.sit<.12))route.elapsed+=dt;
        const covered=routeProgress(route,route.elapsed),step=covered-route.done;route.done=covered;
        actor.rig.position.lerpVectors(route.from,route.to,covered/route.length);
        actor.speed=dt>0?step/dt:0;speedEnvelope=Math.min(1,actor.speed/WALK_SPEED);
        actor.stride+=step/STRIDE_LENGTH*Math.PI*2;gait=Math.sin(actor.stride)*speedEnvelope;
        if(route.elapsed>=route.duration){actor.route=null;actor.speed=0;actor.rig.position.copy(route.to);actor.nextWander=time+(actor.away?6+random()*9:16+random()*22);}
      }else if(seated(actor)){yawToward(actor,actor.seat.look[0]-actor.rig.position.x,actor.seat.look[1]-actor.rig.position.z,dt);
      }else if(actor.greet&&time<actor.greet.until){yawToward(actor,actor.greet.x-actor.rig.position.x,actor.greet.z-actor.rig.position.z,dt,4);
      }else{const peer=peerOf(actor);const lookX=actor.away?actor.rig.position.x+Math.sin(time*.3+actor.index):(peer?.rig.position.x??actor.look[0]),lookZ=actor.away?actor.rig.position.z+Math.cos(time*.3+actor.index):(peer?.rig.position.z??actor.look[1]);yawToward(actor,lookX-actor.rig.position.x,lookZ-actor.rig.position.z,dt);}
      actor.walking=!!actor.route;
      if(!actor.route&&!actor.away&&!workflow&&!presentation&&actor.rig.position.distanceTo(actor.home)>.05)routeTo(actor,actor.home);
      const inConversation=engagedIn(actor);
      const active=(workflow?inConversation:actor.zone===(presentation?order[step]:selected))&&!actor.walking;
      actor.activityWeight=THREE.MathUtils.damp(actor.activityWeight,active?1:0,5,dt);
      const work=actor.activityWeight,phase=time+actor.index*2.17;
      const breathe=Math.sin(phase*1.2);
      actor.sit=THREE.MathUtils.damp(actor.sit,!actor.route&&seated(actor)?1:0,3.2,dt);const sit=actor.sit*actor.sit*(3-2*actor.sit);
      // What the body is doing, as weights from 0 to 1. Seated at a keyboard the hands rest on the keys (the room sound
      // types there too); a room at work adds the activity on top: quicker keys, talking hands, pointing at the board.
      const keys=actor.activity==='keyboard'&&!inConversation?sit:0;
      const talking=(inConversation||actor.activity==='conversation'||actor.activity==='direction')?work*(1-keys):0;
      // At the board (MAYA, NOA): now and then one hand comes up and points at a card, then drops again.
      const raise=Math.max(0,Math.sin(phase*.45)),pointing=actor.activity==='table'&&!inConversation?work*(1-sit)*raise*raise*(3-2*raise):0;
      // Standing still, the weight drifts slowly from one leg to the other; the upper body stays over the feet.
      const shift=Math.sin(phase*.21)*(1-sit)*(1-speedEnvelope);
      actor.hips.position.x=.02*shift;
      actor.hips.position.y=.86-.24*sit+Math.abs(Math.cos(actor.stride))*.018*speedEnvelope;
      // Walking, the pelvis turns with the leading leg and the shoulders turn against it.
      actor.hips.rotation.set(0,gait*.09,.035*shift);
      actor.spine.rotation.x=-.025*talking+.012*breathe+.06*speedEnvelope+.13*keys;
      actor.spine.rotation.z=.01*Math.sin(phase*.65)-.045*shift-gait*.015;
      actor.spine.rotation.y=-gait*.17;
      actor.chest.scale.y=actor.chestY*(1+.012*breathe);
      const nod=talking*.06*Math.max(0,Math.sin(phase*2.3))**3;
      actor.head.rotation.y=(.085*Math.sin(phase*.7)+work*.055*Math.sin(phase*1.3))*(1-speedEnvelope)+gait*.08;
      actor.head.rotation.x=.025*Math.sin(phase*.9)+.03*work+.05*keys-.05*pointing+nod;
      // A blink every few seconds, two or three frames long.
      if(time>actor.blinkAt+.14)actor.blinkAt=time+2.2+random()*4.5;
      const shut=time>actor.blinkAt?.12:1;for(const e of actor.eyes)e.node.scale.y=e.y*shut;
      for(const arm of actor.arms){
        const side=arm.side,swing=-gait*side*.3;
        // At rest the arms hang a little away from the body, elbows soft; walking, they swing against the legs and
        // the forearm bends as the arm comes forward.
        let sx=swing,sz=side*.08,ex=-.16-.5*Math.max(0,-swing),hx=.06,hz=0;
        const blend=(w,s1,s2,e1,h1)=>{if(w<=0)return;sx+=(s1-sx)*w;sz+=(side*s2-sz)*w;ex+=(e1-ex)*w;hx+=(h1-hx)*w;};
        // Keys: forearms forward over the desk, wrists down, fingers tapping faster when the room is at work.
        const tap=Math.sin(phase*(7+2*work)+side*1.9)*Math.max(0,Math.sin(phase*.9+side));
        blend(keys,-.32,.14,-1.08,.28+.1*tap*(.5+.5*work));
        // Talking: the hands come up and move on the beats of the sentence, the leading hand more than the other.
        const beat=Math.max(0,Math.sin(phase*1.15+(side>0?0:2.2))),lead=side>0?1:.55;
        blend(talking,-(.22+.3*beat)*lead,.12+.1*beat,-(.85+.4*beat)*lead-.2,-.15*beat);
        // Leaning over the table: arms straight down to it, palms flat.
        if(side<0)blend(pointing,-1.25,.06,-.18,-.1);else blend(pointing,-.12,.1,-.4,.05);
        arm.shoulder.rotation.x=sx;arm.shoulder.rotation.z=sz;arm.elbow.rotation.x=ex;arm.hand.rotation.set(hx,0,hz);
      }
      for(const leg of actor.legs){
        const s=leg.side,free=Math.max(0,s*shift),stride=gait*s;
        // The leg that carries less weight relaxes at the knee; walking, the knee folds on the swing forward.
        const hx=stride*.36-1.42*sit-.06*free,kx=Math.max(0,-stride)*.62+.06*speedEnvelope+1.46*sit+.13*free;
        leg.hip.rotation.set(hx,0,-.06*shift);leg.knee.rotation.x=kx;
        // The shoe stays level with the floor, rolling onto the toes behind and onto the heel in front.
        leg.ankle.rotation.set(-(hx+kx)+.55*Math.max(0,stride)-.22*Math.max(0,-stride)*speedEnvelope,0,.06*shift);
      }
      // Being presented: a short wave of the right hand toward the camera, and the head turned to it. Standing people
      // turn their body; seated ones only turn the head. It stops if they start walking.
      const g=actor.greet,greeting=g&&time<g.until+.6&&!actor.walking;
      const wave=greeting?Math.min(1,(time-g.start)/.45)*Math.min(1,Math.max(0,(g.until+.6-time)/.6)):0;
      actor.greetWeight=THREE.MathUtils.damp(actor.greetWeight||0,wave,9,dt);
      const w=actor.greetWeight*actor.greetWeight*(3-2*actor.greetWeight);
      if(w>.002){
        const right=actor.arms.find(a=>a.side===-1),swing=Math.sin((time-g.start)*7.5);
        right.shoulder.rotation.x=THREE.MathUtils.lerp(right.shoulder.rotation.x,-.35,w);
        right.shoulder.rotation.z=THREE.MathUtils.lerp(right.shoulder.rotation.z,-2.55,w);
        right.elbow.rotation.x=THREE.MathUtils.lerp(right.elbow.rotation.x,-.25,w);
        right.elbow.rotation.z=-.5*w+.38*w*swing;
        const toCamera=Math.atan2(g.x-actor.rig.position.x,g.z-actor.rig.position.z),turn=Math.atan2(Math.sin(toCamera-actor.rig.rotation.y),Math.cos(toCamera-actor.rig.rotation.y));
        actor.head.rotation.y=THREE.MathUtils.lerp(actor.head.rotation.y,THREE.MathUtils.clamp(turn,-.9,.9),w);
        actor.head.rotation.z=.08*w*Math.sin((time-g.start)*1.6);actor.spine.rotation.y=THREE.MathUtils.clamp(turn,-.35,.35)*w*(sit>.5?1:.3);
      }else{for(const arm of actor.arms)arm.elbow.rotation.z=0;actor.head.rotation.z=0;if(g&&time>g.until+1)actor.greet=null;}
    }
    writeInstances();return true;
  }
  return {
    update,
    // NAYRA is presenting this agent and the camera is at (x, z): the agent turns to it and waves for a few seconds.
    // A stroll is only ambient: it stops where it is so the wave happens. A walk that belongs to a real task goes on.
    greet(name,x,z,seconds=3.2){
      const a=actors.find(o=>o.name===name);if(!a||!enabled())return false;
      if(a.route&&!workflow&&!presentation){a.route=null;a.speed=0;a.walking=false;a.away=true;a.nextWander=time+seconds+4;}
      a.greet={start:time,until:time+seconds,x,z};invalidate();return true;
    },
    select(zone){selected=zone;invalidate();},
    setPresentation(active,nextStep=0){const changed=presentation!==active||step!==nextStep;presentation=active;step=Math.max(0,Math.min(5,nextStep));if(!active)presentationPaused=false;if(changed)syncRoutes();invalidate();},
    setPresentationPaused(value){presentationPaused=!!value;last=performance.now();invalidate();},
    // Only a real change of task moves people; clearing an empty workflow (which happens whenever NAYRA names someone)
    // must not send everyone walking back to their desks.
    setWorkflow(value){if(!value&&!workflow){presentationPaused=false;return;}workflow=value;presentationPaused=false;for(const a of actors)a.away=false;syncRoutes();invalidate();},
    setAmbient(value){ambient=!!value;if(!ambient)for(const a of actors){a.away=false;if(!workflow&&!presentation)routeTo(a,a.home);}invalidate();return ambient;},
    // Keyed by room (first occupant) and by name, so a shared room can still point at the right person.
    // Rooms where someone is seated at a keyboard right now: the only places the ambient sound plays typing.
    typingZones(){return [...new Set(actors.filter(a=>a.activity==='keyboard'&&a.sit>.5).map(a=>a.zone))];},
    // Where an agent's head is and which way the body faces: used to frame a close-up.
    headOf(name){const a=actors.find(x=>x.name===name);if(!a)return null;root.updateMatrixWorld(true);const p=a.head.getWorldPosition(new THREE.Vector3());return {head:p.toArray(),yaw:a.rig.rotation.y};},
    anchors(){const out={};for(const a of actors){const p=[a.rig.position.x,a.rig.position.y+2.05,a.rig.position.z];out[a.name]=p;if(!out[a.zone])out[a.zone]=p;}return out;},
    setEnabled(value){userEnabled=!!value;last=performance.now();if(enabled())syncRoutes();invalidate();return this.state();},
    state(){return {enabled:enabled(),userEnabled,reducedMotion:media.matches,paused:presentationPaused,rate:24,ambient,away:actors.filter(a=>a.away).map(a=>a.name)};},
    diagnostics(){return {...this.state(),presentation,step,workflow,updates,clock:+time.toFixed(3),drawCalls:Object.keys(parts).length,actors:actors.map(a=>({name:a.name,zone:a.zone,position:a.rig.position.toArray(),home:a.home.toArray(),walking:a.walking,speed:+a.speed.toFixed(3),sit:+a.sit.toFixed(2),greet:+(a.greetWeight||0).toFixed(2),footClearance:a.legs.map(leg=>+footClearance(a,leg.foot).toFixed(4)),head:a.head.rotation.toArray().slice(0,3),activity:+a.activityWeight.toFixed(3)}))};}
  };
}
