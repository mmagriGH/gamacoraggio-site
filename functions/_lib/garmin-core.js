// Cloudflare Pages Functions utilities: no embedded credentials.
const encoder = new TextEncoder();
export const CALLBACK = "https://gamacoraggio.com/endurostrength/oauth/garmin/callback";
// Registered redirect must exactly match the Garmin application setting.
// Preview may use the stable, branch-specific Cloudflare Pages alias, never a
// random deployment hash. This never weakens the integration feature flag.
export function callbackURL(env) {
  const value = env.GARMIN_REDIRECT_URI || CALLBACK;
  let url;
  try { url = new URL(value); }
  catch { throw new PublicError("Garmin redirect configuration is invalid", 503); }
  const isProduction = url.hostname === "gamacoraggio.com";
  const isPreview = url.hostname.endsWith(".gamacoraggio-site.pages.dev") &&
    url.hostname !== "gamacoraggio-site.pages.dev";
  if (url.protocol !== "https:" || (!isProduction && !isPreview) ||
      url.pathname !== "/endurostrength/oauth/garmin/callback" ||
      url.search || url.hash || url.port || url.username || url.password) {
    throw new PublicError("Garmin redirect configuration is not approved", 503);
  }
  return url.toString();
}
export const GARMIN_AUTHORIZE = "https://connect.garmin.com/oauth2Confirm";
export const GARMIN_TOKEN = "https://diauth.garmin.com/di-oauth2-service/oauth/token";
export const GARMIN_USER_ID = "https://apis.garmin.com/wellness-api/rest/user/id";
export const GARMIN_PERMISSIONS = "https://apis.garmin.com/wellness-api/rest/user/permissions";
export const GARMIN_REVOKE = "https://apis.garmin.com/wellness-api/rest/user/registration";
export const currentSeconds = () => Math.floor(Date.now() / 1000);

