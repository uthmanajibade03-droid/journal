/* Vercel KV (Upstash Redis) REST client.
   The leading underscore folder keeps Vercel from deploying this as
   its own function. Other files require() it. */

const URL = process.env.KV_REST_API_URL;
const TOKEN = process.env.KV_REST_API_TOKEN;

function configured() { return !!(URL && TOKEN); }

async function get(key) {
  if (!configured()) return null;
  const r = await fetch(URL + '/get/' + encodeURIComponent(key), {
    headers: { Authorization: 'Bearer ' + TOKEN }
  });
  if (!r.ok) {
    if (r.status === 404) return null;
    throw new Error('KV GET ' + r.status);
  }
  const data = await r.json().catch(function () { return null; });
  if (!data || data.result == null) return null;
  try { return JSON.parse(data.result); }
  catch (e) { return data.result; }
}

async function set(key, value) {
  if (!configured()) throw new Error('Vercel KV not configured');
  const body = typeof value === 'string' ? value : JSON.stringify(value);
  const r = await fetch(URL + '/set/' + encodeURIComponent(key), {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + TOKEN,
      'Content-Type': 'text/plain'
    },
    body: body
  });
  if (!r.ok) {
    const t = await r.text().catch(function () { return ''; });
    throw new Error('KV SET ' + r.status + ': ' + t);
  }
  return true;
}

async function del(key) {
  if (!configured()) return false;
  const r = await fetch(URL + '/del/' + encodeURIComponent(key), {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + TOKEN }
  });
  return r.ok;
}

module.exports = { configured, get, set, del };
