const TELEGRAM_TOKEN = "8209980143:AAEqYImLz5sniYx5cNCk0-yKX8wmiS9s9-g";
const TELEGRAM_CHAT_PREFIX = "@demo_user_"; 
const MAX_FREE_ALERTS = 2;

// Admin secret for manual VIP upgrade
const ADMIN_PASSWORD = "Premium01";

// ----------------------------
// Helper: Send Telegram notification
// ----------------------------
async function sendTelegramNotification(env, userId, message) {
  const chat_id = TELEGRAM_CHAT_PREFIX + userId;
  await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id, text: message })
  });
}

// ----------------------------
// Alerts CRUD & VIP check
// ----------------------------
async function handleAlerts(request, env) {
  const userId = request.headers.get("x-user-id") || "demo-user";
  const user = await env.USERS_KV.get(userId, { type: "json" }) || { vip: false };

  let alerts = (await env.ALERTS_KV.get(userId, { type: "json" })) || [];
  
  if (request.method === "POST") {
    const data = await request.json();
    
    if (!user.vip && alerts.length >= MAX_FREE_ALERTS) {
      return new Response(JSON.stringify({ error:"Upgrade to VIP for more alerts!" }), { status:403 });
    }
    
    alerts.push({ id: crypto.randomUUID(), sent:false, ...data });
    await env.ALERTS_KV.put(userId, JSON.stringify(alerts));
    return new Response(JSON.stringify({ success:true }), { status:200 });
  }

  if (request.method === "GET") {
    return new Response(JSON.stringify(alerts), { headers: { "Content-Type": "application/json" } });
  }

  return new Response("Method not allowed", { status:405 });
}

// ----------------------------
// Signals / MemeRadar / Alpha Feed / Events
// ----------------------------
async function handleDataRequests(request, env) {
  const url = new URL(request.url);

  if (url.pathname.startsWith("/signals")) {
    const signals = (await env.SIGNALS_KV.get("signals", { type: "json" })) || [];
    return new Response(JSON.stringify({ signals }), { headers: { "Content-Type": "application/json" } });
  }

  if (url.pathname.startsWith("/memeradar")) {
    const memecoins = (await env.MEMECOINS_KV.get("topCoins", { type: "json" })) || [];
    return new Response(JSON.stringify({ topCoins: memecoins }), { headers: { "Content-Type": "application/json" } });
  }

  if (url.pathname.startsWith("/alphafeed")) {
    const alphaFeed = (await env.ALPHA_KV.get("alphaFeed", { type: "json" })) || [];
    return new Response(JSON.stringify({ alphaFeed }), { headers: { "Content-Type": "application/json" } });
  }

  if (url.pathname.startsWith("/events")) {
    const events = (await env.EVENTS_KV.get("events", { type: "json" })) || [];
    return new Response(JSON.stringify({ events }), { headers: { "Content-Type": "application/json" } });
  }

  return new Response("Not Found", { status:404 });
}

// ----------------------------
// VIP Upgrade Endpoint (Manual/Admin)
// ----------------------------
async function handleVIPUpgrade(request, env) {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  const secret = url.searchParams.get("password");

  if (!userId || secret !== ADMIN_PASSWORD) {
    return new Response(JSON.stringify({ error:"Unauthorized" }), { status:401 });
  }

  // Upgrade user to VIP
  await env.USERS_KV.put(userId, JSON.stringify({ vip:true, upgradedAt:new Date().toISOString() }));
  return new Response(JSON.stringify({ success:true, message:`User ${userId} upgraded to VIP` }), { status:200 });
}

// ----------------------------
// Worker Fetch Event
// ----------------------------
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/alert")) return handleAlerts(request, env);
    if (url.pathname.startsWith("/signals") || url.pathname.startsWith("/memeradar") || url.pathname.startsWith("/alphafeed") || url.pathname.startsWith("/events")) {
      return handleDataRequests(request, env);
    }
    if (url.pathname.startsWith("/upgrade-vip")) return handleVIPUpgrade(request, env);

    if (url.pathname === "/") {
      return new Response("Crypto Alerts Bot Worker Running!", { status:200 });
    }

    return new Response("Not Found", { status:404 });
  }
};

// ----------------------------
// Scheduled Price-Check Loop (5 min cron)
// ----------------------------
export async function scheduled(event, env, ctx) {
  console.log("Crypto Alerts Bot: Running price-check loop...");

  const users = [];
  for await (const key of env.USERS_KV.list()) {
    const user = await env.USERS_KV.get(key.name, { type:"json" });
    if(user) users.push({ id:key.name, ...user });
  }

  for (const user of users) {
    let alerts = (await env.ALERTS_KV.get(user.id, { type:"json" })) || [];
    for (const alert of alerts) {
      if (alert.sent) continue;

      try {
        const coinId = alert.coin.toLowerCase();
        const resp = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${coinId}&vs_currencies=usd`);
        const data = await resp.json();
        const price = data[coinId]?.usd;
        if (!price) continue;

        let trigger = false;
        if (alert.type.toLowerCase() === "above" && price >= parseFloat(alert.target)) trigger = true;
        if (alert.type.toLowerCase() === "below" && price <= parseFloat(alert.target)) trigger = true;

        if (trigger) {
          await sendTelegramNotification(env, user.id, `🚨 Price Alert: ${alert.coin.toUpperCase()} is ${alert.type} $${alert.target}. Current: $${price}`);
          alert.sent = true;
        }
      } catch (err) {
        console.error("Price-check error:", err);
      }
    }
    await env.ALERTS_KV.put(user.id, JSON.stringify(alerts));
  }
}
