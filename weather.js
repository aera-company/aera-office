// Weather over the Leblon seafront. Pure: no browser or rendering dependency, except `loadWeather`, which fetches.
// A weather state is three numbers from 0 to 1: `cloud` (sky cover), `rain` (0 dry, .3 drizzle, 1 heavy) and `wind`,
// plus `windFrom`, the compass direction the wind blows from.
// The live state comes from MET Norway's public forecast for the beach (free, commercial use allowed with credit,
// no key). `?clima=nublado` (or limpo, chuva, vento) previews a fixed state; without data the sky stays clear.

export const LEBLON={lat:-22.987,lon:-43.222};
export const CLEAR={cloud:.12,rain:0,wind:.25,windFrom:160,label:'Céu limpo',source:null};
export const PRESETS={
  limpo:{...CLEAR},
  nublado:{cloud:.92,rain:0,wind:.45,windFrom:160,label:'Nublado',source:null},
  chuva:{cloud:1,rain:.45,wind:.6,windFrom:160,label:'Chuva fina',source:null},
  vento:{cloud:.38,rain:0,wind:1,windFrom:160,label:'Vento forte',source:null}
};

const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
const num=(v,fallback=0)=>Number.isFinite(Number(v))?Number(v):fallback;

// From one entry of MET Norway's locationforecast 2.0 (compact) to a weather state.
export function fromMetNo(json){
  const now=json?.properties?.timeseries?.[0];if(!now)return null;
  const d=now.data?.instant?.details||{},next=now.data?.next_1_hours||now.data?.next_6_hours||{};
  const symbol=String(next.summary?.symbol_code||''),mm=num(next.details?.precipitation_amount);
  const wet=/rain|drizzle|sleet|thunder|shower/.test(symbol);
  // Light rain is about 0.1 to 0.5 mm in an hour; past 4 mm it is pouring.
  const rain=wet||mm>=.1?clamp(.22+Math.sqrt(Math.max(mm,.1))*.36):0;
  const cloud=clamp(Math.max(num(d.cloud_area_fraction,12)/100,rain?.9:0,/fog|cloudy/.test(symbol)&&!/partly/.test(symbol)?.85:0));
  // A sea breeze is 3 to 5 m/s; at 12 m/s the palms are thrashing.
  const wind=clamp((num(d.wind_speed,3)-1.5)/10.5);
  const label=rain>.75?'Chuva forte':rain>.5?'Chuva':rain?'Chuva fina':cloud>.75?'Nublado':cloud>.4?'Parcialmente nublado':wind>.7?'Vento forte':'Céu limpo';
  // Where the wind comes from, in compass degrees (the usual sea breeze here is from the south-southeast).
  const windFrom=num(d.wind_from_direction,160);
  return {cloud,rain,wind,windFrom,label,source:'MET Norway',time:now.time};
}

export function weatherFromQuery(search){
  const key=new URLSearchParams(search||'').get('clima');
  return key&&PRESETS[key.toLowerCase()]?{...PRESETS[key.toLowerCase()]}:null;
}

// The live state, cached for half an hour so the forecast service is asked at most twice an hour per visitor.
export async function loadWeather({storage,fetchImpl=globalThis.fetch,now=Date.now()}={}){
  const key='aera-weather';
  try{const kept=JSON.parse(storage?.getItem(key)||'null');if(kept&&now-kept.at<30*60*1000&&kept.state)return kept.state;}catch{}
  const url=`https://api.met.no/weatherapi/locationforecast/2.0/compact?lat=${LEBLON.lat}&lon=${LEBLON.lon}`;
  const response=await fetchImpl(url,{headers:{Accept:'application/json'}});
  if(!response.ok)throw new Error(`clima ${response.status}`);
  const state=fromMetNo(await response.json());if(!state)throw new Error('clima sem dados');
  try{storage?.setItem(key,JSON.stringify({at:now,state}));}catch{}
  return state;
}

const channels=h=>[1,3,5].map(i=>parseInt(h.slice(i,i+2),16));
const mix=(a,b,t)=>{const x=channels(a),y=channels(b);return '#'+x.map((v,i)=>Math.round(v+(y[i]-v)*t).toString(16).padStart(2,'0')).join('');};

// Overcast sky by day and by night: flat greys, a touch of city light under the clouds after dark.
const OVERCAST_DAY={zenith:'#7b8691',mid:'#98a2aa',haze:'#b2b8bb',hemiSky:'#c4cbd0',sea:'#2b4651'};
const OVERCAST_NIGHT={zenith:'#0c1015',mid:'#171c22',haze:'#2a2b2f',hemiSky:'#5d6670',sea:'#0b161c'};

// A moment of the day (see daylight.js) seen through the weather: the clouds take the sun, flatten the colours and
// soften the shadows, the rain pulls the haze in and switches the street lamps on early. Adds `cloud`, `rain`, `wind`, `windFrom`,
// `overcast`, `fogNear` and `fogFar` for the sky, sea, palms and rain to read.
export function weatherize(s,w=CLEAR){
  const cloud=clamp(num(w.cloud)),rain=clamp(num(w.rain)),wind=clamp(num(w.wind)),windFrom=num(w.windFrom,160);
  // Scattered clouds barely touch the light; a full deck (or any rain) takes most of the sun.
  const overcast=Math.max(clamp((cloud-.35)/.55),rain?clamp(.82+.18*rain):0);
  if(!overcast&&!rain)return {...s,cloud,rain,wind,windFrom,overcast:0,fogNear:50,fogFar:330};
  const lit=clamp(s.bright),grey=key=>mix(OVERCAST_NIGHT[key],OVERCAST_DAY[key],lit);
  const o=overcast,out={...s,cloud,rain,wind,windFrom,overcast:o};
  for(const key of ['zenith','mid','haze'])out[key]=mix(s[key],grey(key),o*.88);
  out.rose=mix(s.rose,grey('mid'),o*.85);out.glow=mix(s.glow,grey('haze'),o*.6);
  out.hemiSky=mix(s.hemiSky,grey('hemiSky'),o*.7);out.sea=mix(s.sea,grey('sea'),o*.55);
  out.glowLow=s.glowLow*(1-.85*o);out.glowHigh=s.glowHigh*(1-.9*o);out.disc=s.disc*(1-o);
  out.key=s.key*(1-.74*o);out.warm=s.warm*(1-.75*o);out.rim=s.rim*(1-.5*o);out.hemi=s.hemi*(1+.22*o);
  out.keyColor=mix(s.keyColor,'#dfe4e8',o*.7);
  out.bright=s.bright*(1-.22*o);out.exposure=s.exposure*(1+.05*o);
  // A dark, rainy afternoon: lamps and windows come on before the hour says so.
  out.lamps=Math.max(s.lamps,clamp(o*(1-lit)*1.4+rain*.25*(1-lit)));out.windows=Math.max(s.windows,clamp(o*(1-lit)*.9));
  out.fogNear=50-26*rain-8*o;out.fogFar=330-150*rain-40*o;
  return out;
}
