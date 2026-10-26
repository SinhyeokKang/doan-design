// Synthetic wire peer for the installed-SDK and app-server runtime tests.
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn } = require('node:child_process');
const runtime = process.argv[2];
const base = process.env.DOAN_FAKE_ROOT;
const config = () => JSON.parse(fs.readFileSync(path.join(base, runtime + '.json'), 'utf8'));
if (process.argv.includes('--version')) { console.log(config().version || (runtime === 'claude' ? '2.1.310' : '0.163.0')); process.exit(0); }
if (process.argv.includes('mcp')) { process.stdout.write('{}\n'); process.exit(0); }
const log = value => fs.appendFileSync(path.join(base, 'wire.jsonl'), JSON.stringify({ runtime, pid: process.pid, ...value }) + '\n');
log({ kind: 'spawn', argv: process.argv.slice(3), cwd: process.cwd() });
const child = spawn(process.execPath, ['-e', 'setInterval(()=>{},1000)'], { stdio: 'ignore' });
log({ kind: 'descendant', child: child.pid });
if (config().mode === 'startup-crash') process.exit(7);
const send = value => { log({ kind: 'out', value }); process.stdout.write(JSON.stringify(value) + '\n'); };
let session = '', turn = '', current = {}, request = '';
const gate = (name, fn) => { if (!name) return fn(); const timer = setInterval(() => { if (fs.existsSync(path.join(base, name))) { clearInterval(timer); fn(); } }, 10); };
function ensureSession(id) {
  if (runtime === 'claude') {
    const dir = path.join(process.env.CLAUDE_CONFIG_DIR, 'projects', 'fixture'); fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, id + '.jsonl'), JSON.stringify({ sessionId: id, type: 'fixture' }) + '\n');
  } else {
    const dir = path.join(process.env.CODEX_HOME, 'sessions', '2026', '10', '27'); fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'rollout-2026-10-27T00-00-00-' + id + '.jsonl');
    if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify({ type: 'session_meta', payload: { id, cwd: process.cwd(), cli_version: '0.163.0' } }) + '\n');
  }
}
function done() {
  if (current.write) fs.writeFileSync(path.join(process.cwd(), current.write.path), current.write.html);
  if (runtime === 'claude') {
    if (!current.finalOnly) send({ type: 'assistant', parent_tool_use_id: null, message: { id: 'message-' + turn, role: 'assistant', content: [{ type: 'text', text: 'fixture complete' }] } });
    send({ type: 'result', subtype: 'success', is_error: false, result: 'fixture complete', session_id: session });
    setTimeout(() => process.exit(0), 20);
  } else {
    if (!current.finalOnly) send({ method: 'item/completed', params: { threadId: session, turnId: turn, item: { type: 'agentMessage', id: 'message-' + turn, text: 'fixture complete' } } });
    send({ method: 'turn/completed', params: { threadId: session, turn: { id: turn, status: 'completed' } } });
    if (current.foreign) send({ id: 'post-terminal', method: 'item/tool/requestUserInput', params: { threadId: session, turnId: turn } });
  }
}
function begin() {
  ensureSession(session);
  if (current.mode === 'crash') return process.exit(7);
  if (current.mode === 'malformed' || current.mode === 'noise-valid') { log({kind:'noise'}); process.stdout.write('not-json\n'); if (current.mode === 'malformed') return; }
  if (runtime === 'claude') {
    for (const event of [{type:'message_start',message:{id:'message-'+turn}}, {type:'content_block_start',index:0,content_block:{type:'text',text:''}}, {type:'content_block_delta',index:0,delta:{type:'text_delta',text:'fixture '}}]) send({type:'stream_event',event,parent_tool_use_id:null,session_id:session});
  }
  if (runtime === 'codex') {
    send({ method: 'item/agentMessage/delta', params: { threadId: session, turnId: turn, itemId: 'message-' + turn, delta: 'fixture ' } });
    if (current.foreign) for (const [id, params] of [['foreign-thread', {threadId:'foreign',turnId:turn}], ['global', {}], ['nullable', {threadId:session,turnId:null}]]) send({id,method:'item/tool/requestUserInput',params});
  }
  if (current.finalOnly) {
    if (runtime === 'claude') send({ type:'assistant', parent_tool_use_id:null, message:{id:'message-'+turn,role:'assistant',content:[{type:'text',text:'fixture complete'}]} });
    else send({method:'item/completed',params:{threadId:session,turnId:turn,item:{type:'agentMessage',id:'message-'+turn,text:'fixture complete'}}});
  }
  if (current.mode === 'permission') {
    request = 'approval-' + turn;
    if (runtime === 'claude') send({type:'assistant',parent_tool_use_id:null,message:{id:'tool-'+turn,role:'assistant',content:[{type:'tool_use',id:request,name:'Write',input:{file_path:path.join(process.cwd(),'design/a.html'),content:'fixture'}}]}});
    else send({method:'item/started',params:{threadId:session,turnId:turn,item:{type:'fileChange',id:'edit-'+turn,changes:[{path:path.join(process.cwd(),'design/a.html'),kind:{type:'update'},diff:'+fixture'}]}}});
    if (runtime === 'claude') send({ type: 'control_request', request_id: request, request: { subtype: 'can_use_tool', tool_name: 'Write', input: { file_path: path.join(process.cwd(), 'design/a.html'), content: 'fixture' }, tool_use_id: request } });
    else send({ id: request, method: 'item/fileChange/requestApproval', params: { threadId: session, turnId: turn, itemId: 'edit-' + turn, reason: 'Fixture edit' } });
  } else if (current.mode !== 'hold') gate(current.doneGate, done);
}
require('node:readline').createInterface({input:process.stdin}).on('line', line => {
  const r = JSON.parse(line); log({ kind:'in', value:r });
  if (runtime === 'claude') {
    if (r.type === 'control_request') gate(config().handshakeGate, () => send({ type:'control_response', response:{subtype:'success',request_id:r.request_id,response:{commands:[],models:[],account:{}}} }));
    if (r.type === 'user') { session = r.session_id; turn = randomUUID(); current = config(); begin(); }
    if (r.type === 'control_response' && r.response.request_id === request) { if (r.response.response?.behavior === 'deny') current.write = null; gate(current.doneGate, done); }
  } else {
    if (r.method === 'initialize') gate(config().handshakeGate, () => send({ id:r.id,result:{} }));
    if (r.method === 'thread/start' || r.method === 'thread/resume') {
      if (config().mode === 'active-writer') return send({id:r.id,error:{code:-32000,message:'already has an active writer'}});
      session = r.params.threadId || config().generatedId || randomUUID(); ensureSession(session);
      send({id:r.id,result:{thread:{id:session}}});
    }
    if (r.method === 'turn/start' && config().mode === 'crash-before-reply') return process.exit(7);
    if (r.method === 'turn/start') { turn = randomUUID(); current = config(); send({id:r.id,result:{turn:{id:turn}}}); begin(); }
    if (r.method === 'turn/interrupt') { send({id:r.id,result:{}}); send({method:'turn/completed',params:{threadId:session,turn:{id:turn,status:'interrupted'}}}); }
    if (r.id === request && r.result) { if (r.result.decision === 'decline') current.write = null; gate(current.doneGate, done); }
  }
});