export class PublicError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}
export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
      "Referrer-Policy": "no-referrer"
    }
  });
}
export function html(message, status = 200) {
  const safe = message.replace(/[&<>\"']/g, c => ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c]));
  return new Response('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><title>EnduroStrength Garmin</title><main style="max-width:34rem;margin:12vh auto;padding:1.5rem;font:1.1rem system-ui"><h1>EnduroStrength</h1><p>'+safe+'</p><p>You may return to EnduroStrength.</p></main>', {status,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store","Referrer-Policy":"no-referrer","Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'"}});
}
export function handleError(error) {
  return json({error:error instanceof PublicError ? error.message : "Service temporarily unavailable"}, error instanceof PublicError ? error.status : 503);
}
export function requireReady(env) {
  if (env.GARMIN_INTEGRATION_ENABLED !== "true") throw new PublicError("Garmin integration is not yet enabled",503);
  for (const key of ["GARMIN_DB","GARMIN_CLIENT_ID","GARMIN_CLIENT_SECRET","GARMIN_ENCRYPTION_KEY_B64"]) {
    if (!env[key]) throw new PublicError("Garmin integration is not configured",503);
  }
}
function bytesToB64(bytes) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g,"-").replace(/\//g,"_").replace(/=/g,""); }
function b64ToBytes(input) {
  const standard=input.replace(/-/g,"+").replace(/_/g,"/");
  return Uint8Array.from(atob(standard+"=".repeat((4-standard.length%4)%4)),c=>c.charCodeAt(0));
}
export function randomSecret(length=32) { return bytesToB64(crypto.getRandomValues(new Uint8Array(length))); }
export async function sha256(value) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
}
export async function deviceHash(request) {
  const header = request.headers.get("Authorization") || "";
  const m = /^Bearer ([A-Za-z0-9_-]{43,128})$/.exec(header);
  if (!m) throw new PublicError("This device is not authorized",401);
  const digest = await sha256(m[1]);
  return Array.from(digest,b=>b.toString(16).padStart(2,"0")).join("");
}
async function encryptionKey(env) {
  const data = b64ToBytes(env.GARMIN_ENCRYPTION_KEY_B64);
  if(data.length !== 32) throw new PublicError("Encryption key is not configured correctly",503);
  return crypto.subtle.importKey("raw",data,{name:"AES-GCM"},false,["encrypt","decrypt"]);
}
export async function seal(env,plaintext) {
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const ciphertext=await crypto.subtle.encrypt({name:"AES-GCM",iv},await encryptionKey(env),encoder.encode(plaintext));
  return "v1."+bytesToB64(iv)+"."+bytesToB64(new Uint8Array(ciphertext));
}
export async function unseal(env,sealed) {
  const parts=sealed.split(".");
  if(parts.length!==3||parts[0]!=="v1") throw new PublicError("Unable to decrypt stored credentials",503);
  const raw=await crypto.subtle.decrypt({name:"AES-GCM",iv:b64ToBytes(parts[1])},await encryptionKey(env),b64ToBytes(parts[2]));
  return new TextDecoder().decode(raw);
}
export async function pkceChallenge(verifier) { return bytesToB64(await sha256(verifier)); }
export async function tokenRequest(env,fields) {
  const response=await fetch(GARMIN_TOKEN,{
    method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},
    body:new URLSearchParams({...fields,client_id:env.GARMIN_CLIENT_ID,client_secret:env.GARMIN_CLIENT_SECRET}).toString()
  });
  if(!response.ok) throw new PublicError("Garmin authorization could not be completed",502);
  const data=await response.json();
  if(typeof data.access_token!=="string"||typeof data.refresh_token!=="string") throw new PublicError("Garmin returned incomplete credentials",502);
  return data;
}
export async function garminAuthorized(url,accessToken,method="GET") {
  const response=await fetch(url,{
    method,headers:{"Authorization":"Bearer "+accessToken,"Accept":"application/json"}
  });
  if(!response.ok) throw new PublicError("Garmin could not complete the requested operation",502);
  if(method==="DELETE") return null;
  return response.json();
}
export async function connected(env,hash) {
  return env.GARMIN_DB.prepare("SELECT * FROM garmin_connections WHERE device_hash = ?").bind(hash).first();
}
export async function validAccessToken(env,connection) {
  if(connection.access_expires_at>currentSeconds()+600) return unseal(env,connection.access_ciphertext);
  if(!connection.refresh_ciphertext || (connection.refresh_expires_at && connection.refresh_expires_at<=currentSeconds())) throw new PublicError("Garmin authorization expired; reconnect your account",401);
  const token=await tokenRequest(env,{grant_type:"refresh_token",refresh_token:await unseal(env,connection.refresh_ciphertext)});
  const now=currentSeconds();
  await env.GARMIN_DB.prepare("UPDATE garmin_connections SET access_ciphertext=?,refresh_ciphertext=?,access_expires_at=?,refresh_expires_at=?,updated_at=? WHERE device_hash=?").bind(
    await seal(env,token.access_token),await seal(env,token.refresh_token),
    now+Number(token.expires_in||3600),
    token.refresh_token_expires_in ? now+Number(token.refresh_token_expires_in) : connection.refresh_expires_at,
    now,connection.device_hash
  ).run();
  return token.access_token;
}
export async function deleteExpiredFlows(env) {
  await env.GARMIN_DB.prepare("DELETE FROM garmin_oauth_flows WHERE expires_at < ?").bind(currentSeconds()).run();
}
// Shared secret in callback URL, since Garmin only receives a URL configuration.
// Do not log query strings, and restrict route via Cloudflare WAF/rate-limits.
export async function authenticateWebhook(request,env) {
  const expected=env.GARMIN_WEBHOOK_TOKEN;
  const presented=new URL(request.url).searchParams.get("key") || "";
  if(!expected||expected.length<40||presented.length<40) throw new PublicError("Unauthorized",401);
  const a=await sha256(expected), b=await sha256(presented);
  let diff=0; for(let i=0;i<a.length;i++) diff |= a[i]^b[i];
  if(diff!==0) throw new PublicError("Unauthorized",401);
}
export function safePositiveNumber(value,max=86400) {
  return typeof value==="number" && Number.isFinite(value) && value>=0 && value<=max ? value : null;
}
