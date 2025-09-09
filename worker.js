export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const userId = url.searchParams.get("userId") || "demoUser";

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
      return new Response(JSON.stringify({
        type: "admin",
        users,
        alerts,
        signals,
        memes,
        alpha,
        events,
        wallets,
        icons
      }), { headers: { "content-type": "application/json" } });
    }

    // ---------- VIP Upgrade (Simulated) ----------
    if (url.pathname.startsWith("/upgrade-vip")) {
      const userId = url.searchParams.get("userId");
      if (!userId) return new Response(JSON.stringify({ error: "Missing userId" }), { status: 400 });
      let users = await env.USERS_KV.get("users", { type: "json" }) || {};
      if (!users[userId]) users[userId] = { vip: false, joined: Date.now() };
      users[userId].vip = true;
      await env.USERS_KV.put("users", JSON.stringify(users));
      return new Response(JSON.stringify({ success: true, message: `${userId} upgraded to VIP (simulated)` }), { headers: { "content-type": "application/json" } });
    }

    // ---------- Telegram Mini App Dashboard ----------
    if (url.pathname === "/") {
      await preloadDummyData(env);
      const users = await env.USERS_KV.get("users", { type: "json" }) || {};
      const user = users[userId] || { vip: false };
      const alertsObj = await env.ALERTS_KV.get("alerts", { type: "json" }) || {};
      const alerts = Object.values(alertsObj).filter(a => a.userId === userId);
      const signals = await env.SIGNALS_KV.get("signals", { type: "json" }) || [];
      const memes = await env.MEMECOINS_KV.get("memes", { type: "json" }) || [];
      const alpha = await env.SIGNALS_KV.get("alpha", { type: "json" }) || [];
      const events = await env.EVENTS_KV.get("events", { type: "json" }) || [];

      const dashboard = {
        type: "dashboard",
        user: { id: userId, vip: user.vip },
        sections: [
          {
            title: "📈 My Alerts",
            vipRequired: false,
            cards: alerts.length ? alerts.map(a => ({ title: a.coin.toUpperCase(), subtitle: `$${a.targetPrice}` })) : [{ title: "No alerts yet" }],
            vipButton: !user.vip ? { text: "💎 Upgrade to VIP", url: `/upgrade-vip?userId=${userId}` } : null
          },
          { title: "📊 Signals", cards: signals.map(s => ({ title: s.title, subtitle: s.description })) },
          { title: "🐶 MemeCoin Hype", cards: memes.map(m => ({ title: m.title, subtitle: `Hype: ${m.hype}` })) },
          { title: "🧠 Alpha Feed", cards: alpha.map(a => ({ title: a.title, subtitle: a.description })) },
          { title: "📅 Upcoming Events & Airdrops", cards: events.map(e => ({ title: e.title, subtitle: e.date })) }
        ]
      };

      return new Response(JSON.stringify(dashboard), { headers: { "content-type": "application/json" } });
    }

    return new Response(JSON.stringify({ error: "Not found" }), { status: 404, headers: { "content-type": "application/json" } });
  },

  // ---------- Scheduled Cron for Price Checks ----------
  async scheduled(event, env, ctx) {
    const alertsObj = await env.ALERTS_KV.get("alerts", { type: "json" }) || {};
    for (const key of Object.keys(alertsObj)) {
      const alert = alertsObj[key];
      try {
        const priceData = await fetch(`${env.COINGECKO_API}/simple/price?ids=${alert.coin}&vs_currencies=usd`).then(r => r.json());
        const current = priceData[alert.coin].usd;
        if ((alert.above && current >= alert.targetPrice) || (!alert.above && current <= alert.targetPrice)) {
          await sendTelegram(env, alert.userId, `🚨 ${alert.coin.toUpperCase()} reached $${current} (target ${alert.targetPrice})`);
        }
      } catch(e) { console.error("Price check failed", e); }
    }
  }
};

// ----------------- Telegram Helper -----------------
async function sendTelegram(env, chatId, text) {
  await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text })
  });
}

// ----------------- Preload Dummy Data -----------------
async function preloadDummyData(env) {
  let users = await env.USERS_KV.get("users", { type: "json" }) || {};
  if (!Object.keys(users).length) {
    users["demoUser"] = { vip: false, joined: Date.now() };
    await env.USERS_KV.put("users", JSON.stringify(users));
  }

  let alerts = await env.ALERTS_KV.get("alerts", { type: "json" }) || {};
  if (!Object.keys(alerts).length) {
    alerts["demoAlert"] = { coin: "bitcoin", targetPrice: 50000, above: true, userId: "demoUser" };
    await env.ALERTS_KV.put("alerts", JSON.stringify(alerts));
  }

  let signals = await env.SIGNALS_KV.get("signals", { type: "json" }) || [];
  if (!signals.length) await env.SIGNALS_KV.put("signals", JSON.stringify([{ title: "$BTC Breakout", description: "High signal from TG channel" }]));

  let memes = await env.MEMECOINS_KV.get("memes", { type: "json" }) || [];
  if (!memes.length) await env.MEMECOINS_KV.put("memes", JSON.stringify([{ title: "$DOGE Pump", hype: 95 }]));

  let alpha = await env.SIGNALS_KV.get("alpha", { type: "json" }) || [];
  if (!alpha.length) await env.SIGNALS_KV.put("alpha", JSON.stringify([{ title: "TraderXYZ: $ETH Moves Up", description: "Short-term alpha" }]));

  let events = await env.EVENTS_KV.get("events", { type: "json" }) || [];
  if (!events.length) await env.EVENTS_KV.put("events", JSON.stringify([{ title: "Airdrop $XYZ", date: "2025-09-15" }]));

  let wallets = await env.WALLET_KV.get("wallets", { type: "json" }) || {};
  if (!Object.keys(wallets).length) {
    wallets["BTC"] = "your_btc_wallet_here";
    wallets["USDT"] = "your_trc20_usdt_here";
    await env.WALLET_KV.put("wallets", JSON.stringify(wallets));
  }

  let icons = await env.WALLET_KV.get("icons", { type: "json" }) || {};
  if (!Object.keys(icons).length) {
    icons["alerts"] = "📈";
    icons["memes"] = "🐶";
    icons["alpha"] = "🧠";
    icons["events"] = "📅";
    await env.WALLET_KV.put("icons", JSON.stringify(icons));
  }
}
