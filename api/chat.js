// Web test page for Ona: open https://ona-bot.vercel.app/api/chat in a browser.
// Same brain and memory as the WhatsApp bot, no Twilio needed.
const ona = require('../lib/ona');
const store = require('../lib/store');
const files = require('../lib/files');

const PAGE = `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>Chat with Ona</title>
<style>
:root{--bg:#E9EDE6;--wall:#EFEAE2;--panel:#fff;--ink:#16233B;--muted:#5B677A;--line:#D6DCD3;--leaf:#167A4C;--on-leaf:#fff;--me:#D9FDD3;--chip:#fff}
@media(prefers-color-scheme:dark){:root{--bg:#0B141A;--wall:#0B141A;--panel:#1F2C34;--ink:#E9EDEF;--muted:#8696A0;--line:#2A3942;--leaf:#21A366;--on-leaf:#fff;--me:#005C4B;--chip:#1F2C34}}
*{box-sizing:border-box}html,body{height:100%;margin:0}
body{background:var(--bg);color:var(--ink);font:15px/1.45 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;display:flex;justify-content:center}
.app{width:100%;max-width:560px;height:100%;display:flex;flex-direction:column;background:var(--wall)}
header{display:flex;align-items:center;gap:12px;padding:12px max(16px,env(safe-area-inset-left));padding-top:max(12px,env(safe-area-inset-top));background:var(--leaf);color:var(--on-leaf)}
.av{width:40px;height:40px;border-radius:50%;background:var(--on-leaf);color:var(--leaf);display:grid;place-items:center;font-weight:800;font-size:20px}
.nm{font-weight:700;font-size:17px;line-height:1.1}.st{font-size:12.5px;opacity:.85}
header button{margin-left:auto;background:transparent;border:1px solid rgba(255,255,255,.5);color:var(--on-leaf);border-radius:999px;padding:6px 12px;font:inherit;font-size:13px;cursor:pointer}
.note{font-size:12.5px;color:var(--muted);text-align:center;padding:8px 16px;background:var(--panel);border-bottom:1px solid var(--line)}
#chat{flex:1;overflow-y:auto;padding:14px 12px;display:flex;flex-direction:column;gap:6px}
.row{display:flex}.row.me{justify-content:flex-end}
.b{max-width:86%;background:var(--panel);padding:8px 10px;border-radius:12px;box-shadow:0 1px 0 rgba(0,0,0,.08);white-space:pre-wrap;overflow-wrap:anywhere}
.row.me .b{background:var(--me)}.b a{color:var(--leaf);font-weight:600}
.typing{color:var(--muted);font-style:italic}
.chips{display:flex;gap:6px;overflow-x:auto;padding:8px 12px 0}
.chips button{flex:none;border:1px solid var(--line);background:var(--chip);color:var(--leaf);border-radius:999px;padding:6px 12px;font:inherit;font-size:13.5px;font-weight:600;cursor:pointer}
form{display:flex;gap:8px;padding:8px 12px;padding-bottom:max(10px,env(safe-area-inset-bottom))}
textarea{flex:1;resize:none;border:0;border-radius:22px;padding:11px 16px;background:var(--panel);color:var(--ink);font:inherit;min-height:44px;max-height:140px}
.att{width:44px;height:44px;border-radius:50%;border:0;background:transparent;color:var(--muted);cursor:pointer;display:grid;place-items:center;flex:none;font-size:22px}
.send{width:44px;height:44px;border-radius:50%;border:0;background:var(--leaf);color:var(--on-leaf);cursor:pointer;display:grid;place-items:center;flex:none}
:focus-visible{outline:2px solid var(--leaf);outline-offset:2px}
</style></head><body><div class="app">
<header><div class="av">O</div><div><div class="nm">Ona</div><div class="st" id="st">online</div></div><button id="reset" type="button">Start over</button></header>
<div class="note">Test version of Ona. This is how it works on WhatsApp. Type a reply, tap a suggestion, or 📎 attach your CV (PDF or Word).</div>
<div id="chat" aria-live="polite"></div>
<div class="chips" id="chips"></div>
<form id="f"><button type="button" class="att" id="att" aria-label="Attach your CV (PDF or Word)" title="Attach your CV (PDF or Word)">📎</button><input type="file" id="file" hidden accept=".pdf,.docx,.doc,.txt,.png,.jpg,.jpeg,.webp,application/pdf,image/*,application/vnd.openxmlformats-officedocument.wordprocessingml.document"><textarea id="t" rows="1" placeholder="Message" aria-label="Message"></textarea>
<button class="send" aria-label="Send"><svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.4 21 12 3.4 3.6 3.4 10l12.6 2-12.6 2z"/></svg></button></form>
</div><script>
var KEY='ona-web-id',LOG='ona-web-log',id,log=[];
try{id=localStorage.getItem(KEY);log=JSON.parse(localStorage.getItem(LOG)||'[]')}catch(e){}
if(!id){id='web:'+String(Math.floor(1e9+Math.random()*9e9));try{localStorage.setItem(KEY,id)}catch(e){}}
var chat=document.getElementById('chat'),t=document.getElementById('t'),busy=false;
function esc(s){return s.replace(/[&<>"]/g,function(c){return{'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]})}
function fmt(s){return esc(s).replace(/\\*([^*\\n]+)\\*/g,'<b>$1</b>').replace(/(https?:\\/\\/[^\\s<]+)/g,'<a href="$1" target="_blank" rel="noopener">$1</a>')}
function add(who,text,save){var r=document.createElement('div');r.className='row '+who;r.innerHTML='<div class="b">'+fmt(text)+'</div>';chat.appendChild(r);chat.scrollTop=chat.scrollHeight;if(save!==false){log.push([who,text]);if(log.length>200)log=log.slice(-200);try{localStorage.setItem(LOG,JSON.stringify(log))}catch(e){}}}
function chips(last){var c=[];var l=(last||'').toUpperCase();
 if(/REPLY \\*YES\\*/.test(l))c=['YES'];else if(/\\*SAMPLE\\*/.test(l))c=['SAMPLE'];else if(/HOW OLD/.test(l))c=['22','26','30'];
 else if(/REPLY 1, 2 OR 3/.test(l))c=['1','2','3'];else c=['APPLY 1','NEXT','NEXT 7','STATUS','MATCHES','HELP'];
 document.getElementById('chips').innerHTML=c.map(function(x){return '<button type="button">'+x+'</button>'}).join('')}
document.getElementById('chips').onclick=function(e){if(e.target.tagName==='BUTTON')send(e.target.textContent)};
function send(text,file){text=(text||'').trim();if((!text&&!file)||busy)return;add('me',file?'📄 '+file.name:text);busy=true;document.getElementById('st').textContent=file?'reading your CV…':'typing…';
 var ty=document.createElement('div');ty.className='row';ty.innerHTML='<div class="b typing">Ona is typing…</div>';chat.appendChild(ty);chat.scrollTop=chat.scrollHeight;
 fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(file?{id:id,file:file}:{id:id,text:text})})
 .then(function(r){return r.json()}).then(function(j){ty.remove();(j.messages||['Something went wrong. Try again.']).forEach(function(m){add('bot',m)});chips((j.messages||[]).slice(-1)[0])})
 .catch(function(){ty.remove();add('bot','I could not connect. Check your internet and try again.',false)})
 .then(function(){busy=false;document.getElementById('st').textContent='online'})}
document.getElementById('att').onclick=function(){if(!busy)document.getElementById('file').click()};
document.getElementById('file').onchange=function(e){var f=e.target.files[0];e.target.value='';if(!f)return;
 if(f.size>3*1024*1024){add('bot','That file is over 3 MB. Please send a smaller file, or paste your CV as text.',false);return}
 var rd=new FileReader();rd.onload=function(){send('',{name:f.name,type:f.type||'',data:String(rd.result).split(',')[1]||''})};rd.readAsDataURL(f)};
document.getElementById('f').onsubmit=function(e){e.preventDefault();var v=t.value;t.value='';t.style.height='';send(v)};
t.addEventListener('keydown',function(e){if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();document.getElementById('f').requestSubmit()}});
t.addEventListener('input',function(){t.style.height='auto';t.style.height=Math.min(t.scrollHeight,140)+'px'});
document.getElementById('reset').onclick=function(){if(busy)return;chat.innerHTML='';log=[];try{localStorage.removeItem(LOG)}catch(e){}send('RESET')};
if(log.length){log.forEach(function(m){add(m[0],m[1],false)});chips(log.filter(function(m){return m[0]==='bot'}).slice(-1)[0]?.[1])}else send('Hi');
</script></body></html>`;

