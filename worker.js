// Crypto Signal Filter & Alpha Hub – Worker
// ================================================

// KV Bindings: USERS_KV, ALERTS_KV, SIGNALS_KV, MEMECOINS_KV, EVENTS_KV, WALLET_KV
// Env: TELEGRAM_BOT_TOKEN, COINGECKO_API, RUGDOC_API, TG_CHANNEL_IDS

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    if (pathname.startsWith("/admin")) return await handleAdmin(request, env);
    if (pathname.startsWith("/dashboard")) return await handleDashboard(request, env);
    if (pathname.startsWith("/alert")) return await handleAlerts(request, env);
    if (pathname.startsWith("/signals")) return await handleSignals(request, env);
    if (pathname.startsWith("/memeradar")) return await handleMemeRadar(request, env);
    if (pathname.startsWith("/alphafeed")) return await handleAlphaFeed(request, env);
    if (pathname.startsWith("/events")) return await handleEvents(request, env);

    return new Response("Crypto Signal Filter & Alpha Hub – Worker Running", { status: 200, headers: { "Content-Type": "text/plain" } });
  },
};

// ----------------------------
// Admin Panel
// ----------------------------
async function handleAdmin(request, env) {
  const list = [];
  const iter = env.USERS_KV.list();
  for await (const key of iter.keys) {
    const user = await env.USERS_KV.get(key.name, { type: "json" });
    list.push({ id: key.name, ...user });
  }
  return new Response(JSON.stringify(list, null, 2), { headers: { "Content-Type": "application/json" } });
}

// ----------------------------
// User Dashboard
// ----------------------------
async function handleDashboard(request, env) {
  const userId = request.headers.get("x-user-id");
  if (!userId) return new Response("Unauthorized", { status: 401 });

  const user = await env.USERS_KV.get(userId, { type: "json" });
  const alerts = await env.ALERTS_KV.get(userId, { type: "json" }) || [];

  const html = `
    <h2>Dashboard – ${userId}</h2>
    <p>VIP: ${user.vip ? "✅" : "❌"}</p>
    <h3>My Alerts</h3>
    <ul>
      ${alerts.map(a => `<li>${a.coin} ${a.type} ${a.target}</li>`).join("")}
    </ul>
    <button onclick="alert('Add alert modal here')">+ Create Alert</button>
  `;
  return new Response(html, { headers: { "Content-Type": "text/html" } });
}

// ----------------------------
// Alerts CRUD
// ----------------------------
async function handleAlerts(request, env) {
  const userId = request.headers.get("x-user-id");
  if (!userId) return new Response("Unauthorized", { status: 401 });

  if (request.method === "POST") {
    const data = await request.json();
    const alerts = (await env.ALERTS_KV.get(userId, { type: "json" })) || [];
    alerts.push({ id: crypto.randomUUID(), ...data });
    await env.ALERTS_KV.put(userId, JSON.stringify(alerts));
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }

  if (request.method === "GET") {
    const alerts = (await env.ALERTS_KV.get(userId, { type: "json" })) || [];
    return new Response(JSON.stringify(alerts), { headers: { "Content-Type": "application/json" } });
  }

  return new Response("Method not allowed", { status: 405 });
}

// ----------------------------
// High-Signal Alerts
// ----------------------------
async function handleSignals(request, env) {
  const signals = [];
  const channelIds = env.TG_CHANNEL_IDS?.split(",") || [];
  for (const channel of channelIds) {
    signals.push({ channel, message: `Sample high-signal from ${channel}`, timestamp: new Date().toISOString() });
  }
  for (const signal of signals) await env.SIGNALS_KV.put(crypto.randomUUID(), JSON.stringify(signal));
  return new Response(JSON.stringify({ signals }), { headers: { "Content-Type": "application/json" } });
}

// ----------------------------
// MemeCoin Radar
// ----------------------------
async function handleMemeRadar(request, env) {
  const resp = await fetch(`https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=10&page=1`);
  const topCoins = await resp.json();
  for (const coin of topCoins) {
    const data = { coin: coin.symbol.toUpperCase(), hypeScore: coin.price_change_percentage_24h, timestamp: new Date().toISOString() };
    await env.MEMECOINS_KV.put(coin.id, JSON.stringify(data));
  }
  return new Response(JSON.stringify({ topCoins }), { headers: { "Content-Type": "application/json" } });
}

// ----------------------------
// Alpha Feed
// ----------------------------
async function handleAlphaFeed(request, env) {
  const sampleAlpha = [
    { trader: "TraderXYZ", insight: "$ASTRO heating up", watchlist: ["$MARS","$ASTRO"], risk: "Medium" },
    { trader: "TraderABC", insight: "$SOL partnership update", watchlist: ["$SOL","$RAY"], risk: "Low" }
  ];
  for (const alpha of sampleAlpha) await env.SIGNALS_KV.put(crypto.randomUUID(), JSON.stringify(alpha));
  return new Response(JSON.stringify({ alphaFeed: sampleAlpha }), { headers: { "Content-Type": "application/json" } });
}

// ----------------------------
// Event Calendar
// ----------------------------
async function handleEvents(request, env) {
  const sampleEvents = [
    { event: "$PYTH Token Unlock", date: "2025-09-12", notifySubscribers: [] },
    { event: "$DOGE Snapshot", date: "2025-09-15", notifySubscribers: [] },
    { event: "$MATIC AMA", date: "2025-09-18", notifySubscribers: [] },
    { event: "$ASTRO Airdrop Claim", date: "2025-09-20", notifySubscribers: [] }
  ];
  for (const evt of sampleEvents) await env.EVENTS_KV.put(crypto.randomUUID(), JSON.stringify(evt));
  return new Response(JSON.stringify({ events: sampleEvents }), { headers: { "Content-Type": "application/json" } });
}

// ----------------------------
// Security / Rugpull Alerts
// ----------------------------
async function checkSecurityAlerts(env) {
  if (!env.RUGDOC_API) return;
  const resp = await fetch(env.RUGDOC_API);
  const flaggedTokens = await resp.json();
  const iter = env.WALLET_KV.list();
  for await (const key of iter.keys) {
    const wallet = await env.WALLET_KV.get(key.name, { type: "json" }) || { tokensHeld: [] };
    const riskyTokens = wallet.tokensHeld.filter(t => flaggedTokens.includes(t));
    if (riskyTokens.length > 0) {
      await sendTelegramNotification(env, key.name, `⚠️ Security Alert: flagged tokens detected: ${riskyTokens.join(", ")}`);
    }
  }
}

// ----------------------------
// Telegram Notification
// ----------------------------
async function sendTelegramNotification(env, userId, message) {
  const user = await env.USERS_KV.get(userId, { type: "json" });
  if (!user || !user.telegramChatId) return;
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: user.telegramChatId, text: message })
  });
}

// ----------------------------
// Price Alerts
// ----------------------------
async function checkPriceAlerts(env) {
  const usersIter = env.ALERTS_KV.list();
  for await (const key of usersIter.keys) {
    const userId = key.name;
    const alerts = await env.ALERTS_KV.get(userId, { type: "json" }) || [];
    for (const alert of alerts) {
      const priceResp = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${alert.coin}&vs_currencies=usd`);
      const priceData = await priceResp.json();
      const currentPrice = priceData[alert.coin]?.usd;
      if (!currentPrice) continue;
      if ((alert.type === "Above" && currentPrice >= alert.target) || (alert.type === "Below" && currentPrice <= alert.target)) {
        await sendTelegramNotification(env, userId, `🔔 ${alert.coin} price alert! Current: $${currentPrice}, Target: $${alert.target}`);
      }
    }
  }
}
