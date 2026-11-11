// Time of day for the scene, taken from the viewer's own clock. Pure: no browser or rendering dependency.
// `daylight(hour)` blends a few hand-set moments (night, dawn, morning, day, golden hour, sunset, blue hour)
// into one state: sky colours, sun position, light strengths, how much the street and window lights are on,
// and `bright` (0 at night, 1 at midday), which the page uses to keep its text readable over a lit scene.
export const SUNRISE=5.3,SUNSET=18.3;

const night={bright:0,zenith:'#04080f',mid:'#0b1522',haze:'#18222e',glow:'#3a4a60',rose:'#1c2433',glowLow:0,glowHigh:0,disc:0,
  hemiSky:'#6f86a6',hemiGround:'#1d1a17',hemi:.42,keyColor:'#9db4d6',key:.6,sunKey:0,warm:0,rim:.25,exposure:1.05,
  lamps:1,windows:1,interior:1,nightLights:1,sea:'#081a24',hills:[.75,.8,.9]};
const dawn={bright:0.2,zenith:'#16263f',mid:'#46607f',haze:'#a98f8c',glow:'#f0a07a',rose:'#a8808c',glowLow:.9,glowHigh:.5,disc:.35,
  hemiSky:'#b4c4d8',hemiGround:'#4a3c30',hemi:1,keyColor:'#ffb694',key:1.7,sunKey:1,warm:0,rim:.4,exposure:1.06,
  lamps:.9,windows:.6,interior:1,nightLights:.7,sea:'#0f2d3b',hills:[1.3,1.3,1.4]};
const morning={bright:0.8,zenith:'#3a70b0',mid:'#8fb4d6',haze:'#e2cdb8',glow:'#ffd9b0',rose:'#e6c4b4',glowLow:.6,glowHigh:.4,disc:.6,
  hemiSky:'#d6e2ee',hemiGround:'#7d6c58',hemi:1.7,keyColor:'#ffdcb4',key:4.4,sunKey:1,warm:0,rim:.25,exposure:1,
  lamps:0,windows:.1,interior:.7,nightLights:0,sea:'#1c5f78',hills:[6,6.4,3.8]};
const day={bright:1,zenith:'#2b6fbd',mid:'#79b0de',haze:'#cfe0ea',glow:'#ffffff',rose:'#dfeaf2',glowLow:.25,glowHigh:.2,disc:.7,
  hemiSky:'#dcebf7',hemiGround:'#8f8571',hemi:2.1,keyColor:'#fff4e2',key:6.2,sunKey:1,warm:0,rim:.2,exposure:.94,
  lamps:0,windows:0,interior:.55,nightLights:0,sea:'#1a6a86',hills:[8,8.6,4.6]};
const golden={bright:0.7,zenith:'#2a5488',mid:'#7f9bb8',haze:'#dcc0a0',glow:'#ffc890',rose:'#d8b29a',glowLow:.7,glowHigh:.45,disc:.6,
  hemiSky:'#d5e0ec',hemiGround:'#7a6850',hemi:1.5,keyColor:'#ffd2a0',key:4.2,sunKey:1,warm:.5,rim:.35,exposure:1,
  lamps:0,windows:.2,interior:.75,nightLights:0,sea:'#1b5a70',hills:[5,4.8,3.4]};
const sunset={bright:0.3,zenith:'#1c3558',mid:'#5c7190',haze:'#b99484',glow:'#f2a56f',rose:'#b07f86',glowLow:.95,glowHigh:.6,disc:.5,
  hemiSky:'#c3cfdf',hemiGround:'#5a4632',hemi:1.05,keyColor:'#ffb98a',key:2.3,sunKey:1,warm:1,rim:.5,exposure:1.04,
  lamps:.8,windows:.7,interior:.9,nightLights:.5,sea:'#123847',hills:[1.6,1.5,1.5]};
// The look the pavilion was designed for: just after sunset, warm inside, cool outside.
const blue={bright:0,zenith:'#0b1826',mid:'#3a5670',haze:'#5b6672',glow:'#e2a983',rose:'#7c7890',glowLow:.82,glowHigh:.42,disc:.22,
  hemiSky:'#b2c9df',hemiGround:'#44331f',hemi:.72,keyColor:'#a9c3dc',key:.95,sunKey:0,warm:1.35,rim:.55,exposure:1.08,
  lamps:1,windows:1,interior:1,nightLights:1,sea:'#0b2530',hills:[1,1,1]};
const moments=[[0,night],[4.6,night],[5.5,dawn],[6.7,morning],[9,day],[15.6,day],[17.2,golden],[18.3,sunset],[19.1,blue],[20.7,night],[24,night]];

const channels=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const mixHex=(a,b,t)=>{const x=channels(a),y=channels(b);return '#'+x.map((v,i)=>Math.round(v+(y[i]-v)*t).toString(16).padStart(2,'0')).join('');};
const blend=(a,b,t)=>typeof a==='number'?a+(b-a)*t:Array.isArray(a)?a.map((v,i)=>v+(b[i]-v)*t):mixHex(a,b,t);

// Hour of the day as a decimal, from a Date (the viewer's local time).
export function hourOf(date){return date.getHours()+date.getMinutes()/60+date.getSeconds()/3600;}
// Sun direction in the site frame (+x east, +y up, -z north), never below a low horizon line so the glow has a place to sit.
export function sunDirection(hour){
  const t=Math.max(0,Math.min(1,(hour-SUNRISE)/(SUNSET-SUNRISE))),angle=Math.PI*t,up=Math.sin(angle);
  const v=[Math.cos(angle),Math.max(.04,up*.92),-.28*up],l=Math.hypot(...v);
  return v.map(c=>c/l);
}
export function daylight(hour){
  const h=((Number(hour)%24)+24)%24;
  let i=0;while(i<moments.length-2&&h>=moments[i+1][0])i++;
  const [h0,a]=moments[i],[h1,b]=moments[i+1],x=(h-h0)/(h1-h0),t=x*x*(3-2*x),state={hour:h,sun:sunDirection(h)};
  for(const key of Object.keys(a))state[key]=blend(a[key],b[key],t);
  return state;
}
