// Safe, read-only Cloudflare Pages preview check. Never exposes tokens or user data.
// It stays disabled for Garmin OAuth even when the D1 schema is ready.
export async function onRequestGet({env}) {
  let database = "unavailable";
  if (env.GARMIN_DB) {
    try {
      const check = await env.GARMIN_DB.prepare(
        "SELECT COUNT(*) AS n FROM sqlite_master WHERE type = 'table' AND name IN (?, ?, ?, ?)"
      ).bind("garmin_oauth_flows", "garmin_connections", "garmin_activities", "garmin_health").first();
      database = Number(check?.n) === 4 ? "ready" : "incomplete";
    } catch {
      database = "unavailable";
    }
  }
  const configured = env.GARMIN_INTEGRATION_ENABLED === "true" &&
    database === "ready" && !!env.GARMIN_CLIENT_ID &&
    !!env.GARMIN_CLIENT_SECRET && !!env.GARMIN_ENCRYPTION_KEY_B64;
  return new Response(JSON.stringify({
    service: "endurostrength-garmin",
    status: configured ? "ready" : "disabled",
    database
  }), {
    status: configured ? 200 : 503,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });
}
