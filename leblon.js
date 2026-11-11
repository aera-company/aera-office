import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// The site around the pavilion: a fictional Leblon front at the turn from golden hour to blue hour.
// Everything is procedural and generic; no real building, brand or sign is reproduced.
// The site has its own frame, turned against the building so the avenue passes diagonally in front of the plaza:
// site +z runs towards the sea, site -x runs west along the avenue to the twin-peak headland.
export const HAZE='#5b6672';
export const SITE_YAW=-Math.PI/6;
export const shore={avenue:[28.5,40.5],cycle:[40.7,43.1],boardwalk:[43.1,49.5],sand:49.5,sea:68};
const cos=Math.cos(SITE_YAW),sin=Math.sin(SITE_YAW);
// Site coordinates to world coordinates, as [x, z].
export function toWorld(x,z){return [x*cos+z*sin,-x*sin+z*cos];}
// Direction the wind blows toward, in world x, z, from the compass bearing it comes from (site frame: +x east, +z south, out to sea).
export function downwind(from=160){const a=(from+180)*Math.PI/180,[x,z]=toWorld(Math.sin(a),-Math.cos(a));return new THREE.Vector2(x,z).normalize();}
// Where the low sun sits: behind the headland, as seen from the plaza.
const SUN=new THREE.Vector3(-.8,.04,-.6).normalize();
export const sunDirection=SUN.clone();
// The moon hangs low over the sea (site frame), so at night its path of light runs across the water toward the beach.
const MOON_SITE=[-.12,.14,.98];

