/* SPDX-License-Identifier: MIT
 * Docked buddy: the reference draft for the buddy that stands on the docked composer and the canvas toolbar
 * (canvas buddy-docked-poc). Canvas only. Adapted from motion-preview.js, which stays Home's draft.
 *
 * Two parts in one file:
 * 1. The docked core, on globalThis.dockedBuddyCore. It never reads document, window or the DOM, so a golden
 *    generator can load this file in a node vm (no document there, so part 2 returns at once), stub Math.random and
 *    time, and step it. It holds the rig table, the shader sources, the host and shadow geometry, the floating-element
 *    overlap test, and advance(state, inputs, now, random): one step of time, motion and the surface/hide state
 *    together, because they share one random stream and one state (conceal, trip, nextMove).
 * 2. The preview shell: reads this canvas's DOM into inputs, draws the WebGL rig, and runs the preview controls.
 */

// ---- 1. Docked core (DOM-free) ----
(root => {
  'use strict';
  // Per-buddy rig numbers (UV of the 1254² layers). contact is the painted foot centre and bottom, from buddies.ts.
  const BUDDIES = {
    doany: {body:'../doany/v2/body.png', accessory:'../doany/v2/hat.png', eyes:['.421,.550','.619,.550'], radius:['.035','.056'], pivot:'.67,.30', tilt:[-.30,.15], contact:[.458,.941], liftScale:.9},
    puri: {body:'puri/body.png', accessory:'puri/accessory.png', eyes:['.433,.528','.607,.528'], radius:['.034','.057'], pivot:'.515,.307', tilt:[-.12,.12], contact:[.498,.847], liftScale:.9},
    dungdung: {body:'dungdung/body.png', accessory:'dungdung/accessory.png', eyes:['.404,.482','.585,.482'], radius:['.033','.057'], pivot:'.5,.43', tilt:[-0.025,0.025], contact:[.494,.86], liftScale:.9},
    popo: {body:'popo/body.png', accessory:'popo/accessory.png', eyes:['.411,.42','.607,.42'], radius:['.032','.055'], pivot:'.503,.42', tilt:[0,0], contact:[.494,.858], liftScale:.9},
    dori: {body:'dori/body.png', accessory:'dori/accessory.png', eyes:['.424,.364','.563,.365'], radius:['.027','.045'], pivot:'.51,.535', tilt:[-0.02,0.02], contact:[.504,.888], liftScale:.65},
  };
  // Home's templates (motion-preview.js), unchanged.
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
  // The docked vertex shader pins squash and tilt to the foot contact, so the feet stay on the floor; it inserts two
  // lines before this one. A missing anchor must throw: replacing nothing would compile Home's shader silently.
  const ANCHOR = 'q += vec2(0.,.10-lift);';
  function shaders(id) {
    const c = BUDDIES[id];
    if (!c) throw Error(`Unknown buddy ${id}`);
    const home = vertexFor(c);
    if (home.split(ANCHOR).length !== 2) throw Error(`Docked shader anchor not found exactly once for ${id}`);
    const vertex = home.replace(ANCHOR, `q.y += (${c.contact[1]}-.60)*squash-squash*.36;
      q.y -= sin(tilt)*(${c.contact[0]}-.5)*(1.+squash)+(cos(tilt)-1.)*((${c.contact[1]}-.60)*(1.-squash)+squash*.36);
      ${ANCHOR}`);
    return { vertex, fragment: fragmentFor(c) };
  }

  const SIZE = 56;          // rig viewport, CSS px, on both surfaces
  const FLOOR = -1;         // ground origin, relative to the surface's top edge
  const WINDOW = 88;        // clip window height above the floor; only the buddy is clipped
  const DROP = 52;          // hide descent
  const PEEK = 12;          // reveal pause depth
  const REST_SECONDS = 5;   // the person rests after this long without view, selection, input or thread-scroll activity
  const TRIP_MIN = 60, TRIP_SPREAD = 60; // idle surface trip: after 60–120 s of uninterrupted rest
  const FLOAT_WAIT = 1;     // after the last overlapping floating element closes
  const RISE = .22;         // a reveal without a peek
  const HIDES = [{name:'quick',delay:0,duration:.24},{name:'hesitant',delay:.18,duration:.36},{name:'soft',delay:.04,duration:.42}];
  const REST = {squash:0,lift:0,tilt:0,phase:'rest'};
  const smooth = u => u*u*(3-2*u);
  const clamp01 = u => Math.max(0, Math.min(1, u));
  // Shader UV to a fraction of the host box: (p-.5)*1.34 in clip space is .165 + .67*p of the viewport (Doany.tsx's
  // shadow origin uses the same mapping).
  const project = v => .165 + .67*v;
  function geometry(id) {
    const [x, y] = BUDDIES[id].contact;
    // contactX: the shadow centre from the host's left edge; hostTop: the host's top from the floor; originY: its
    // transform-origin y as a fraction, so the feet are the pivot.
    return { contactX: SIZE*project(x), hostTop: -SIZE*project(y), originY: project(y) };
  }
  // The buddy's clip window over a surface's padding box (left, right, top; viewport coordinates).
  function clipWindow(r) { return { left: r.left, right: r.right, top: r.top + FLOOR - WINDOW, bottom: r.top + FLOOR }; }
  // The buddy's own 56px box at x on a surface, down to the floor: floating elements are measured against it, so a
  // tooltip far along the surface does not send the buddy down.
  function buddyBox(r, x) { return { left: r.left + x, right: r.left + x + SIZE, top: r.top + FLOOR - SIZE, bottom: r.top + FLOOR }; }
  // Where the buddy stands, or would stand, on a surface of this width: its x there, else the first-visit x.
  function xOn(st, name, width) {
    const x = st.surface === name ? st.x : st.slots[name] ?? (name === 'tools' ? (width - SIZE)/2 : 16);
    return Math.max(-2, Math.min(trackMax(width), x));
  }
  // A floating element counts only when it intersects the buddy's box; touching edges and empty rects do not.
  function overlaps(clip, rects) {
    return rects.some(r => r.right > r.left && r.bottom > r.top && r.left < clip.right && clip.left < r.right && r.top < clip.bottom && clip.top < r.bottom);
  }

  function create(id, random) {
    if (!BUDDIES[id]) throw Error(`Unknown buddy ${id}`);
    return {
      buddy: id, tempo: id === 'puri' ? 1.12 : 1, time: 0, last: 0, mounted: false, reduced: false,
      surface: null, slots: {}, x: 16, direction: 1, motion: null, stepsLeft: 0, requestedJump: false,
      nextMove: 1.8 + random(), nextHop: 13 + random()*7,
      forced: 'walk', focusUntil: 0, typingUntil: 0,
      lookX: 0, lookY: 0, bodyLean: 0, hat: 0, hatV: 0, blinkAt: 2, nextBlink: 2, eye: 1,
      conceal: 0, trip: null, visit: null, idleLeft: null,
    };
  }

  const attention = st => st.time < st.typingUntil ? 'input' : st.time < st.focusUntil ? st.forced : 'walk';
  const trackMax = width => Math.max(-2, width - 52);
  function hopPose(st) {
    const m = st.motion;
    if (!m) return REST;
    const t = st.time - m.start;
    if (t < m.prepare) { const u = t/m.prepare; return {squash:(m.big?.10:.055)*smooth(u), lift:0, tilt:st.direction*.018*smooth(u), phase:'prepare'}; }
    if (t < m.prepare + m.flight) {
      const u = (t - m.prepare)/m.flight, arc = 4*u*(1-u);
      return {squash:(m.big?.10:.055)*(1-smooth(Math.min(1, u/.18)))-(m.big?.045:.025)*Math.sin(Math.PI*u), lift:(m.big?.18:.075)*arc, tilt:st.direction*.025*Math.sin(Math.PI*u), phase:'air'};
    }
    const u = Math.min(1, (t - m.prepare - m.flight)/m.settle);
    return {squash:(m.big?.08:.045)*Math.sin(Math.PI*u)*Math.exp(-u*2), lift:0, tilt:0, phase:'land'};
  }
  function beginMove(st, width, random, big) {
    const max = trackMax(width);
    const stride = (big ? 0 : 8 + random()*4)*st.direction;
    if (!big && (st.x + stride > max || st.x + stride < -2)) st.direction *= -1;
    const to = big ? st.x : Math.max(-2, Math.min(max, st.x + Math.abs(stride)*st.direction));
    st.motion = {start: st.time, from: st.x, to, big, prepare: (big?.2:.14)*st.tempo, flight: (big?.42:.28)*st.tempo, settle: .22*st.tempo};
  }

  // What the inputs allow. A surface has a floor when it is present, at least 56px wide and, for the dock, an input
  // card that accepts input on an open panel. ok: the buddy may stand there now.
  function read(inputs) {
    const s = inputs.surfaces || {}, panel = inputs.panel || {}, r = inputs.reasons || {};
    const stepAside = !!(r.queue || r.prompts || r.waiting);
    const folded = !!(panel.folded || panel.folding);
    const floor = name => { const v = s[name]; return !!v && !!v.present && v.width >= SIZE && (name !== 'dock' || (v.accepts !== false && !folded)); };
    const floating = name => !!(s[name] && s[name].floating);
    const ok = name => floor(name) && !floating(name) && !(name === 'dock' && stepAside);
    return { s, stepAside, folded, floor, floating, ok, anyFloating: floating('dock') || floating('tools') };
  }
  // The surface the rules want now. The dock is home; the toolbar keeps the buddy only after an idle visit.
  function want(st, v) {
    const cur = st.surface;
    if (cur && v.ok(cur) && (cur === 'dock' || st.visit === 'idle')) return cur;
    if (v.ok('dock')) return 'dock';
    if (v.ok('tools')) return 'tools';
    return null;
  }
  // A narrower floor clamps x at once. A surface without a floor (a folding panel) keeps the remembered x.
  function clampX(st, inputs, v) {
    const s = st.surface && inputs.surfaces && inputs.surfaces[st.surface];
    if (s && v.floor(st.surface)) st.x = Math.max(-2, Math.min(trackMax(s.width), st.x));
  }
  // Reparents only while fully concealed. A first toolbar visit is centred; later visits keep each surface's x.
  function moveTo(st, dest, inputs) {
    if (!dest || dest === st.surface) return;
    if (st.surface) st.slots[st.surface] = st.x;
    st.surface = dest;
    const width = inputs.surfaces[dest].width;
    const first = dest === 'tools' ? (width - SIZE)/2 : 16;
    st.x = Math.max(-2, Math.min(trackMax(width), st.slots[dest] ?? first));
    st.motion = null; st.stepsLeft = 0;
  }
  function startTrip(st, dest, random, opts = {}) {
    st.stepsLeft = 0; st.requestedJump = false;
    // A preparation that has not left the floor is cancelled; an airborne hop or a landing finishes first.
    if (st.motion && hopPose(st).phase === 'prepare') st.motion = null;
    const style = opts.hold || opts.quick ? HIDES[0] : HIDES[Math.floor(random()*HIDES.length)];
    const hidden = st.conceal === 1;
    st.trip = { destination: dest, phase: hidden ? 'waiting' : 'leaving', from: st.conceal, at: hidden ? st.time : null, style,
      wait: opts.hold ? 0 : .25 + random()*.35, idle: !!opts.idle, hold: !!opts.hold, closedAt: null, quick: false };
  }
  // No floor under the buddy, or its surface left: hidden at once, so it is never seen crossing the page.
  function drop(st, dest, random) {
    st.conceal = 1; st.motion = null; st.stepsLeft = 0; st.requestedJump = false;
    st.trip = { destination: dest, phase: 'waiting', from: 1, at: st.time, style: null, wait: .25 + random()*.35, idle: false, hold: false, closedAt: null, quick: false };
  }
  function rise(st) { st.trip = { destination: st.surface, phase: 'arriving', from: st.conceal, at: st.time, quick: true, idle: false, hold: false, closedAt: null }; }
  function arrive(st, dest, inputs, v, quick) {
    const idle = !!(st.trip && st.trip.idle);
    moveTo(st, dest, inputs);
    st.visit = st.surface === 'tools' ? (idle && !v.stepAside && v.floor('dock') ? 'idle' : 'forced') : null;
    st.trip = { destination: st.surface, phase: 'arriving', from: st.conceal, at: st.time, quick, idle: false, hold: false, closedAt: null };
  }
  function done(st) { st.trip = null; st.conceal = 0; st.nextMove = st.time + 1.5; st.idleLeft = null; }

  // Time is not running (not visible, paused preview, reduced motion): every surface and hide change applies at once.
  function settle(st, v, inputs) {
    st.trip = null; st.idleLeft = null;
    const hide = () => { if (st.conceal !== 1) { st.conceal = 1; st.motion = null; st.stepsLeft = 0; } };
    if (st.surface && v.floor(st.surface) && v.floating(st.surface)) return hide();
    const w = want(st, v);
    if (w === null) return hide();
    if (w !== st.surface) { moveTo(st, w, inputs); st.visit = w === 'tools' ? 'forced' : null; }
    if (st.conceal !== 0) { st.conceal = 0; st.motion = null; st.stepsLeft = 0; }
  }

  // Priority: no floor or surface gone > overlapping floating element > step-aside reason > folded panel > idle trip.
  function decide(st, v, inputs, dt, random, replay) {
    const cur = st.surface;
    if (cur === 'tools' && (v.stepAside || !v.floor('dock'))) st.visit = 'forced';
    let trip = st.trip;
    // The input card is still on screen but takes no input: the buddy goes down with the quick hide instead of popping
    // out. A card that is gone, folding or too narrow still drops it at once.
    const sc = cur && v.s[cur];
    if (cur === 'dock' && sc && sc.present && sc.width >= SIZE && !v.folded && sc.accepts === false) {
      const w = want(st, v);
      if (!trip) { if (st.conceal < 1) startTrip(st, w, random, { quick: true }); else drop(st, w, random); return; }
      if (trip.phase === 'arriving') { startTrip(st, w, random, { quick: true }); return; }
      trip.hold = false; trip.destination = w;
      return;
    }
    if (!cur || !v.floor(cur)) {
      if (trip && trip.phase === 'waiting' && !trip.hold && st.conceal === 1) trip.destination = want(st, v);
      else drop(st, want(st, v), random);
      return;
    }
    // A floating element over the buddy's own window: down until every one closes, then 1 s, then the rules again.
    if (v.floating(cur) && (!trip || trip.phase === 'arriving' || trip.hold)) {
      if (trip && trip.hold) trip.closedAt = null;
      else startTrip(st, cur, random, { hold: true });
      return;
    }
    if (trip && trip.hold) {
      if (trip.closedAt === null) trip.closedAt = st.time;
      if (st.time - trip.closedAt < FLOAT_WAIT) return;
      const w = want(st, v);
      if (w === cur) { rise(st); return; }
      trip.hold = false; trip.destination = w;
      if (w !== null && st.conceal === 1) arrive(st, w, inputs, v, false);
      return;
    }
    const w = want(st, v);
    if (trip) {
      if (trip.phase === 'arriving') { if (w !== cur) startTrip(st, w, random); return; }
      if (trip.idle) { if (trip.destination && v.ok(trip.destination)) return; trip.idle = false; }
      if (trip.phase === 'leaving' && w === cur) {
        // Retarget from the current concealed fraction; a departure that has not started yet just ends.
        if (trip.at === null && st.conceal === 0) st.trip = null; else rise(st);
        return;
      }
      trip.destination = w;
      return;
    }
    if (w === null) { if (st.conceal < 1) startTrip(st, null, random); return; }
    if (w !== cur || st.conceal === 1) { startTrip(st, w, random); return; }
    // Idle trips: only while the person rests and nothing else holds the buddy. Overview has no toolbar, so it hides
    // and returns at the same input.
    const free = !v.stepAside && !v.folded && !v.anyFloating;
    if (replay && free) { idleTrip(st, v, random); return; }
    if (!(free && inputs.resting && attention(st) !== 'input')) { st.idleLeft = null; return; }
    if (st.idleLeft === null) st.idleLeft = TRIP_MIN + random()*TRIP_SPREAD;
    st.idleLeft -= dt;
    if (st.idleLeft <= 0) idleTrip(st, v, random);
  }
  function idleTrip(st, v, random) {
    const other = st.surface === 'dock' ? 'tools' : 'dock';
    startTrip(st, v.ok(other) ? other : st.surface, random, { idle: true });
    st.idleLeft = null;
  }
  function advanceTrip(st, inputs, v) {
    const trip = st.trip;
    if (!trip || st.motion) return;
    if (trip.at === null) trip.at = st.time;
    const elapsed = st.time - trip.at;
    if (trip.phase === 'leaving') {
      const u = clamp01((elapsed - trip.style.delay)/trip.style.duration);
      st.conceal = trip.from + (1 - trip.from)*smooth(u);
      if (u === 1) { trip.phase = 'waiting'; trip.at = st.time; }
    } else if (trip.phase === 'waiting') {
      if (trip.hold || trip.destination === null || elapsed < trip.wait) return;
      arrive(st, trip.destination, inputs, v, false);
    } else if (trip.quick) {
      const u = Math.min(1, elapsed/RISE);
      st.conceal = trip.from*(1 - smooth(u));
      if (u === 1) done(st);
    } else {
      const peek = PEEK/DROP;
      if (elapsed < .22) st.conceal = 1 + (peek - 1)*smooth(elapsed/.22);
      else if (elapsed < .34) st.conceal = peek;
      else { const u = Math.min(1, (elapsed - .34)/.22); st.conceal = peek*(1 - smooth(u)); if (u === 1) done(st); }
    }
  }
  function mount(st, v, inputs) {
    st.mounted = true;
    const w = want(st, v), s = v.s;
    const at = w || (s.dock && s.dock.present ? 'dock' : s.tools && s.tools.present ? 'tools' : null);
    moveTo(st, at, inputs);
    st.visit = st.surface === 'tools' ? 'forced' : null;
    st.conceal = w ? 0 : 1;
  }
  function presence(st) {
    const trip = st.trip;
    if (!trip) return st.conceal === 0 ? 'shown' : 'hidden';
    if (trip.phase === 'leaving') return 'hiding';
    if (trip.phase === 'arriving') return 'revealing';
    return trip.hold || trip.destination === null ? 'hidden' : 'waiting';
  }

  /* One step. inputs:
   *   surfaces: { dock: {present, accepts, width, floating} | null, tools: {present, width, floating} | null }
   *   reasons: { queue, prompts, waiting }   step-aside reasons (queued message, suggested prompts, waiting card)
   *   panel: { folded, folding }             the canvas conversation panel
   *   resting, visible, paused, reduced      booleans; paused is the preview's Pause control
   *   events: [] of 'input' (composer input/focus), 'thread' (pointer over the thread) and the preview-only
   *           'jump', 'look-input', 'look-thread', 'walk', 'blink', 'trip' (Hide & reappear)
   * now is a rAF timestamp in ms; random() returns [0, 1). advance updates state in place and returns what to draw. */
  function advance(st, inputs, now, random) {
    const dt = Math.min(.035, st.last ? (now - st.last)/1000 : 1/60);
    st.last = now;
    const v = read(inputs);
    if (!st.mounted) mount(st, v, inputs);
    const reduced = !!inputs.reduced;
    if (reduced !== st.reduced) {
      st.reduced = reduced; st.motion = null; st.requestedJump = false; st.stepsLeft = 0; st.bodyLean = 0; st.hat = 0; st.hatV = 0;
      settle(st, v, inputs);
      if (!reduced) st.nextMove = st.time + 2;
    }
    let replay = false;
    for (const e of inputs.events || []) {
      if (e === 'input') st.typingUntil = st.time + 2.2;
      else if (e === 'thread') { st.forced = 'thread'; st.focusUntil = st.time + 1.5; }
      else if (e === 'look-input' || e === 'look-thread') { st.forced = e.slice(5); st.focusUntil = st.time + 5; }
      else if (e === 'walk') { st.forced = 'walk'; st.focusUntil = 0; st.nextMove = st.time + .35; }
      else if (e === 'jump') { if (!reduced && !st.trip && st.conceal === 0) st.requestedJump = true; }
      else if (e === 'blink') st.blinkAt = st.time;
      else if (e === 'trip') replay = true;
    }
    if (reduced || !inputs.visible || inputs.paused) {
      settle(st, v, inputs);
      clampX(st, inputs, v);
      return frame(st, inputs);
    }
    st.time += dt;
    const t = st.time, focus = attention(st);
    decide(st, v, inputs, dt, random, replay);
    const width = st.surface && inputs.surfaces[st.surface] ? inputs.surfaces[st.surface].width : SIZE;
    if (st.motion) {
      const m = st.motion, age = t - m.start;
      // Horizontal movement happens only in the air.
      if (age >= m.prepare) st.x = m.from + (m.to - m.from)*smooth(clamp01((age - m.prepare)/m.flight));
      if (age >= m.prepare + m.flight + m.settle) { st.x = m.to; st.motion = null; st.nextMove = t + (st.stepsLeft > 0 ? .12 : 2.8 + random()*2.4); }
    }
    if (!st.motion && !st.trip && st.conceal === 0) {
      const room = trackMax(width);
      if (st.direction > 0 && room - st.x < 12) st.direction = -1; else if (st.direction < 0 && st.x < 0) st.direction = 1;
      if (st.requestedJump) { beginMove(st, width, random, true); st.requestedJump = false; st.nextHop = t + 16 + random()*9; }
      else if (focus === 'walk' && t >= st.nextMove) {
        if (t >= st.nextHop) { beginMove(st, width, random, true); st.nextHop = t + 16 + random()*9; st.stepsLeft = 0; }
        else {
          if (st.stepsLeft === 0) { st.stepsLeft = 2 + Math.floor(random()*2); st.direction = random() < .5 ? -1 : 1; }
          beginMove(st, width, random, false); st.stepsLeft--;
        }
      } else if (focus !== 'walk') { st.stepsLeft = 0; st.nextMove = t + 1.1; }
    }
    clampX(st, inputs, v);
    advanceTrip(st, inputs, v);
    // Eyes lead a new direction; the body follows softly and only moves during a hop.
    const x = focus === 'input' ? .08 : focus === 'thread' ? 0 : st.motion || st.nextMove - t < .45 ? st.direction*.55 : st.direction*.12;
    const y = st.conceal > 0 ? -.55 : focus === 'input' ? .75 : focus === 'thread' ? -.75 : 0;
    st.lookX += (x - st.lookX)*(1 - Math.exp(-dt*9)); st.lookY += (y - st.lookY)*(1 - Math.exp(-dt*9));
    st.bodyLean += (st.lookX*.025 - st.bodyLean)*(1 - Math.exp(-dt*3));
    const hatTarget = -st.bodyLean*.55 - hopPose(st).tilt*.35;
    st.hatV += (hatTarget - st.hat)*70*dt; st.hatV *= Math.exp(-dt*12); st.hat += st.hatV*dt;
    // Blinks: Home's 420 ms, every 4–8 s.
    if (t >= st.nextBlink) { st.blinkAt = t; st.nextBlink = t + 4 + random()*4; }
    const b = t - st.blinkAt;
    st.eye = b >= 0 && b < .42 ? 1 - .96*Math.sin(Math.PI*b/.42) : 1;
    return frame(st, inputs);
  }

  // What to draw. Reduced motion rests like Home: no breathing, blink, gaze or hop, and a static shadow.
  function frame(st, inputs) {
    const cfg = BUDDIES[st.buddy], g = geometry(st.buddy), still = st.reduced;
    const moving = still ? REST : hopPose(st);
    const big = !!(st.motion && st.motion.big);
    const airborne = still ? 0 : clamp01(moving.lift/(big ? .18 : .075));
    const focus = attention(st);
    const slots = Object.assign({}, st.slots);
    if (st.surface) slots[st.surface] = st.x;
    return {
      surface: st.surface, conceal: st.conceal, presence: presence(st), slots, hideStyle: st.trip && st.trip.style ? st.trip.style.name : null,
      host: { x: st.x, y: st.conceal*DROP },
      pose: {
        time: still ? 0 : st.time, squash: moving.squash + (still ? 0 : Math.sin(st.time*1.6)*.003), lift: moving.lift,
        tilt: still ? 0 : moving.tilt + st.bodyLean, hatTilt: still ? 0 : Math.max(cfg.tilt[0], Math.min(cfg.tilt[1], st.hat)),
        energy: big ? .3 : 0, eyeOpen: still ? 1 : st.eye, lookX: still ? 0 : st.lookX, lookY: still ? 0 : st.lookY,
        hopLift: moving.lift/(.22*cfg.liftScale), phase: moving.phase,
      },
      // Short hop apex .55 × .70, large .40 × .70; opacity .34 on the floor, .16 at the apex, times (1 - conceal).
      shadow: { x: st.x + g.contactX, scaleX: 1 - airborne*(big ? .6 : .45), scaleY: 1 - airborne*.3, opacity: (.34 - airborne*.18)*(1 - st.conceal) },
      attention: focus,
      mode: still ? 'reduced-motion' : inputs.paused ? 'paused' : st.motion ? moving.phase : focus === 'walk' ? 'idle' : 'attentive',
    };
  }

  root.dockedBuddyCore = Object.freeze({
    BUDDIES, vertexFor, fragmentFor, ANCHOR, shaders, geometry, clipWindow, buddyBox, xOn, overlaps, create, advance,
    SIZE, FLOOR, WINDOW, DROP, PEEK, REST_SECONDS, TRIP_MIN, TRIP_SPREAD, FLOAT_WAIT, HIDES,
  });
})(globalThis);

