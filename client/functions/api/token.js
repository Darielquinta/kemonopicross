// Cloudflare Pages Function  →  POST /api/token
export async function onRequestPost({ request, env }) {
  const { code } = await request.json();

  const body = new URLSearchParams({
    client_id:     env.DISCORD_CLIENT_ID,
    client_secret: env.DISCORD_CLIENT_SECRET,
    grant_type:    "authorization_code",
    code,
    redirect_uri:  "https://kemonopicross.xyz/"   // the exact URI set in Discord dev portal
  });

  const r = await fetch("https://discord.com/api/v10/oauth2/token", {
    method:  "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body
  });

  return new Response(await r.text(), { status: r.status });
}