export function createSky(){
  const material=new THREE.ShaderMaterial({
    side:THREE.BackSide,depthWrite:false,fog:false,
    uniforms:{zenith:{value:new THREE.Color('#0b1826')},mid:{value:new THREE.Color('#3a5670')},haze:{value:new THREE.Color(HAZE)},glow:{value:new THREE.Color('#e2a983')},rose:{value:new THREE.Color('#7c7890')},deep:{value:new THREE.Color('#0c151c')},sun:{value:SUN.clone()},gains:{value:new THREE.Vector3(.82,.42,.22)},moon:{value:new THREE.Vector3()},moonLight:{value:0},
      cloud:{value:.12},time:{value:0},drift:{value:new THREE.Vector2(.012,.004)},cloudLight:{value:new THREE.Color('#d9dde0')},cloudShade:{value:new THREE.Color('#7d8790')}},
    vertexShader:'varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader:`uniform vec3 zenith,mid,haze,glow,rose,deep,sun,gains,moon,cloudLight,cloudShade;uniform float moonLight,cloud,time;uniform vec2 drift;varying vec3 vDir;
      float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<5;i++){v+=a*noise(p);p=p*2.07+vec2(13.7,5.1);a*=.5;}return v;}
      void main(){
        vec3 d=normalize(vDir);float h=d.y;
        vec3 c=mix(haze,mid,smoothstep(0.,.2,h));c=mix(c,zenith,smoothstep(.12,.7,h));
        float az=max(dot(normalize(vec3(d.x,0.,d.z)),normalize(vec3(sun.x,0.,sun.z))),0.);
        float low=exp(-pow(max(h,0.)/.085,1.25)),high=exp(-pow(max(h,0.)/.24,1.4));
        c=mix(c,rose,high*pow(az,1.6)*gains.y);
        c=mix(c,glow,low*pow(az,3.)*gains.x);
        float toSun=max(dot(d,sun),0.);
        c+=glow*(pow(toSun,40.)*.27+pow(toSun,900.)*1.4)*gains.z;
        float toMoon=dot(d,moon);c+=vec3(.86,.9,1.)*moonLight*(smoothstep(.99955,.9998,toMoon)*1.4+pow(max(toMoon,0.),260.)*.08);
        // Clouds: a layer seen from below, drifting with the wind. The cloud uniform sets how much of the sky they cover;
        // the side facing the sun is lit, the rest is shaded, and the edges near the sun shine.
        if(h>0.&&cloud>.02){
          vec2 q=d.xz/(h+.1)*.9+drift*time;
          float n=fbm(q),dens=smoothstep(.64-.5*cloud,.84-.46*cloud,n)*smoothstep(0.,.16,h);
          float facing=clamp((n-fbm(q+normalize(sun.xz+1e-4)*.09))*5.+.5,0.,1.);
          vec3 cc=mix(cloudShade,cloudLight,facing*.75+.25*(1.-dens));
          cc+=glow*pow(toSun,6.)*(1.-dens)*.55*gains.x;
          c=mix(c,cc,dens*.94);
        }
        c=mix(deep,c,smoothstep(-.45,-.01,h));
        gl_FragColor=vec4(c,1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  {const [mx,mz]=toWorld(MOON_SITE[0],MOON_SITE[2]);material.uniforms.moon.value.set(mx,MOON_SITE[1],mz).normalize();}
  const cloudWhite=new THREE.Color('#f1f2f2'),cloudNight=new THREE.Color('#1c1e22');
  const mesh=new THREE.Mesh(new THREE.SphereGeometry(760,48,24),material);mesh.name='AERA_SKY';mesh.frustumCulled=false;mesh.renderOrder=-10;
  // Sky for a moment of the day (see daylight.js); returns the sun direction in world coordinates.
  function setDaylight(s){
    const u=material.uniforms,[x,z]=toWorld(s.sun[0],s.sun[2]);
    for(const key of ['zenith','mid','haze','glow','rose'])u[key].value.set(s[key]);
    u.gains.value.set(s.glowLow,s.glowHigh,s.disc);u.moonLight.value=s.nightLights*(1-(s.overcast||0));u.sun.value.set(x,s.sun[1],z).normalize();
    // Cloud tones follow the light: bright grey by day, warm-lit at sunset, dark with a touch of city glow at night.
    const b=Math.min(1,s.bright/.8);u.cloud.value=s.cloud??.12;
    u.cloudLight.value.set(s.haze).lerp(cloudWhite,.5*b).lerp(u.glow.value,.25*s.glowLow*(1-(s.overcast||0)));
    u.cloudShade.value.set(s.mid).lerp(cloudNight,1-b).multiplyScalar(.82);
    return u.sun.value;
  }
  // Clouds drift downwind.
  function setWind(wind,from=160){material.uniforms.drift.value.copy(downwind(from)).multiplyScalar(.004+.02*wind);}
  function tick(t){material.uniforms.time.value=t;}
  return {mesh,sun:SUN,setDaylight,setWind,tick};
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

// The sea surface. Coordinates are the site's: +z runs out to sea, `shoreline` is where the water meets the sand at rest.
function createOcean({span,shoreline,start,depth}){
  const geometry=new THREE.PlaneGeometry(span,depth,1,1);geometry.rotateX(-Math.PI/2);geometry.translate(0,-.3,start+depth/2);
  const uniforms=THREE.UniformsUtils.merge([THREE.UniformsLib.fog,{
    time:{value:0},shoreline:{value:shoreline},yaw:{value:SITE_YAW},bright:{value:0},wind:{value:.25},rain:{value:0},
    shallow:{value:new THREE.Color('#2a9a9a')},deep:{value:new THREE.Color('#0b2530')},sand:{value:new THREE.Color('#7a7262')},
    skyTop:{value:new THREE.Color('#3a5670')},skyHorizon:{value:new THREE.Color(HAZE)},
    glintColor:{value:new THREE.Color('#ffe2c0')},glintDir:{value:new THREE.Vector3(0,.1,-1)},glint:{value:1}
  }]);
  const material=new THREE.ShaderMaterial({uniforms,fog:true,transparent:true,depthWrite:true,
    vertexShader:`varying vec3 vLocal;varying vec3 vWorld;
      #include <fog_pars_vertex>
      void main(){vLocal=position;vec4 world=modelMatrix*vec4(position,1.);vWorld=world.xyz;vec4 mvPosition=viewMatrix*world;gl_Position=projectionMatrix*mvPosition;
      #include <fog_vertex>
      }`,
    fragmentShader:`uniform float time,shoreline,yaw,bright,glint,wind,rain;uniform vec3 shallow,deep,sand,skyTop,skyHorizon,glintColor,glintDir;
      varying vec3 vLocal;varying vec3 vWorld;
      #include <fog_pars_fragment>
      float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      float fbm(vec2 p){float v=0.,a=.5;for(int i=0;i<4;i++){v+=a*noise(p);p=p*2.03+vec2(17.1,9.2);a*=.5;}return v;}
      // Height slope of the swell and chop at p (site x, z). Waves run toward the beach (-z).
      vec2 slope(vec2 p,float detail){
        vec2 g=vec2(0.);
        vec4 w[6];
        w[0]=vec4(normalize(vec2(.12,-1.)),17.,.32);w[1]=vec4(normalize(vec2(-.2,-1.)),11.,.2);w[2]=vec4(normalize(vec2(.35,-1.)),7.,.12);
        w[3]=vec4(normalize(vec2(1.,-.6)),3.1,.045);w[4]=vec4(normalize(vec2(-.8,-.5)),1.9,.03);w[5]=vec4(normalize(vec2(.3,.9)),1.1,.018);
        for(int i=0;i<6;i++){
          float k=6.2832/w[i].z,speed=sqrt(9.8/k),phase=k*dot(w[i].xy,-p)-k*speed*time*.55;
          float a=w[i].w*(i>2?detail*(.625+1.5*wind):.875+.5*wind);g+=w[i].xy*(-a*k*cos(phase));
        }
        return g;
      }
      void main(){
        vec2 p=vLocal.xz;float d=p.y-shoreline;
        vec3 toCamera=cameraPosition-vWorld;float dist=length(toCamera);vec3 V=toCamera/dist;
        float detail=1.-smoothstep(22.,160.,dist);
        // The swash: the water's edge runs up and back down the sand, uneven along the beach.
        float edge=-2.6+3.2*sin(time*.38+p.x*.006)+2.*(fbm(vec2(p.x*.045,time*.07))-.5);
        float wet=d-edge;
        vec2 g=slope(p,detail)*(.35+.65*smoothstep(-2.,10.,wet))*.62*mix(1.,.16,smoothstep(40.,260.,dist));
        // Rain stipples the surface: fine pits that come and go.
        if(rain>0.){vec2 r=p*3.1;g+=rain*detail*.35*(vec2(noise(r+time*9.),noise(r.yx-time*7.3))-.5);}
        vec3 nLocal=normalize(vec3(-g.x,1.,-g.y));
        float c=cos(yaw),s=sin(yaw);vec3 n=normalize(vec3(nLocal.x*c+nLocal.z*s,nLocal.y,-nLocal.x*s+nLocal.z*c));
        // Water colour: turquoise over the sand bar, deep blue offshore.
        vec3 water=mix(shallow,deep,smoothstep(2.,38.,d));
        water=mix(mix(sand,shallow,.55),water,smoothstep(0.,7.,wet));
        float sunUp=clamp(glintDir.y*3.,0.,1.);
        vec3 col=water*(.55+.45*max(dot(n,normalize(glintDir)),0.)*sunUp+.25*bright);
        // Sky reflection with Fresnel, then the sun or moon glint.
        vec3 r=reflect(-V,n);vec3 sky=mix(skyHorizon*.82,skyTop,smoothstep(0.,.45,r.y));
        float fres=.02+.98*pow(1.-max(dot(n,V),0.),5.);
        col=mix(col,sky,clamp(fres*.62,0.,1.));
        float toSun=max(dot(r,normalize(glintDir)),0.);
        col+=glintColor*glint*(pow(toSun,700.)*2.2+pow(toSun,60.)*.12+pow(toSun,160.)*.9*(1.-bright)*step(glintDir.y,.2))*smoothstep(-2.,6.,wet);
        // Breaking waves: fronts rolling in through the surf zone, leaving foam behind them that thins out.
        float zone=smoothstep(22.,8.,d)*smoothstep(-1.,3.,wet);
        float sets=d/8.5+time*.13+.12*fbm(vec2(p.x*.03,d*.05));
        float f=fract(sets);
        float crest=exp(-f*11.)+.14*exp(-f*3.)*fbm(vec2(p.x*.12,d*.25+time*.2));
        float breakup=smoothstep(.42,.78,fbm(vec2(p.x*.09,d*.18)+vec2(time*.03,-time*.05)));
        float foam=clamp(crest*breakup*zone*1.6,0.,1.);
        // Lace of foam at the edge of the swash, and a thin line far out where the swell breaks on the bar.
        foam=max(foam,exp(-max(wet,0.)*1.4)*smoothstep(.3,.65,fbm(vec2(p.x*.2,time*.3)))*smoothstep(-1.,0.,wet));
        foam=max(foam,smoothstep(.66,.9,fbm(vec2(p.x*.05,time*.04)))*exp(-abs(d-26.-2.*sin(time*.2))*.9)*.28);
        // With wind the surf zone gets busier and whitecaps break offshore.
        foam=clamp(foam*(.8+.6*wind),0.,1.);
        float caps=smoothstep(.7-.12*wind,.86,fbm(p*vec2(.11,.16)+vec2(time*.05,-time*.21)))*smoothstep(.45,1.,wind)*smoothstep(14.,40.,d)*(1.-smoothstep(120.,320.,dist));
        foam=max(foam,caps*.7);
        vec3 foamColor=mix(vec3(.16,.19,.22),vec3(.93,.95,.95),.25+.75*bright)*(.8+.2*mix(skyHorizon,skyTop,.5)*1.5);
        col=mix(col,foamColor,foam);
        // On the sand side of the swash: dark wet sand that mirrors the sky and dries off up the beach.
        float alpha=1.;
        if(wet<0.){
          float damp=smoothstep(-9.,-.2,wet);
          vec3 wetSand=sand*.55;wetSand=mix(wetSand,sky,.22+.4*fres);
          wetSand+=glintColor*glint*pow(toSun,180.)*.9;
          col=mix(wetSand,col,smoothstep(-.6,0.,wet));alpha=damp*.92;
        }
        gl_FragColor=vec4(col,alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        // Lighter haze than the land: the sea keeps its colour out to the horizon instead of fading to grey near the shore.
        #ifdef USE_FOG
          gl_FragColor.rgb=mix(gl_FragColor.rgb,fogColor,smoothstep(fogNear,fogFar*1.6,vFogDepth)*.85);
        #endif
      }`});
  const mesh=new THREE.Mesh(geometry,material);mesh.name='AERA_SEA';mesh.renderOrder=1;mesh.frustumCulled=false;
  const turquoise=new THREE.Color('#2fb5a8'),moon=new THREE.Vector3(),sun=new THREE.Vector3();
  const [mx,mz]=toWorld(MOON_SITE[0],MOON_SITE[2]);moon.set(mx,MOON_SITE[1],mz).normalize();
  function setDaylight(s){
    const [x,z]=toWorld(s.sun[0],s.sun[2]);sun.set(x,s.sun[1],z).normalize();
    uniforms.wind.value=s.wind??.25;uniforms.rain.value=s.rain||0;
    uniforms.deep.value.set(s.sea);uniforms.shallow.value.set(s.sea).lerp(turquoise,(.1+.42*s.bright)*(1-.6*(s.overcast||0)));
    uniforms.skyTop.value.set(s.mid);uniforms.skyHorizon.value.set(s.haze);uniforms.bright.value=s.bright;
    uniforms.glintDir.value.copy(moon).lerp(sun,s.sunKey).normalize();uniforms.glintColor.value.set(s.keyColor);uniforms.glint.value=(.55+.9*s.sunKey)*(1-.85*(s.overcast||0));
    uniforms.sand.value.set('#7d7464').multiplyScalar(.35+.65*s.bright+.15);
  }
  return {mesh,uniforms,setDaylight};
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
  const sand=new THREE.MeshStandardMaterial({color:'#6b6558',roughness:.97,map:sandMap});flat(span,690,0,-.34,shore.sand+345,sand).name='AERA_SAND';
  // The sea: one surface drawn by its own shader. Swell rolling in toward the beach, waves that break into foam in the
  // surf zone, the swash running up the sand and the wet strip it leaves, turquoise shallows turning deep blue, and the
  // sky of the hour reflected with the sun (or the moon) glinting on it. Only the time moves it; still with reduced motion.
  const ocean=createOcean({span,shoreline:shore.sea,start:shore.sea-14,depth:680});far.add(ocean.mesh);

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
  for(const x of [14,23.5])C(x,.9,57,.05,2.5,steel);
  const net=new THREE.Mesh(new THREE.PlaneGeometry(9.5,1),new THREE.MeshBasicMaterial({color:'#dfe4e2',transparent:true,opacity:.2,side:THREE.DoubleSide,depthWrite:false}));net.position.set(18.75,1.62,57);far.add(net);
  for(const y of [1.14,2.1])B(18.75,y,57,9.5,.035,.02,paint);

  // Wind in the vegetation: the vertex shader bends each palm frond (and, less, each tree canopy) downwind, with gusts
  // and a flutter that differ from one plant to the next. Nothing is recomputed on the CPU.
  const gust={time:{value:0},wind:{value:.25},windDir:{value:downwind(160)}};
  const sway=(m,{pivot,reach,height})=>{m.onBeforeCompile=shader=>{
    Object.assign(shader.uniforms,gust);
    shader.vertexShader='uniform float time,wind;uniform vec2 windDir;\n'+shader.vertexShader.replace('#include <project_vertex>',`
      vec4 world=vec4(transformed,1.);
      #ifdef USE_INSTANCING
        world=instanceMatrix*world;
      #endif
      world=modelMatrix*world;
      vec2 root=modelMatrix[3].xz;
      #ifdef USE_INSTANCING
        root+=instanceMatrix[3].xz;
      #endif
      float phase=root.x*.37+root.y*.23;
      float r=${reach};
      float gustPart=.55+.3*sin(time*1.3+phase*.5)+.15*sin(time*3.1+phase);
      float bend=wind*wind*gustPart*r;
      world.xz+=windDir*bend*${height};
      world.y-=bend*bend*.05;
      world.y+=sin(time*(5.+4.*wind)+phase*2.+r*1.7)*wind*r*.045;
      vec4 mvPosition=viewMatrix*world;
      gl_Position=projectionMatrix*mvPosition;`);
  };m.customProgramCacheKey=()=>'aera-sway-'+pivot;};

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
  sway(crownMaterial,{pivot:'palm',reach:'length(transformed.xz-vec2(1.05,0.))',height:'.42'});
  const trunks=new THREE.InstancedMesh(trunkGeometry,trunkMaterial,palmSpots.length),crowns=new THREE.InstancedMesh(crownGeometry,crownMaterial,palmSpots.length);
  const dummy=new THREE.Object3D();
  palmSpots.forEach(([x,z,s],i)=>{dummy.position.set(x,-.35,z);dummy.rotation.set((random()-.5)*.1,random()*Math.PI*2,(random()-.5)*.1);dummy.scale.set(s,s*(.9+random()*.25),s);dummy.updateMatrix();trunks.setMatrixAt(i,dummy.matrix);crowns.setMatrixAt(i,dummy.matrix);});
  trunks.name='AERA_PALM_TRUNKS';crowns.name='AERA_PALM_CROWNS';far.add(trunks,crowns);

  // Plaza and street trees, plus low restinga scrub at the edge of the sand: the same blob cluster, instanced.
  const blob=new THREE.IcosahedronGeometry(1,1),blobs=[];
  for(const [x,y,z,r,sy] of [[0,5.2,0,2.1,.7],[1.5,4.6,.6,1.5,.65],[-1.4,4.8,-.5,1.6,.6],[.3,6.2,-.9,1.4,.6],[-.5,5.9,1.1,1.5,.6],[.9,5.5,-1.7,1.2,.6]]){const g=blob.clone();g.scale(r,r*sy,r);g.translate(x,y,z);blobs.push(g);}
  const canopyGeometry=mergeGeometries(blobs,false);blobs.forEach(g=>g.dispose());blob.dispose();
  const stemGeometry=new THREE.CylinderGeometry(.13,.2,4.2,6);stemGeometry.translate(0,2.1,0);
  // Two kinds: the round street tree, and the beach almond (amendoeira) of the Rio seafront, whose leaves grow in flat
  // tiers on a leaning trunk and turn red and orange a few at a time.
  const tiers=[],disc=new THREE.IcosahedronGeometry(1,1);
  for(const [x,y,z,r,sy] of [[.3,3.3,0,2.7,.24],[1.1,3.5,.9,1.7,.22],[-.5,4.4,-.3,2.2,.24],[.2,5.3,.3,1.5,.26],[-1.2,3.6,-.8,1.6,.22]]){const g=disc.clone();g.scale(r,r*sy*2.2,r);g.translate(x,y,z);tiers.push(g);}
  const almondGeometry=mergeGeometries(tiers,false);tiers.forEach(g=>g.dispose());disc.dispose();
  const almondStem=new THREE.CylinderGeometry(.12,.2,4,6);almondStem.translate(0,2,0);almondStem.rotateZ(-.12);
  const treeSpots=[],almondSpots=[];
  for(let i=0;i<120&&treeSpots.length+almondSpots.length<46;i++){const x=-96+random()*200,z=-58+random()*82;if(fromPavilion(x,z)>33&&!blocksView(x,z,13))(random()<.35?almondSpots:treeSpots).push([x,z,.8+random()*.6]);}
  for(let x=-250;x<=250;x+=14)if(Math.abs(x-10)>110)almondSpots.push([x+random()*3,a0-3.2,.75+random()*.3]);
  const leafMaterial=new THREE.MeshStandardMaterial({color:'#ffffff',roughness:.97,flatShading:true});
  sway(leafMaterial,{pivot:'tree',reach:'max(transformed.y-3.,0.)',height:'.16'});
  // Each crown its own green; among the almonds, one in five has turned.
  const greens=['#2f4234','#36503a','#2a3d31','#3e5a3c','#334a2f'].map(c=>new THREE.Color(c)),autumn=['#8f4a2a','#a8612e','#6e4a2a'].map(c=>new THREE.Color(c));
  const planted=(geometry,stem,spots,turn)=>{
    const crowns=new THREE.InstancedMesh(geometry,leafMaterial,spots.length),stems=new THREE.InstancedMesh(stem,trunkMaterial,spots.length);
    spots.forEach(([x,z,s],i)=>{dummy.position.set(x,-.3,z);dummy.rotation.set(0,random()*Math.PI*2,0);dummy.scale.set(s,s*(.9+random()*.2),s);dummy.updateMatrix();crowns.setMatrixAt(i,dummy.matrix);stems.setMatrixAt(i,dummy.matrix);
      crowns.setColorAt(i,random()<turn?autumn[Math.floor(random()*autumn.length)]:greens[Math.floor(random()*greens.length)]);});
    far.add(crowns,stems);
  };
  planted(canopyGeometry,stemGeometry,treeSpots,0);planted(almondGeometry,almondStem,almondSpots,.2);
  // Restinga at the top of the sand: low, wide clumps in fresh and dusty greens, not boulders.
  const scrubSpots=[];for(let x=-250;x<=250;x+=1.6+random()*2.6)scrubSpots.push([x,shore.sand+.9+random()*3.6,.12+random()*.16]);
  const scrub=new THREE.InstancedMesh(canopyGeometry,new THREE.MeshStandardMaterial({color:'#ffffff',roughness:1,flatShading:true}),scrubSpots.length);
  const dune=['#3f5634','#4b5f38','#36492f','#56603c'].map(c=>new THREE.Color(c));
  scrubSpots.forEach(([x,z,s],i)=>{dummy.position.set(x,-.35-4.2*s*.95,z);dummy.rotation.set(0,random()*Math.PI*2,0);dummy.scale.set(s*2,s*1.15,s*2);dummy.updateMatrix();scrub.setMatrixAt(i,dummy.matrix);scrub.setColorAt(i,dune[Math.floor(random()*dune.length)]);});
  far.add(scrub);

  // Neighbourhood: residential blocks of different width, height, tone and crown. One draw call.
  const cells=8,cell=3.1;
  const lit=[];let wn=17;const wr=()=>{wn=(wn*16807)%2147483647;return wn/2147483647;};
  // About a third of the flats are lit after dark: mostly warm lamps, some cooler, a few blue with a screen on.
  for(let i=0;i<cells*cells;i++)lit.push(wr()<.3?['#ffc98c','#ffd9a6','#ffbf7a','#e9eef0','#9fb8ff'][Math.floor(wr()*wr()*5)]:null);
  // Cell 0 always glows: it is also where the glass lobbies at street level take their colour from.
  lit[0]='#ffd4a0';
  // Each floor is a long recessed balcony behind a pale slab edge and a glass rail, with sliding doors between slim
  // piers: the usual seafront block. The walls are light; the vertex colour gives each block its own paint.
  const facadeMap=canvasTexture(512,512,(c)=>{
    const u=64;c.fillStyle='#a8a7a2';c.fillRect(0,0,512,512);
    for(let y=0;y<cells;y++){
      const top=y*u;
      c.fillStyle='#39414a';c.fillRect(0,top+8,512,38);                 // recessed balcony, in shade
      for(let x=0;x<cells;x++){c.fillStyle='#55626c';c.fillRect(x*u+10,top+12,u-20,30);c.fillStyle='#7c8a93';c.fillRect(x*u+u/2-1,top+12,2,30);}
      c.fillStyle='rgba(170,196,204,.55)';c.fillRect(0,top+32,512,14);  // glass rail
      c.fillStyle='#c4c2bc';c.fillRect(0,top+46,512,10);                // slab edge
      c.fillStyle='#a7a6a1';c.fillRect(0,top+56,512,2);
      for(let x=0;x<cells;x++){c.fillStyle='#a8a7a2';c.fillRect(x*u,top+8,6,38);}
    }
  });
  const glowMap=canvasTexture(512,512,(c)=>{c.fillStyle='#000';c.fillRect(0,0,512,512);for(let y=0;y<cells;y++)for(let x=0;x<cells;x++){const v=lit[y*cells+x];if(!v)continue;c.fillStyle=v;c.globalAlpha=x+y===0?.5:.35+wr()*.5;c.fillRect(x*64+10,y*64+12,wr()>.4||x+y===0?44:22,30);}c.globalAlpha=1;});
  // White, cream, sand, pale blue-grey, a soft salmon and the odd grey concrete block.
  const tones=[[.86,.85,.81],[.84,.8,.72],[.76,.7,.61],[.68,.72,.75],[.82,.7,.63],[.56,.57,.58],[.84,.83,.79]];
  const blocks=[];
  // A box whose every face takes one spot of the facade texture: plain wall (0.01, 0.99) or lobby glass (cell 0).
  const plain=(x,y,z,w,h,d,tone,u=.004,v=.996)=>{
    const g=new THREE.BoxGeometry(w,h,d),uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,u,v);
    const colors=new Float32Array(uv.count*3);for(let i=0;i<uv.count;i++)colors.set(tone,i*3);g.setAttribute('color',new THREE.BufferAttribute(colors,3));
    g.translate(x,y+h/2-.35,z);blocks.push(g);
  };
  const volume=(x,z,w,h,d,tone,y=0)=>{
    const g=new THREE.BoxGeometry(w,h,d),uv=g.attributes.uv,ou=Math.floor(wr()*cells)/cells,ov=Math.floor(wr()*cells)/cells,blind=wr()<.55;
    for(let i=0;i<uv.count;i++){
      const face=Math.floor(i/4);
      // Roofs and, on most blocks, the two side walls are plain: blind gables between neighbours.
      if(face===2||face===3||(blind&&face<2)){uv.setXY(i,.004,.996);continue;}
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
    // Street level is open: a glass lobby set back under the block, on a row of columns (the Rio pilotis).
    const L=cell*1.25,glass=[.75,.8,.82];
    plain(x,0,z,w-2.4,L,d-2.4,glass,.039,.953);
    const n=Math.max(2,Math.round(w/6));for(let i=0;i<=n;i++)for(const s of [-1,1])plain(x-w/2+.45+i*(w-.9)/n,0,z+s*(d/2-.45),.5,L,.5,tone);
    volume(x,z,w,h,d,tone,L);const roof=L+h;
    if(kind<.4)volume(x,z,w*.62,cell*2,d*.66,tone,roof);
    else if(kind<.6){volume(x-w*.2,z,w*.5,cell*3,d*.8,tone,roof);}
    else if(kind<.72)volume(x,z,w+1.2,cell*.33,d+1.2,tone,roof);
    // On the roof: the water tank and the lift machine room, and sometimes a mast.
    const top=roof+(kind<.4?cell*2:kind<.6?cell*3:kind<.72?cell*.33:0),grey=tone.map(v=>v*.82);
    plain(x+w*(wr()-.5)*.4,top,z+d*(wr()-.5)*.3,3.2+wr()*2,2.2,2.6+wr()*1.5,grey);
    if(wr()<.6)plain(x-w*.3,top,z+d*.2,2,1.4,2,grey);
    if(wr()<.3)plain(x+w*.3,top,z-d*.2,.12,5+wr()*4,.12,[.35,.36,.37]);
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

  // Life on the water, scenery like the cars: surfers waiting past the break, sailboats and a fishing boat crossing far
  // out, gulls circling over the shore. Surfers and gulls go home at dusk; the boats light a lamp on the mast.
  const shaped=(g,rgb)=>{const t=tinted(g,rgb);t.deleteAttribute('uv');return t;};
  const at=(g,x,y,z,rx=0,ry=0,rz=0)=>{g.rotateX(rx);g.rotateY(ry);g.rotateZ(rz);g.translate(x,y,z);return g;};
  const seaPaint=new THREE.MeshStandardMaterial({roughness:.6,vertexColors:true,side:THREE.DoubleSide});
  // A surfer sitting astride the board, facing out to sea (+z), legs in the water.
  const surferGeometry=mergeGeometries([
    shaped(at(new THREE.CapsuleGeometry(.24,1.5,3,8),0,0,0,Math.PI/2),[.93,.9,.82]).applyMatrix4(new THREE.Matrix4().makeScale(1,.28,1)),
    shaped(at(new THREE.CapsuleGeometry(.17,.42,3,8),0,.52,-.05,-.12),[.06,.07,.08]),
    shaped(at(new THREE.SphereGeometry(.13,10,8),0,1.02,0),[.36,.24,.17]),
    shaped(at(new THREE.CapsuleGeometry(.06,.42,3,6),-.2,.5,.08,.5,0,.5),[.06,.07,.08]),
    shaped(at(new THREE.CapsuleGeometry(.06,.42,3,6),.2,.5,.08,.5,0,-.5),[.06,.07,.08])
  ].map(g=>g.index?g.toNonIndexed():g),false);
  const surferSpots=[[-62,24],[-48,27],[-21,23.5],[14,26],[37,24.5],[58,28],[80,25]].map(([x,dz],i)=>({x,z:shore.sea+dz,yaw:(i%3-1)*.35,phase:i*1.7}));
  const surfers=new THREE.InstancedMesh(surferGeometry,seaPaint,surferSpots.length);surfers.name='AERA_SURFERS';
  // Sailboats (white hull, sail) and a small fishing boat (blue hull, cabin). One geometry each, moving slowly along the coast.
  const hull=(len,beam,rgb)=>{const g=new THREE.CylinderGeometry(beam/2,beam*.3,len,10,1,false,0,Math.PI);g.rotateZ(Math.PI/2);g.rotateX(Math.PI);g.scale(1,.9,1);g.translate(0,.6,0);const deck=new THREE.BoxGeometry(len*.92,.08,beam*.96);deck.translate(0,.6,0);return mergeGeometries([shaped(g,rgb),shaped(deck,[.62,.5,.36])],false);};
  const triangle=(points,rgb)=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));g.computeVertexNormals();return shaped(g,rgb);};
  const sailboat=mergeGeometries([hull(7,2.2,[.92,.92,.9]),shaped(at(new THREE.BoxGeometry(.12,9,.12),.3,4.9,0),[.75,.76,.76]),triangle([.3,1.2,0,.3,9.2,0,-3.2,1.3,0],[.96,.95,.92]),triangle([.5,1.2,0,.4,7.6,0,3.3,1.1,0],[.9,.89,.86])].map(g=>g.index?g.toNonIndexed():g),false);
  const fishing=mergeGeometries([hull(6,2,[.18,.33,.52]),shaped(at(new THREE.BoxGeometry(1.8,1.3,1.4),.6,1.2,0),[.92,.9,.86]),shaped(at(new THREE.BoxGeometry(.1,3.2,.1),-1.2,2.2,0),[.3,.3,.3])].map(g=>g.index?g.toNonIndexed():g),false);
  const mastLight=new THREE.MeshBasicMaterial({color:'#fff1d0',toneMapped:false,transparent:true,opacity:0});
  const boats=[[sailboat,shore.sea+120,1.1,-160],[sailboat,shore.sea+205,.7,90],[fishing,shore.sea+150,1.5,-20]].map(([geometry,z,speed,start],i)=>{
    const boat=new THREE.Group(),lamp=new THREE.Mesh(new THREE.SphereGeometry(.22,8,6),mastLight);lamp.position.set(geometry===fishing?-1.2:.3,geometry===fishing?3.9:9.5,0);
    boat.add(new THREE.Mesh(geometry,seaPaint),lamp);boat.position.set(start,-.35,z);boat.userData={speed,start,phase:i*2.3};far.add(boat);return boat;
  });
  // Gulls: a body and two wings that flap in the vertex shader, each bird on its own beat.
  const gullGeometry=new THREE.BufferGeometry();
  gullGeometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,.35, 0,0,-.3, -1,.05,0, 0,0,.35, 1,.05,0, 0,0,-.3],3));gullGeometry.computeVertexNormals();
  const gullMaterial=new THREE.MeshLambertMaterial({color:'#eceae4',side:THREE.DoubleSide});
  gullMaterial.onBeforeCompile=shader=>{shader.uniforms.time=gust.time;
    shader.vertexShader='uniform float time;\n'+shader.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\n      transformed.y+=abs(transformed.x)*.5*sin(time*7.+instanceMatrix[3].x*1.7+instanceMatrix[3].z);');};
  gullMaterial.customProgramCacheKey=()=>'aera-gull';
  const gullPaths=Array.from({length:9},(_,i)=>({cx:-70+i*18+random()*8,cz:shore.sea-6+random()*16,r:9+random()*14,y:5+random()*6,w:(random()<.5?-1:1)*(.18+random()*.12),a:random()*Math.PI*2}));
  const gulls=new THREE.InstancedMesh(gullGeometry,gullMaterial,gullPaths.length);gulls.name='AERA_GULLS';
  const pose=new THREE.Object3D();
  function moveLife(t){
    surferSpots.forEach((p,i)=>{const bob=Math.sin(t*1.3+p.phase);pose.position.set(p.x+Math.sin(t*.07+p.phase)*.8,-.28+.06*bob,p.z);pose.rotation.set(.05*Math.sin(t*1.1+p.phase),p.yaw,.04*bob);pose.scale.setScalar(1);pose.updateMatrix();surfers.setMatrixAt(i,pose.matrix);});
    surfers.instanceMatrix.needsUpdate=true;
    for(const boat of boats){const u=boat.userData;boat.position.x=320-((320-u.start+t*u.speed)%640);boat.position.y=-.35+.12*Math.sin(t*.9+u.phase);boat.rotation.set(.03*Math.sin(t*.7+u.phase),Math.PI,.04*Math.sin(t*.8+u.phase));}
    gullPaths.forEach((g,i)=>{const a=g.a+t*g.w;pose.position.set(g.cx+Math.cos(a)*g.r,g.y+Math.sin(t*.4+i)*1.2,g.cz+Math.sin(a)*g.r*.6);pose.rotation.set(0,-a+(g.w>0?0:Math.PI),Math.sign(g.w)*.25);pose.scale.setScalar(1);pose.updateMatrix();gulls.setMatrixAt(i,pose.matrix);});
    gulls.instanceMatrix.needsUpdate=true;
  }
  moveLife(0);far.add(surfers,gulls);

  far.traverse(o=>{if(o.isMesh||o.isPoints){o.castShadow=false;o.receiveShadow=false;o.frustumCulled=false;}});

  // Rain: thin streaks in a box that travels with the camera, falling and drifting downwind in the vertex shader.
  // The drops stay put in the world while the camera moves (the box wraps around it), and none fall inside the
  // pavilion's glass. How many are drawn follows the weather; with no rain the object is hidden.
  const DROPS=3200,seeds=new Float32Array(DROPS*2*4),tips=new Float32Array(DROPS*2);
  {let n=97;const r=()=>{n=(n*16807)%2147483647;return n/2147483647;};
    for(let i=0;i<DROPS;i++){const a=[r(),r(),r(),r()];for(let e=0;e<2;e++){seeds.set(a,(i*2+e)*4);tips[i*2+e]=e;}}}
  const rainGeometry=new THREE.BufferGeometry();
  rainGeometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(DROPS*2*3),3));
  rainGeometry.setAttribute('seed',new THREE.Float32BufferAttribute(seeds,4));rainGeometry.setAttribute('tip',new THREE.Float32BufferAttribute(tips,1));
  const rainUniforms={time:{value:0},amount:{value:0},center:{value:new THREE.Vector3()},drift:{value:new THREE.Vector2()},tint:{value:new THREE.Color('#c9d2d8')},opacity:{value:.3}};
  const rain=new THREE.LineSegments(rainGeometry,new THREE.ShaderMaterial({uniforms:rainUniforms,transparent:true,depthWrite:false,fog:false,
    vertexShader:`uniform float time,amount;uniform vec3 center;uniform vec2 drift;attribute vec4 seed;attribute float tip;varying float vAlpha;
      void main(){
        const float BOX=56.,HIGH=26.,FALL=8.5,LENGTH=.85;
        if(seed.w>amount){gl_Position=vec4(2.,2.,2.,1.);vAlpha=0.;return;}
        float y=mod(seed.y*HIGH-time*FALL*(.85+.3*seed.x),HIGH)-.3;
        vec2 xz=seed.xz*BOX+drift*time;xz=center.xz+(fract((xz-center.xz)/BOX+.5)-.5)*BOX;
        vec3 p=vec3(xz.x,y,xz.y);
        // Under the roofs of the pavilion it does not rain.
        if(abs(p.x)<10.6&&p.z>-6.2&&p.z<6.8&&p.y<13.7){gl_Position=vec4(2.,2.,2.,1.);vAlpha=0.;return;}
        p+=normalize(vec3(drift.x,-FALL,drift.y))*LENGTH*tip;
        vec4 mv=modelViewMatrix*vec4(p,1.);gl_Position=projectionMatrix*mv;
        vAlpha=(1.-tip*.8)*smoothstep(.6,3.,-mv.z)*(1.-smoothstep(BOX*.3,BOX*.5,-mv.z));
      }`,
    fragmentShader:`uniform vec3 tint;uniform float opacity;varying float vAlpha;void main(){gl_FragColor=vec4(tint,vAlpha*opacity);
      #include <colorspace_fragment>
      }`}));
  rain.name='AERA_RAIN';rain.frustumCulled=false;rain.renderOrder=3;rain.visible=false;scene.add(rain);
  rain.onBeforeRender=(r,s,camera)=>{rainUniforms.center.value.copy(camera.position);};

  // Wet ground: the street, the promenade and the sand darken and turn glossy in the rain, so they mirror the sky and lamps.
  // At a low angle a wet surface mirrors the grey sky: a Fresnel sheen toward the sky colour, on top of the darkening.
  const sheen={wet:{value:0},wetSky:{value:new THREE.Color()}};
  const wetten=m=>{m.onBeforeCompile=shader=>{Object.assign(shader.uniforms,sheen);
    shader.fragmentShader='uniform float wet;uniform vec3 wetSky;\n'+shader.fragmentShader.replace('#include <opaque_fragment>',`
      float grazing=pow(1.-clamp(dot(normal,normalize(vViewPosition)),0.,1.),3.);
      outgoingLight=mix(outgoingLight,wetSky,wet*(.08+.62*grazing));
      #include <opaque_fragment>`);};m.customProgramCacheKey=()=>'aera-wet';m.needsUpdate=true;};
  // Sand only darkens: wet sand stays warm, it does not turn into a mirror.
  const wets=[[asphalt,.2],[paving,.36],[cycle,.24],[sand,.8]].map(([m,gloss])=>{if(m!==sand)wetten(m);return {m,gloss,roughness:m.roughness,color:m.color.clone()};});
  // Far hills fade into the rain and the low cloud.
  const veil={veil:{value:0},veilColor:{value:new THREE.Color()}};
  silhouettes.material.onBeforeCompile=shader=>{Object.assign(shader.uniforms,veil);
    shader.fragmentShader='uniform float veil;uniform vec3 veilColor;\n'+shader.fragmentShader.replace('#include <opaque_fragment>','#include <opaque_fragment>\n      gl_FragColor.rgb=mix(gl_FragColor.rgb,veilColor,veil);');};
  let low=false,last=0;
  function update(now){
    if(low||still.matches||now-last<1000/24)return false;
    last=now;const t=now/1000;
    ocean.uniforms.time.value=t;gust.time.value=t;rainUniforms.time.value=t;
    for(const car of cars)car.position.x=260-((260-car.userData.start+t*car.userData.speed)%520);
    moveLife(t);
    return true;
  }
  // The floor-plan cut shows the pavilion alone: trees and palms would be sliced by the clipping planes.
  // Street lamps, lit windows, hillside lights, sea and headland follow the moment of the day (see daylight.js).
  const lampOff=new THREE.Color('#6b7275'),lampOn=new THREE.Color('#ffd9a8');
  function setDaylight(s){
    lampHead.color.lerpColors(lampOff,lampOn,s.lamps);pools.opacity=.2*s.lamps;beamMaterial.opacity=.28*s.lamps;
    city.material.emissiveIntensity=.85*s.windows;
    // The pale walls would glow grey after dark under the sky light; at night they sink back and the windows carry them.
    city.material.color.setScalar(.38+.62*Math.min(1,s.bright/.7));hillLights.material.opacity=.75*s.nightLights;hillLights.visible=s.nightLights>.02;
    ocean.setDaylight(s);silhouettes.material.color.setRGB(...s.hills);
    // Surfers and gulls are out by day only, and not in the rain; boat lamps come on with the street lamps.
    surfers.visible=s.bright>.12&&!(s.rain>.5);gulls.visible=s.bright>.2&&!s.rain;mastLight.opacity=s.lamps;
    // Weather (see weather.js): wind in the plants and on the sea, rain falling, the ground wet.
    const wind=s.wind??.25,wet=s.rain?Math.min(1,.45+s.rain):0;
    gust.wind.value=wind;gust.windDir.value.copy(downwind(s.windFrom??160));rainUniforms.drift.value.copy(gust.windDir.value).multiplyScalar(.6+5.5*wind);
    rainAmount=s.rain?Math.min(1,.18+s.rain*.85):0;rainUniforms.amount.value=rainAmount*(low?.4:1);rain.visible=rainAmount>0&&far.visible;
    rainUniforms.tint.value.set(s.haze).lerp(drop,.35+.3*s.bright).multiplyScalar(.75+.5*s.bright);rainUniforms.opacity.value=.22+.16*s.bright;
    for(const w of wets){w.m.roughness=w.roughness+(w.gloss-w.roughness)*wet;w.m.color.copy(w.color).multiplyScalar(1-.4*wet);}
    sheen.wet.value=wet;sheen.wetSky.value.set(s.haze).multiplyScalar(.75);
    const o=s.overcast||0;veil.veil.value=Math.min(.75,.4*o+.45*(s.rain||0));veil.veilColor.value.set(s.haze);
    hillLights.material.opacity*=1-.6*(s.overcast||0);
  }
  const drop=new THREE.Color('#e8eef2');let rainAmount=0;
  return {update,setDaylight,setLow(value){low=!!value;rainUniforms.amount.value=rainAmount*(low?.4:1);},setVisible(value){far.visible=!!value;rain.visible=!!value&&rainAmount>0;}};
}
