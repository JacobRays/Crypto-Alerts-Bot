export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ========= ROUTES =========
    if (path === "/") {
      return new Response(await INDEX_HTML(env), {
        headers: { "Content-Type": "text/html" },
      });
    }

    // -------- Admin Panel --------
    if (path.startsWith("/admin")) {
      const auth = url.searchParams.get("password");
      if (auth !== "Premium01") {
        return new Response("❌ Unauthorized", { status: 401 });
      }

      async function safeList(binding) {
        try {
          return await binding.list();
        } catch (e) {
          return { error: e.message };
        }
      }

      const users = await safeList(env.USERS_KV);
      const alerts = await safeList(env.ALERTS_KV);
      const signals = await safeList(env.SIGNALS_KV);
      const memes = await safeList(env.MEMECOINS_KV);
      const events = await safeList(env.EVENTS_KV);
      const wallets = await safeList(env.WALLET_KV);

      return new Response(
        `
        <html>
          <head><title>Admin Panel</title></head>
          <body style="font-family: sans-serif; background:#111; color:#eee; padding:20px;">
            <h1>🔑 Admin Panel</h1>
            <h3>👤 Users</h3><pre>${JSON.stringify(users, null, 2)}</pre>
            <h3>📢 Alerts</h3><pre>${JSON.stringify(alerts, null, 2)}</pre>
            <h3>📡 Signals</h3><pre>${JSON.stringify(signals, null, 2)}</pre>
            <h3>🐸 MemeCoins</h3><pre>${JSON.stringify(memes, null, 2)}</pre>
            <h3>🎁 Events</h3><pre>${JSON.stringify(events, null, 2)}</pre>
            <h3>💳 Wallets</h3><pre>${JSON.stringify(wallets, null, 2)}</pre>
          </body>
        </html>
        `,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    // -------- Seed KV with dummy data --------
    if (path === "/seed") {
      await env.USERS_KV.put(
        "demo-user",
        JSON.stringify({ vip: false, upgradedAt: "Free" })
      );
      await env.ALERTS_KV.put(
        "demo-user",
        JSON.stringify([
          { id: "1", coin: "bitcoin", type: "Above", target: 40000, sent: false },
        ])
      );
      await env.SIGNALS_KV.put(
        "signals",
        JSON.stringify([{ channel: "BTC News", message: "$BTC pump incoming" }])
      );
      await env.MEMECOINS_KV.put(
        "topCoins",
        JSON.stringify([{ symbol: "DOGE", price_change_percentage_24h: 12.5 }])
      );
      await env.EVENTS_KV.put(
        "events",
        JSON.stringify([{ event: "BTC Snapshot", date: "2025-09-10" }])
      );
      await env.WALLET_KV.put(
        "wallets",
        JSON.stringify({
          paypal: "https://paypal.me/premiumrays01",
          btc: "your-btc-wallet",
          usdt_trc20: "your-trc20-wallet",
        })
      );

      return new Response("✅ Dummy data seeded.");
    }

    // -------- VIP Upgrade --------
    if (path.startsWith("/upgrade-vip")) {
      const userId = url.searchParams.get("userId");
      if (!userId) return new Response("❌ Missing userId", { status: 400 });

      await env.USERS_KV.put(
        userId,
        JSON.stringify({ vip: true, upgradedAt: new Date().toISOString() })
      );

      return new Response(`✅ User ${userId} upgraded to VIP`);
    }

    return new Response("❌ Not found", { status: 404 });
  },

  // ========= CRON JOB =========
  async scheduled(event, env, ctx) {
    const alerts = await env.ALERTS_KV.list();
    for (const key of alerts.keys) {
      const userAlerts =
        (await env.ALERTS_KV.get(key.name, { type: "json" })) || [];
      for (const alert of userAlerts) {
        if (alert.sent) continue;

        const priceResp = await fetch(
          `${env.COINGECKO_API}/simple/price?ids=${alert.coin}&vs_currencies=usd`
        );
        const priceData = await priceResp.json();
        const price = priceData[alert.coin]?.usd;

        if (
          (alert.type === "Above" && price >= alert.target) ||
          (alert.type === "Below" && price <= alert.target)
        ) {
          // send Telegram notification
          await fetch(
            `https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`,
            {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                chat_id: key.name,
                text: `🚨 Alert triggered for ${alert.coin}: $${price}`,
              }),
            }
          );
          alert.sent = true;
        }
      }
      await env.ALERTS_KV.put(key.name, JSON.stringify(userAlerts));
    }
  },
};

