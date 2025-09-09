export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    // ========= ADMIN DASH =========
    if (url.pathname.startsWith("/admin")) {
      const auth = url.searchParams.get("password");
      if (auth !== "Premium01") {
        return new Response("❌ Unauthorized", { status: 401 });
      }

      const signals = await env.SIGNALS_KV.list();
      const memes = await env.MEMECOINS_KV.list();
      const events = await env.EVENTS_KV.list();

      return new Response(
        `
        <h1>🔑 Admin Panel</h1>
        <p>Users KV: ${JSON.stringify(await env.USERS_KV.list())}</p>
        <p>Alerts KV: ${JSON.stringify(await env.ALERTS_KV.list())}</p>
        <p>Signals KV: ${JSON.stringify(signals.keys)}</p>
        <p>MemeCoins KV: ${JSON.stringify(memes.keys)}</p>
        <p>Events KV: ${JSON.stringify(events.keys)}</p>
        `,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    // ========= DASHBOARD =========
    if (url.pathname === "/" || url.pathname === "/index.html") {
      const signals = await env.SIGNALS_KV.list();
      const memes = await env.MEMECOINS_KV.list();
      const events = await env.EVENTS_KV.list();

      return new Response(
        `
        <html>
          <head>
            <title>Crypto Alerts Bot</title>
            <style>
              body { font-family: sans-serif; padding: 20px; background: #111; color: #eee; }
              .section { margin: 15px 0; padding: 10px; background: #222; border-radius: 10px; }
              .badge { background: #0f0; padding: 4px 8px; border-radius: 8px; font-size: 0.8em; }
            </style>
          </head>
          <body>
            <h1>🚀 Crypto Alerts Bot</h1>

            <div class="section">
              <h2>📡 High-Signal Alerts <span class="badge">${signals.keys.length}</span></h2>
              <pre>${JSON.stringify(signals.keys, null, 2)}</pre>
            </div>

            <div class="section">
              <h2>🐸 MemeCoin Hype <span class="badge">${memes.keys.length}</span></h2>
              <pre>${JSON.stringify(memes.keys, null, 2)}</pre>
            </div>

            <div class="section">
              <h2>📢 Alpha Feed</h2>
              <p>(coming soon)</p>
            </div>

            <div class="section">
              <h2>🎁 Events & Airdrops <span class="badge">${events.keys.length}</span></h2>
              <pre>${JSON.stringify(events.keys, null, 2)}</pre>
            </div>

            <div class="section">
              <button onclick="alert('VIP Flow Coming Soon!')">⭐ Upgrade to VIP</button>
            </div>
          </body>
        </html>
        `,
        { headers: { "Content-Type": "text/html" } }
      );
    }

    return new Response("Not found", { status: 404 });
  },
};
