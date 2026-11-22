// Non-sensitive endpoint used to check Pages Functions deployment before activating Garmin.
export function onRequestGet({env}) {
  const configured = env.GARMIN_INTEGRATION_ENABLED === "true" &&
    !!env.GARMIN_DB && !!env.GARMIN_CLIENT_ID &&
    !!env.GARMIN_CLIENT_SECRET && !!env.GARMIN_ENCRYPTION_KEY_B64;
  return new Response(JSON.stringify({service:"endurostrength-garmin",status:configured?"ready":"disabled"}), {
    status:configured?200:503,
    headers:{"Content-Type":"application/json","Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}
  });
}