// ========= FRONTEND =========
async function INDEX_HTML(env) {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Crypto Alerts Bot</title>
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <style>
    body { font-family: sans-serif; background:#0d1117; color:#eee; margin:0; padding:20px; }
    h1 { color:#4ade80; }
    .section { margin-bottom:20px; background:#161b22; padding:15px; border-radius:10px; }
    .badge { display:inline-block; padding:4px 8px; border-radius:6px; font-size:12px; margin-right:5px; }
    .vip { background:#facc15; color:#000; }
    .free { background:#f87171; color:#fff; }
    button { background:#4ade80; border:none; padding:10px 15px; border-radius:8px; cursor:pointer; margin-top:10px; }
    button:hover { background:#22c55e; }
    details { margin-top:10px; }
  </style>
</head>
<body>
  <h1>🚀 Crypto Alerts Bot</h1>
  <div class="section">
    <span class="badge free">Free</span> 
    <button onclick="upgrade()">Upgrade to VIP</button>
  </div>

  <div class="section">
    <h3>📢 My Alerts</h3>
    <details open><summary>View Alerts</summary><div id="alerts">Checking...</div></details>
    <button onclick="openAlertModal()">+ Create Alert</button>
  </div>

  <div class="section">
    <h3>📡 High-Signal Alerts</h3>
    <details><summary>Expand</summary><div id="signals">Loading...</div></details>
  </div>

  <div class="section">
    <h3>🐸 MemeCoin Hype</h3>
    <details><summary>Expand</summary><div id="memes">Loading...</div></details>
  </div>

  <div class="section">
    <h3>📈 Alpha Feed</h3>
    <details><summary>Expand</summary><div id="alpha">Loading...</div></details>
  </div>

  <div class="section">
    <h3>🎁 Upcoming Events & Airdrops</h3>
    <details><summary>Expand</summary><div id="events">Loading...</div></details>
  </div>

  <!-- Modal -->
  <div id="modal" style="display:none; position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.8);">
    <div style="background:#161b22; padding:20px; margin:100px auto; width:90%; max-width:400px; border-radius:10px;">
      <h3>Create Alert</h3>
      <input id="coin" placeholder="Coin ID (e.g. bitcoin)" style="width:100%; margin-bottom:10px;">
      <select id="type"><option>Above</option><option>Below</option></select>
      <input id="target" type="number" placeholder="Target Price" style="width:100%; margin-top:10px;">
      <button onclick="saveAlert()">Save</button>
      <button onclick="closeModal()">Cancel</button>
      <hr>
      <p>⚡ Free users limited. <b>Upgrade to VIP</b> for unlimited alerts:</p>
      <a href="https://paypal.me/premiumrays01" target="_blank"><button>💳 PayPal</button></a>
      <a href="bitcoin:your-btc-wallet" target="_blank"><button>₿ Bitcoin</button></a>
      <a href="usdt:your-trc20-wallet" target="_blank"><button>💰 USDT (TRC20)</button></a>
    </div>
  </div>

<script>
function openAlertModal(){ document.getElementById('modal').style.display='block'; }
function closeModal(){ document.getElementById('modal').style.display='none'; }
function upgrade(){ alert("Redirecting to upgrade options..."); }

function saveAlert(){
  alert("Alert saved (demo). In real flow, call backend /alerts API.");
  closeModal();
}
</script>
</body>
</html>`;
}