// ---- 2. Preview shell (DOM) ----
(() => {
  'use strict';
  if (typeof document === 'undefined') return;
  const core = globalThis.dockedBuddyCore;
  const assetBase = new URL('.', document.currentScript.src);
  const asset = name => new URL(name, assetBase).href;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const svg = body => `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
  const ICONS = {
    crosshair: '<circle cx="12" cy="12" r="10"/><line x1="22" x2="18" y1="12" y2="12"/><line x1="6" x2="2" y1="12" y2="12"/><line x1="12" x2="12" y1="6" y2="2"/><line x1="12" x2="12" y1="22" y2="18"/>',
    compass: '<path d="m16.24 7.76-1.804 5.411a2 2 0 0 1-1.265 1.265L7.76 16.24l1.804-5.411a2 2 0 0 1 1.265-1.265z"/><circle cx="12" cy="12" r="10"/>',
    go: '<path d="M7 7h10v10"/><path d="M7 17 17 7"/>',
    stop: '<circle cx="12" cy="12" r="10"/><rect x="9" y="9" width="6" height="6" rx="1"/>',
  };
  // Floating elements the app portals or shows by the toolbar: Radix poppers (tooltips, menus, popovers), the slash
  // popover and the picking/capture hint. Read once per animation frame for every rig.
  const FLOATING = '[data-radix-popper-content-wrapper], .slash-popover, .doan-picking';
  let floatingAt = -1, floatingRects = [];
  const floating = now => {
    if (now !== floatingAt) { floatingAt = now; floatingRects = [...document.querySelectorAll(FLOATING)].map(e => e.getBoundingClientRect()); }
    return floatingRects;
  };
  const RIG_ACTIONS = new Set(['walk', 'jump', 'input', 'thread', 'pause', 'queue-add', 'queue-clear', 'wander', 'blink']);

  // Preview state shared by a frame's rigs, and the frame-level preview controls. None of this is product UI.
  function controller(frame) {
    const ctl = { frame, rigs: [], prompts: false, waiting: false, noFloor: false, folded: false, folding: false, visible: true, lastActivity: performance.now() };
    const io = new IntersectionObserver(entries => { ctl.visible = entries[0].isIntersecting; }); io.observe(frame);
    window.addEventListener('pagehide', () => io.disconnect(), { once: true });
    // The person's activity that ends a rest: composer input, thread scrolling, and view moves or selection on the board.
    const active = () => { ctl.lastActivity = performance.now(); };
    frame.addEventListener('input', e => { if (e.target.closest('.composer-input')) active(); });
    frame.addEventListener('focusin', e => { if (e.target.closest('.composer-input')) active(); });
    for (const type of ['wheel', 'pointerdown']) frame.addEventListener(type, e => { if (e.target.closest('.thread-scroll, .area')) active(); }, { passive: true });
    ctl.resting = now => now - ctl.lastActivity >= core.REST_SECONDS*1000 && document.hasFocus();
    const button = name => frame.querySelector(`[data-poc-action="${name}"]`);
    const press = (name, on) => button(name)?.setAttribute('aria-pressed', String(on));
    const workspace = frame.querySelector('.workspace');
    const column = frame.querySelector('.doan-conv-column');
    const scroll = frame.querySelector('.cp-scroll, .ov-scroll');
    const thread = scroll?.querySelector(':scope > .conversation-thread');
    const card = frame.querySelector('.doan-conv-column .composer-card, .ov .composer-card');
    let hint = null, tip = null, prompts = null, waiting = null, width = '', folding = 0;
    function picking(on = !hint) {
      const bottom = frame.querySelector('.doan-canvas-bottom');
      if (!bottom) return;
      if (on && !hint) {
        hint = document.createElement('div'); hint.className = 'doan-agent doan-picking'; hint.setAttribute('role', 'status');
        hint.innerHTML = `${svg(ICONS.crosshair).replace('<svg ', '<svg class="doan-picking-icon" ')}<span class="doan-agent-text">Click a frame or an element, or Shift-click a spot</span><span class="doan-kbd" data-ui-variant="on-prominent" aria-hidden="true">Esc</span>`;
        bottom.prepend(hint);
      } else if (!on && hint) { hint.remove(); hint = null; }
      frame.querySelector('.doan-canvas-tool[aria-label="Pick from canvas"]')?.setAttribute('aria-pressed', String(!!hint));
      press('picking', !!hint);
    }
    // A Radix tooltip over Select, top side, 4px offset, portalled to body like the app's.
    function tooltip(on = !tip) {
      const anchor = frame.querySelector('.doan-canvas-tool[aria-label="Select"]');
      if (!anchor) return;
      if (on && !tip) {
        tip = document.createElement('div'); tip.setAttribute('data-radix-popper-content-wrapper', '');
        tip.innerHTML = '<div class="doan-tooltip has-key" data-state="delayed-open" data-side="top" role="tooltip">Select<span class="doan-kbd" data-ui-variant="on-prominent" data-ui-size="sm">V</span></div>';
        tip.style.position = 'absolute'; tip.style.left = '0'; tip.style.top = '0'; tip.style.zIndex = '50';
        document.body.append(tip);
        const a = anchor.getBoundingClientRect(), r = tip.getBoundingClientRect();
        tip.style.transform = `translate(${a.left + a.width/2 - r.width/2 + scrollX}px, ${a.top - 4 - r.height + scrollY}px)`;
      } else if (!on && tip) { tip.remove(); tip = null; }
      press('tooltip', !!tip);
    }
    // Folding animates the column like the app (data-panel-motion, --time-panel-enter); unfolding returns at once.
    function fold(on = !ctl.folded && !ctl.folding) {
      if (!workspace || !column) return;
      const ms = parseFloat(getComputedStyle(workspace).getPropertyValue('--time-panel-enter')) || 0;
      workspace.setAttribute('data-panel-motion', '');
      clearTimeout(folding);
      if (on) {
        width = workspace.style.getPropertyValue('--doan-right-width');
        ctl.folding = true;
        workspace.setAttribute('data-panel', 'collapsed'); column.setAttribute('data-collapsed', ''); workspace.style.setProperty('--doan-right-width', '0px');
        folding = setTimeout(() => { ctl.folding = false; ctl.folded = true; workspace.removeAttribute('data-panel-motion'); }, ms);
      } else {
        ctl.folded = false; ctl.folding = false;
        workspace.removeAttribute('data-panel'); column.removeAttribute('data-collapsed'); workspace.style.setProperty('--doan-right-width', width);
        folding = setTimeout(() => workspace.removeAttribute('data-panel-motion'), ms);
      }
      press('fold', on);
    }
    // A new conversation shows its suggested prompts in place of the thread.
    function suggest(on = !prompts) {
      if (!scroll || !thread) return;
      if (on && waiting) permission(false);
      if (on && !prompts) {
        const list = ['Get to know this project', 'Plan the first screen', 'Document the design system'].map(label =>
          `<button type="button" class="suggestion" title="${label}"><span class="suggestion-icon">${svg(ICONS.compass)}</span><span class="suggestion-label">${label}</span>${svg(ICONS.go).replace('<svg ', '<svg class="suggestion-go" ')}</button>`).join('');
        prompts = document.createElement('div');
        prompts.innerHTML = `<div class="ov-suggestions" role="group" aria-label="Suggested prompts">${list}</div>`;
        if (scroll.classList.contains('ov-scroll')) prompts.className = 'ov-col ov-new'; else prompts = prompts.firstElementChild;
        thread.replaceWith(prompts);
      } else if (!on && prompts) { prompts.replaceWith(thread); prompts = null; }
      ctl.prompts = !!prompts; press('prompts', ctl.prompts);
    }
    // A permission card at the thread's end, waiting for an answer.
    function permission(on = !waiting) {
      const list = thread?.querySelector('.thread');
      if (!list) return;
      if (on && prompts) suggest(false);
      if (on && !waiting) {
        waiting = document.createElement('div'); waiting.className = 'thread-item';
        waiting.innerHTML = `<div class="doan-notice thread-notice" role="alert"><span class="strip-agent doan-alert-icon"><img class="logo" src="${asset('../provider-logos/claude.png')}" alt=""></span>
          <span class="strip-text selectable"><b>Claude needs your answer</b><span>Edit .doan/canvases/overview.html</span></span>
          <span class="strip-actions"><button type="button" class="doan-button" data-ui-size="sm" data-ui-variant="prominent">Allow</button><button type="button" class="doan-button" data-ui-size="sm" data-ui-variant="panel">Deny</button><button type="button" class="doan-button" data-ui-size="sm">${svg(ICONS.stop)}Stop</button></span></div>`;
        list.append(waiting);
        const scroller = thread.querySelector('.thread-scroll'); scroller.scrollTop = scroller.scrollHeight;
      } else if (!on && waiting) { waiting.remove(); waiting = null; }
      ctl.waiting = !!waiting; press('permission', ctl.waiting);
    }
    // The card stays but takes no input (an unlisted page, a canvas sharing another's id).
    function noFloor(on = !ctl.noFloor) {
      ctl.noFloor = on;
      const input = card?.querySelector('.composer-input');
      if (input) input.setAttribute('contenteditable', String(!on));
      press('no-floor', on);
    }
    const actions = { picking, tooltip, fold, prompts: suggest, permission, 'no-floor': noFloor };
    frame.querySelectorAll('[data-poc-action]').forEach(b => { const run = actions[b.dataset.pocAction]; if (run) b.addEventListener('click', () => run()); });
    return ctl;
  }

  function createRig(host, ctl) {
    const id = host.dataset.buddyPreview, cfg = core.BUDDIES[id];
    const frame = ctl.frame;
    const ground = host.parentElement, dock = host.closest('.docked'), card = dock.querySelector('.composer-card');
    const toolbar = frame.querySelector('.doan-canvas-tools');
    const surfaces = { dock: card, tools: toolbar };
    const shadow = document.createElement('span'); shadow.className = 'poc-contact-shadow'; ground.prepend(shadow);
    const windowLayer = document.createElement('span'); windowLayer.className = 'poc-buddy-window';
    ground.append(windowLayer); windowLayer.append(host);
    // Host offset and pivot from the rig's foot contact, the shader's own mapping (no per-buddy CSS).
    const g = core.geometry(id);
    host.style.top = `calc(100% + ${g.hostTop}px)`;
    host.style.transformOrigin = `50% ${g.originY*100}%`;
    const state = core.create(id, Math.random);
    const rig = { state, out: null, host, gl: null, paused: false, blocked: false, events: [], ready: false, still: false, render: () => {}, dispose: () => {} };
    const canvas = host.querySelector('canvas'), fallback = host.querySelector('img');
    const message = dock.querySelector('.composer-input');
    const buttons = frame.querySelectorAll('[data-poc-action]');
    const queueTemplate = document.querySelector('.queue-entry')?.cloneNode(true);
    const queueCount = () => dock.querySelectorAll('.queue-entry').length;
    function addQueue() {
      if (!queueTemplate) return;
      let queue = dock.querySelector('.queue');
      if (!queue) { queue = document.createElement('div'); queue.className = 'queue'; dock.prepend(queue); }
      const row = queueTemplate.cloneNode(true);
      row.querySelector('.queue-text').textContent = `Queued follow-up ${queueCount() + 1}`;
      queue.append(row);
    }
    dock.addEventListener('click', event => {
      const button = event.target.closest('.queue-item button[aria-label="Remove queued message"]');
      if (!button) return;
      const queue = button.closest('.queue'); button.closest('.queue-entry').remove();
      if (!queue.querySelector('.queue-entry')) queue.remove();
    });
    function action(name) {
      if (name === 'queue-add') addQueue();
      else if (name === 'queue-clear') dock.querySelector('.queue')?.remove();
      else if (name === 'wander') rig.events.push('trip');
      else if (name === 'input' || name === 'thread') rig.events.push(`look-${name}`);
      else if (name === 'pause') {
        rig.paused = !rig.paused;
        buttons.forEach(b => { if (b.dataset.pocAction === 'pause') { b.textContent = rig.paused ? 'Resume' : 'Pause'; b.setAttribute('aria-pressed', String(rig.paused)); } });
      } else rig.events.push(name);
    }
    buttons.forEach(b => { if (RIG_ACTIONS.has(b.dataset.pocAction)) b.addEventListener('click', () => action(b.dataset.pocAction)); });
    frame.addEventListener('pointermove', e => { if (e.target.closest('.thread-scroll')) rig.events.push('thread'); });
    message?.addEventListener('focus', () => rig.events.push('input'));
    message?.addEventListener('input', () => {
      rig.events.push('input');
      message.toggleAttribute('data-empty', !message.textContent.trim());
      const measure = document.createElement('canvas').getContext('2d');
      measure.font = getComputedStyle(message).font;
      const expanded = measure.measureText(message.textContent).width > card.clientWidth - 100 || message.innerText.includes('\n');
      dock.dataset.shape = expanded ? 'box' : 'capsule';
      dock.querySelector('.composer-send').disabled = !message.textContent.trim();
    });

    function surface(name, now) {
      const el = surfaces[name];
      if (!el || !el.isConnected) return null;
      const r = el.getBoundingClientRect();
      const present = el.checkVisibility({ visibilityProperty: true }) && r.width > 0;
      // The ground spans the padding box (the toolbar has a 1px transparent border).
      const box = { left: r.left + el.clientLeft, right: r.left + el.clientLeft + el.clientWidth, top: r.top + el.clientTop };
      return { present, width: el.clientWidth, accepts: name === 'dock' ? !ctl.noFloor : true,
        floating: present && core.overlaps(core.buddyBox(box, core.xOn(state, name, el.clientWidth)), floating(now)) };
    }
    function inputs(now) {
      const events = rig.events; rig.events = [];
      return {
        surfaces: { dock: surface('dock', now), tools: surface('tools', now) },
        reasons: { queue: queueCount() > 0, prompts: ctl.prompts, waiting: ctl.waiting },
        panel: { folded: ctl.folded, folding: ctl.folding },
        resting: ctl.resting(now),
        // Time runs only while the frame (a stable container, not the sprite) is shown and the rig has drawn.
        visible: rig.ready && ctl.visible && frame.checkVisibility({ visibilityProperty: true, opacityProperty: true }) && !document.hidden,
        paused: rig.paused, reduced: reduced.matches, events,
      };
    }
    function apply(out) {
      const target = out.surface && surfaces[out.surface];
      if (target && ground.parentElement !== target) target.prepend(ground);
      host.style.transform = `translate(${out.host.x}px,${out.host.y}px)`;
      shadow.style.transform = `translateX(${out.shadow.x}px) scale(${out.shadow.scaleX},${out.shadow.scaleY})`;
      shadow.style.opacity = String(out.shadow.opacity);
      host.dataset.surface = out.surface ?? '';
      host.dataset.presence = out.presence;
      host.dataset.attention = out.attention;
      host.dataset.state = rig.still ? 'static' : out.mode;
      host.style.setProperty('--hop-lift', String(out.pose.hopLift));
    }

    let gl = null, program = null, locations = {}, indices = [], textures = [], eyeTexture = null;
    try {
      gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: false });
    } catch { gl = null; }
    rig.gl = gl;
    const goStill = () => { rig.still = true; rig.ready = false; fallback.hidden = false; canvas.hidden = true; host.dataset.state = 'static'; };
    if (gl) {
      try {
        const { vertex, fragment } = core.shaders(id);
        const compile = (type, source) => {
          const shader = gl.createShader(type);
          gl.shaderSource(shader, source); gl.compileShader(shader);
          if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw Error(gl.getShaderInfoLog(shader));
          return shader;
        };
        program = gl.createProgram();
        gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex));
        gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw Error(gl.getProgramInfoLog(program));
        gl.useProgram(program);
        for (const key of ['time','squash','lift','tilt','hatTilt','layer','energy','look','eyeOpen','skin','eyeTex']) locations[key] = gl.getUniformLocation(program, key);
        const points = [], n = 64;
        for (let y = 0; y <= n; y++) for (let x = 0; x <= n; x++) points.push(x/n, y/n);
        for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { const i = y*(n+1) + x; indices.push(i, i+1, i+n+1, i+1, i+n+2, i+n+1); }
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(points), gl.STATIC_DRAW);
        const uv = gl.getAttribLocation(program, 'aUV'); gl.enableVertexAttribArray(uv); gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer()); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);
        gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      } catch (error) { console.error(error); gl = null; rig.gl = null; }
    }
    if (!gl) goStill();
    function texture(name) {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
          try {
            const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
            resolve(t);
          } catch (error) { reject(error); }
        };
        img.onerror = () => reject(Error('Could not load ' + name)); img.src = asset(name);
      });
    }
    function render(out = rig.out) {
      if (!rig.ready || !out || gl.isContextLost()) return;
      const p = out.pose;
      gl.viewport(0, 0, canvas.width, canvas.height); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); gl.useProgram(program);
      for (const key of ['time', 'squash', 'lift', 'tilt', 'hatTilt', 'energy', 'eyeOpen']) gl.uniform1f(locations[key], p[key]);
      gl.uniform2f(locations.look, p.lookX, p.lookY);
      gl.uniform1i(locations.skin, 0);
      if (eyeTexture) { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, eyeTexture); gl.uniform1i(locations.eyeTex, 1); gl.activeTexture(gl.TEXTURE0); }
      for (let layer = 0; layer < 2; layer++) { gl.uniform1f(locations.layer, layer); gl.bindTexture(gl.TEXTURE_2D, textures[layer]); gl.drawElements(gl.TRIANGLES, indices.length, gl.UNSIGNED_SHORT, 0); }
    }
    rig.render = () => render();
    const resize = () => {
      if (!gl) return;
      const size = Math.min(1024, Math.ceil(host.clientWidth*Math.min(devicePixelRatio || 1, 2)));
      if (size === 0) return;
      canvas.width = size; canvas.height = size; render();
    };
    const observer = new ResizeObserver(resize); observer.observe(host);
    let disposed = false, raf = 0, drawn = '';
    function tick(now) {
      if (disposed) return;
      const out = core.advance(state, inputs(now), now, Math.random);
      rig.out = out;
      apply(out);
      rig.blocked = queueCount() > 0 || ctl.prompts || ctl.waiting || ctl.noFloor || ctl.folded || ctl.folding;
      const wander = frame.querySelector('[data-poc-action="wander"]');
      if (wander) wander.disabled = ctl.rigs.some(r => r.blocked);
      // Draw while visible and moving; a still pose (reduced motion, paused, not visible) draws once when it changes.
      const key = `${out.mode}|${out.pose.time}|${out.surface}|${out.conceal}`;
      if (out.conceal < 1 && key !== drawn) { drawn = key; render(out); }
      raf = requestAnimationFrame(tick);
    }
    if (gl) {
      canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); goStill(); });
      Promise.all([texture(cfg.body), texture(cfg.accessory), texture('eye.png')]).then(([b, a, e]) => {
        textures.push(b, a); eyeTexture = e;
        if (disposed) return;
        rig.ready = true; fallback.hidden = true; canvas.hidden = false; drawn = ''; resize();
      }).catch(error => { goStill(); console.error(error); });
    }
    raf = requestAnimationFrame(tick);
    rig.dispose = () => { disposed = true; cancelAnimationFrame(raf); observer.disconnect(); gl?.getExtension('WEBGL_lose_context')?.loseContext(); };
    window.addEventListener('pagehide', rig.dispose, { once: true });
    return rig;
  }

  const rigs = [], controllers = new Map();
  document.querySelectorAll('[data-buddy-preview]').forEach(host => {
    const frame = host.closest('[data-mascot-scope], [data-doan-frame]');
    if (!controllers.has(frame)) controllers.set(frame, controller(frame));
    const ctl = controllers.get(frame);
    try { const rig = createRig(host, ctl); ctl.rigs.push(rig); rigs.push(rig); }
    catch (error) { host.dataset.state = 'static'; console.error(error); }
  });
  // Static specimens need the app's end-following behavior as the queue changes their viewport height.
  document.querySelectorAll('.thread-scroll').forEach(scroller => {
    let pinned = true;
    scroller.addEventListener('scroll', () => { pinned = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight < 2; }, { passive: true });
    const observer = new ResizeObserver(() => { if (pinned) scroller.scrollTop = scroller.scrollHeight; });
    observer.observe(scroller);
    observer.observe(scroller.querySelector('.thread'));
    window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
  });
  window.buddyPreview = { rigs, core };
})();