module.exports = async (req, res) => {
  if (req.method === 'GET'){ res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.status(200).send(PAGE); return; }
  if (req.method !== 'POST'){ res.status(405).send('Method not allowed'); return; }
  let b = req.body || {};
  if (typeof b === 'string'){ try { b = JSON.parse(b); } catch (e){ b = {}; } }
  const id = String(b.id || '');
  let text = String(b.text || '').slice(0, 6000);
  if (/^web:\d{6,12}$/.test(id) && b.file && b.file.data){
    if (!store.hasRedis()){ res.status(200).json({ messages: ['⚙️ Ona’s memory isn’t connected yet.'] }); return; }
    const r = await files.extract({ buffer: Buffer.from(String(b.file.data), 'base64'), type: String(b.file.type || ''), name: String(b.file.name || '') });
    if (r.error){ res.status(200).json({ messages: [r.error] }); return; }
    text = r.text.slice(0, 20000);
  }
  if (!/^web:\d{6,12}$/.test(id) || !text){ res.status(400).json({ messages: ['Something is off with this page. Reload it and try again.'] }); return; }
  if (!store.hasRedis()){ res.status(200).json({ messages: ['⚙️ Ona’s memory isn’t connected yet.'] }); return; }
  try {
    const messages = await ona.handle({ phone: id, text, waName: '' });
    res.status(200).json({ messages });
  } catch (e){
    console.error(e);
    // Test version: show the technical reason so the team can fix it quickly.
    res.status(200).json({ messages: ['Sorry, something went wrong on my side. Please try again in a minute.', `🛠 Test info for the team: ${String(e && e.message || e).slice(0, 300)}`] });
  }
};
