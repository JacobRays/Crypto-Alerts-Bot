export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ---------- Admin Panel ----------
    if (url.pathname.startsWith("/admin")) {
      const auth = url.searchParams.get("password");
      if (auth !== "Premium01") return new Response("❌ Unauthorized", { status: 401 });
      await preloadDummyData(env);
      const users = await env.USERS_KV.get("users", { type: "json" }) || {};
      const alerts = await env.ALERTS_KV.get("alerts", { type: "json" }) || {};
      const signals = await env.SIGNALS_KV.get("signals", { type: "json" }) || [];
      const memes = await env.MEMECOINS_KV.get("memes", { type: "json" }) || [];
      const alpha = await env.SIGNALS_KV.get("alpha", { type: "json" }) || [];
      const events = await env.EVENTS_KV.get("events", { type: "json" }) || [];
      const wallets = await env.WALLET_KV.get("wallets", { type: "json" }) || {};
      const icons = await env.WALLET_KV.get("icons", { type: "json" }) || {};
      return new Response(ADMIN_HTML(users, alerts, signals, memes, alpha, events, wallets, icons), {
        headers: { "content-type": "text/html" }
      });
    }

    // ---------- VIP Upgrade (Simulated) ----------
    if (url.pathname.startsWith("/upgrade-vip")) {
      const userId = url.searchParams.get("userId");
      if (!userId) return new Response("Missing userId", { status: 400 });
      let users = await env.USERS_KV.get("users", { type: "json" }) || {};
      if (!users[userId]) users[userId] = { vip: false, joined: Date.now() };
      users[userId].vip = true;
      await env.USERS_KV.put("users", JSON.stringify(users));
      return new Response(`✅ ${userId} upgraded to VIP (simulated)`, { status: 200 });
    }

    // ---------- User Dashboard ----------
    if (url.pathname === "/") return renderDashboard(request, env, url);

    return new Response("Not Found", { status: 404 });
  },

  // ---------- Scheduled Cron for Price Checks ----------
  async scheduled(event, env, ctx) {
    const alerts = await env.ALERTS_KV.get("alerts", { type: "json" }) || {};
    for (let key of Object.keys(alerts)) {
      const alert = alerts[key];
      try {
        const price = await fetch(`${env.COINGECKO_API}/simple/price?ids=${alert.coin}&vs_currencies=usd`)
          .then(r => r.json());
        const current = price[alert.coin].usd;
        if ((alert.above && current >= alert.targetPrice) || (!alert.above && current <= alert.targetPrice)) {
          await sendTelegram(env, alert.userId, `🚨 Alert: ${alert.coin.toUpperCase()} is ${current} USD (target ${alert.targetPrice})`);
        }
      } catch (e) { console.error("Price check error", e); }
    }
  }
};

// ----------------- Telegram Helpers -----------------
async function sendTelegram(env, chatId, text) {
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}

// ----------------- Dummy KV Data Preload -----------------
async function preloadDummyData(env) {
  // USERS_KV
  let users = await env.USERS_KV.get("users", { type: "json" }) || {};
  if (!Object.keys(users).length) {
    users["demoUser"] = { vip: false, joined: Date.now() };
    await env.USERS_KV.put("users", JSON.stringify(users));
  }
  // ALERTS_KV
  let alerts = await env.ALERTS_KV.get("alerts", { type: "json" }) || {};
  if (!Object.keys(alerts).length) {
    alerts["demoAlert"] = { coin: "bitcoin", targetPrice: 50000, above: true, userId: "demoUser" };
    await env.ALERTS_KV.put("alerts", JSON.stringify(alerts));
  }
  // SIGNALS_KV
  let signals = await env.SIGNALS_KV.get("signals", { type: "json" }) || [];
  if (!signals.length) {
    await env.SIGNALS_KV.put("signals", JSON.stringify([{ title: "$BTC Breakout", description: "High signal from TG channel" }]));
  }
  // MEMECOINS_KV
  let memes = await env.MEMECOINS_KV.get("memes", { type: "json" }) || [];
  if (!memes.length) await env.MEMECOINS_KV.put("memes", JSON.stringify([{ title: "$DOGE Pump", hype: 95 }]));
  // ALPHA
  let alpha = await env.SIGNALS_KV.get("alpha", { type: "json" }) || [];
  if (!alpha.length) await env.SIGNALS_KV.put("alpha", JSON.stringify([{ title: "TraderXYZ: $ETH Moves Up", description: "Short-term alpha" }]));
  // EVENTS_KV
  let events = await env.EVENTS_KV.get("events", { type: "json" }) || [];
  if (!events.length) await env.EVENTS_KV.put("events", JSON.stringify([{ title: "Airdrop $XYZ", date: "2025-09-15" }]));
  // WALLET_KV
  let wallets = await env.WALLET_KV.get("wallets", { type: "json" }) || {};
  if (!Object.keys(wallets).length) {
    wallets["BTC"] = "your_btc_wallet_here";
    wallets["USDT"] = "your_trc20_usdt_here";
    await env.WALLET_KV.put("wallets", JSON.stringify(wallets));
  }
  // ICONS KV
  let icons = await env.WALLET_KV.get("icons", { type: "json" }) || {};
  if (!Object.keys(icons).length) {
    icons["alerts"] = "📈";
    icons["memes"] = "🐶";
    icons["alpha"] = "🧠";
    icons["events"] = "📅";
    await env.WALLET_KV.put("icons", JSON.stringify(icons));
  }
}

