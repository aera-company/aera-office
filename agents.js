import * as THREE from 'three';
import {pickWaypoint,floorOfY,routeTiming,routeProgress,WALK_SPEED,STRIDE_LENGTH} from './stations.js';

// Architectural occupants, not autonomous agents. Their choreography is predefined.
// Two layers of motion: ambient circulation (no task) and execution (driven by server events via setWorkflow).
// Shared instanced geometry keeps six articulated rigs to three draw calls.
export function createAgentTeam({scene, contactMaterial, onInvalidate=()=>{}}) {
  const media=matchMedia('(prefers-reduced-motion: reduce)');
  const root=new THREE.Group();root.name='AERA_PROPOSED_AGENTS';scene.add(root);
  const parts={capsule:[],sphere:[],shadow:[]},actors=[];
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
    {name:'NINA',zone:'grow',home:[3.3,.79,.5],work:[4.1,.79,-2.3],look:[5.7,-.25],seat:{at:'work',look:[4.1,-3.3]},color:'#a63f35',activity:'conversation',skin:'#8f5f42',hair:'#17110e',style:'bun',pants:'#26221f'},
    // ARI lives on the Comando floor: in front of the presentation wall at rest, at the head of the long table when a job runs.
    {name:'ARI',zone:'control',home:[.5,9.35,-4.35],work:[-4.0,9.35,-1.2],look:[.5,-1.2],color:'#d9d2c3',activity:'direction',skin:'#d6b396',hair:'#9a9792',style:'short',pants:'#2a3238'}
  ];
  const shoe='#1c2327';
  function joint(parent,x=0,y=0,z=0){const node=new THREE.Object3D();node.position.set(x,y,z);parent.add(node);return node;}
  function part(kind,parent,position,scale,color){const node=joint(parent,...position);node.scale.set(...scale);parts[kind].push({node,color:new THREE.Color(color)});return node;}
  function capsule(parent,position,w,h,d,color){return part('capsule',parent,position,[w,h/2,d],color);}
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
    sphere(head,[0,HEAD.y,HEAD.z],[HEAD.rx,HEAD.ry,HEAD.rz],skin);
    for(const s of [-1,1]){
      sphere(head,[s*.139,.056,-.004],[.022,.034,.02],dark);
      sphere(head,[s*.05,.084,front(s*.05,.084)-.005],[.026,.025,.01],'#efe9df');
      sphere(head,[s*.05,.082,front(s*.05,.082)+.002],[.015,.019,.008],'#18120f');
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
    }else if(name==='JOHN'){
      // Round black afro, thick square glasses, short beard, one silver earring, slate hoodie.
      sphere(head,[0,.19,-.05],[.205,.172,.184],hair);sphere(head,[0,-.036,.058],[.102,.076,.086],'#1c1310');
      glasses(head,'#101214',{thick:true});sphere(head,[-.15,.02,0],[.01,.018,.018],'#c9ccd0');
      sphere(spine,[0,.44,-.1],[.15,.1,.11],spec.color);
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
      glasses(head,'#2b2a2b');capsule(spine,[0,.455,0],.125,.13,.12,spec.color);
    }
  }
  for(const [index,spec] of specs.entries()){
    const {skin,pants,hair}=spec;
    const rig=joint(root,...spec.home);rig.name=`agent:${spec.name}`;
    const hips=joint(rig,0,.86),spine=joint(hips,0,.11);
    capsule(hips,[0,.035,0],.28,.23,.22,pants);
    const chest=capsule(spine,[0,.22,0],.37,.52,.24,spec.color);
    // Head, face and styling follow each agent's portrait on the room card: the same hair, glasses, accessories and clothes.
    capsule(spine,[0,.5,0],.075,.2,.075,skin);
    const head=joint(spine,0,.66);
    dress(spec,head,spine);
    const arms=[],legs=[];
    for(const side of [-1,1]){
      const shoulder=joint(spine,side*.225,.40,0);
      capsule(shoulder,[0,-.14,0],.09,.28,.095,spec.color);
      const elbow=joint(shoulder,0,-.28);
      capsule(elbow,[0,-.135,0],.075,.27,.08,spec.color);
      part('sphere',elbow,[0,-.30,0],[.042,.065,.035],skin);
      arms.push({side,shoulder,elbow});
      const hip=joint(hips,side*.09,0,0);
      capsule(hip,[0,-.205,0],.115,.41,.13,pants);
      const knee=joint(hip,0,-.41);
      capsule(knee,[0,-.205,0],.08,.41,.085,pants);
      const foot=part('sphere',knee,[0,-.39,.065],[.073,.055,.14],shoe);
      legs.push({side,hip,knee,foot});
    }
    const shadow=part('shadow',rig,[0,.012,0],[.8,.65,1],'#ffffff');shadow.rotation.x=-Math.PI/2;
    const lookYaw=Math.atan2(spec.look[0]-spec.home[0],spec.look[1]-spec.home[2]);rig.rotation.y=lookYaw;
    actors.push({...spec,index,rig,hips,spine,chest,head,arms,legs,lookYaw,home:new THREE.Vector3(...spec.home),work:new THREE.Vector3(...spec.work),route:null,activityWeight:0,walking:false,stride:0,speed:0,sit:0});
  }
  const geometries={capsule:new THREE.CapsuleGeometry(.5,1,3,8),sphere:new THREE.SphereGeometry(1,18,13),shadow:new THREE.PlaneGeometry(1,1)};
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
  function settle(){for(const a of actors){a.route=null;a.walking=false;a.stride=0;a.speed=0;a.rig.position.copy(a.home);a.rig.rotation.set(0,a.lookYaw,0);a.sit=a.seat?.at==='home'?1:0;a.hips.position.y=.86-.24*a.sit;a.spine.rotation.set(0,0,0);a.chest.scale.y=.26;a.head.rotation.set(0,0,0);for(const arm of a.arms){arm.shoulder.rotation.set(0,0,arm.side*.07);arm.elbow.rotation.set(-.12,0,0);}for(const leg of a.legs){leg.hip.rotation.set(-1.42*a.sit,0,0);leg.knee.rotation.set(1.46*a.sit,0,0);}}writeInstances();}
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
      }else{const peer=peerOf(actor);const lookX=actor.away?actor.rig.position.x+Math.sin(time*.3+actor.index):(peer?.rig.position.x??actor.look[0]),lookZ=actor.away?actor.rig.position.z+Math.cos(time*.3+actor.index):(peer?.rig.position.z??actor.look[1]);yawToward(actor,lookX-actor.rig.position.x,lookZ-actor.rig.position.z,dt);}
      actor.walking=!!actor.route;
      if(!actor.route&&!actor.away&&!workflow&&!presentation&&actor.rig.position.distanceTo(actor.home)>.05)routeTo(actor,actor.home);
      const inConversation=engagedIn(actor);
      const active=(workflow?inConversation:actor.zone===(presentation?order[step]:selected))&&!actor.walking;
      actor.activityWeight=THREE.MathUtils.damp(actor.activityWeight,active?1:0,5,dt);
      const work=actor.activityWeight,phase=time+actor.index*2.17;
      const breathe=Math.sin(phase*1.2);
      actor.sit=THREE.MathUtils.damp(actor.sit,!actor.route&&seated(actor)?1:0,3.2,dt);const sit=actor.sit*actor.sit*(3-2*actor.sit);
      actor.hips.position.y=.86-.24*sit+Math.abs(Math.cos(actor.stride))*.014*speedEnvelope;
      actor.spine.rotation.x=-.025*work+.012*breathe+.035*speedEnvelope;
      actor.spine.rotation.z=.01*Math.sin(phase*.65)+gait*.018;
      actor.chest.scale.y=.26*(1+.012*breathe);
      actor.head.rotation.y=(.085*Math.sin(phase*.7)+work*.055*Math.sin(phase*1.3))*(1-speedEnvelope);
      actor.head.rotation.x=.025*Math.sin(phase*.9)+work*.03;
      for(const arm of actor.arms){
        const side=arm.side,typing=actor.activity==='keyboard'&&!inConversation,conversing=inConversation||actor.activity==='conversation'||actor.activity==='direction';
        const gesture=conversing?(side===1?.45:.1):.18;
        arm.shoulder.rotation.x=-gait*side*.24-work*gesture;
        arm.shoulder.rotation.z=side*(.07+work*.055);
        arm.elbow.rotation.x=-.12-work*(typing?.95:conversing?.85:.7)+work*.04*Math.sin(phase*(typing?4.2:1.7)+side);
      }
      for(const leg of actor.legs){leg.hip.rotation.x=gait*leg.side*.32-1.42*sit;leg.knee.rotation.x=Math.max(0,-gait*leg.side)*.48+1.46*sit;}
    }
    writeInstances();return true;
  }
  return {
    update,
    select(zone){selected=zone;invalidate();},
    setPresentation(active,nextStep=0){const changed=presentation!==active||step!==nextStep;presentation=active;step=Math.max(0,Math.min(5,nextStep));if(!active)presentationPaused=false;if(changed)syncRoutes();invalidate();},
    setPresentationPaused(value){presentationPaused=!!value;last=performance.now();invalidate();},
    setWorkflow(value){workflow=value;presentationPaused=false;for(const a of actors)a.away=false;syncRoutes();invalidate();},
    setAmbient(value){ambient=!!value;if(!ambient)for(const a of actors){a.away=false;if(!workflow&&!presentation)routeTo(a,a.home);}invalidate();return ambient;},
    // Keyed by room (first occupant) and by name, so a shared room can still point at the right person.
    // Rooms where someone is seated at a keyboard right now: the only places the ambient sound plays typing.
    typingZones(){return [...new Set(actors.filter(a=>a.activity==='keyboard'&&a.sit>.5).map(a=>a.zone))];},
    // Where an agent's head is and which way the body faces: used to frame a close-up.
    headOf(name){const a=actors.find(x=>x.name===name);if(!a)return null;root.updateMatrixWorld(true);const p=a.head.getWorldPosition(new THREE.Vector3());return {head:p.toArray(),yaw:a.rig.rotation.y};},
    anchors(){const out={};for(const a of actors){const p=[a.rig.position.x,a.rig.position.y+2.05,a.rig.position.z];out[a.name]=p;if(!out[a.zone])out[a.zone]=p;}return out;},
    setEnabled(value){userEnabled=!!value;last=performance.now();if(enabled())syncRoutes();invalidate();return this.state();},
    state(){return {enabled:enabled(),userEnabled,reducedMotion:media.matches,paused:presentationPaused,rate:24,ambient,away:actors.filter(a=>a.away).map(a=>a.name)};},
    diagnostics(){return {...this.state(),presentation,step,workflow,updates,clock:+time.toFixed(3),drawCalls:3,actors:actors.map(a=>({name:a.name,zone:a.zone,position:a.rig.position.toArray(),home:a.home.toArray(),walking:a.walking,speed:+a.speed.toFixed(3),sit:+a.sit.toFixed(2),footClearance:a.legs.map(leg=>+footClearance(a,leg.foot).toFixed(4)),head:a.head.rotation.toArray().slice(0,3),activity:+a.activityWeight.toFixed(3)}))};}
  };
}
