// Ambient sound for the office, synthesised in the browser: no recordings, no files, nothing to license or download.
// Four layers, each following what is on screen:
// - the sea: a low wash and the hiss of foam, in sets of waves that build, break and draw back;
// - the city: a distant hum and, by day and early evening, the odd car passing on the avenue;
// - the room: a quiet room tone when the visitor walks inside, with the sea muffled through the glass;
// - typing: keys only in a room where someone is actually seated at a keyboard.
// It starts only on a click (browsers require it), stays off until asked, and steps back while NAYRA speaks.

function noiseBuffer(context,seconds,brown=false){
  const length=Math.floor(context.sampleRate*seconds),buffer=context.createBuffer(2,length,context.sampleRate);
  for(let channel=0;channel<2;channel++){
    const data=buffer.getChannelData(channel);let last=0,seed=channel?7919:104729;
    const random=()=>{seed=(seed*16807)%2147483647;return seed/2147483647*2-1;};
    for(let i=0;i<length;i++){const white=random();if(brown){last=(last+.02*white)/1.02;data[i]=last*3.5;}else data[i]=white*.5;}
  }
  return buffer;
}

export function createAmbience(context){
  const now=()=>context.currentTime;
  const white=noiseBuffer(context,6),brown=noiseBuffer(context,6,true);
  const loop=(buffer)=>{const source=context.createBufferSource();source.buffer=buffer;source.loop=true;source.loopStart=0;source.loopEnd=buffer.duration;source.start(0,Math.random()*buffer.duration);return source;};
  const gain=(value=0)=>{const node=context.createGain();node.gain.value=value;return node;};
  const filter=(type,frequency,q=.7)=>{const node=context.createBiquadFilter();node.type=type;node.frequency.value=frequency;node.Q.value=q;return node;};

  const master=gain(0);master.connect(context.destination);
  const duck=gain(1);duck.connect(master);
  // The sea goes through a lowpass that closes when the visitor is inside, as if heard through the glass.
  const seaBus=gain(0),seaGlass=filter('lowpass',16000);seaBus.connect(seaGlass).connect(duck);
  const cityBus=gain(0);cityBus.connect(duck);
  const roomBus=gain(0);roomBus.connect(duck);
  const keysBus=gain(0);keysBus.connect(duck);

  // Sea: a low wash (brown noise) and the foam hiss (white noise through a moving band).
  const washGain=gain(.25),hissGain=gain(.08),hissBand=filter('bandpass',1400,.6),washLow=filter('lowpass',320);
  loop(brown).connect(washLow).connect(washGain).connect(seaBus);
  loop(white).connect(hissBand).connect(hissGain).connect(seaBus);
  // City: a far, low hum.
  const humGain=gain(.18);loop(brown).connect(filter('lowpass',220)).connect(humGain).connect(cityBus);
  // Room: the faint air of a quiet office.
  loop(brown).connect(filter('lowpass',140)).connect(gain(.14)).connect(roomBus);

  let nextWave=0,nextCar=0,nextKey=0,keysLeft=0,traffic=.6,typing=false;
  function wave(at){
    // One wave: it builds, breaks (the hiss jumps and the band opens), then draws back over the sand.
    const build=1.8+Math.random()*1.2,size=.7+Math.random()*.5,crest=at+build;
    washGain.gain.setTargetAtTime(.25+.55*size,at,build/3);
    hissGain.gain.setTargetAtTime(.1,at,build/2);
    hissGain.gain.setTargetAtTime(.75*size,crest,.06);
    washGain.gain.setTargetAtTime(.95*size,crest,.12);
    hissBand.frequency.setTargetAtTime(1100,at,build/2);
    hissBand.frequency.setTargetAtTime(3400,crest+.2,1.4);
    washGain.gain.setTargetAtTime(.22,crest+.5,1.1);
    hissGain.gain.setTargetAtTime(.07,crest+.4,1.6);
    return crest+3.4+Math.random()*3.2;
  }
  function car(at){
    // A car passing on the avenue: a band of noise that rises and falls, panned from one side to the other.
    const source=context.createBufferSource();source.buffer=brown;source.loop=true;
    const band=filter('bandpass',260,1.2),level=gain(0),pan=context.createStereoPanner?context.createStereoPanner():null;
    const length=3+Math.random()*2.5,side=Math.random()<.5?-1:1;
    source.connect(band).connect(level);if(pan){level.connect(pan).connect(cityBus);pan.pan.setValueAtTime(-.8*side,at);pan.pan.linearRampToValueAtTime(.8*side,at+length);}else level.connect(cityBus);
    band.frequency.setValueAtTime(220,at);band.frequency.linearRampToValueAtTime(620,at+length*.5);band.frequency.linearRampToValueAtTime(240,at+length);
    level.gain.setValueAtTime(0,at);level.gain.linearRampToValueAtTime(.55,at+length*.5);level.gain.linearRampToValueAtTime(0,at+length);
    source.start(at,Math.random()*4);source.stop(at+length+.1);
    return at+length+(traffic>.5?4:9)+Math.random()*(traffic>.5?9:16);
  }
  function key(at){
    const source=context.createBufferSource();source.buffer=white;
    const level=gain(0),tone=filter('bandpass',2600+Math.random()*1800,2.2);
    source.connect(tone).connect(level).connect(keysBus);
    const strength=.22+Math.random()*.22;level.gain.setValueAtTime(strength,at);level.gain.exponentialRampToValueAtTime(.001,at+.035);
    source.start(at,Math.random()*5);source.stop(at+.05);
    if(--keysLeft>0)return at+.08+Math.random()*.12;
    keysLeft=3+Math.floor(Math.random()*9);return at+.35+Math.random()*1.4;
  }
  // Events are scheduled a little ahead of the audio clock; `until` is how far.
  function schedule(until){
    if(!nextWave)nextWave=now()+.2;if(!nextCar)nextCar=now()+3;if(!nextKey)nextKey=now()+.5;
    while(nextWave<until)nextWave=wave(nextWave);
    while(nextCar<until){nextCar=traffic>.08?car(nextCar):nextCar+6;}
    while(nextKey<until){nextKey=typing?key(nextKey):nextKey+.5;}
  }
  const set=(param,value,time=.8)=>param.setTargetAtTime(value,now(),time);
  return {
    context,schedule,
    // What the listener is near: 0 to 1 levels for the sea and the city, inside a room or not, someone typing there.
    mix({sea=1,city=.5,inside=false,typing:someoneTyping=false,traffic:cars=.6,ducked=0}={}){
      typing=someoneTyping;traffic=cars;
      set(seaBus.gain,sea*(inside?.45:1));set(seaGlass.frequency,inside?650:16000,.6);
      set(cityBus.gain,city*(inside?.35:1));set(humGain.gain,.1+.12*cars);
      set(roomBus.gain,inside?1:0,1.2);set(keysBus.gain,someoneTyping&&inside?1:0,.4);
      set(duck.gain,1-.72*ducked,.25);
    },
    fadeTo(level,seconds=1.2){master.gain.cancelScheduledValues(now());master.gain.setTargetAtTime(level,now(),seconds/3);}
  };
}
