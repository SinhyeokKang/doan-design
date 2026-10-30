/* SPDX-License-Identifier: MIT
 * Original motion prototype. No third-party animation runtime.
 */
(() => {
  'use strict';
  const assetBase = new URL('.', document.currentScript.src);
  const asset = name => window.MASCOT_ASSETS?.[name] || new URL(name, assetBase).href;
  const vertex = `
    precision mediump float;
    attribute vec2 aUV;
    varying vec2 vUV;
    uniform float time, squash, lift, tilt, hatTilt, layer, energy;
    uniform vec2 look;
    void main() {
      vUV = aUV;
      vec2 p = aUV;
      if (layer > .5) {
        p = p * .83 + vec2(.09, .01);
        vec2 h = p - vec2(.67,.30);
        float c = cos(hatTilt), s = sin(hatTilt);
        p = vec2(c*h.x-s*h.y,s*h.x+c*h.y) + vec2(.67,.30);
      }
      vec2 q = p - vec2(.5,.60);
      float edge = smoothstep(.15,.49,length(q));
      if (layer < .5) {
        float angle = atan(q.y,q.x);
        q += normalize(q+vec2(.0001))*edge*(sin(angle*6.+time*2.3)*.005 + sin(angle*3.-time*5.)*energy*.012);
        q.x += look.x * .018 * (1.-abs(q.y));
      }
      q.x *= 1.+squash;
      q.y *= 1.-squash;
      q.y += squash*.36;
      float c = cos(tilt), s = sin(tilt);
      q = vec2(c*q.x-s*q.y,s*q.x+c*q.y);
      q += vec2(0.,.12-lift);
      gl_Position = vec4(q.x*1.20,-q.y*1.20,0.,1.);
    }`;
  const fragment = `
    precision mediump float;
    varying vec2 vUV;
    uniform sampler2D skin;
    uniform float layer, eyeOpen;
    uniform vec2 look;
    float eye(vec2 center) {
      vec2 d = (vUV-center-look*vec2(.018,.014))/vec2(.035,.056*max(.065,eyeOpen));
      return 1.-smoothstep(.94,1.03,length(d));
    }
    void main() {
      vec4 col = texture2D(skin,vUV);
      if (layer < .5) {
        float mask = max(eye(vec2(.384,.554)), eye(vec2(.617,.554)));
        float shine = exp(-pow((vUV.y-.527-look.y*.014)*42.,2.));
        col.rgb = mix(col.rgb,vec3(.025)+vec3(.085)*shine,mask);
      }
      gl_FragColor = col;
    }`;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const rigs = [];
  function createRig(host) {
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
    for (const key of ['time','squash','lift','tilt','hatTilt','layer','energy','look','eyeOpen','skin']) locations[key]=gl.getUniformLocation(program,key);
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
    const state={time:0,ready:false,paused:false,visible:true,lookX:0,lookY:0,targetX:0,targetY:0,hat:0,hatV:0,jumpAt:-99,blinkAt:2,nextBlink:2,typingUntil:0,greetUntil:0,frames:0,last:0,eye:1,mode:'idle'};
    const frame=host.closest('[data-mascot-scope], [data-doan-frame]') || document;
    const message=frame.querySelector('[data-mascot-message]');
    const send=frame.querySelector('[data-mascot-send]');
    const buttons=frame.querySelectorAll('[data-mascot-action]');
    let pointerUntil=0;
    let rect;
    const resize=()=>{const size=Math.min(1024,Math.ceil(host.clientWidth*Math.min(devicePixelRatio||1,2))); canvas.width=size;canvas.height=size;rect=host.getBoundingClientRect();render();};
    const observer=new ResizeObserver(resize); observer.observe(host);
    const visible=new IntersectionObserver(entries=>{state.visible=entries[0].isIntersecting;}); visible.observe(host);
    function jump(){if(reduced.matches)return;state.jumpAt=state.time;state.greetUntil=0;state.hatV-=.9;}
    function action(name){
      if(name==='jump') jump();
      if(name==='greet') state.greetUntil=state.time+2.4;
      if(name==='blink') state.blinkAt=state.time;
      if(name==='pause') {state.paused=!state.paused;buttons.forEach(b=>{if(b.dataset.mascotAction==='pause'){b.textContent=state.paused?'Resume':'Pause';b.setAttribute('aria-pressed',String(state.paused));}});}
    }
    host.addEventListener('click',jump);
    host.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();jump();}});
    frame.addEventListener('pointermove',e=>{rect=host.getBoundingClientRect();state.targetX=Math.max(-1,Math.min(1,(e.clientX-rect.x-rect.width/2)/(rect.width*1.5)));state.targetY=Math.max(-1,Math.min(1,(e.clientY-rect.y-rect.height/2)/(rect.height*1.5)));pointerUntil=state.time+1.8;});
    buttons.forEach(b=>b.addEventListener('click',()=>action(b.dataset.mascotAction)));
    message?.addEventListener('input',()=>{state.typingUntil=state.time+1.4;if(send)send.disabled=!message.value.trim();frame.querySelector('.home-suggestions')?.classList.toggle('hidden',Boolean(message.value.trim()));});
    send?.addEventListener('click',()=>{jump();if(message)message.value='';send.disabled=true;frame.querySelector('.home-suggestions')?.classList.remove('hidden');});
    function render(){
      if(!state.ready || gl.isContextLost())return;
      const t=state.time, still=reduced.matches;
      let squash=still?0:Math.sin(t*1.9)*.016,lift=0,energy=0,tilt=still?0:Math.sin(t*.85)*.025+state.lookX*.065;
      let mode='idle';
      if(!still && t<state.typingUntil){mode='attentive';tilt*=.6;squash+=.025;}
      const j=t-state.jumpAt;
      if(!still && j<1.35){
        mode='jump';energy=Math.exp(-j*2);
        if(j<.18)squash+=.15*Math.sin(j/.18*Math.PI/2);
        else if(j<.75){const a=(j-.18)/.57;lift=.22*Math.sin(a*Math.PI);squash-=.085*Math.sin(a*Math.PI);}
        else {const a=j-.75;squash+=.12*Math.exp(-a*7)*Math.cos(a*17);}
      }
      if(!still && t<state.greetUntil){mode='greet';tilt+=Math.sin((state.greetUntil-t)*8)*.13;energy=.5;}
      state.mode=still?'reduced-motion':state.paused?'paused':mode;
      host.dataset.state=state.mode;
      gl.viewport(0,0,canvas.width,canvas.height);gl.clearColor(0,0,0,0);gl.clear(gl.COLOR_BUFFER_BIT);gl.useProgram(program);
      for(const [key,value] of Object.entries({time:still?0:t,squash,lift,tilt,hatTilt:still?0:state.hat,energy,eyeOpen:still?1:state.eye}))gl.uniform1f(locations[key],value);
      gl.uniform2f(locations.look,still?0:state.lookX,still?0:state.lookY);
      gl.uniform1i(locations.skin,0);
      for(let layer=0;layer<2;layer++){gl.uniform1f(locations.layer,layer);gl.bindTexture(gl.TEXTURE_2D,textures[layer]);gl.drawElements(gl.TRIANGLES,indices.length,gl.UNSIGNED_SHORT,0);}
      state.frames++;
    }
    function tick(now){
      if(state.ready && reduced.matches && state.mode!=='reduced-motion')render();
      const dt=Math.min(.035,state.last?(now-state.last)/1000:1/60);state.last=now;
      if(state.ready && state.visible && !document.hidden && !state.paused && !reduced.matches){
        state.time+=dt;
        const t=state.time;
        let x=state.targetX,y=state.targetY;
        if(t>pointerUntil){x=Math.sin(t*.65)*.42;y=Math.sin(t*.39)*.25;}
        if(t<state.typingUntil){x=Math.sin(t*2)*.12;y=.8;}
        state.lookX+=(x-state.lookX)*(1-Math.exp(-dt*5));state.lookY+=(y-state.lookY)*(1-Math.exp(-dt*5));
        const hatTarget=-state.lookX*.09+Math.sin(t*1.9)*.025;
        state.hatV+=(hatTarget-state.hat)*45*dt;state.hatV*=Math.exp(-dt*6);state.hat+=state.hatV*dt;
        if(t>=state.nextBlink){state.blinkAt=t;state.nextBlink=t+2.5+Math.random()*3.5;}
        const b=t-state.blinkAt;
        state.eye=b>=0&&b<.26?1-.96*Math.sin(Math.PI*b/.26):1;
        render();
      }
      requestAnimationFrame(tick);
    }
    reduced.addEventListener('change',()=>{state.hat=0;state.hatV=0;render();});
    canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();fallback.hidden=false;canvas.hidden=true;host.dataset.state='static';});
    Promise.all([texture('body.png'),texture('hat.png')]).then(ts=>{textures.push(...ts);state.ready=true;fallback.hidden=true;canvas.hidden=false;resize();}).catch(error=>{host.dataset.state='static';console.error(error);});
    requestAnimationFrame(tick);
    return {state,action,render,host,gl};
  }
  document.querySelectorAll('[data-mascot]').forEach(host=>{try{const rig=createRig(host);if(rig)rigs.push(rig);}catch(error){host.dataset.state='static';console.error(error);}});
  window.mascotDemo={rigs};
})();
