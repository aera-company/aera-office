import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// The site around the pavilion: a fictional Leblon front at the turn from golden hour to blue hour.
// Everything is procedural and generic; no real building, brand or sign is reproduced.
// The site has its own frame, turned against the building so the avenue passes diagonally in front of the plaza:
// site +z runs towards the sea, site -x runs west along the avenue to the twin-peak headland.
export const HAZE='#5b6672';
export const SITE_YAW=-Math.PI/6;
export const shore={avenue:[28.5,40.5],cycle:[40.7,43.1],boardwalk:[43.1,49.5],sand:49.5,sea:76};
const cos=Math.cos(SITE_YAW),sin=Math.sin(SITE_YAW);
// Site coordinates to world coordinates, as [x, z].
export function toWorld(x,z){return [x*cos+z*sin,-x*sin+z*cos];}
// Where the low sun sits: behind the headland, as seen from the plaza.
const SUN=new THREE.Vector3(-.8,.04,-.6).normalize();
export const sunDirection=SUN.clone();

export function createSky(){
  const material=new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,fog:false,
    uniforms:{zenith:{value:new THREE.Color('#0b1826')},mid:{value:new THREE.Color('#3a5670')},haze:{value:new THREE.Color(HAZE)},glow:{value:new THREE.Color('#e2a983')},rose:{value:new THREE.Color('#7c7890')},deep:{value:new THREE.Color('#0c151c')},sun:{value:SUN.clone()},gains:{value:new THREE.Vector3(.82,.42,.22)}},
    vertexShader:'varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`uniform vec3 zenith,mid,haze,glow,rose,deep,sun,gains;varying vec3 vDir;
      void main(){
        vec3 d=normalize(vDir);float h=d.y;
        vec3 c=mix(haze,mid,smoothstep(0.,.2,h));c=mix(c,zenith,smoothstep(.12,.7,h));
        float az=max(dot(normalize(vec3(d.x,0.,d.z)),normalize(vec3(sun.x,0.,sun.z))),0.);
        float low=exp(-pow(max(h,0.)/.085,1.25)),high=exp(-pow(max(h,0.)/.24,1.4));
        c=mix(c,rose,high*pow(az,1.6)*gains.y);
        c=mix(c,glow,low*pow(az,3.)*gains.x);
        float toSun=max(dot(d,sun),0.);
        c+=glow*(pow(toSun,40.)*.27+pow(toSun,900.)*1.4)*gains.z;
        c=mix(deep,c,smoothstep(-.45,-.01,h));
        gl_FragColor=vec4(c,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(760,48,24),material);mesh.name='AERA_SKY';mesh.frustumCulled=false;mesh.renderOrder=-10;
  // Sky for a moment of the day (see daylight.js); returns the sun direction in world coordinates.
  function setDaylight(s){
    const u=material.uniforms,[x,z]=toWorld(s.sun[0],s.sun[2]);
    for(const key of ['zenith','mid','haze','glow','rose'])u[key].value.set(s[key]);
    u.gains.value.set(s.glowLow,s.glowHigh,s.disc);u.sun.value.set(x,s.sun[1],z).normalize();
    return u.sun.value;
  }
  return {mesh,sun:SUN,setDaylight};
}

function waveNormals(size=128){
  // Tileable height field from a few sines, differentiated into a normal map.
  const height=(x,y)=>{const u=x/size*Math.PI*2,v=y/size*Math.PI*2;return Math.sin(u*3+v*2)*.5+Math.sin(u*7-v*5+1.3)*.26+Math.sin(u*13+v*11+.7)*.14+Math.sin(u*2-v*9+2.1)*.2+Math.sin(u*19-v*17)*.07;};
  const canvas=document.createElement('canvas');canvas.width=canvas.height=size;const ctx=canvas.getContext('2d'),image=ctx.createImageData(size,size);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const dx=(height(x+1,y)-height(x-1,y))*1.6,dy=(height(x,y+1)-height(x,y-1))*1.6,l=Math.hypot(dx,dy,1),i=(y*size+x)*4;
    image.data[i]=(-dx/l*.5+.5)*255;image.data[i+1]=(-dy/l*.5+.5)*255;image.data[i+2]=(1/l*.5+.5)*255;image.data[i+3]=255;
  }
  ctx.putImageData(image,0,0);const t=new THREE.CanvasTexture(canvas);t.wrapS=t.wrapT=THREE.RepeatWrapping;return t;
}
function canvasTexture(w,h,draw,{repeat=[1,1],srgb=true}={}){
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;draw(canvas.getContext('2d'),w,h);
  const t=new THREE.CanvasTexture(canvas);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(...repeat);if(srgb)t.colorSpace=THREE.SRGBColorSpace;return t;
}

