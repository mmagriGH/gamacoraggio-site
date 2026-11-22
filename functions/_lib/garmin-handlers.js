import {
  CALLBACK, GARMIN_AUTHORIZE, GARMIN_USER_ID, GARMIN_PERMISSIONS, GARMIN_REVOKE,
  currentSeconds, PublicError, json, html, handleError, requireReady, randomSecret,
  deviceHash, seal, unseal, pkceChallenge, tokenRequest, garminAuthorized, connected,
  validAccessToken, deleteExpiredFlows, authenticateWebhook, safePositiveNumber
} from "./garmin-core.js";

const run = async (context, handler, asHtml = false) => {
  try { requireReady(context.env); return await handler(context); }
  catch (error) {
    if (asHtml) return html(error instanceof PublicError ? error.message : "Could not complete Garmin authorization", error instanceof PublicError ? error.status : 503);
    return handleError(error);
  }
};
export const start = context => run(context, async ({request,env}) => {
  const hash=await deviceHash(request);
  await deleteExpiredFlows(env);
  const state=randomSecret();
  const verifier=randomSecret(64);
  await env.GARMIN_DB.prepare("INSERT INTO garmin_oauth_flows (state,device_hash,verifier_ciphertext,expires_at) VALUES (?,?,?,?)")
    .bind(state,hash,await seal(env,verifier),currentSeconds()+600).run();
  const url=new URL(GARMIN_AUTHORIZE);
  url.search=new URLSearchParams({
    client_id:env.GARMIN_CLIENT_ID,response_type:"code",code_challenge:await pkceChallenge(verifier),
    code_challenge_method:"S256",redirect_uri:CALLBACK,state
  }).toString();
  return json({authorizationURL:url.toString(),expiresIn:600});
});
export const callback = context => run(context, async ({request,env}) => {
  const args=new URL(request.url).searchParams;
  const state=args.get("state") || "";
  if(!/^[A-Za-z0-9_-]{43}$/.test(state)) throw new PublicError("Invalid authorization state",400);
  const flow=await env.GARMIN_DB.prepare("SELECT * FROM garmin_oauth_flows WHERE state=?").bind(state).first();
  if(!flow||flow.expires_at<currentSeconds()||flow.consumed_at) throw new PublicError("This Garmin sign-in session expired. Please start again.",400);
  const consumed=await env.GARMIN_DB.prepare("UPDATE garmin_oauth_flows SET consumed_at=? WHERE state=? AND consumed_at IS NULL AND expires_at>=?")
    .bind(currentSeconds(),state,currentSeconds()).run();
  if(consumed.meta.changes!==1) throw new PublicError("This sign-in session was already used.",400);
  if(args.has("error")) return html("Garmin authorization was declined. No data was imported.");
  const code=args.get("code");
  if(!code||code.length>2048) throw new PublicError("Authorization code missing",400);
  const token=await tokenRequest(env,{
    grant_type:"authorization_code",code,code_verifier:await unseal(env,flow.verifier_ciphertext),redirect_uri:CALLBACK
  });
  const identity=await garminAuthorized(GARMIN_USER_ID,token.access_token);
  if(typeof identity.userId!=="string" || identity.userId.length>128) throw new PublicError("Garmin did not return a valid user identifier",502);
  const permissions=await garminAuthorized(GARMIN_PERMISSIONS,token.access_token);
  const previous=await connected(env,flow.device_hash);
  if(previous && previous.garmin_user_id!==identity.userId) {
    throw new PublicError("Disconnect the previous Garmin account before linking a different one",409);
  }
  const now=currentSeconds();
  await env.GARMIN_DB.prepare(
    "INSERT INTO garmin_connections (device_hash,garmin_user_id,access_ciphertext,refresh_ciphertext,access_expires_at,refresh_expires_at,permissions_json,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?) "+
    "ON CONFLICT(device_hash) DO UPDATE SET garmin_user_id=excluded.garmin_user_id,access_ciphertext=excluded.access_ciphertext,refresh_ciphertext=excluded.refresh_ciphertext,access_expires_at=excluded.access_expires_at,refresh_expires_at=excluded.refresh_expires_at,permissions_json=excluded.permissions_json,updated_at=excluded.updated_at"
  ).bind(flow.device_hash,identity.userId,
    await seal(env,token.access_token),await seal(env,token.refresh_token),
    now+Number(token.expires_in||3600),token.refresh_token_expires_in?now+Number(token.refresh_token_expires_in):null,
    JSON.stringify(permissions).slice(0,5000),now,now).run();
  return html("Garmin connected successfully. Open EnduroStrength and refresh your connection status.");
},true);
export const status = context => run(context, async ({request,env}) => {
  const hash=await deviceHash(request);
  const conn=await connected(env,hash);
  return json({connected:!!conn,permissions:conn?JSON.parse(conn.permissions_json):[],lastUpdated:conn?.updated_at||null});
});
export const disconnect = context => run(context, async ({request,env}) => {
  const hash=await deviceHash(request);
  const conn=await connected(env,hash);
  if(!conn) return json({connected:false});
  const access=await validAccessToken(env,conn);
  await garminAuthorized(GARMIN_REVOKE,access,"DELETE");
  // Garmin registration is user/app scoped. Erase every installation's link and
  // associated imported records when consent is withdrawn from any device.
  await env.GARMIN_DB.batch([
    env.GARMIN_DB.prepare("DELETE FROM garmin_connections WHERE garmin_user_id=?").bind(conn.garmin_user_id),
    env.GARMIN_DB.prepare("DELETE FROM garmin_activities WHERE garmin_user_id=?").bind(conn.garmin_user_id),
    env.GARMIN_DB.prepare("DELETE FROM garmin_health WHERE garmin_user_id=?").bind(conn.garmin_user_id)
  ]);
  return json({connected:false,deletedData:true});
});
function dateFromSeconds(n) {
  if(!Number.isFinite(n)) return null;
  const d=new Date(n*1000);
  return Number.isFinite(d.getTime()) ? d.toISOString().slice(0,10) : null;
}
function integerInRange(value,min,max) { return Number.isInteger(value) && value>=min && value<=max ? value:null; }
function normalizedActivity(activity) {
  const eventId=String(activity.activityId ?? "").slice(0,100);
  const stamp=Number(activity.startTimeInSeconds ?? activity.startTimeInSecondsUTC);
  if(!/^[a-zA-Z0-9_-]{1,100}$/.test(eventId)||!Number.isFinite(stamp)||stamp<946684800||stamp>currentSeconds()+86400) return null;
  const duration=safePositiveNumber(Number(activity.durationInSeconds),172800);
  const distance=safePositiveNumber(Number(activity.distanceInMeters),1000000);
  const heart=integerInRange(Number(activity.averageHeartRateInBeatsPerMinute),25,250);
  const sport=String(activity.activityType ?? "unknown").replace(/[^a-zA-Z0-9 _-]/g,"").slice(0,40)||"unknown";
  return {eventId,stamp,duration,distance,heart,sport};
}
function normalizedHealth(event,kind) {
  const day=String(event.calendarDate??dateFromSeconds(Number(event.startTimeInSeconds))??"");
  if(!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const sleep=kind==="sleeps" ? safePositiveNumber(Number(event.sleepTimeInSeconds??event.durationInSeconds),86400) : null;
  const resting=integerInRange(Number(event.restingHeartRateInBeatsPerMinute),25,250);
  if(sleep===null&&resting===null) return null;
  return {kind,day,sleep,resting};
}
export const push = context => run(context, async ({request,env}) => {
  await authenticateWebhook(request,env);
  const size=Number(request.headers.get("content-length")||0);
  if(size>262144) throw new PublicError("Payload too large",413);
  const body=await request.text();
  if(body.length>262144) throw new PublicError("Payload too large",413);
  let payload; try {payload=JSON.parse(body);} catch {throw new PublicError("Malformed JSON",400);}
  if(!payload||Array.isArray(payload)||typeof payload!=="object") throw new PublicError("Invalid payload",400);
  // Push-only; do not follow callbackURLs or untrusted third-party URLs.
  let accepted=0;
  for(const [kind,events] of Object.entries(payload)) {
    if(!["activities","dailies","sleeps"].includes(kind)||!Array.isArray(events)) continue;
    if(events.length>100) throw new PublicError("Too many events",413);
    for(const event of events) {
      if(!event||typeof event!=="object") continue;
      const userId=String(event.userId??"");
      if(!/^[a-zA-Z0-9_-]{8,128}$/.test(userId)) continue;
      const registered=await env.GARMIN_DB.prepare("SELECT 1 FROM garmin_connections WHERE garmin_user_id=? LIMIT 1").bind(userId).first();
      if(!registered) continue;
      const now=currentSeconds();
      if(kind==="activities") {
        const a=normalizedActivity(event); if(!a) continue;
        await env.GARMIN_DB.prepare("INSERT INTO garmin_activities (garmin_user_id,external_id,started_at,duration_seconds,sport,distance_meters,mean_hr,received_at) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT (garmin_user_id,external_id) DO UPDATE SET started_at=excluded.started_at,duration_seconds=excluded.duration_seconds,sport=excluded.sport,distance_meters=excluded.distance_meters,mean_hr=excluded.mean_hr,received_at=excluded.received_at")
          .bind(userId,a.eventId,a.stamp,a.duration,a.sport,a.distance,a.heart,now).run(); accepted++;
      } else {
        const h=normalizedHealth(event,kind); if(!h) continue;
        await env.GARMIN_DB.prepare("INSERT INTO garmin_health (garmin_user_id,event_kind,observed_date,sleep_seconds,resting_hr,received_at) VALUES (?,?,?,?,?,?) ON CONFLICT (garmin_user_id,event_kind,observed_date) DO UPDATE SET sleep_seconds=excluded.sleep_seconds,resting_hr=excluded.resting_hr,received_at=excluded.received_at")
          .bind(userId,h.kind,h.day,h.sleep,h.resting,now).run(); accepted++;
      }
    }
  }
  return json({accepted});
});
export function trainingGuidance(activities,health) {
  const cutoff=currentSeconds()-48*3600;
  const recent=activities.filter(a=>a.started_at>=cutoff);
  const minutes=Math.round(recent.reduce((sum,a)=>sum+(Number(a.duration_seconds)||0),0)/60);
  const level=recent.length===0?"insufficient-data":minutes>=120?"high-volume":minutes>=60?"moderate-volume":"light-volume";
  const message=level==="high-volume"?"Consider a lighter strength session around recent endurance volume.":level==="moderate-volume"?"Check your schedule before adding demanding leg work.":level==="light-volume"?"Recent logged endurance volume is limited; confirm any missing sessions.":"No recent Garmin activities. Your manual training plan remains the source of truth.";
  return {minutesLast48Hours:minutes,activityCountLast48Hours:recent.length,volumeCategory:level,suggestion:message,isMedicalRecoveryScore:false};
}
export const contextData = context => run(context, async ({request,env}) => {
  const hash=await deviceHash(request);
  const conn=await connected(env,hash);
  if(!conn) return json({connected:false,activities:[],health:[],guidance:null});
  const from=currentSeconds()-7*86400;
  const [activities,health]=await Promise.all([
    env.GARMIN_DB.prepare("SELECT external_id,started_at,duration_seconds,sport,distance_meters,mean_hr FROM garmin_activities WHERE garmin_user_id=? AND started_at>=? ORDER BY started_at DESC LIMIT 60").bind(conn.garmin_user_id,from).all(),
    env.GARMIN_DB.prepare("SELECT event_kind,observed_date,sleep_seconds,resting_hr FROM garmin_health WHERE garmin_user_id=? ORDER BY observed_date DESC LIMIT 14").bind(conn.garmin_user_id).all()
  ]);
  const rows=activities.results||[];
  return json({connected:true,activities:rows,health:health.results||[],guidance:trainingGuidance(rows,health.results||[])});
});
export const workoutPreview = context => run(context, async ({request,env}) => {
  const hash=await deviceHash(request);
  if(!await connected(env,hash)) throw new PublicError("Connect Garmin first",401);
  const body=await request.text();
  if(body.length>10000) throw new PublicError("Workout too large",413);
  let payload;try {payload=JSON.parse(body);}catch{throw new PublicError("Invalid workout",400);}
  const title=typeof payload?.title==="string"?payload.title.trim().slice(0,80):"";
  const steps=Array.isArray(payload?.steps)?payload.steps:[];
  if(!title||steps.length<1||steps.length>30) throw new PublicError("Workout needs a title and 1-30 steps",400);
  const preview=steps.map(step=>{
    const name=typeof step?.name==="string"?step.name.trim().slice(0,100):"";
    const seconds=integerInRange(step?.durationSeconds,10,3600);
    const repetitions=integerInRange(step?.repetitions,1,200);
    if(!name||(!seconds&&!repetitions)) throw new PublicError("Every step needs an exercise and valid duration or repetitions",400);
    return {name,durationSeconds:seconds,repetitions};
  });
  // No Garmin Training API call until the licensed schema, approvals, and user consent are confirmed.
  return json({title,steps:preview,publishAvailable:false,message:"Preview only. Garmin workout publishing is not yet enabled."});
});
