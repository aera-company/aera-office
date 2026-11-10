import * as THREE from 'three';
import {createAgentTeam} from './agents.js';
import {floorSpecs,roomSpecs,moveWithinFloor} from './navigation.js';
import {layoutStations} from './stations.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import {createSky,buildLeblon,HAZE,toWorld} from './leblon.js';

// Real procedural architecture. No AI services, panorama geometry or remote assets.
export async function createOffice({selectZone,onFailure,onQuality,onNavigation=()=>{},onInteraction=()=>{},onStation=()=>{}}) {
  const stage = document.querySelector('#scene');
  const renderer = new THREE.WebGLRenderer({antialias:true,powerPreference:'high-performance',preserveDrawingBuffer:false});
  const scene = new THREE.Scene();
  // Blue hour on the shoreline: a sky dome with the last warm band to the west; the fog takes the horizon haze.
  scene.background = new THREE.Color(HAZE);
  scene.fog = new THREE.Fog(HAZE,55,400);
  const sky = createSky();scene.add(sky.mesh);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.08;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.shadowMap.autoUpdate = false;
  let lowQuality = false, paused = false, failed = false;
  let width = innerWidth, height = innerHeight;
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1,1.5));
  renderer.setSize(width,height);
  renderer.domElement.setAttribute('aria-hidden','true');
  stage.append(renderer.domElement);
  // On a phone the intro text sits over the brightest part of the sky; a soft scrim keeps it readable.
  const scrim=document.createElement('div');scrim.setAttribute('aria-hidden','true');
  scrim.style.cssText='position:absolute;inset:0;pointer-events:none;opacity:0;transition:opacity .6s ease;background:linear-gradient(180deg,rgba(8,12,16,.78) 0%,rgba(8,12,16,.6) 46%,rgba(8,12,16,0) 74%)';stage.append(scrim);
  renderer.domElement.addEventListener('webglcontextlost', e => {e.preventDefault();failed=true;onFailure('A renderização 3D foi interrompida. Recarregue a página ou abra a apresentação offline.');});
  const camera = new THREE.PerspectiveCamera(36,width/height,.2,1600);
  camera.position.set(40,12.5,36);
  const controls = new OrbitControls(camera,renderer.domElement);
  controls.target.set(0,6,0);
  controls.enableDamping = true;
  controls.dampingFactor = .075;
  controls.enablePan = false;
  controls.rotateSpeed = .55;
  controls.zoomSpeed = .7;
  controls.minDistance = 12;
  controls.maxDistance = 100;
  // The orbit stays on the plaza and seafront side, where the camera has room and the facade reads.
  controls.minAzimuthAngle = -1.75;controls.maxAzimuthAngle = 1.75;
  controls.minPolarAngle = Math.PI/6;
  controls.maxPolarAngle = Math.PI/2.03;
  controls.update();
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const environment = pmrem.fromScene(room,.04);
  scene.environment = environment.texture;
  scene.environmentIntensity = .34;
  room.dispose();pmrem.dispose();
  scene.add(new THREE.HemisphereLight('#b2c9df','#44331f',.72));
  const moon = new THREE.DirectionalLight('#a9c3dc',.95);
  moon.position.set(-13,26,17);moon.castShadow=true;
  moon.shadow.mapSize.set(2048,2048);
  Object.assign(moon.shadow.camera,{left:-23,right:23,top:21,bottom:-18,near:1,far:70});
  moon.shadow.bias=-.00035;moon.shadow.normalBias=.035;
  scene.add(moon);
  const sunset = new THREE.DirectionalLight('#ffc09a',1.35);
  sunset.position.set(-30,7,-22);scene.add(sunset);
  const rim = new THREE.DirectionalLight('#f3c9a0',.55);
  rim.position.set(22,8,-10);scene.add(rim);
  const interiorLights=[];
  for (const x of [-5.5,5.5]) {
    const light = new THREE.PointLight('#ffc283',185,17,2);light.position.set(x,7.9,0);scene.add(light);
    const lower = new THREE.PointLight('#ffb96d',165,15,2);lower.position.set(x,3.8,0);scene.add(lower);
    const command = new THREE.PointLight('#ffc99a',175,17,2);command.position.set(x*.7,12.2,-.6);scene.add(command);
    interiorLights.push(light,lower,command);
  }
  for(const light of interiorLights)light.userData.full=light.intensity;
  const materials = {};
  function material(name,color,roughness=.7,metalness=0,extra={}) {return materials[name]=new THREE.MeshStandardMaterial({color,roughness,metalness,...extra});}
  const steel = material('steel','#273237',.32,.75);
  const trim = material('trim','#546065',.35,.65);
  const oak = material('oak','#92663b',.65,.04,{emissive:'#ad692a',emissiveIntensity:.06});
  const oakDark = material('oakDark','#60402b',.79);
  const slab = material('slab','#434844',.7,.08);
  const limestone = material('limestone','#ada897',.9);
  const concrete = material('concrete','#747b75',.82);
  const fabric = material('fabric','#a99b80',.93);
  const seatDark = material('seatDark','#3f4b49',.9);
  const leafMats = ['#566b4c','#405a47','#6c7954'].map((c,i)=>material(`leaf${i}`,c,.98));
  const pot = material('pot','#3e4a46',.82);
  const screen = material('screen','#1b323c',.44,.25,{emissive:'#789da3',emissiveIntensity:.45});
  const artWhite = material('artWhite','#e0d6be',.9);
  const artOchre = material('artOchre','#b37d4b',.86);
  const glass = material('glass','#a2c2cc',.13,.28,{transparent:true,opacity:.075,depthWrite:false,side:THREE.DoubleSide});
  const innerGlass = material('innerGlass','#adc4c6',.24,.18,{transparent:true,opacity:.085,depthWrite:false,side:THREE.DoubleSide});
  const warm = new THREE.MeshBasicMaterial({color:'#ffc58a',toneMapped:false});
  const warmDim = new THREE.MeshBasicMaterial({color:'#b38755'});
  const cool = new THREE.MeshBasicMaterial({color:'#b5d3d3'});
  function grainTexture(base,woodGrain=false) {
    const c=document.createElement('canvas');c.width=256;c.height=256;
    const ctx=c.getContext('2d');ctx.fillStyle=base;ctx.fillRect(0,0,256,256);
    let n=713;const rand=()=>{n=(n*16807)%2147483647;return n/2147483647;};
    for(let i=0;i<9000;i++) {
      const v=rand();ctx.fillStyle=v>.5?'rgba(255,245,225,.035)':'rgba(0,0,0,.045)';
      ctx.fillRect(rand()*256,rand()*256,woodGrain?1:2,woodGrain?8+rand()*55:2);
    }
    const t=new THREE.CanvasTexture(c);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(woodGrain?3:4,woodGrain?1:4);t.colorSpace=THREE.SRGBColorSpace;return t;
  }
  oak.map=grainTexture('#d5c4ab',true);
  limestone.map=grainTexture('#e5e2d9');concrete.map=limestone.map;slab.map=grainTexture('#ccc6ba');
  const facade=document.createElement('canvas');facade.width=256;facade.height=256;
  const fc=facade.getContext('2d');const fg=fc.createLinearGradient(0,0,0,256);
  fg.addColorStop(0,'#92b1c8');fg.addColorStop(.5,'#c0ccd0');fg.addColorStop(1,'#344e5a');fc.fillStyle=fg;fc.fillRect(0,0,256,256);
  fc.fillStyle='#e1e8e7';fc.globalAlpha=.25;fc.fillRect(15,0,2,256);fc.fillRect(20,0,6,256);
  glass.map=new THREE.CanvasTexture(facade);glass.map.colorSpace=THREE.SRGBColorSpace;glass.opacity=.12;
  const unitBox = new THREE.BoxGeometry(1,1,1);
  const sphereGeometry = new THREE.IcosahedronGeometry(1,1);
  const cylinderGeometry = new THREE.CylinderGeometry(1,1,1,20);
  const architecture = new THREE.Group();scene.add(architecture);
  function box(x,y,z,w,h,d,m,parent=architecture) {const rounded=m===fabric||m===seatDark;const o=new THREE.Mesh(rounded?new RoundedBoxGeometry(w,h,d,2,Math.min(.07,h*.25)):unitBox,m);o.position.set(x,y,z);if(!rounded)o.scale.set(w,h,d);parent.add(o);return o;}
  function sphere(x,y,z,r,m,parent=architecture,scale=[1,1,1]) {const o=new THREE.Mesh(sphereGeometry,m);o.position.set(x,y,z);o.scale.set(r*scale[0],r*scale[1],r*scale[2]);parent.add(o);return o;}
  function cylinder(x,y,z,r,h,m,parent=architecture) {const o=new THREE.Mesh(cylinderGeometry,m);o.position.set(x,y,z);o.scale.set(r,h,r);parent.add(o);return o;}
  function group(x,y,z,rotation=0) {const g=new THREE.Group();g.position.set(x,y,z);g.rotation.y=rotation;architecture.add(g);return g;}
  function bar(x,y,z,length,axis='x',m=warm) {return box(x,y,z,axis==='x'?length:.025,.022,axis==='z'?length:.025,m);}
  // Ground and a planted island: quiet context, without expensive planar reflections.
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(1300,1300),material('ground','#57544d',.9));
  ground.material.map=(()=>{const t=grainTexture('#e9e2d4');t.repeat.set(260,260);return t;})();
  ground.rotation.x=-Math.PI/2;ground.position.y=-.35;ground.receiveShadow=true;scene.add(ground);
  box(0,-.12,0,25,.4,17,concrete);
  box(0,.14,0,23.9,.2,16.2,steel);
  box(0,.29,0,23.3,.12,15.7,limestone);
  box(0,.36,0,21.1,.12,13.4,slab);
  for(const z of [7.88,-7.88])bar(0,.19,z,23.65);
  for(const x of [-11.9,11.9])bar(x,.19,0,15.7,'z');
  // Entrance stepping stones and fine paving joints.
  for(let i=0;i<5;i++){box(2.4,.02,9+i*1.15,3.4,.15,.88,concrete);bar(2.4,-.03,9.47+i*1.15,3.25,'x',warmDim);}
  // A reflecting pool wraps the south and east of the plinth; the facade and the warm interior read in it.
  const pool = material('pool','#1b3440',.07,.7,{envMapIntensity:1.8});
  box(0,-.31,11.6,38,.045,6,pool);
  box(17.2,-.31,2.8,6.4,.045,23.6,pool);
  for(const [x,z,w,d] of [[-19.1,11.6,.14,6.1],[0,14.65,38.2,.14],[20.5,2.8,.14,23.8],[17.2,-9.05,6.6,.14]])box(x,-.2,z,w,.22,d,concrete);
  // Lantern globes get their own material: spheres are non-indexed and cannot merge with the box bars.
  const lantern=new THREE.MeshBasicMaterial({color:'#ffd9a8',toneMapped:false});
  for(const x of [-13,-7.5,7.5,13]){box(x,.72,8.3,.11,.95,.11,steel);sphere(x,1.3,8.3,.1,lantern);}
  for(const z of [-9,-3,3,9]){box(13.3,.72,z,.11,.95,.11,steel);sphere(13.3,1.3,z,.1,lantern);}
  // Three true storeys, restrained horizontal proportions; the roof terrace sits on the fourth slab.
  // Leblon pavilion: three thin plates that slide past each other. A deep balcony to the sea, a terrace cantilevered
  // to the east, a third plate reaching west, and a long roof eave. The glass line stays where the rooms are.
  const fascia=material('fascia','#cdc6b7',.6,.02);fascia.map=limestone.map;
  const plates=[[.58,-11.6,11.6,-6.9,7.6],[4.85,-10.7,14.6,-6.5,9.0],[9.10,-14.2,10.7,-6.5,7.3],[13.38,-12.6,13.4,-7.7,9.4]];
  for(const [y,x0,x1,z0,z1] of plates){
    const cx=(x0+x1)/2,cz=(z0+z1)/2,w=x1-x0,d=z1-z0;
    box(cx,y+.02,cz,w,.2,d,fascia);
    box(cx,y-.12,cz,w-.7,.08,d-.7,steel);
    box(cx,y+.125,cz,w-.5,.02,d-.5,slab);
    box(0,y+.18,0,20.6,.08,12.15,slab);
    if(y>1){box(cx,y-.175,cz,w-.9,.03,d-.9,oakDark);bar(cx,y-.2,z1-.5,w-1.6);}
  }
  // Glass balustrades on the outdoor plates.
  function rail(x0,z0,x1,z1,y){
    const along=Math.abs(x1-x0)>Math.abs(z1-z0),length=along?Math.abs(x1-x0):Math.abs(z1-z0),cx=(x0+x1)/2,cz=(z0+z1)/2;
    box(cx,y+.52,cz,along?length:.02,1.0,along?.02:length,innerGlass);box(cx,y+1.04,cz,along?length:.05,.035,along?.05:length,steel);
    const posts=Math.max(1,Math.round(length/2.6));for(let i=0;i<=posts;i++)box(x0+(x1-x0)*i/posts,y+.52,z0+(z1-z0)*i/posts,.035,1.0,.035,steel);
  }
  rail(-10.55,8.85,14.45,8.85,4.97);rail(14.45,-6.35,14.45,8.85,4.97);rail(-10.55,6.1,-10.55,8.85,4.97);rail(10.3,-6.35,14.45,-6.35,4.97);
  rail(-14.05,7.15,10.55,7.15,9.22);rail(-14.05,-1.4,-14.05,7.15,9.22);rail(10.55,6.1,10.55,7.15,9.22);
  // Round pilotis carry the east terrace over the water.
  for(const z of [8.3,1.2,-5.8])cylinder(13.9,2.2,z,.17,5.1,concrete);
  // Stone circulation core at the back, taller than the roof, with one warm slit; low garden walls extend the horizontals.
  box(-12.3,8.4,-4.1,3.5,17.5,4.8,limestone);box(-12.3,17.2,-4.1,3.9,.14,5.2,fascia);box(-12.3,8.8,-1.68,.2,14.2,.03,warm);
  box(18.5,1.1,-7.2,16,2.9,.35,limestone);box(-20,1.1,-7.2,11.5,2.9,.35,limestone);
  // Timber brise on the east face of the Comando floor.
  for(let z=-5.7;z<5.95;z+=.55)box(10.52,11.24,z,.3,3.9,.06,oak);
  // Entrance: a steel portal, a low canopy under the balcony and a broad stone step.
  box(2.4,3.9,6.12,2.7,.12,.3,steel);for(const x of [1.1,3.7])box(x,2.3,6.12,.12,3.3,.3,steel);
  box(2.4,3.98,7.45,3.6,.08,2.6,fascia);box(2.4,.3,8.15,6.4,.16,1.1,fascia);
  // Outdoor rooms: a lounge on the east terrace, planters along the balcony, a pergola over the roof seating.
  for(const [x,z] of [[12.4,6.9],[12.6,-4.9],[-9.6,7.9],[-3,7.9],[6.2,7.9]])box(x,5.25,z,1.1,.5,.7,concrete);
  box(-4.4,16.45,-5.2,10.6,.14,.1,steel);box(-4.4,16.45,2.4,10.6,.14,.1,steel);
  for(const x of [-9.6,.8])for(const z of [-5.2,2.4])box(x,15.05,z,.1,2.8,.1,steel);
  for(let x=-9.5;x<.85;x+=.42)box(x,16.58,-1.4,.07,.16,8.0,oak);
  // Timber soffits and individual slats are batched into one material draw.
  for(const y of [4.67,8.92,13.20]) {
    box(0,y,0,20.65,.06,12.15,oakDark);
    for(let x=-10.1;x<10.2;x+=.22)box(x,y-.045,0,.12,.055,12.03,oak);
    for(const z of [-5.35,5.99]){bar(0,y-.09,z,20.05);}
    for(const x of [-8,0,8])bar(x,y-.09,-.3,9.2,'z');
  }
  for(const x of [-10,0,10])for(const z of [-5.85,5.85])box(x,7.0,z,.18,12.7,.18,steel);
  // Glass on all sides, with mullions instead of a single opaque wall.
  for(const z of [-6.03,6.03]) {
    for(const y of [2.81,7.07,11.35]) {
      for(let x=-8.75;x<10;x+=2.5)box(x,y,z,2.46,3.95,.025,glass);
      box(0,y-1.99,z,20.4,.045,.08,trim);
    }
    for(let x=-10;x<=10;x+=2.5)box(x,7.0,z,.045,12.55,.075,steel);
  }
  for(const x of [-10.22,10.22]) {
    for(const y of [2.81,7.07,11.35])box(x,y,0,.025,3.95,12,glass);
    for(const z of [-3,0,3])box(x,7.0,z,.07,12.55,.045,steel);
  }
  // Solid service walls lend depth to the transparent pavilion.
  for(const y of [2.8,7.05]) {
    box(-5.4,y,-5.55,7.7,3.9,.18,oakDark);
    for(let x=-9.15;x<-1.6;x+=.19)box(x,y,-5.40,.075,3.9,.12,oak);
    box(5.7,y,-5.55,7.4,3.9,.16,limestone);
    box(.1,y,-4.9,2.4,3.9,1.25,concrete);
  }
  box(-1.2,6.95,-1.5,.025,3.7,7.5,innerGlass);
  box(1.45,6.95,-1.5,.025,3.7,7.5,innerGlass);
  box(-1.2,2.7,-1.5,.025,3.7,7.5,innerGlass);
  // Reception, shelving and meeting architecture.
  box(.5,1.22,3.4,3.8,.98,.95,oak);
  box(.5,1.75,3.4,3.95,.09,1.1,limestone);
  bar(.5,.84,3.89,3.5);
  for(const y of [1.1,2.05,3,3.95]) {
    box(-7.3,y,-5.02,4.6,.065,.57,oak);
    for(let k=0;k<7;k++)box(-9.1+k*.61,y+.28,-5.02,.15,.47,.29,k%3===0?artWhite:oakDark);
  }
  function chair(x,y,z,rotation=0,parent=architecture) {
    const g=new THREE.Group();g.position.set(x,y,z);g.rotation.y=rotation;parent.add(g);
    box(0,.48,0,.61,.12,.59,seatDark,g);box(0,.83,-.22,.59,.59,.11,seatDark,g);
    cylinder(0,.22,0,.035,.45,trim,g);
    box(0,.04,0,.64,.045,.045,steel,g);box(0,.04,0,.045,.045,.6,steel,g);
    box(-.36,.66,0,.04,.035,.47,trim,g);box(.36,.66,0,.04,.035,.47,trim,g);
  }
  function desk(x,y,z,rotation=0) {
    const g=group(x,y,z,rotation);
    box(0,.76,0,2.32,.08,1.04,oak,g);
    for(const sx of [-.97,.97])box(sx,.38,0,.065,.72,.83,steel,g);
    box(0,1.25,-.21,1.02,.63,.065,steel,g);box(0,1.25,-.17,.96,.56,.012,screen,g);
    box(0,.95,-.21,.045,.3,.045,trim,g);
    box(0,.815,.2,.7,.025,.22,steel,g);
    box(.78,.835,.17,.19,.09,.25,artWhite,g);
    chair(0,0,1,Math.PI,g);
    // Screen UI is tiny geometry, not a floating futuristic dashboard.
    for(let i=0;i<3;i++)box(-.27,1.4-i*.11,-.158,.32+i*.08,.012,.008,cool,g);
  }
  function meeting(x,y,z,rotation=0) {
    const g=group(x,y,z,rotation);
    box(0,.79,0,4.4,.11,1.6,oak,g);
    for(const xx of [-1.5,1.5])box(xx,.39,0,.16,.74,1.05,steel,g);
    for(const xx of [-1.5,0,1.5]){chair(xx,0,1.3,Math.PI,g);chair(xx,0,-1.3,0,g);}
    box(-.7,.88,0,.65,.025,.4,artWhite,g);box(.8,.89,0,.65,.03,.45,steel,g);
  }
  const lower=.79, upper=5.07;
  for(const x of [-7.6,-4.5])for(const z of [1.1,-2.6])desk(x,lower,z,0);
  meeting(-5.8,upper,-.7);
  // CREATE: shared worktable, material board and lounge.
  meeting(5.6,upper,.7,0);
  // JOHN's desk: design and art, against the material board.
  desk(7.6,upper,-3.4,0);
  box(5.7,7.1,-5.39,5.8,2.3,.1,steel);
  for(let i=0;i<5;i++) {
    box(3.4+i*1.13,7.2+(i%2)*.2,-5.30,.86,1.25,.025,i%2?artOchre:artWhite);
    box(3.4+i*1.13,6.44,-5.28,.7,.04,.02,trim);
  }
  for(const x of [-7.2,-4.4,4.2,7]) {
    cylinder(x,8.45,.1,.014,.8,steel);
    cylinder(x,8.01,.1,.32,.08,steel);
    cylinder(x,7.96,.1,.27,.025,warm);
  }
  // GROW: conversational setting, visually distinct from the build laboratory.
  function sofa(x,y,z,rotation=0) {
    const g=group(x,y,z,rotation);
    box(0,.3,0,2.8,.5,1.04,fabric,g);box(0,.77,-.42,2.8,.69,.22,fabric,g);
    for(const xx of [-1.33,1.33])box(xx,.62,0,.19,.52,1.07,fabric,g);
    for(const xx of [-.75,.75])box(xx,.59,0,1.2,.12,.84,artWhite,g);
    for(const xx of [-1.1,1.1])for(const zz of [-.33,.33])box(xx,.08,zz,.055,.15,.055,steel,g);
  }
  sofa(5.5,lower,1.9,0);sofa(8.4,lower,0,-Math.PI/2);
  cylinder(5.7,lower+.46,-.25,.87,.07,oak);cylinder(5.7,lower+.22,-.25,.12,.43,steel);
  box(5.8,lower+.51,-.3,.5,.018,.36,artWhite);
  desk(4.1,lower,-3.3,0);desk(7.3,lower,-3.3,0);
  // A sculptural helical stair climbs the three floors around one mast; the structure itself moves nowhere.
  const top=9.35;
  cylinder(.1,7.02,-1.1,.09,8.6,trim);
  for(const base of [lower,upper]) {
    const offset=base===lower?0:Math.PI*1.65;
    for(let i=0;i<25;i++) {
      const a=offset+i/24*Math.PI*1.65;
      const g=group(.1,base+i*(4.28/24),-1.1,-a);
      box(.82,0,0,1.5,.065,.4,oak,g);
      cylinder(1.56,.51,0,.014,1.02,trim,g);
    }
    const railPoints=[];
    for(let i=0;i<=80;i++) {const a=offset+i/80*Math.PI*1.65;railPoints.push(new THREE.Vector3(.1+Math.cos(a)*1.56,base+i/80*4.28+1.02,-1.1+Math.sin(a)*1.56));}
    architecture.add(new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(railPoints),90,.025,6,false),trim));
  }
  // COMANDO (andar 02): one long table for direction and approval, a presentation wall, a lounge and ARI's desk.
  box(0,top+.79,-1.2,6.6,.11,1.8,oak);
  for(const xx of [-2.6,0,2.6])box(xx,top+.39,-1.2,.16,.74,1.15,steel);
  for(const xx of [-2.4,-.8,.8,2.4]){chair(xx,top,.2,Math.PI);chair(xx,top,-2.6,0);}
  box(-1.4,top+.88,-1.2,.65,.025,.4,artWhite);box(1.2,top+.89,-1.2,.65,.03,.45,steel);
  box(.5,top+2.0,-5.55,11,3.9,.18,limestone);
  box(.5,top+2.15,-5.43,5.6,2.9,.04,steel);box(.5,top+2.15,-5.41,5.4,2.72,.012,screen);
  for(let x=-9.15;x<-5.6;x+=.19)box(x,top+2.0,-5.40,.075,3.9,.12,oak);
  box(-7.4,top+2.0,-5.55,3.9,3.9,.18,oakDark);
  sofa(7.6,top,1.9,-Math.PI/2);box(7.6,top+.42,-.6,.9,.05,.9,oak);
  desk(-7.3,top,-3.95,Math.PI);
  for(const x of [-2.2,0,2.2]) {
    cylinder(x,top+3.1,-1.2,.014,.8,steel);
    cylinder(x,top+2.66,-1.2,.32,.08,steel);
    cylinder(x,top+2.61,-1.2,.27,.025,warm);
  }
  // Deterministic tree canopies: same silhouette on every launch and screenshot.
  let seed=42;const random=()=>{seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;};
  function plant(x,y,z,size=1,tree=false) {
    cylinder(x,y+.25*size,z,.36*size,.5*size,pot);
    cylinder(x,y+(tree?1.12:.65)*size,z,.045*size,(tree?1.8:.8)*size,oakDark);
    const n=tree?95:13;
    for(let i=0;i<n;i++) {
      const a=i*2.399,rad=Math.sqrt(random())*(tree?.75:.45)*size;
      const yy=(tree?2.3:1.0)+(random()-.5)*(tree?1.15:.65);
      sphere(x+Math.cos(a)*rad,y+yy*size,z+Math.sin(a)*rad,(tree?.18:.17)*size,leafMats[i%3],architecture,[1.3,.65+random()*.35,1]);
    }
  }
  for(const [x,z,s] of [[-9.2,4.7,.88],[-8.9,-4.6,.7],[9.1,4.7,.9],[1.9,-4.9,.7]]){plant(x,lower,z,s,true);plant(x,upper,z,s,true);}
  for(const [x,z] of [[-2.7,3.8],[2.5,3.9],[8.9,-4.5]])plant(x,upper,z,.7);
  for(const [x,z,s] of [[-9.2,4.7,.88],[9.1,4.7,.9],[-9,-4.6,.7]])plant(x,top,z,s,true);
  plant(-2.7,top,3.9,.7);plant(2.5,top,3.9,.7);
  // A real roof terrace, with a low glass balustrade and planted borders.
  box(0,13.58,0,20.8,.06,12.3,oakDark);
  for(let z=-5.7;z<5.7;z+=.18)box(0,13.63,z,20.25,.035,.13,oak);
  for(const z of [-5.9,5.9]) {
    box(0,14.18,z,20.5,1.05,.025,innerGlass);box(0,14.71,z,20.55,.035,.045,steel);
    for(const x of [-10,-5,0,5,10])box(x,14.19,z,.035,1.05,.035,steel);
  }
  for(const x of [-10.15,10.15])box(x,14.18,0,.025,1.05,11.8,innerGlass);
  for(const x of [-8.8,-6.6,6.7,9])plant(x,13.68,-4.7,.65,true);
  sofa(-6,13.68,1.2);sofa(-2.7,13.68,1.2);
  // Landscape beds with low green foliage and occasional taller trees.
  for(const [x,z,w,d] of [[-14,2.8,2.7,12],[13.8,-2,2.4,10],[-6,-9.8,12,2.2],[9.5,11,3,3]]) {
    box(x,-.03,z,w,.4,d,concrete);
    for(let i=0;i<13;i++)plant(x+(random()-.5)*(w-.7),.17,z+(random()-.5)*(d-.7),.3+random()*.25);
  }
  plant(-14.1,.18,-1.5,1.55,true);plant(14,.18,-9.9,1.5,true);plant(-12.7,.18,-8.5,1.9,true);
  plant(-16.5,-.3,6.2,2.3,true);plant(16.2,-.3,-15.5,2.1,true);plant(-15.8,-.3,-14,2.4,true);plant(-22.5,-.3,-4,2.0,true);
  const monitorCanvas=document.createElement('canvas');monitorCanvas.width=512;monitorCanvas.height=300;
  const mc=monitorCanvas.getContext('2d');mc.fillStyle='#182c34';mc.fillRect(0,0,512,300);
  mc.fillStyle='#a1babd';mc.font='500 18px sans-serif';mc.fillText('AERA / WORKSPACE',28,36);
  mc.fillStyle='#49616b';mc.fillRect(28,55,456,1);
  for(let i=0;i<4;i++){mc.fillStyle=i===0?'#c0aa87':'#68858c';mc.fillRect(28,85+i*38,80,7);mc.fillStyle='#344e58';mc.fillRect(130,85+i*38,150+i*38,7);}
  mc.fillStyle='#bda27c';mc.fillRect(355,233,127,25);
  const monitorTexture=new THREE.CanvasTexture(monitorCanvas);monitorTexture.colorSpace=THREE.SRGBColorSpace;
  screen.map=monitorTexture;screen.emissiveMap=monitorTexture;
  // Labels are architectural signage. Texture canvases are local and font-ready.
  function sign(text,x,y,z,w,color='#e5d6bc',rotation=0) {
    const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=256;
    const c=canvas.getContext('2d');c.clearRect(0,0,1024,256);c.fillStyle=color;
    c.font='500 95px "Instrument Sans Variable", sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(text,512,128);
    const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,w/4),new THREE.MeshBasicMaterial({map:texture,transparent:true,depthWrite:false,side:THREE.DoubleSide}));
    mesh.position.set(x,y,z);mesh.rotation.y=rotation;mesh.userData.noBatch=true;architecture.add(mesh);
  }
  sign('THINK',-5.9,8.1,-5.26,2.3);sign('CREATE',5.7,8.48,-5.25,2.4);
  sign('BUILD',-6.9,3.8,-5.16,1.95);sign('GROW',6.2,3.85,-5.35,2);
  sign('COMANDO',-7.4,12.7,-5.26,2.6);
  // Original AERA PNG, used as a separate identity layer on the reception fascia.
  const logo = await new THREE.TextureLoader().loadAsync(new URL('./assets/aera-logo.png',import.meta.url).href);
  logo.colorSpace=THREE.SRGBColorSpace;
  const logoMesh=new THREE.Mesh(new THREE.PlaneGeometry(1.65,.407),new THREE.MeshBasicMaterial({map:logo,transparent:true,depthWrite:false}));
  logoMesh.position.set(.5,1.28,3.89);logoMesh.userData.noBatch=true;architecture.add(logoMesh);
  const leblon=buildLeblon({scene,architecture,box,cylinder,sphere,material,materials,lantern,random,keepClear:[[66,60],[-28,40],[30,40],toWorld(74,46)],anisotropy:Math.min(8,renderer.capabilities.getMaxAnisotropy())});
  // Cheap ambient contact shadow, independent of the single sun shadow map.
  const shadowCanvas=document.createElement('canvas');shadowCanvas.width=128;shadowCanvas.height=128;
  const sc=shadowCanvas.getContext('2d'),gradient=sc.createRadialGradient(64,64,12,64,64,64);
  gradient.addColorStop(0,'rgba(0,0,0,.65)');gradient.addColorStop(.65,'rgba(0,0,0,.3)');gradient.addColorStop(1,'rgba(0,0,0,0)');sc.fillStyle=gradient;sc.fillRect(0,0,128,128);
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(39,29),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(shadowCanvas),transparent:true,depthWrite:false}));
  shadow.rotation.x=-Math.PI/2;shadow.position.y=-.325;scene.add(shadow);
  // Merge static geometry by material: hundreds of architectural details, few draw calls.
  architecture.updateMatrixWorld(true);
  const batches=new Map(),remove=[];
  architecture.traverse(object=>{
    if(!object.isMesh||object.userData.noBatch)return;
    const geometry=object.geometry.clone().applyMatrix4(object.matrixWorld);
    if(!batches.has(object.material))batches.set(object.material,[]);
    batches.get(object.material).push(geometry);remove.push(object);
  });
  remove.forEach(object=>object.removeFromParent());
  for(const [m,geometries] of batches){
    const merged=mergeGeometries(geometries,false);geometries.forEach(g=>g.dispose());
    const mesh=new THREE.Mesh(merged,m);mesh.castShadow=!m.transparent&&m.isMeshStandardMaterial;mesh.receiveShadow=!m.transparent&&m.isMeshStandardMaterial;
    scene.add(mesh);
  }
  unitBox.dispose();sphereGeometry.dispose();cylinderGeometry.dispose();
  renderer.shadowMap.needsUpdate=true;
  const views={
    all:{target:[-1,6.6,0],position:[40,12.5,36]},
    think:{target:[-4.7,6.9,.5],position:[-17,10.3,25]},
    create:{target:[4.7,6.9,.5],position:[20,10.5,25]},
    build:{target:[-5.2,2.6,.5],position:[-17,6.9,25]},
    grow:{target:[5.2,2.6,.5],position:[20,6.9,25]},
    control:{target:[.3,11.2,.5],position:[12,15.5,26]}
  };
  let transition=null,currentZone='all',dirty=true,viewMode='orbit',floorMode='all',exploring=false;
  // Office lights: on by default; they only change on a real request (NAYRA's voice command or the scene API).
  const warmFull=warm.color.clone(),warmDimFull=warmDim.color.clone();let lightLevel=1,lightTarget=1;
  function applyLights(){
    for(const light of interiorLights)light.intensity=light.userData.full*(.03+.97*lightLevel);
    warm.color.copy(warmFull).multiplyScalar(.05+.95*lightLevel);warmDim.color.copy(warmDimFull).multiplyScalar(.12+.88*lightLevel);
    oak.emissiveIntensity=.06*lightLevel;dirty=true;
  }
  function setLights(on){lightTarget=on?1:0;if(motion.matches){lightLevel=lightTarget;applyLights();}dirty=true;return lightTarget===1;}
  window.addEventListener('aera:lights',e=>{if(failed||!e.detail)return;setLights(!!e.detail.on);e.detail.handled=true;});
  let yaw=0,pitch=0,drag=null,lastNavigation=0,lastSampleAt=0,opening=false,skipIntro=null;
  function closeOpening(){opening=false;if(skipIntro){skipIntro.remove();skipIntro=null;}dirty=true;}
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  const moves=new Set();
  const team=createAgentTeam({scene,contactMaterial:shadow.material,onInvalidate:()=>{dirty=true;}});
  const accents={};
  for(const [zone,r] of Object.entries(roomSpecs)) {
    const [x0,x1,z0,z1]=r.bounds,y=floorSpecs[r.floor].base+.012;
    const group=new THREE.Group();scene.add(group);
    const points=[[x0,y,z0],[x1,y,z0],[x1,y,z1],[x0,y,z1]].map(p=>new THREE.Vector3(...p));
    const outline=new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(points),new THREE.LineBasicMaterial({color:'#dfb67e',transparent:true,opacity:.75}));group.add(outline);
    const wash=new THREE.Mesh(new THREE.PlaneGeometry(x1-x0,z1-z0),new THREE.MeshBasicMaterial({color:'#d7b17d',transparent:true,opacity:.055,depthWrite:false,side:THREE.DoubleSide}));
    wash.rotation.x=-Math.PI/2;wash.position.set((x0+x1)/2,y,(z0+z1)/2);group.add(wash);group.visible=false;accents[zone]=group;
  }
  function markZone(zone){currentZone=zone;team.select(zone);for(const [key,g] of Object.entries(accents))g.visible=key===zone;}
  function emitNavigation(force=false){
    const now=performance.now();if(!force&&now-lastNavigation<80)return;lastNavigation=now;
    onNavigation({mode:viewMode,floor:floorMode,zone:currentZone,position:camera.position.toArray(),yaw,transitioning:!!transition});
  }
  function clearClipping(){renderer.clippingPlanes=[];dirty=true;}
  function setClipping(floor){
    if(floor==='lower')renderer.clippingPlanes=[new THREE.Plane(new THREE.Vector3(0,-1,0),4.54),new THREE.Plane(new THREE.Vector3(0,1,0),-.44)];
    else if(floor==='upper')renderer.clippingPlanes=[new THREE.Plane(new THREE.Vector3(0,-1,0),8.75),new THREE.Plane(new THREE.Vector3(0,1,0),-4.98)];
    else if(floor==='top')renderer.clippingPlanes=[new THREE.Plane(new THREE.Vector3(0,-1,0),13.03),new THREE.Plane(new THREE.Vector3(0,1,0),-9.26)];
    else if(floor==='terrace')renderer.clippingPlanes=[new THREE.Plane(new THREE.Vector3(0,1,0),-13.52)];
    else clearClipping();
    dirty=true;
  }
  function frameOffset(){
    const mobile=width<=900;scrim.style.opacity=mobile&&!exploring?'1':'0';
    if(viewMode==='walk')camera.clearViewOffset();
    else if(mobile)camera.setViewOffset(width,height,0,exploring?height*.02:-height*.11,width,height);
    else camera.setViewOffset(width,height,(!exploring||currentZone!=='all')?-width*.075:0,height*.015,width,height);
  }
  function syncLook(){
    const direction=new THREE.Vector3();camera.getWorldDirection(direction);
    yaw=Math.atan2(-direction.x,-direction.z);pitch=Math.asin(THREE.MathUtils.clamp(direction.y,-1,1));
  }
  function look(){
    const direction=new THREE.Vector3(-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch));
    controls.target.copy(camera.position).add(direction);camera.lookAt(controls.target);dirty=true;
  }
  function travel(position,target,{instant=false,fov=36,duration=1500}={}){
    moves.clear();closeOpening();
    if(instant||motion.matches){transition=null;camera.position.copy(position);controls.target.copy(target);camera.fov=fov;camera.updateProjectionMatrix();camera.lookAt(target);syncLook();if(viewMode==='orbit')controls.update();}
    else transition={from:camera.position.clone(),fromTarget:controls.target.clone(),position,target,start:performance.now(),duration,fromFov:camera.fov,fov};
    dirty=true;emitNavigation(true);
  }
  function focus(zone,instant=false){
    if(!views[zone])return;
    viewMode='orbit';floorMode='all';controls.enabled=true;controls.minDistance=12;controls.maxDistance=110;clearClipping();markZone(zone);frameOffset();
    const v=views[zone],target=new THREE.Vector3(...v.target),position=new THREE.Vector3(...v.position);
    if(width<=900)position.sub(target).multiplyScalar(zone==='all'?(width<550?1.6:1.2):(width<550?1.75:1.25)).add(target);
    travel(position,target,{instant});
  }
  function enter(zone='control',instant=false){
    const r=roomSpecs[zone]||roomSpecs.control;viewMode='walk';floorMode=r.floor;controls.enabled=false;clearClipping();markZone(roomSpecs[zone]?zone:'control');frameOffset();
    travel(new THREE.Vector3(...r.entry),new THREE.Vector3(...r.look),{instant,fov:65,duration:1450});
  }
  function setFloor(floor,instant=false){
    if(floor==='all'){focus('all',instant);return;}
    if(!floorSpecs[floor])return;
    floorMode=floor;
    if(viewMode==='walk'){
      const f=floorSpecs[floor];clearClipping();markZone('all');
      travel(new THREE.Vector3(...f.spawn),new THREE.Vector3(...f.look),{instant:true,fov:65});
    }else{
      viewMode='orbit';controls.enabled=true;controls.minDistance=10;markZone('all');setClipping(floor);frameOffset();
      const y=floorSpecs[floor].base;
      const target=new THREE.Vector3(0,y+.6,0),position=new THREE.Vector3(17,y+17,22);
      if(width<900)position.sub(target).multiplyScalar(width<550?1.7:1.3).add(target);
      travel(position,target,{instant,fov:40});
    }
    emitNavigation(true);
  }
  controls.addEventListener('start',()=>{transition=null;closeOpening();dirty=true;onInteraction();});
  controls.addEventListener('change',()=>{dirty=true;});
  const labels=[],layer=document.querySelector('#scene-labels');
  const labelCoords={think:[-6.4,7,5.95],create:[6.3,7,5.95],build:[-6.4,2.8,5.95],grow:[6.3,2.8,5.95],control:[.5,11.3,5.95]};
  const names={think:'MAYA',create:'NOA · JOHN',build:'LEO',grow:'NINA',control:'ARI'};
  // Numbered markers with a leader line, like an architectural key. Rooms on the left read leftwards.
  const numbers={think:'01',create:'02',build:'03',grow:'04',control:'05'},titles={control:'COMANDO'};
  for(const [zone,coords] of Object.entries(labelCoords)){
    const button=document.createElement('button');button.className='hotspot'+(zone==='think'||zone==='build'?' left':'');button.dataset.zone=zone;
    button.innerHTML=`<i>${numbers[zone]}</i><b></b><span>${titles[zone]||zone.toUpperCase()}<small>${names[zone]}</small></span>`;
    button.setAttribute('aria-label',`Explorar ${zone.toUpperCase()} com ${names[zone].replace(' · ',' e ')}`);button.addEventListener('click',e=>selectZone(zone,{instant:e.detail===0}));layer.append(button);
    labels.push({button,zone,position:new THREE.Vector3(...coords)});
  }
  // Stations: the capability index inside each room. Same registry as the panel; state comes from the server.
  const stationLabels=[];let selectedStation='';
  function setStations(list){
    for(const s of stationLabels)s.button.remove();stationLabels.length=0;
    for(const s of layoutStations(list)){
      const button=document.createElement('button');button.className='station';button.dataset.zone=s.zone;button.dataset.state=s.state;button.dataset.station=s.id;
      button.innerHTML=`<i></i><span>${s.name}</span>`;button.title=s.state_label;button.setAttribute('aria-label',`${s.name} · ${s.state_label}`);
      button.addEventListener('click',e=>{e.stopPropagation();selectedStation=s.id;dirty=true;onStation(s.id);});layer.append(button);
      stationLabels.push({button,zone:s.zone,id:s.id,position:new THREE.Vector3(...s.position)});
    }
    dirty=true;
  }
  function setStationStates(states){
    for(const s of stationLabels){const st=states[s.id];if(st){s.button.dataset.state=st.state;s.button.title=st.state_label;}}
    dirty=true;
  }
  function setCharacterStates(states){
    // One visual signal for "em tarefa": the room hotspot carries it, derived from server state only.
    for(const {button,zone} of labels){const name=names[zone];const st=states[name];button.classList.toggle('working',!!st&&st.state==='em_tarefa');button.querySelector('small').textContent=st&&st.state==='em_tarefa'?`${name} · em tarefa`:name;}
    dirty=true;
  }
  // The demonstration handoff follows the actual architectural anchors.
  const flowMaterial=new THREE.LineBasicMaterial({color:'#e5bc86',transparent:true,opacity:.7});
  const flowGeometry=new THREE.BufferGeometry();
  const flowLine=new THREE.Line(flowGeometry,flowMaterial);scene.add(flowLine);flowLine.visible=false;
  const flowDot=new THREE.Mesh(new THREE.SphereGeometry(.065,8,6),warm);scene.add(flowDot);flowDot.visible=false;
  let workflow=null,curve=null;
  function setWorkflow(value){
    workflow=value;team.setWorkflow(value);
    if(value){
      const anchors=team.anchors();
      const fallback=zone=>zone==='grow'?[6.3,2.6,2.5]:zone==='control'?[.3,11.2,1.2]:[.5,2.6,3.4];
      const a=new THREE.Vector3(...(anchors[value.agent]||anchors[value.zone]||fallback(value.zone)));
      const b=new THREE.Vector3(...(anchors[value.partner]||anchors[value.partnerZone]||fallback(value.partnerZone)));a.y-=.45;b.y-=.45;
      const mid=a.clone().lerp(b,.5);mid.y+=1.1;curve=new THREE.QuadraticBezierCurve3(a,mid,b);flowGeometry.setFromPoints(curve.getPoints(44));
    }
    flowLine.visible=!!value;flowDot.visible=!!value&&!motion.matches;dirty=true;
  }
  const projected=new THREE.Vector3();
  function updateLabels(){
    for(const {button,position,zone} of labels){
      projected.copy(position).project(camera);const x=(projected.x*.5+.5)*width,y=(-projected.y*.5+.5)*height;
      const mobile=width<=900,leftLimit=exploring?width<=900?16:175:Math.min(400,width*.3);
      button.hidden=opening||(mobile&&!exploring)||viewMode==='walk'||!!workflow||floorMode==='terrace'||(floorMode!=='all'&&roomSpecs[zone].floor!==floorMode)||camera.position.z<0||projected.z>1||x<leftLimit||x>width-(currentZone==='all'?30:width<=900?20:330)||y<(mobile?230:135)||y>height-(mobile?185:195)||(currentZone!=='all'&&currentZone!==zone);
      button.style.left=`${x}px`;button.style.top=`${y}px`;button.classList.toggle('selected',currentZone===zone);
    }
    for(const {button,position,zone,id} of stationLabels){
      // Stations show only inside the focused room, where the camera can read them.
      if(currentZone!==zone||viewMode==='walk'||!!workflow){button.hidden=true;continue;}
      projected.copy(position).project(camera);const x=(projected.x*.5+.5)*width,y=(-projected.y*.5+.5)*height;
      button.hidden=projected.z>1||x<40||x>width-(width<=900?20:330)||y<140||y>height-200;
      button.style.left=`${x}px`;button.style.top=`${y}px`;button.classList.toggle('selected',selectedStation===id);
    }
  }
  // Room volumes let the architecture itself be selected, not just the labels.
  const roomVolumes=Object.fromEntries(Object.entries(roomSpecs).map(([zone,r])=>{const [a,b,c,d]=r.bounds,y=floorSpecs[r.floor].base;return [zone,new THREE.Box3(new THREE.Vector3(a,y+.25,c),new THREE.Vector3(b,y+3.5,d))];}));
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();let pointerStart=null;
  function cancelTravel(){if(transition){transition=null;closeOpening();syncLook();}onInteraction();}
  renderer.domElement.addEventListener('pointerdown',e=>{
    pointerStart={x:e.clientX,y:e.clientY};
    if(viewMode==='walk'){cancelTravel();drag={x:e.clientX,y:e.clientY,id:e.pointerId};renderer.domElement.setPointerCapture(e.pointerId);}
  });
  renderer.domElement.addEventListener('pointermove',e=>{
    if(!drag||viewMode!=='walk')return;
    yaw-=(e.clientX-drag.x)*.003;pitch=THREE.MathUtils.clamp(pitch-(e.clientY-drag.y)*.003,-.7,.65);drag.x=e.clientX;drag.y=e.clientY;look();
  });
  renderer.domElement.addEventListener('pointerup',e=>{
    drag=null;
    if(viewMode==='walk'||!pointerStart||Math.hypot(e.clientX-pointerStart.x,e.clientY-pointerStart.y)>6)return;
    pointer.set(e.clientX/width*2-1,-e.clientY/height*2+1);ray.setFromCamera(pointer,camera);
    const hits=[];
    for(const [zone,volume] of Object.entries(roomVolumes)){
      if(floorMode!=='all'&&roomSpecs[zone].floor!==floorMode)continue;
      const point=ray.ray.intersectBox(volume,new THREE.Vector3());if(point)hits.push({zone,distance:point.distanceTo(camera.position)});
    }
    hits.sort((a,b)=>a.distance-b.distance);if(hits[0])selectZone(hits[0].zone);
  });
  renderer.domElement.addEventListener('pointercancel',()=>{drag=null;pointerStart=null;});
  const keyMoves={KeyW:'forward',ArrowUp:'forward',KeyS:'backward',ArrowDown:'backward',KeyA:'left',KeyD:'right',ArrowLeft:'turnLeft',ArrowRight:'turnRight'};
  const editable=e=>/INPUT|TEXTAREA|SELECT/.test(e.target?.tagName)||e.target?.isContentEditable||document.querySelector('dialog[open]')||document.querySelector('#brief-panel:not([hidden])');
  window.addEventListener('keydown',e=>{if(viewMode!=='walk'||editable(e)||e.metaKey||e.ctrlKey||e.altKey)return;const action=keyMoves[e.code];if(action){e.preventDefault();cancelTravel();moves.add(action);}});
  window.addEventListener('keyup',e=>{const action=keyMoves[e.code];if(action)moves.delete(action);});
  window.addEventListener('blur',()=>{moves.clear();drag=null;});
  function tickWalk(delta){
    if(viewMode!=='walk'||transition||!moves.size)return false;
    const dt=Math.min(delta/1000,.05);if(moves.has('turnLeft'))yaw+=dt*1.2;if(moves.has('turnRight'))yaw-=dt*1.2;
    let f=Number(moves.has('forward'))-Number(moves.has('backward')),r=Number(moves.has('right'))-Number(moves.has('left'));
    const length=Math.hypot(f,r)||1;f/=length;r/=length;
    const dx=(-Math.sin(yaw)*f+Math.cos(yaw)*r)*dt*1.8,dz=(-Math.cos(yaw)*f-Math.sin(yaw)*r)*dt*1.8;
    const next=moveWithinFloor(camera.position,dx,dz,floorMode);camera.position.x=next.x;camera.position.z=next.z;camera.position.y=floorSpecs[floorMode].eye;
    look();return true;
  }
  let last=performance.now(),samples=[],slowSamples=[];
  function frame(now){
    requestAnimationFrame(frame);
    if(failed||paused||document.hidden){last=now;moves.clear();return;}
    const delta=now-last;last=now;let moving=tickWalk(delta);
    if(transition){
      const t=Math.min(1,(now-transition.start)/transition.duration),e=t<.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;
      camera.position.lerpVectors(transition.from,transition.position,e);controls.target.lerpVectors(transition.fromTarget,transition.target,e);camera.fov=THREE.MathUtils.lerp(transition.fromFov,transition.fov,e);camera.updateProjectionMatrix();camera.lookAt(controls.target);moving=true;
      if(t===1){transition=null;closeOpening();syncLook();}
    }
    if(lightLevel!==lightTarget){const step=Math.min(1,Math.max(0,delta)/1400);lightLevel=lightTarget>lightLevel?Math.min(lightTarget,lightLevel+step):Math.max(lightTarget,lightLevel-step);applyLights();moving=true;}
    if(viewMode==='orbit')controls.update();
    const agentsChanged=team.update(now,dirty||moving),shoreChanged=leblon.update(now);
    if(workflow&&curve&&!motion.matches){flowDot.position.copy(curve.getPoint((now%2600)/2600));moving=true;}
    if(dirty||moving||agentsChanged||shoreChanged){
      const before=performance.now();renderer.render(scene,camera);const submit=performance.now()-before;updateLabels();emitNavigation();dirty=false;
      if(moving){if(delta>0&&delta<250){samples.push(delta);if(samples.length>900)samples.shift();}slowSamples.push(submit);if(slowSamples.length>900)slowSamples.shift();}
      if(!lowQuality&&samples.length>=180&&samples.length%180===0&&samples.slice(-180).reduce((a,b)=>a+b,0)/180>29){setQuality(true);onQuality(true);}
      lastSampleAt=now;
    }
  }
  function setQuality(low){lowQuality=low;leblon.setLow(low);renderer.setPixelRatio(Math.min(devicePixelRatio||1,low?1:1.5));renderer.shadowMap.enabled=!low;renderer.shadowMap.needsUpdate=true;renderer.setSize(width,height);dirty=true;}
  window.addEventListener('resize',()=>{width=innerWidth;height=innerHeight;camera.aspect=width/height;camera.updateProjectionMatrix();renderer.setSize(width,height);frameOffset();dirty=true;});
  document.addEventListener('visibilitychange',()=>{moves.clear();if(!document.hidden){last=performance.now();dirty=true;}});
  focus('all',true);
  // Opening shot, once per load: a slow travelling from the seafront promenade, across the avenue, rising into the hero frame.
  // It ends in the interactive scene, can be skipped, and is not played with reduced motion.
  if(!motion.matches){
    const hero=camera.position.clone(),heroTarget=controls.target.clone(),[sx,sz]=toWorld(74,46.3);
    camera.position.set(sx,2.6,sz);controls.target.set(-4,2.3,2);camera.lookAt(controls.target);controls.update();
    travel(hero,heroTarget,{duration:7600});opening=true;
    skipIntro=document.createElement('button');skipIntro.id='skip-intro';skipIntro.type='button';skipIntro.textContent='Pular intro';
    skipIntro.style.cssText='position:fixed;right:36px;top:92px;z-index:60;padding:11px 16px;background:#0f1c23cc;border:1px solid #ffffff3d;color:#eee9df;font:500 12px/1 "Instrument Sans Variable","Helvetica Neue",sans-serif;letter-spacing:.04em;cursor:pointer;backdrop-filter:blur(6px);border-radius:2px';
    skipIntro.addEventListener('click',()=>{travel(hero,heroTarget,{instant:true});});document.body.append(skipIntro);
  }
  renderer.compile(scene,camera);renderer.render(scene,camera);updateLabels();requestAnimationFrame(frame);
  const gl=renderer.getContext(),debug=gl.getExtension('WEBGL_debug_renderer_info');
  return {
    focus,enter,setFloor,setWorkflow,setStations,setStationStates,setCharacterStates,
    selectStation(id){selectedStation=id||'';dirty=true;},
    setAmbient(value){return team.setAmbient(value);},
    setLights,lights(){return lightTarget===1;},
    setExploring(value){exploring=value;frameOffset();dirty=true;},
    move(action,active){if(viewMode!=='walk')return;cancelTravel();if(active)moves.add(action);else moves.delete(action);},
    stopMoving(){moves.clear();},
    zoom(factor){if(viewMode==='walk')return;transition=null;const d=camera.position.clone().sub(controls.target).multiplyScalar(factor).clampLength(controls.minDistance,controls.maxDistance);camera.position.copy(controls.target).add(d);controls.update();dirty=true;},
    toggleQuality(){setQuality(!lowQuality);return lowQuality;},
    toggleAgentMotion(){return team.setEnabled(!team.state().userEnabled);},
    setAgentPaused(value){team.setPresentationPaused(value);dirty=true;},
    setPaused(value){paused=value;moves.clear();dirty=true;},
    diagnostics(){
      const sorted=[...samples].sort((a,b)=>a-b),mean=samples.reduce((a,b)=>a+b,0)/(samples.length||1);
      return {three:THREE.REVISION,viewMode,floor:floorMode,currentZone,exploring,transitioning:!!transition,quality:lowQuality?'leve':'alta',dpr:renderer.getPixelRatio(),viewport:[width,height],drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,sampledFrames:samples.length,fps:mean?Math.round(1000/mean*10)/10:null,p95FrameMs:sorted.length?Math.round(sorted[Math.floor(sorted.length*.95)]*10)/10:null,meanSubmitMs:slowSamples.length?+(slowSamples.reduce((a,b)=>a+b,0)/slowSamples.length).toFixed(2):null,gpu:debug?gl.getParameter(debug.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),camera:camera.position.toArray(),target:controls.target.toArray(),yaw,pitch,clippingPlanes:renderer.clippingPlanes.length,agents:team.diagnostics(),webgl:gl.getParameter(gl.VERSION)};
    }
  };
}
