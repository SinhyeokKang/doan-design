/* SPDX-License-Identifier: MIT
 * Docked composer PoC, adapted from motion-preview.js. Canvas only.
 * Buddy motion preview: Doany's V2 motion prototype run per buddy from the BUDDIES table, plus --hop-lift
 * for the ground shadow layer, and the shared eye.png (one eye cut from Puri's still) for every buddy's eyes,
 * closed by a plush lid from the top. A review aid for the buddy assets; the app's rig is ported separately.
 */
(() => {
  'use strict';
  const assetBase = new URL('.', document.currentScript.src);
  const asset = name => new URL(name, assetBase).href;
  // Per-buddy rig numbers (UV of the 1254² layers); each friend is added here when its layers exist.
  const BUDDIES = {
    doany: {body:'../doany/v2/body.png', accessory:'../doany/v2/hat.png', eyes:['.421,.550','.619,.550'], radius:['.035','.056'], pivot:'.67,.30', tilt:[-.30,.15], contact:[.458,.941], liftScale:.9},
    puri: {body:'puri/body.png', accessory:'puri/accessory.png', eyes:['.433,.528','.607,.528'], radius:['.034','.057'], pivot:'.515,.307', tilt:[-.12,.12], contact:[.498,.847], liftScale:.9},
    dungdung: {body:'dungdung/body.png', accessory:'dungdung/accessory.png', eyes:['.404,.482','.585,.482'], radius:['.033','.057'], pivot:'.5,.43', tilt:[-0.025,0.025], contact:[.494,.86], liftScale:.9},
    popo: {body:'popo/body.png', accessory:'popo/accessory.png', eyes:['.411,.42','.607,.42'], radius:['.032','.055'], pivot:'.503,.42', tilt:[0,0], contact:[.494,.858], liftScale:.9},
    dori: {body:'dori/body.png', accessory:'dori/accessory.png', eyes:['.424,.364','.563,.365'], radius:['.027','.045'], pivot:'.51,.535', tilt:[-0.02,0.02], contact:[.504,.888], liftScale:.65},
  };
  const vertexFor = c => `
    precision mediump float;
    attribute vec2 aUV;
    varying vec2 vUV;
    uniform float time, squash, lift, tilt, hatTilt, layer, energy;
    uniform vec2 look;
    void main() {
      vUV = aUV;
      vec2 p = aUV;
      if (layer > .5) {
        vec2 h = p - vec2(${c.pivot});
        float c = cos(hatTilt), s = sin(hatTilt);
        p = vec2(c*h.x-s*h.y,s*h.x+c*h.y) + vec2(${c.pivot});
      }
      vec2 q = p - vec2(.5,.60);
      if (layer < .5) {
        q.x += look.x * .018 * (1.-abs(q.y));
      }
      q.x *= 1.+squash;
      q.y *= 1.-squash;
      q.y += squash*.36;
      float c = cos(tilt), s = sin(tilt);
      q = vec2(c*q.x-s*q.y,s*q.x+c*q.y);
      q += vec2(0.,.10-lift);
      gl_Position = vec4(q.x*1.34,-q.y*1.34,0.,1.);
    }`;
  const EYE_SPAN = 1.35; // eye.png covers ±1.35 eye radii around the centre
  const fragmentFor = c => `
    precision mediump float;
    varying vec2 vUV;
    uniform sampler2D skin, eyeTex;
    uniform float layer, eyeOpen;
    uniform vec2 look;
    // The bead keeps its shape; a plush lid (the body texture already under it) covers it from the top,
    // its edge following the bead's arch at first and curving into a closed-eye smile at the bottom.
    vec4 spriteEye(vec2 center) {
      vec2 d = (vUV-center-look*vec2(.018,.014))/vec2(${c.radius[0]},${c.radius[1]});
      vec2 s = d/${EYE_SPAN.toFixed(2)}*.5+.5;
      if (s.x<0.||s.x>1.||s.y<0.||s.y>1.) return vec4(0.);
      vec4 e = texture2D(eyeTex,s);
      float lid = -1.35 + (1.-eyeOpen)*2.25 + mix(-.2,.22,1.-eyeOpen)*(1.-d.x*d.x);
      e.a *= smoothstep(lid-.06, lid+.06, d.y);
      return e;
    }
    void main() {
      vec4 col = texture2D(skin,vUV);
      if (layer < .5) {
        vec4 a = spriteEye(vec2(${c.eyes[0]})), b = spriteEye(vec2(${c.eyes[1]}));
        col.rgb = mix(col.rgb,a.rgb,a.a); col.rgb = mix(col.rgb,b.rgb,b.a);
      }
      gl_FragColor = col;
    }`;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const rigs = [];
  function createRig(host) {
    const cfg = BUDDIES[host.dataset.buddyPreview];
    if (!cfg) { host.dataset.state = 'static'; return; }
    const vertex = vertexFor(cfg).replace('q += vec2(0.,.10-lift);', `q.y += (${cfg.contact[1]}-.60)*squash-squash*.36;
      q.y -= sin(tilt)*(${cfg.contact[0]}-.5)*(1.+squash)+(cos(tilt)-1.)*((${cfg.contact[1]}-.60)*(1.-squash)+squash*.36);
      q += vec2(0.,.10-lift);`), fragment = fragmentFor(cfg);
    const canvas = host.querySelector('canvas');
    const fallback = host.querySelector('img');
    const gl = canvas.getContext('webgl', { alpha:true, antialias:true, premultipliedAlpha:false });
    if (!gl) { host.dataset.state = 'static'; return; }
    function compile(type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader,source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader,gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
      return shader;
    }
    const program = gl.createProgram();
    gl.attachShader(program,compile(gl.VERTEX_SHADER,vertex));
    gl.attachShader(program,compile(gl.FRAGMENT_SHADER,fragment));
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program,gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
    gl.useProgram(program);
    const locations = {};
    for (const key of ['time','squash','lift','tilt','hatTilt','layer','energy','look','eyeOpen','skin','eyeTex']) locations[key]=gl.getUniformLocation(program,key);
    const points=[], indices=[], n=64;
    for(let y=0;y<=n;y++) for(let x=0;x<=n;x++) points.push(x/n,y/n);
    for(let y=0;y<n;y++) for(let x=0;x<n;x++) { const i=y*(n+1)+x; indices.push(i,i+1,i+n+1,i+1,i+n+2,i+n+1); }
    gl.bindBuffer(gl.ARRAY_BUFFER,gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER,new Float32Array(points),gl.STATIC_DRAW);
    const uv=gl.getAttribLocation(program,'aUV'); gl.enableVertexAttribArray(uv); gl.vertexAttribPointer(uv,2,gl.FLOAT,false,0,0);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,gl.createBuffer()); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA,gl.ONE_MINUS_SRC_ALPHA);
    const textures=[];
    function texture(name) {
      return new Promise((resolve,reject)=>{
        const img=new Image();
        img.crossOrigin="anonymous";
        img.onload=()=>{
          try {
          const t=gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D,t);
          gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
          gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
          gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,img);
          resolve(t);
          } catch (error) { reject(error); }
        };
        img.onerror=()=>reject(Error('Could not load '+name)); img.src=asset(name);
      });
    }
    let disposed=false,raf=0;
    const state={time:0,ready:false,paused:false,visible:true,lookX:0,lookY:0,targetX:0,targetY:0,hat:0,hatV:0,jumpAt:-99,blinkAt:2,nextBlink:2,typingUntil:0,greetUntil:0,frames:0,last:0,eye:1,mode:'idle'};
    const frame=host.closest('[data-mascot-scope], [data-doan-frame]') || document;
    const message=host.closest('.docked').querySelector('.composer-input');
    const buttons=frame.querySelectorAll('[data-poc-action]');
    let walkX=16, direction=1, forced='walk', focusUntil=0;
    const tempo=host.dataset.buddyPreview==='puri'?1.12:1;
    let motion=null, nextMove=1.8+Math.random(), stepsLeft=0, requestedJump=false, nextHop=13+Math.random()*7;
    let bodyLean=0;
    const smooth=u=>u*u*(3-2*u);
    const attention=()=>state.time<state.typingUntil?'input':state.time<focusUntil?forced:'walk';
    function beginMove(big=false){
      const max=trackMax();
      const stride=(big?0:8+Math.random()*4)*direction;
      if(!big && (walkX+stride>max || walkX+stride< -2))direction*=-1;
      const target=big?walkX:Math.max(-2,Math.min(max,walkX+Math.abs(stride)*direction));
      motion={start:state.time,from:walkX,to:target,big,prepare:(big?.2:.14)*tempo,flight:(big?.42:.28)*tempo,settle:.22*tempo};
    }
    function pose(){
      if(!motion)return {squash:0,lift:0,tilt:0,phase:'rest'};
      const t=state.time-motion.start,m=motion;
      if(t<m.prepare){const u=t/m.prepare;return {squash:(m.big?.10:.055)*smooth(u),lift:0,tilt:direction*.018*smooth(u),phase:'prepare'};}
      if(t<m.prepare+m.flight){
        const u=(t-m.prepare)/m.flight,arc=4*u*(1-u);
        return {squash:(m.big?.10:.055)*(1-smooth(Math.min(1,u/.18)))-(m.big?.045:.025)*Math.sin(Math.PI*u),lift:(m.big?.18:.075)*arc,tilt:direction*.025*Math.sin(Math.PI*u),phase:'air'};
      }
      const u=Math.min(1,(t-m.prepare-m.flight)/m.settle);
      return {squash:(m.big?.08:.045)*Math.sin(Math.PI*u)*Math.exp(-u*2),lift:0,tilt:0,phase:'land'};
    }
    const ground=host.parentElement;
    const dock=host.closest('.docked');
    const shadow=document.createElement('span');shadow.className='poc-contact-shadow';ground.prepend(shadow);
    const trackMax=()=>Math.max(-2,ground.clientWidth-52);
    const windowLayer=document.createElement('span');windowLayer.className='poc-buddy-window';
    ground.append(windowLayer);windowLayer.append(host);
    const toolbar=frame.querySelector('.doan-canvas-tools');
    const surfaces={dock:dock.querySelector('.composer-card'),tools:toolbar};
    const slots={dock:walkX};
    let location='dock',queuePresent=!!dock.querySelector('.queue-entry');
    let conceal=queuePresent?1:0,trip=null;
    let nextHide=state.time+10+Math.random()*8;
    const queueTemplate=document.querySelector('.queue-entry')?.cloneNode(true);
    const queueCount=()=>dock.querySelectorAll('.queue-entry').length;
    function moveSurface(destination){
      if(destination===location)return;
      slots[location]=walkX;location=destination;surfaces[location].prepend(ground);
      walkX=slots[location]??Math.max(-2,(ground.clientWidth-56)/2);
    }
    function startTrip(destination){
      stepsLeft=0;requestedJump=false;
      if(reduced.matches){
        motion=null;trip=null;if(destination)moveSurface(destination);conceal=destination?0:1;drawPresence();return;
      }
      if(motion && pose().phase==='prepare')motion=null;
      const variants=[{name:'quick',delay:0,duration:.24},{name:'hesitant',delay:.18,duration:.36},{name:'soft',delay:.04,duration:.42}];
      const style=variants[Math.floor(Math.random()*variants.length)];
      trip={destination,phase:conceal===1?'waiting':'leaving',from:conceal,at:conceal===1?state.time:null,style,wait:.25+Math.random()*.35};
      state.hideStyle=style.name;
    }
    function syncQueue(){
      const next=queueCount()>0;if(next===queuePresent)return;
      queuePresent=next;
      buttons.forEach(b=>{if(b.dataset.pocAction==='wander')b.disabled=next;});
      if(next && location==='tools' && conceal===0 && !trip)return;
      startTrip(next?(toolbar?'tools':null):'dock');
    }
    function drawPresence(){
      host.style.transform=`translate(${walkX}px,${conceal*52}px)`;
      const height=motion?.big?.18:.075;
      const airborne=Math.max(0,Math.min(1,pose().lift/height));
      shadow.style.transform=`translateX(${walkX+26}px) scale(${1-airborne*(motion?.big?.6:.45)},${1-airborne*.3})`;
      shadow.style.opacity=String((.34-airborne*.18)*(1-conceal));
      host.dataset.surface=location;
      host.dataset.presence=conceal===1?'hidden':conceal===0?'shown':trip?.phase==='leaving'?'hiding':'revealing';
    }
    function advancePresence(){
      if(!trip || motion)return;
      if(trip.at===null)trip.at=state.time;
      const elapsed=state.time-trip.at;
      if(trip.phase==='leaving'){
        const u=Math.max(0,Math.min(1,(elapsed-trip.style.delay)/trip.style.duration));
        conceal=trip.from+(1-trip.from)*smooth(u);
        if(u===1){trip.phase='waiting';trip.at=state.time;}
      }else if(trip.phase==='waiting'){
        if(trip.destination===null || elapsed<trip.wait)return;
        moveSurface(trip.destination);trip.phase='arriving';trip.at=state.time;
      }else{
        const peek=12/52;
        if(elapsed<.22)conceal=1+(peek-1)*smooth(elapsed/.22);
        else if(elapsed<.34)conceal=peek;
        else {const u=Math.min(1,(elapsed-.34)/.22);conceal=peek*(1-smooth(u));if(u===1){trip=null;nextMove=state.time+1.5;nextHide=state.time+10+Math.random()*8;}}
      }
    }
    buttons.forEach(b=>{if(b.dataset.pocAction==='wander')b.disabled=queuePresent;});
    if(queuePresent)startTrip(toolbar?'tools':null);
    dock.addEventListener('click',event=>{
      const button=event.target.closest('.queue-item button[aria-label="Remove queued message"]');
      if(!button)return;
      const queue=button.closest('.queue');button.closest('.queue-entry').remove();
      if(!queue.querySelector('.queue-entry'))queue.remove();
      syncQueue();
    });
    function addQueue(){
      if(!queueTemplate)return;
      let queue=dock.querySelector('.queue');
      if(!queue){queue=document.createElement('div');queue.className='queue';dock.prepend(queue);}
      const row=queueTemplate.cloneNode(true);row.querySelector('.poc-ground')?.remove();
      row.querySelector('.queue-text').textContent=`Queued follow-up ${queueCount()+1}`;
      queue.append(row);syncQueue();
    }
    drawPresence();
    const resize=()=>{const size=Math.min(1024,Math.ceil(host.clientWidth*Math.min(devicePixelRatio||1,2))); canvas.width=size;canvas.height=size;render();};
    const observer=new ResizeObserver(resize); observer.observe(host);
    const visible=new IntersectionObserver(entries=>{state.visible=entries[0].isIntersecting;}); visible.observe(frame);
    function jump(){if(reduced.matches)return;requestedJump=true;}
    function action(name){
      if(name==='wander' && !queuePresent)startTrip(toolbar?(location==='dock'?'tools':'dock'):'dock');
      if(name==='queue-add')addQueue();
      if(name==='queue-clear'){dock.querySelector('.queue')?.remove();syncQueue();}
      if(name==='jump' && !trip && conceal===0) jump();
      if(['walk','input','thread'].includes(name)){forced=name;focusUntil=name==='walk'?0:state.time+5;if(name==='walk')nextMove=state.time+.35;}
      if(name==='greet') state.greetUntil=state.time+2.4;
      if(name==='blink') state.blinkAt=state.time;
      if(name==='pause') {state.paused=!state.paused;buttons.forEach(b=>{if(b.dataset.pocAction==='pause'){b.textContent=state.paused?'Resume':'Pause';b.setAttribute('aria-pressed',String(state.paused));}});}
    }
    host.addEventListener('click',jump);
    host.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();jump();}});
    frame.addEventListener('pointermove',e=>{
      if(e.target.closest('.thread-scroll')){forced='thread';focusUntil=state.time+1.5;}
    });
    buttons.forEach(b=>b.addEventListener('click',()=>action(b.dataset.pocAction)));
    message?.addEventListener('input',()=>{
      state.typingUntil=state.time+2.2;
      message.toggleAttribute('data-empty',!message.textContent.trim());
      const dock=message.closest('.docked');
      const measure=document.createElement('canvas').getContext('2d');
      const style=getComputedStyle(message);measure.font=style.font;
      const expanded=measure.measureText(message.textContent).width > dock.querySelector('.composer-card').clientWidth-100 || message.innerText.includes('\n');
      dock.dataset.shape=expanded?'box':'capsule';
      dock.querySelector('.composer-send').disabled=!message.textContent.trim();
    });
    message?.addEventListener('focus',()=>{state.typingUntil=state.time+2.2;});
    function render(){
      if(!state.ready || gl.isContextLost())return;
      const t=state.time, still=reduced.matches;
      const moving=still?{squash:0,lift:0,tilt:0,phase:'rest'}:pose();
      const squash=moving.squash+(still?0:Math.sin(t*1.6)*.003);
      const lift=moving.lift,energy=motion?.big?.3:0;
      const tilt=still?0:moving.tilt+bodyLean;
      const mode=motion?moving.phase:attention()==='walk'?'idle':'attentive';
      state.mode=still?'reduced-motion':state.paused?'paused':mode;
      host.dataset.state=state.mode;
      gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(program);
      for(const [key,value] of Object.entries({time:still?0:t,squash,lift,tilt,hatTilt:still?0:Math.max(cfg.tilt[0],Math.min(cfg.tilt[1],state.hat)),energy,eyeOpen:still?1:state.eye}))gl.uniform1f(locations[key],value);
      host.style.setProperty('--hop-lift',String(lift/(.22*cfg.liftScale)));
      gl.uniform2f(locations.look,still?0:state.lookX,still?0:state.lookY);
      gl.uniform1i(locations.skin,0);
      if(eyeTexture){gl.activeTexture(gl.TEXTURE1);gl.bindTexture(gl.TEXTURE_2D,eyeTexture);gl.uniform1i(locations.eyeTex,1);gl.activeTexture(gl.TEXTURE0);}
      for(let layer=0;layer<2;layer++){gl.uniform1f(locations.layer,layer);gl.bindTexture(gl.TEXTURE_2D,textures[layer]);gl.drawElements(gl.TRIANGLES,indices.length,gl.UNSIGNED_SHORT,0);}
      state.frames++;
    }
    function tick(now){
      if(disposed)return;
      if(state.ready && reduced.matches && state.mode!=='reduced-motion')render();
      const dt=Math.min(.035,state.last?(now-state.last)/1000:1/60);state.last=now;
      if(state.ready && state.visible && host.checkVisibility({visibilityProperty:true}) && !document.hidden && !state.paused && !reduced.matches){
        state.time+=dt;
        const t=state.time;
        const focus=attention();
        if(!trip && !queuePresent && focus==='walk' && t>=nextHide)startTrip(toolbar?(location==='dock'?'tools':'dock'):'dock');
        if(motion){
          const m=motion,age=t-m.start;
          if(age>=m.prepare){
            const u=Math.max(0,Math.min(1,(age-m.prepare)/m.flight));
            walkX=m.from+(m.to-m.from)*smooth(u);
          }
          if(age>=m.prepare+m.flight+m.settle){
            walkX=m.to;motion=null;
            nextMove=t+(stepsLeft>0?.12:2.8+Math.random()*2.4);
          }
        }
        if(!motion && !trip && conceal===0){
          const room=trackMax();
          if(direction>0 && room-walkX<12)direction=-1;else if(direction<0 && walkX<0)direction=1;
          if(requestedJump){beginMove(true);requestedJump=false;nextHop=t+16+Math.random()*9;}
          else if(focus==='walk' && t>=nextMove){
            if(t>=nextHop){beginMove(true);nextHop=t+16+Math.random()*9;stepsLeft=0;}
            else {
              if(stepsLeft===0){
                stepsLeft=2+Math.floor(Math.random()*2);
                direction=Math.random()<.5?-1:1;
              }
              beginMove();stepsLeft--;
            }
          }
          else if(focus!=='walk'){stepsLeft=0;nextMove=t+1.1;}
        }
        const max=trackMax();
        walkX=Math.max(-2,Math.min(max,walkX));
        advancePresence();drawPresence();
        // Eyes lead a new direction; the body follows softly and only moves during a hop.
        let x=focus==='input'?.08:focus==='thread'?0:motion || nextMove-t<.45?direction*.55:direction*.12;
        let y=conceal>0?-.55:focus==='input'?.75:focus==='thread'?-.75:0;
        host.dataset.attention=focus;
        state.lookX+=(x-state.lookX)*(1-Math.exp(-dt*9));state.lookY+=(y-state.lookY)*(1-Math.exp(-dt*9));
        bodyLean+=(state.lookX*.025-bodyLean)*(1-Math.exp(-dt*3));
        const hatTarget=-bodyLean*.55-pose().tilt*.35;
        state.hatV+=(hatTarget-state.hat)*70*dt;state.hatV*=Math.exp(-dt*12);state.hat+=state.hatV*dt;
        state.motion=motion?pose().phase:'rest';
        if(t>=state.nextBlink){state.blinkAt=t;state.nextBlink=t+4+Math.random()*4;}
        const b=t-state.blinkAt;
        state.eye=b>=0&&b<.18?1-.96*Math.sin(Math.PI*b/.18):1;
        if(conceal<1)render();
      }
      raf=requestAnimationFrame(tick);
    }
    reduced.addEventListener('change',()=>{motion=null;trip=null;requestedJump=false;bodyLean=0;state.hat=0;state.hatV=0;startTrip(queuePresent?(toolbar?'tools':null):'dock');if(!reduced.matches){trip=null;conceal=queuePresent&&!toolbar?1:0;}drawPresence();nextMove=state.time+2;nextHide=state.time+12;render();});
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();fallback.hidden=false;canvas.hidden=true;host.dataset.state='static';});
    let eyeTexture=null;
    Promise.all([texture(cfg.body),texture(cfg.accessory),texture('eye.png')]).then(([b,a,e])=>{textures.push(b,a);eyeTexture=e;if(disposed)return;state.ready=true;fallback.hidden=true;canvas.hidden=false;resize();}).catch(error=>{host.dataset.state='static';console.error(error);});
    raf=requestAnimationFrame(tick);
    function dispose(){disposed=true;cancelAnimationFrame(raf);observer.disconnect();visible.disconnect();gl.getExtension('WEBGL_lose_context')?.loseContext();}
    window.addEventListener('pagehide',dispose,{once:true});
    return {state,action,render,host,gl,dispose};
  }
  document.querySelectorAll('[data-buddy-preview]').forEach(host=>{try{const rig=createRig(host);if(rig)rigs.push(rig);}catch(error){host.dataset.state='static';console.error(error);}});
  // Static specimens need the app's end-following behavior as the queue changes their viewport height.
  document.querySelectorAll('.thread-scroll').forEach(scroller=>{
    let pinned=true;
    scroller.addEventListener('scroll',()=>{pinned=scroller.scrollHeight-scroller.scrollTop-scroller.clientHeight<2;},{passive:true});
    const observer=new ResizeObserver(()=>{if(pinned)scroller.scrollTop=scroller.scrollHeight;});
    observer.observe(scroller);
    observer.observe(scroller.querySelector('.thread'));
    window.addEventListener('pagehide',()=>observer.disconnect(),{once:true});
  });
  window.buddyPreview={rigs};
})();
