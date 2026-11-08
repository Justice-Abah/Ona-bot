// Storage: Upstash Redis over its REST API (added from Vercel's Storage tab).
// Falls back to in-memory storage for local tests; memory does NOT persist on Vercel.

const URL_ = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

const mem = { kv: new Map(), sets: new Map(), lists: new Map(), hashes: new Map() };

function hasRedis(){ return !!(URL_ && TOKEN); }

async function redis(cmd){
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd)
  });
  const j = await r.json();
  if (j.error) throw new Error('Redis: ' + j.error);
  return j.result;
}

const key = phone => 'ona:user:' + phone;

async function getUser(phone){
  if (!hasRedis()) { const v = mem.kv.get(key(phone)); return v ? JSON.parse(v) : null; }
  const v = await redis(['GET', key(phone)]);
  return v ? JSON.parse(v) : null;
}

async function saveUser(u){
  const v = JSON.stringify(u);
  if (!hasRedis()) {
    mem.kv.set(key(u.phone), v);
    if (!mem.sets.has('ona:users')) mem.sets.set('ona:users', new Set());
    mem.sets.get('ona:users').add(u.phone);
    return;
  }
  await redis(['SET', key(u.phone), v]);
  await redis(['SADD', 'ona:users', u.phone]);
}

async function deleteUser(phone){
  if (!hasRedis()) { mem.kv.delete(key(phone)); mem.sets.get('ona:users')?.delete(phone); return; }
  await redis(['DEL', key(phone)]);
  await redis(['SREM', 'ona:users', phone]);
}

async function allPhones(){
  if (!hasRedis()) return [...(mem.sets.get('ona:users') || [])];
  return (await redis(['SMEMBERS', 'ona:users'])) || [];
}

async function count(field, n = 1){
  if (!hasRedis()) { const h = mem.hashes.get('ona:stats') || {}; h[field] = (h[field] || 0) + n; mem.hashes.set('ona:stats', h); return; }
  await redis(['HINCRBY', 'ona:stats', field, String(n)]);
}

async function stats(){
  if (!hasRedis()) return mem.hashes.get('ona:stats') || {};
  const arr = (await redis(['HGETALL', 'ona:stats'])) || [];
  const o = {}; for (let i = 0; i < arr.length; i += 2) o[arr[i]] = +arr[i + 1];
  return o;
}

async function addFeedback(entry){
  const v = JSON.stringify(entry);
  if (!hasRedis()) { const l = mem.lists.get('ona:feedback') || []; l.unshift(v); mem.lists.set('ona:feedback', l); return; }
  await redis(['LPUSH', 'ona:feedback', v]);
}

async function feedback(limit = 200){
  if (!hasRedis()) return (mem.lists.get('ona:feedback') || []).slice(0, limit).map(s => JSON.parse(s));
  return ((await redis(['LRANGE', 'ona:feedback', '0', String(limit - 1)])) || []).map(s => JSON.parse(s));
}

module.exports = { hasRedis, getUser, saveUser, deleteUser, allPhones, count, stats, addFeedback, feedback };