export function buildLeblon({scene,architecture,box,cylinder,sphere,material,materials,lantern,random,anisotropy=4,keepClear=[]}){
  const still=matchMedia('(prefers-reduced-motion: reduce)');
  // `site` joins the merged architectural batches; `far` holds everything that stays its own draw call.
  const site=new THREE.Group();site.rotation.y=SITE_YAW;architecture.add(site);
  const far=new THREE.Group();far.name='AERA_LEBLON';far.rotation.y=SITE_YAW;scene.add(far);
  const B=(x,y,z,w,h,d,m)=>box(x,y,z,w,h,d,m,site),C=(x,y,z,r,h,m)=>cylinder(x,y,z,r,h,m,site),S=(x,y,z,r,m,scale)=>sphere(x,y,z,r,m,site,scale);
  const flat=(w,d,x,y,z,m)=>{const o=new THREE.Mesh(new THREE.PlaneGeometry(w,d),m);o.rotation.x=-Math.PI/2;o.position.set(x,y,z);far.add(o);return o;};
  const span=1500,[a0,a1]=shore.avenue,[c0,c1]=shore.cycle,[b0,b1]=shore.boardwalk;
  const {concrete,steel,limestone,oakDark,oak,trim}=materials;
  // Distance from a site point to the pavilion, and to the sight lines the cameras need open.
  const fromPavilion=(x,z)=>Math.hypot(x,z);
  const blocksView=(x,z,margin)=>{const [wx,wz]=toWorld(x,z);return keepClear.some(([px,pz])=>{const l=Math.hypot(px,pz),t=Math.max(0,Math.min(1,(wx*px+wz*pz)/(l*l)));return Math.hypot(wx-px*t,wz-pz*t)<margin;});};

  // Sand, wet sand and sea. One plane for the water; a scrolling normal map and the low light do the rest.
  const sandMap=canvasTexture(256,256,(c,w)=>{c.fillStyle='#e9e2d4';c.fillRect(0,0,w,w);let n=31;const r=()=>{n=(n*16807)%2147483647;return n/2147483647;};for(let i=0;i<9000;i++){c.fillStyle=r()>.5?'rgba(255,245,225,.05)':'rgba(0,0,0,.06)';c.fillRect(r()*w,r()*w,2,2);}},{repeat:[300,140]});
  flat(span,690,0,-.34,shore.sand+345,new THREE.MeshStandardMaterial({color:'#6b6558',roughness:.97,map:sandMap})).name='AERA_SAND';
  const normals=waveNormals();normals.repeat.set(span/34,640/34);normals.anisotropy=anisotropy;
  const seaMaterial=new THREE.MeshStandardMaterial({color:'#0b2530',roughness:.34,metalness:.3,normalMap:normals,normalScale:new THREE.Vector2(.2,.2),envMapIntensity:.8});
  flat(span,640,0,-.3,shore.sea+320,seaMaterial).name='AERA_SEA';
  flat(span,16,0,-.332,shore.sea-6,new THREE.MeshStandardMaterial({color:'#4a4640',roughness:.22,metalness:.25,envMapIntensity:1.2})).name='AERA_WET_SAND';
  const foamMap=canvasTexture(512,64,(c,w,h)=>{
    c.clearRect(0,0,w,h);let n=91;const r=()=>{n=(n*16807)%2147483647;return n/2147483647;};
    for(let i=0;i<260;i++){const x=r()*w,y=h*.5+(r()-.5)*h*.55*(r()+.3),l=14+r()*70,a=.08+r()*.3;c.fillStyle=`rgba(236,240,238,${a})`;c.beginPath();c.ellipse(x,y,l,1.2+r()*3.2,0,0,Math.PI*2);c.fill();if(x+l>w){c.beginPath();c.ellipse(x-w,y,l,1.2+r()*3.2,0,0,Math.PI*2);c.fill();}}
  },{repeat:[span/46,1]});
  const foam=[0,1,2,3].map(i=>{
    const m=new THREE.MeshBasicMaterial({map:foamMap.clone(),transparent:true,opacity:.5,depthWrite:false});m.map.offset.x=i*.37;m.map.needsUpdate=true;
    const o=flat(span,2.6+i*1.2,0,-.292+i*.002,shore.sea+1+i*(5.5+i*3),m);o.userData.base=o.position.z;o.userData.phase=i*2.1;return o;
  });

  // Avenue, kerbs, cycle lane and the seafront promenade. Boxes join the architectural batches.
  const asphalt=material('asphalt','#1e2327',.5,.12);
  const paint=material('roadPaint','#aaa89d',.8);
  const cycle=material('cycleLane','#4b332e',.7);
  const paving=material('boardwalk','#aaa69b',.72,.02);
  paving.map=canvasTexture(256,256,(c,w)=>{
    // Original fish-scale mosaic in two stones; not a reproduction of any existing promenade pattern.
    c.fillStyle='#c4c0b5';c.fillRect(0,0,w,w);c.strokeStyle='#4a4e50';c.lineWidth=13;
    for(let r=-1;r<5;r++)for(let k=-1;k<3;k++){c.beginPath();c.arc(k*128+(r%2?64:0)+64,r*64+64,56,Math.PI,Math.PI*2);c.stroke();}
    let n=5;const rnd=()=>{n=(n*16807)%2147483647;return n/2147483647;};
    for(let i=0;i<2600;i++){c.fillStyle=rnd()>.5?'rgba(255,255,255,.05)':'rgba(0,0,0,.07)';c.fillRect(rnd()*w,rnd()*w,2,2);}
  },{repeat:[span/3.2,2]});paving.map.anisotropy=anisotropy;
  B(0,-.368,(a0+a1)/2,span,.05,a1-a0,asphalt);
  B(0,-.29,a0-.12,span,.14,.24,concrete);B(0,-.27,a1+.1,span,.17,.22,concrete);
  B(0,-.275,(c0+c1)/2,span,.14,c1-c0,cycle);
  for(const z of [c0+.1,c1-.14])B(0,-.203,z,span,.004,.09,paint);
  B(0,-.27,(b0+b1)/2,span,.15,b1-b0,paving);
  B(0,-.2,b1+.15,span,.3,.3,concrete);
  for(const lane of [a0+4,a0+8])for(let x=-246;x<250;x+=9)B(x,-.341,lane,3.2,.004,.13,paint);
  for(const x of [-9,38])for(let i=0;i<13;i++)B(x,-.341,a0+.75+i*.88,3.6,.004,.46,paint);

  // Street light: lamp heads glow, light pools are additive decals. No extra real lights.
  const poolMap=canvasTexture(128,128,(c)=>{const g=c.createRadialGradient(64,64,2,64,64,64);g.addColorStop(0,'rgba(255,206,150,.95)');g.addColorStop(.35,'rgba(255,186,120,.38)');g.addColorStop(1,'rgba(255,170,100,0)');c.fillStyle=g;c.fillRect(0,0,128,128);});
  const pools=new THREE.MeshBasicMaterial({map:poolMap,transparent:true,opacity:.2,depthWrite:false,blending:THREE.AdditiveBlending});
  const lampHead=new THREE.MeshBasicMaterial({color:'#ffd9a8',toneMapped:false});
  const poolGeometries=[];
  const pool=(x,z,r,y)=>{const g=new THREE.PlaneGeometry(r*2,r*2);g.rotateX(-Math.PI/2);g.translate(x,y,z);poolGeometries.push(g);};
  for(let x=-243;x<=243;x+=18){
    if(blocksView(x,a0-.8,5))continue;
    B(x,3.3,a0-.8,.16,7.3,.16,steel);B(x,6.9,a0+.6,.1,.1,2.9,steel);B(x,6.82,a0+1.9,.5,.08,.9,lampHead);
    pool(x,a0+2.6,8,-.338);pool(x,a0-2,4.5,-.345);
  }
  for(let x=-246;x<=246;x+=12){C(x,1.55,b1-.6,.045,3.6,steel);S(x,3.42,b1-.6,.17,lantern);pool(x,b1-1.6,3.4,-.19);}
  const poolMesh=new THREE.Mesh(mergeGeometries(poolGeometries,false),pools);poolMesh.name='AERA_LIGHT_POOLS';poolMesh.renderOrder=2;far.add(poolMesh);poolGeometries.forEach(g=>g.dispose());

  // Promenade furniture: benches, bicycle stands, a closed kiosk, a volleyball net on the sand.
  for(let x=-150;x<=150;x+=21){
    B(x+5,.02,b1-1.5,1.9,.07,.5,oak);B(x+5,.3,b1-1.28,1.9,.34,.05,oak);for(const dx of [-.8,.8])B(x+5+dx,-.1,b1-1.5,.06,.2,.44,steel);
  }
  const rings=[];
  for(const x of [-64,22,71])for(let i=0;i<3;i++){
    const bx=x+i*.75,bz=b0+.9;B(bx,.12,bz,.03,.55,.9,steel);
    for(const dz of [-.52,.52]){const g=new THREE.TorusGeometry(.33,.018,5,18);g.rotateY(Math.PI/2);g.translate(bx+.12,.14,bz+dz);rings.push(g);}
    B(bx+.12,.34,bz,.025,.025,1.0,trim);B(bx+.12,.5,bz-.3,.03,.3,.03,trim);B(bx+.12,.56,bz+.38,.3,.03,.03,trim);
  }
  far.add(new THREE.Mesh(mergeGeometries(rings,false),trim));rings.forEach(g=>g.dispose());
  B(-33,1.05,b0+2.9,4.4,2.5,2.7,oakDark);B(-33,2.38,b0+2.9,6.4,.14,4.3,steel);B(-33,.9,b0+1.45,4.4,.08,.5,limestone);
  for(const x of [-34.4,-33,-31.6])C(x,.2,b0+.9,.17,.75,trim);
  for(const x of [14,23.5])C(x,.9,62,.05,2.5,steel);
  const net=new THREE.Mesh(new THREE.PlaneGeometry(9.5,1),new THREE.MeshBasicMaterial({color:'#dfe4e2',transparent:true,opacity:.2,side:THREE.DoubleSide,depthWrite:false}));net.position.set(18.75,1.62,62);far.add(net);
  for(const y of [1.14,2.1])B(18.75,y,62,9.5,.035,.02,paint);

  // Coconut palms: one trunk and one crown geometry, instanced.
  const trunkCurve=new THREE.CatmullRomCurve3([[0,0,0],[.22,2.8,0],[.62,5.8,0],[1.05,8.4,0]].map(p=>new THREE.Vector3(...p)));
  const trunkGeometry=new THREE.TubeGeometry(trunkCurve,9,.15,6,false);
  const fronds=[];
  for(let k=0;k<13;k++){
    const length=3.1+(k%3)*.35,g=new THREE.PlaneGeometry(length,.85,7,2),p=g.attributes.position;
    for(let i=0;i<p.count;i++){
      const t=Math.min(1,Math.max(0,p.getX(i)/length+.5)),z=p.getY(i);
      p.setXYZ(i,t*length,-Math.pow(t,2.1)*(1.5+(k%4)*.25)-Math.abs(z)*.55*(1-t*.5),z*(1-Math.pow(t,2)*.85));
    }
    g.rotateZ(.62-(k%5)*.17);g.rotateY(k/13*Math.PI*2+(k%2)*.2);g.translate(1.05,8.4,0);g.computeVertexNormals();fronds.push(g);
  }
  const crownGeometry=mergeGeometries(fronds,false);fronds.forEach(g=>g.dispose());
  const palmSpots=[];
  for(let x=-250;x<=250;x+=8+random()*6){
    palmSpots.push([x,shore.sand+1.4+random()*1.6,.8+random()*.4]);
    if(random()>.6)palmSpots.push([x+2+random()*2,shore.sand+5+random()*6,.7+random()*.35]);
  }
  for(let i=0;i<26;i++){const x=-90+random()*190,z=-18+random()*42;if(fromPavilion(x,z)>31&&!blocksView(x,z,9))palmSpots.push([x,z,.75+random()*.35]);}
  const trunkMaterial=new THREE.MeshStandardMaterial({color:'#4a4238',roughness:.95});
  const crownMaterial=new THREE.MeshStandardMaterial({color:'#2f4838',roughness:.78,side:THREE.DoubleSide});
  const trunks=new THREE.InstancedMesh(trunkGeometry,trunkMaterial,palmSpots.length),crowns=new THREE.InstancedMesh(crownGeometry,crownMaterial,palmSpots.length);
  const dummy=new THREE.Object3D();
  palmSpots.forEach(([x,z,s],i)=>{dummy.position.set(x,-.35,z);dummy.rotation.set((random()-.5)*.1,random()*Math.PI*2,(random()-.5)*.1);dummy.scale.set(s,s*(.9+random()*.25),s);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);crowns.setMatrixAt(i,dummy.matrix);});
  trunks.name='AERA_PALM_TRUNKS';crowns.name='AERA_PALM_CROWNS';far.add(trunks,crowns);

  // Plaza and street trees, plus low restinga scrub at the edge of the sand: the same blob cluster, instanced.
  const blob=new THREE.IcosahedronGeometry(1,1),blobs=[];
  for(const [x,y,z,r,sy] of [[0,5.2,0,2.1,.7],[1.5,4.6,.6,1.5,.65],[-1.4,4.8,-.5,1.6,.6],[.3,6.2,-.9,1.4,.6],[-.5,5.9,1.1,1.5,.6],[.9,5.5,-1.7,1.2,.6]]){const g=blob.clone();g.scale(r,r*sy,r);g.translate(x,y,z);blobs.push(g);}
  const canopyGeometry=mergeGeometries(blobs,false);blobs.forEach(g=>g.dispose());blob.dispose();
  const stemGeometry=new THREE.CylinderGeometry(.13,.2,4.2,6);stemGeometry.translate(0,2.1,0);
  const treeSpots=[];
  for(let i=0;i<120&&treeSpots.length<46;i++){const x=-96+random()*200,z=-58+random()*82;if(fromPavilion(x,z)>33&&!blocksView(x,z,13))treeSpots.push([x,z,.8+random()*.6]);}
  for(let x=-250;x<=250;x+=14)if(Math.abs(x-10)>110)treeSpots.push([x+random()*3,a0-3.2,.7+random()*.3]);
  const leafMaterial=new THREE.MeshStandardMaterial({color:'#2f4234',roughness:.97,flatShading:true});
  const canopies=new THREE.InstancedMesh(canopyGeometry,leafMaterial,treeSpots.length),stems=new THREE.InstancedMesh(stemGeometry,trunkMaterial,treeSpots.length);
  treeSpots.forEach(([x,z,s],i)=>{dummy.position.set(x,-.3,z);dummy.rotation.set(0,random()*Math.PI*2,0);dummy.scale.set(s,s,s);dummy.updateMatrix();canopies.setMatrixAt(i,dummy.matrix);stems.setMatrixAt(i,dummy.matrix);});
  const scrubSpots=[];for(let x=-250;x<=250;x+=2.2+random()*3.4)scrubSpots.push([x,shore.sand+.9+random()*3.6,.16+random()*.2]);
  const scrub=new THREE.InstancedMesh(canopyGeometry,new THREE.MeshStandardMaterial({color:'#3a4a36',roughness:1,flatShading:true}),scrubSpots.length);
  scrubSpots.forEach(([x,z,s],i)=>{dummy.position.set(x,-.35-4.2*s*.9,z);dummy.rotation.set(0,random()*Math.PI*2,0);dummy.scale.set(s*1.6,s,s*1.6);dummy.updateMatrix();scrub.setMatrixAt(i,dummy.matrix);});
  far.add(canopies,stems,scrub);

  // Neighbourhood: residential blocks of different width, height, tone and crown. One draw call.
  const cells=8,cell=3.1;
  const lit=[];let wn=17;const wr=()=>{wn=(wn*16807)%2147483647;return wn/2147483647;};
  for(let i=0;i<cells*cells;i++)lit.push(wr()<.13?(wr()<.85?'#ffc98c':'#cfe2ea'):null);
  // Each floor is a long recessed balcony behind a slab edge and a rail, split by slim piers: the usual seafront block.
  const facadeMap=canvasTexture(256,256,(c)=>{c.fillStyle='#4c5258';c.fillRect(0,0,256,256);for(let y=0;y<cells;y++){c.fillStyle='#1d242a';c.fillRect(0,y*32+4,256,19);c.fillStyle='#2b3238';c.fillRect(0,y*32+17,256,6);c.fillStyle='#646a6e';c.fillRect(0,y*32+25,256,7);for(let x=0;x<cells;x++){c.fillStyle='#4c5258';c.fillRect(x*32,y*32+4,3,21);}}});
  const glowMap=canvasTexture(256,256,(c)=>{c.fillStyle='#000';c.fillRect(0,0,256,256);for(let y=0;y<cells;y++)for(let x=0;x<cells;x++){const v=lit[y*cells+x];if(!v)continue;c.fillStyle=v;c.globalAlpha=.3+wr()*.4;c.fillRect(x*32+4,y*32+5,wr()>.5?27:13,12);}c.globalAlpha=1;});
  const tones=[[.5,.5,.52],[.62,.59,.54],[.4,.43,.46],[.68,.66,.63],[.46,.42,.39]];
  const blocks=[];
  const volume=(x,z,w,h,d,tone,y=0)=>{
    const g=new THREE.BoxGeometry(w,h,d),uv=g.attributes.uv,ou=Math.floor(wr()*cells)/cells,ov=Math.floor(wr()*cells)/cells,blind=wr()<.55;
    for(let i=0;i<uv.count;i++){
      const face=Math.floor(i/4);
      // Roofs and, on most blocks, the two side walls are plain: blind gables between neighbours.
      if(face===2||face===3||(blind&&face<2)){uv.setXY(i,.02,.02);continue;}
      const run=face<2?d:w;uv.setXY(i,ou+uv.getX(i)*Math.max(1,Math.round(run/cell))/cells,ov+uv.getY(i)*Math.max(1,Math.round(h/cell))/cells);
    }
    const colors=new Float32Array(uv.count*3);for(let i=0;i<uv.count;i++)colors.set(tone,i*3);g.setAttribute('color',new THREE.BufferAttribute(colors,3));
    g.translate(x,y+h/2-.35,z);blocks.push(g);
  };
  const block=(x,z,w,h,d)=>{
    // Nothing is built where the orbit camera can travel.
    const [wx,wz]=toWorld(x,z);if(Math.hypot(wx,wz)<(wz>-30?104:84))return;
    // The avenue keeps an open corridor to the headland.
    if(x<0&&z>-48&&Math.hypot(x,z)<175)return;
    const tone=tones[Math.floor(wr()*tones.length)],kind=wr();
    volume(x,z,w,h,d,tone);
    if(kind<.4)volume(x,z,w*.62,cell*2,d*.66,tone,h);
    else if(kind<.6){volume(x-w*.2,z,w*.5,cell*3,d*.8,tone,h);}
    else if(kind<.72)volume(x,z,w+1.2,cell*.33,d+1.2,tone,h);
  };
  for(let x=-430;x<430;){const w=15+wr()*13,d=15+wr()*6;block(x+w/2,a0-7-d/2,w,cell*Math.round(4+wr()*4),d);x+=w+3+wr()*6;}
  for(let row=0;row<4;row++){
    const z=-22-row*31;
    for(let x=-430;x<430;){const w=15+wr()*13;block(x+w/2,z+wr()*5,w,cell*Math.round(5+wr()*5+row*1.6),16+wr()*5);x+=w+3+wr()*6;}
  }
  const city=new THREE.Mesh(mergeGeometries(blocks,false),new THREE.MeshStandardMaterial({map:facadeMap,emissiveMap:glowMap,emissive:'#ffffff',emissiveIntensity:.5,roughness:.9,vertexColors:true}));
  blocks.forEach(g=>g.dispose());city.name='AERA_CITY';far.add(city);

  // Headland with two peaks at the end of the avenue, hills behind the city and islands on the horizon.
  const top=new THREE.Color('#18212c'),base=new THREE.Color('#414c59');
  const massif=[];
  const dome=(x,z,radius,height,sx=1,sz=1,power=1.9,yaw=0)=>{
    const points=[];for(let i=0;i<=18;i++){const t=i/18;points.push(new THREE.Vector2(radius*Math.pow(Math.max(0,1-Math.pow(t,power)),.62),height*t));}
    const g=new THREE.LatheGeometry(points,28).toNonIndexed(),p=g.attributes.position,colors=new Float32Array(p.count*3),c=new THREE.Color();
    for(let i=0;i<p.count;i++){c.copy(base).lerp(top,Math.min(1,p.getY(i)/(height*.55)));colors.set([c.r,c.g,c.b],i*3);}
    g.setAttribute('color',new THREE.BufferAttribute(colors,3));g.deleteAttribute('uv');g.deleteAttribute('normal');g.scale(sx,1,sz);g.rotateY(yaw);g.translate(x,-.4,z);massif.push(g);
  };
  // The taller, sharper brother and the lower, rounder one, on a vegetated shoulder that runs into the sea.
  dome(-600,74,58,128,1,1.1,1.9,.2);dome(-596,-8,56,98,1,1.15,2.3,.1);dome(-610,30,150,34,1.3,1.5,1.6);dome(-690,60,150,42,1.2,1.6,1.5);dome(-760,-170,230,70,1.3,1.4,1.5);
  for(const [x,z,r,h] of [[-380,-560,230,95],[-90,-600,260,125],[200,-580,240,150],[470,-520,230,105],[640,-380,210,80]])dome(x,z,r,h,1.3,1,1.7);
  for(const [x,z,r,h] of [[150,640,26,13],[196,655,17,8],[238,632,34,10],[-110,660,30,12],[-60,668,15,7]])dome(x,z,r,h,1.5,1,1.6);
  const silhouettes=new THREE.Mesh(mergeGeometries(massif,false),new THREE.MeshBasicMaterial({vertexColors:true,fog:false,side:THREE.DoubleSide}));
  massif.forEach(g=>g.dispose());silhouettes.name='AERA_HEADLAND';far.add(silhouettes);
  const sparks=[];
  for(let i=0;i<120;i++){const a=Math.PI*(-.42+wr()*.62),t=.05+wr()*wr()*.5,r=150*Math.pow(1-Math.pow(t,1.6),.62)+.6;sparks.push(-610+Math.cos(a)*r*1.3,-.4+34*t,30+Math.sin(a)*r*1.5);}
  for(let i=0;i<70;i++)sparks.push(-420+wr()*900,2+wr()*26,-470-wr()*30);
  const sparkGeometry=new THREE.BufferGeometry();sparkGeometry.setAttribute('position',new THREE.Float32BufferAttribute(sparks,3));
  const hillLights=new THREE.Points(sparkGeometry,new THREE.PointsMaterial({color:'#ffc890',size:1.5,sizeAttenuation:false,fog:false,transparent:true,opacity:.75,depthWrite:false}));far.add(hillLights);

  // Two slow cars on the avenue: scenery, not a system state.
  const carPaint=new THREE.MeshStandardMaterial({roughness:.35,metalness:.5,vertexColors:true}),carLights=new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false});
  const beamMap=canvasTexture(64,128,(c)=>{const g=c.createRadialGradient(32,118,2,32,70,64);g.addColorStop(0,'rgba(255,240,214,.9)');g.addColorStop(1,'rgba(255,240,214,0)');c.fillStyle=g;c.fillRect(0,0,64,128);});
  const beamMaterial=new THREE.MeshBasicMaterial({map:beamMap,transparent:true,opacity:.28,depthWrite:false,blending:THREE.AdditiveBlending});
  const tinted=(g,rgb)=>{const flatGeometry=g.index?g.toNonIndexed():g,n=flatGeometry.attributes.position.count,colors=new Float32Array(n*3);for(let i=0;i<n;i++)colors.set(rgb,i*3);flatGeometry.setAttribute('color',new THREE.BufferAttribute(colors,3));return flatGeometry;};
  const piece=(w,h,d,x,y,z,rgb)=>{const g=new THREE.BoxGeometry(w,h,d);g.translate(x,y,z);return tinted(g,rgb);};
  const cars=[[a0+2,5.2,[.09,.11,.13],40],[a0+6,6.6,[.42,.43,.44],-120]].map(([lane,speed,rgb,start])=>{
    const car=new THREE.Group();
    const wheels=[];for(const x of [-1.35,1.35])for(const z of [-.82,.82]){const g=new THREE.CylinderGeometry(.33,.33,.24,12);g.rotateX(Math.PI/2);g.translate(x,.33,z);wheels.push(tinted(g,[.03,.03,.035]));}
    const body=new THREE.Mesh(mergeGeometries([piece(4.4,.62,1.78,0,.62,0,rgb),piece(2.3,.5,1.6,.15,1.16,0,[.04,.05,.06]),piece(2.5,.05,1.66,.15,1.43,0,rgb),...wheels],false),carPaint);
    const lights=new THREE.Mesh(mergeGeometries([piece(.06,.12,.34,-2.21,.72,-.6,[1,.95,.82]),piece(.06,.12,.34,-2.21,.72,.6,[1,.95,.82]),piece(.06,.1,.4,2.21,.76,-.58,[.9,.1,.08]),piece(.06,.1,.4,2.21,.76,.58,[.9,.1,.08])],false),carLights);
    const beam=new THREE.Mesh(new THREE.PlaneGeometry(3.4,9),beamMaterial);beam.rotation.set(-Math.PI/2,0,-Math.PI/2);beam.position.set(-6.4,.02,0);
    car.add(body,lights,beam);car.position.set(start,-.343,lane);car.userData={speed,start};far.add(car);return car;
  });

  far.traverse(o=>{if(o.isMesh||o.isPoints){o.castShadow=false;o.receiveShadow=false;o.frustumCulled=false;}});
  let low=false,last=0;
  function update(now){
    if(low||still.matches||now-last<1000/24)return false;
    last=now;const t=now/1000;
    normals.offset.set(t*.004,t*.011);
    for(const o of foam){const s=Math.sin(t*.42+o.userData.phase);o.position.z=o.userData.base+s*1.5;o.material.opacity=.28+.26*(s*.5+.5);o.material.map.offset.x+=.00012;}
    for(const car of cars)car.position.x=260-((260-car.userData.start+t*car.userData.speed)%520);
    return true;
  }
  // The floor-plan cut shows the pavilion alone: trees and palms would be sliced by the clipping planes.
  // Street lamps, lit windows, hillside lights, sea and headland follow the moment of the day (see daylight.js).
  const lampOff=new THREE.Color('#6b7275'),lampOn=new THREE.Color('#ffd9a8');
  function setDaylight(s){
    lampHead.color.lerpColors(lampOff,lampOn,s.lamps);pools.opacity=.2*s.lamps;beamMaterial.opacity=.28*s.lamps;
    city.material.emissiveIntensity=.5*s.windows;hillLights.material.opacity=.75*s.nightLights;hillLights.visible=s.nightLights>.02;
    seaMaterial.color.set(s.sea);silhouettes.material.color.setRGB(...s.hills);
  }
  return {update,setDaylight,setLow(value){low=!!value;},setVisible(value){far.visible=!!value;}};
}
