// Crypto Alerts Bot – Free-Tier Worker Setup
// Handles: VIP dashboard, alerts, signals, memecoins, alpha feed, events, security alerts

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

    return new Response("Crypto Alerts Bot – Worker Running", { status: 200, headers: { "Content-Type": "text/plain" } });
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
// Demo VIP user for testing
// ----------------------------
async function createDemoUser(env) {
  const demo = await env.USERS_KV.get("demo-user", { type: "json" });
  if (!demo) {
    await env.USERS_KV.put("demo-user", JSON.stringify({
      vip: true,
      telegramChatId: "YOUR_TELEGRAM_CHAT_ID"
    }));
  }
}

// ----------------------------
// User Dashboard
// ----------------------------
async function handleDashboard(request, env) {
  await createDemoUser(env);
  const userId = request.headers.get("x-user-id") || "demo-user";
  const user = await env.USERS_KV.get(userId, { type: "json" });
  const alerts = await env.ALERTS_KV.get(userId, { type: "json" }) || [];

  const html = `
    <h1>Crypto Alerts Bot – Dashboard</h1>
    <p>VIP Status: ${user.vip ? "✅" : "❌"}</p>
    <h3>My Alerts</h3>
    <ul>
      ${alerts.map(a => `<li>${a.coin} ${a.type} ${a.target}</li>`).join("")}
    </ul>
    <button onclick="openModal()">+ Create Alert</button>
  `;
  return new Response(html, { headers: { "Content-Type": "text/html" } });
}

// ----------------------------
// Alerts CRUD
// ----------------------------
async function handleAlerts(request, env) {
  const userId = request.headers.get("x-user-id") || "demo-user";

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
// High-Signal Alerts (Demo Data)
// ----------------------------
async function handleSignals(request, env) {
  const sampleSignals = [
    { channel: "DemoChannel1", message: "[Crypto Alerts Bot] $BTC breakout soon!", timestamp: new Date().toISOString() },
    { channel: "DemoChannel2", message: "[Crypto Alerts Bot] $ETH major partnership!", timestamp: new Date().toISOString() }
  ];
  for (const signal of sampleSignals) await env.SIGNALS_KV.put(crypto.randomUUID(), JSON.stringify(signal));
  return new Response(JSON.stringify({ signals: sampleSignals }), { headers: { "Content-Type": "application/json" } });
}

// ----------------------------
// MemeCoin Radar (Free via CoinGecko)
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
// Alpha Feed (Demo Data)
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
// Event Calendar with Airdrops (Demo Data)
// ----------------------------
async function handleEvents(request, env) {
  const sampleEvents = [
    { event: "$PYTH Token Unlock", date: "2025-09-12" },
    { event: "$DOGE Snapshot", date: "2025-09-15" },
    { event: "$ASTRO Airdrop Claim", date: "2025-09-20" }
  ];
  for (const evt of sampleEvents) await env.EVENTS_KV.put(crypto.randomUUID(), JSON.stringify(evt));
  return new Response(JSON.stringify({ events: sampleEvents }), { headers: { "Content-Type": "application/json" } });
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
