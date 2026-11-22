import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
import {
  PublicError, randomSecret, sha256, pkceChallenge, seal, unseal,
  requireReady, deviceHash, authenticateWebhook, safePositiveNumber
} from "../../functions/_lib/garmin-core.js";
import {trainingGuidance} from "../../functions/_lib/garmin-handlers.js";

if (!globalThis.crypto) Object.defineProperty(globalThis, "crypto", {value:webcrypto});
const env = {
  GARMIN_ENCRYPTION_KEY_B64: Buffer.alloc(32,4).toString("base64"),
  GARMIN_CLIENT_ID: "fake-id",
  GARMIN_CLIENT_SECRET: "fake-secret",
  GARMIN_DB: {},
  GARMIN_INTEGRATION_ENABLED: "true",
  GARMIN_WEBHOOK_TOKEN: "1".repeat(64)
};
const requestWith = key => new Request("https://gamacoraggio.com/test", {headers:{Authorization:"Bearer "+key}});

test("disabled integration fails closed", () => {
  assert.throws(() => requireReady({...env,GARMIN_INTEGRATION_ENABLED:"false"}), e => e instanceof PublicError && e.status===503);
});
test("PKCE challenge is S256 and unique per verifier", async () => {
  const a=randomSecret(64),b=randomSecret(64);
  assert.notEqual(a,b);
  assert.match(await pkceChallenge(a),/^[a-zA-Z0-9_-]{43}$/);
  assert.notEqual(await pkceChallenge(a),await pkceChallenge(b));
});
test("AES-GCM protects data and rejects tampered ciphertext", async () => {
  const first=await seal(env,"fake access token");
  const second=await seal(env,"fake access token");
  assert.notEqual(first,second);
  assert.equal(await unseal(env,first),"fake access token");
  await assert.rejects(unseal(env,first.slice(0,-4)+"AAAA"));
});
test("device keys are never returned as database identity", async () => {
  const token=randomSecret();
  const id=await deviceHash(requestWith(token));
  assert.match(id,/^[a-f0-9]{64}$/);
  assert.notEqual(id,token);
  await assert.rejects(deviceHash(new Request("https://gamacoraggio.com/test")), e=>e.status===401);
});
test("push endpoint rejects wrong webhook token", async () => {
  const right=new Request("https://gamacoraggio.com/test?key="+env.GARMIN_WEBHOOK_TOKEN);
  const wrong=new Request("https://gamacoraggio.com/test?key="+"2".repeat(64));
  await authenticateWebhook(right,env);
  await assert.rejects(authenticateWebhook(wrong,env),e=>e.status===401);
});
test("normalizer does not accept arbitrary numeric values",()=>{
  assert.equal(safePositiveNumber(-2),null);
  assert.equal(safePositiveNumber(Number.POSITIVE_INFINITY),null);
  assert.equal(safePositiveNumber(200),200);
});
test("training volume does not claim physiological recovery",()=>{
  const now=Math.floor(Date.now()/1000);
  const guidance=trainingGuidance([
    {started_at:now-600,duration_seconds:4000},
    {started_at:now-7200,duration_seconds:4200}
  ],[]);
  assert.equal(guidance.volumeCategory,"high-volume");
  assert.equal(guidance.isMedicalRecoveryScore,false);
  assert.equal(guidance.activityCountLast48Hours,2);
});
