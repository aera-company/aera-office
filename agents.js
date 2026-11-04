import * as THREE from 'three';
import {pickWaypoint,floorOfY} from './stations.js';

// Architectural occupants, not autonomous agents. Their choreography is predefined.
// Two layers of motion: ambient circulation (no task) and execution (driven by server events via setWorkflow).
// Shared instanced geometry keeps five articulated rigs to three draw calls.
export function createAgentTeam({scene, contactMaterial, onInvalidate=()=>{}}) {
  const media=matchMedia('(prefers-reduced-motion: reduce)');
  const root=new THREE.Group();root.name='AERA_PROPOSED_AGENTS';scene.add(root);
  const parts={capsule:[],sphere:[],shadow:[]},actors=[];
  const material=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.87,metalness:0});
  const specs=[
    {name:'MAYA',zone:'think',home:[-3.0,5.07,1.55],work:[-3.0,5.07,.4],look:[-5.8,-.7],color:'#59665c',activity:'table'},
    {name:'NOA',zone:'create',home:[3.0,5.07,2.65],work:[3.0,5.07,1.4],look:[5.6,.7],color:'#99866c',activity:'table'},
    // JOHN shares the Create room with NOA: his own desk at the back wall, the worktable when a batch or a review involves him.
    {name:'JOHN',zone:'create',home:[7.6,5.07,-2.3],work:[8.6,5.07,.7],look:[7.6,-4.2],color:'#5c5a66',activity:'keyboard'},
    {name:'LEO',zone:'build',home:[-6.05,.79,2.8],work:[-6.05,.79,1.6],look:[-7.6,1.1],color:'#405662',activity:'keyboard'},
    // ARI lives on the Comando floor: in front of the presentation wall at rest, at the head of the long table when a job runs.
    {name:'ARI',zone:'control',home:[.5,9.35,-4.35],work:[-4.0,9.35,-1.2],look:[.5,-1.2],color:'#d9d2c3',activity:'direction'}
  ];
  const skin='#b9a891',pants='#29373e',shoe='#202b30';
  function joint(parent,x=0,y=0,z=0){const node=new THREE.Object3D();node.position.set(x,y,z);parent.add(node);return node;}
  function part(kind,parent,position,scale,color){const node=joint(parent,...position);node.scale.set(...scale);parts[kind].push({node,color:new THREE.Color(color)});return node;}
  function capsule(parent,position,w,h,d,color){return part('capsule',parent,position,[w,h/2,d],color);}
  for(const [index,spec] of specs.entries()){
    const rig=joint(root,...spec.home);rig.name=`agent:${spec.name}`;
    const hips=joint(rig,0,.86),spine=joint(hips,0,.11);
    capsule(hips,[0,.035,0],.28,.23,.22,pants);
    const chest=capsule(spine,[0,.22,0],.37,.52,.24,spec.color);
    capsule(spine,[0,.49,0],.09,.12,.09,skin);
    const head=joint(spine,0,.61);
    part('sphere',head,[0,.045,.015],[.115,.135,.12],skin);
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
    actors.push({...spec,index,rig,hips,spine,chest,head,arms,legs,lookYaw,home:new THREE.Vector3(...spec.home),work:new THREE.Vector3(...spec.work),route:null,activityWeight:0,walking:false,stride:0});
  }
  const geometries={capsule:new THREE.CapsuleGeometry(.5,1,3,8),sphere:new THREE.SphereGeometry(1,10,7),shadow:new THREE.PlaneGeometry(1,1)};
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
  const frameInterval=1000/24;
  // The existing UI motion token: cubic-bezier(.77,0,.175,1).
  function easeInOut(x){let lo=0,hi=1,t=x;for(let i=0;i<12;i++){const v=3*(1-t)*(1-t)*t*.77+3*(1-t)*t*t*.175+t*t*t;if(v<x)lo=t;else hi=t;t=(lo+hi)/2;}return 3*(1-t)*t*t+t*t*t;}
  function enabled(){return userEnabled&&!media.matches;}
  function yawToward(actor,x,z,dt){const target=Math.atan2(x,z),difference=Math.atan2(Math.sin(target-actor.rig.rotation.y),Math.cos(target-actor.rig.rotation.y));actor.rig.rotation.y+=difference*(1-Math.exp(-dt*8));}
  function footClearance(actor,foot){const e=foot.matrixWorld.elements;return e[13]-Math.hypot(e[1],e[5],e[9])-actor.rig.position.y;}
  function writeInstances(){
    root.updateMatrixWorld(true);
    for(const actor of actors)if(actor.walking){
      const lowest=Math.min(...actor.legs.map(leg=>footClearance(actor,leg.foot)));
      actor.hips.position.y+=.005-lowest;actor.hips.updateMatrixWorld(true);
    }
    for(const kind of Object.keys(parts)){parts[kind].forEach((p,i)=>meshes[kind].setMatrixAt(i,p.node.matrixWorld));meshes[kind].instanceMatrix.needsUpdate=true;}
  }
  function settle(){for(const a of actors){a.route=null;a.walking=false;a.stride=0;a.rig.position.copy(a.home);a.rig.rotation.set(0,a.lookYaw,0);a.hips.position.y=.86;a.spine.rotation.set(0,0,0);a.chest.scale.y=.26;a.head.rotation.set(0,0,0);for(const arm of a.arms){arm.shoulder.rotation.set(0,0,arm.side*.07);arm.elbow.rotation.set(-.12,0,0);}for(const leg of a.legs){leg.hip.rotation.set(0,0,0);leg.knee.rotation.set(0,0,0);}}writeInstances();}
  function routeTo(actor,target){
    const distance=actor.rig.position.distanceTo(target);
    if(distance<.008){actor.route=null;return;}
    actor.route={from:actor.rig.position.clone(),to:target.clone(),start:time,duration:Math.max(1.6,Math.min(3.4,distance/.48))};
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
    if(actor.away){actor.away=false;routeTo(actor,actor.home);actor.nextWander=time+8+random()*10;return;}
    const point=pickWaypoint(random,floor,[actor.rig.position.x,actor.rig.position.z]);
    if(!point){actor.nextWander=time+6;return;}
    actor.away=true;routeTo(actor,new THREE.Vector3(point[0],actor.home.y,point[1]));actor.nextWander=time+3+random()*5;
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
        const route=actor.route,t=Math.min(1,(time-route.start)/route.duration),p=easeInOut(t);
        actor.rig.position.lerpVectors(route.from,route.to,p);
        speedEnvelope=Math.sin(Math.PI*t);actor.stride+=dt*7.5;gait=Math.sin(actor.stride)*speedEnvelope;
        yawToward(actor,route.to.x-route.from.x,route.to.z-route.from.z,dt);
        if(t===1){actor.route=null;actor.rig.position.copy(route.to);}
      }else{const peer=peerOf(actor);const lookX=actor.away?actor.rig.position.x+Math.sin(time*.3+actor.index):(peer?.rig.position.x??actor.look[0]),lookZ=actor.away?actor.rig.position.z+Math.cos(time*.3+actor.index):(peer?.rig.position.z??actor.look[1]);yawToward(actor,lookX-actor.rig.position.x,lookZ-actor.rig.position.z,dt);}
      actor.walking=!!actor.route;
      if(!actor.route&&!actor.away&&!workflow&&!presentation&&actor.rig.position.distanceTo(actor.home)>.05)routeTo(actor,actor.home);
      const inConversation=engagedIn(actor);
      const active=(workflow?inConversation:actor.zone===(presentation?order[step]:selected))&&!actor.walking;
      actor.activityWeight=THREE.MathUtils.damp(actor.activityWeight,active?1:0,5,dt);
      const work=actor.activityWeight,phase=time+actor.index*2.17;
      const breathe=Math.sin(phase*1.2);
      actor.hips.position.y=.86+Math.abs(Math.sin(actor.stride*2))*.012*speedEnvelope;
      actor.spine.rotation.x=-.025*work+.012*breathe;
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
      for(const leg of actor.legs){leg.hip.rotation.x=gait*leg.side*.32;leg.knee.rotation.x=Math.max(0,-gait*leg.side)*.48;}
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
    anchors(){const out={};for(const a of actors){const p=[a.rig.position.x,a.rig.position.y+2.05,a.rig.position.z];out[a.name]=p;if(!out[a.zone])out[a.zone]=p;}return out;},
    setEnabled(value){userEnabled=!!value;last=performance.now();if(enabled())syncRoutes();invalidate();return this.state();},
    state(){return {enabled:enabled(),userEnabled,reducedMotion:media.matches,paused:presentationPaused,rate:24,ambient,away:actors.filter(a=>a.away).map(a=>a.name)};},
    diagnostics(){return {...this.state(),presentation,step,workflow,updates,clock:+time.toFixed(3),drawCalls:3,actors:actors.map(a=>({name:a.name,zone:a.zone,position:a.rig.position.toArray(),home:a.home.toArray(),walking:a.walking,footClearance:a.legs.map(leg=>+footClearance(a,leg.foot).toFixed(4)),head:a.head.rotation.toArray().slice(0,3),activity:+a.activityWeight.toFixed(3)}))};}
  };
}