// ----------------- Render Dashboard -----------------
async function renderDashboard(request, env, url) {
  const userId = url.searchParams.get("userId") || "demoUser";
  let users = await env.USERS_KV.get("users", { type: "json" }) || {};
  const user = users[userId] || { vip: false };
  let alertsObj = await env.ALERTS_KV.get("alerts", { type: "json" }) || {};
  const alerts = Object.values(alertsObj).filter(a => a.userId === userId);

  // Get Signals / Memes / Alpha / Events
  const signals = await env.SIGNALS_KV.get("signals", { type: "json" }) || [];
  const memes = await env.MEMECOINS_KV.get("memes", { type: "json" }) || [];
  const alpha = await env.SIGNALS_KV.get("alpha", { type: "json" }) || [];
  const events = await env.EVENTS_KV.get("events", { type: "json" }) || [];

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <title>Crypto Alerts Bot</title>
    <style>
      body { font-family:sans-serif; background:#0d1117; color:#fff; margin:0; padding:20px;}
      h1 { color:#58a6ff; text-align:center;}
      .section { margin-bottom:25px; border-radius:10px; padding:15px; background:#161b22; }
      .section h2 { cursor:pointer; display:flex; justify-content:space-between; align-items:center; }
      .card { padding:10px; margin:5px 0; background:#21262d; border-radius:8px; display:flex; justify-content:space-between; align-items:center; }
      .btn { padding:6px 12px; border:none; border-radius:6px; cursor:pointer; transition:0.3s; }
      .btn:hover { box-shadow:0 0 12px #238636; }
      .vip-btn { background:#ffb100; color:#0d1117; margin-left:5px; }
      .vip-btn:hover { box-shadow:0 0 15px #ffb100; }
      .empty { color:#8b949e; }
      .icon { margin-right:8px; }
      .collapsible-content { display:none; padding-top:10px; }
    </style>
  </head>
  <body>
    <h1>🚀 Crypto Alerts Bot</h1>

    <div class="section">
      <h2 onclick="toggleSection('alerts')">📈 My Alerts (${user.vip ? 'VIP':'Free'})</h2>
      <div id="alerts" class="collapsible-content">
        ${alerts.length ? alerts.map(a=>`<div class="card">${a.coin.toUpperCase()} $${a.targetPrice}</div>`).join("") : '<p class="empty">No alerts yet</p>'}
        <div style="margin-top:10px;">
          ${!user.vip ? `<a href="/upgrade-vip?userId=${userId}" class="btn vip-btn">💎 Upgrade to VIP</a>` : ''}
        </div>
      </div>
    </div>

    <div class="section">
      <h2 onclick="toggleSection('signals')">📊 Signals</h2>
      <div id="signals" class="collapsible-content">
        ${signals.map(s=>`<div class="card">${s.title} - ${s.description}</div>`).join("")}
      </div>
    </div>

    <div class="section">
      <h2 onclick="toggleSection('memes')">🐶 MemeCoin Hype</h2>
      <div id="memes" class="collapsible-content">
        ${memes.map(m=>`<div class="card">${m.title} - Hype: ${m.hype}</div>`).join("")}
      </div>
    </div>

    <div class="section">
      <h2 onclick="toggleSection('alpha')">🧠 Alpha Feed</h2>
      <div id="alpha" class="collapsible-content">
        ${alpha.map(a=>`<div class="card">${a.title} - ${a.description}</div>`).join("")}
      </div>
    </div>

    <div class="section">
      <h2 onclick="toggleSection('events')">📅 Upcoming Events & Airdrops</h2>
      <div id="events" class="collapsible-content">
        ${events.map(e=>`<div class="card">${e.title} - ${e.date}</div>`).join("")}
      </div>
    </div>

    <script>
      function toggleSection(id){
        const el = document.getElementById(id);
        el.style.display = el.style.display==='block'?'none':'block';
      }
    </script>
  </body>
  </html>
  `;
  return new Response(html, { headers: { "content-type":"text/html" } });
}

// ----------------- Admin HTML (Partial, ready to expand) -----------------
function ADMIN_HTML(users, alerts, signals, memes, alpha, events, wallets, icons){
  let usersHtml = Object.keys(users).map(u=>`<div class="card">${u} - VIP: ${users[u].vip ? '✅' : '❌'}</div>`).join("");
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8"/>
    <title>Admin Panel - Crypto Alerts</title>
    <style>
      body{background:#0d1117;color:#fff;font-family:sans-serif;padding:20px;}
      h1{color:#58a6ff;text-align:center;}
      .card{background:#161b22;padding:10px;margin:5px 0;border-radius:8px;}
    </style>
  </head>
  <body>
    <h1>🔧 Admin Panel</h1>
    <h2>Users</h2>
    ${usersHtml}
    <p>Wallets and Icons editable via KV in Cloudflare dashboard</p>
    <p>Signals, MemeRadar, Alpha Feed, Events editable via KV namespaces</p>
  </body>
  </html>
  `;
}
