export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ---------- ROUTES ----------
    if (url.pathname === "/") {
      return this.renderDashboard(request, env, url);
    }

    if (url.pathname.startsWith("/add-alert")) {
      const userId = url.searchParams.get("userId");
      const symbol = url.searchParams.get("symbol");
      const target = url.searchParams.get("target");
      if (!userId || !symbol || !target) {
        return new Response("Missing parameters", { status: 400 });
      }
      await env.ALERTS_KV.put(`${userId}:${symbol}:${target}`, JSON.stringify({
        symbol,
        target,
        createdAt: Date.now()
      }));
      return Response.redirect("/", 302);
    }

    if (url.pathname.startsWith("/delete-alert")) {
      const key = url.searchParams.get("key");
      if (key) {
        await env.ALERTS_KV.delete(key);
      }
      return Response.redirect("/", 302);
    }

    return new Response("Not found", { status: 404 });
  },

  // ---------- DASHBOARD ----------
  async renderDashboard(request, env, url) {
    const userId = url.searchParams.get("userId") || "guest";
    const list = await env.ALERTS_KV.list({ prefix: `${userId}:` });
    const alerts = [];

    for (const key of list.keys) {
      const data = await env.ALERTS_KV.get(key.name, "json");
      if (data) {
        alerts.push({ key: key.name, ...data });
      }
    }

    const alertsHtml = alerts.length > 0
      ? alerts.map(a => `
        <div class="alert-card">
          <span>📈 ${a.symbol} → $${a.target}</span>
          <a href="/delete-alert?key=${encodeURIComponent(a.key)}" class="delete-btn">Delete</a>
        </div>
      `).join("")
      : `<p class="empty">No alerts yet. Create one below 👇</p>`;

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
        <title>Crypto Alerts Bot</title>
        <style>
          body { font-family: Arial, sans-serif; background:#0d1117; color:#fff; margin:0; padding:20px; }
          h1 { color:#58a6ff; }
          .alert-card { background:#161b22; padding:12px; border-radius:8px; margin-bottom:10px;
                        display:flex; justify-content:space-between; align-items:center; }
          .delete-btn { background:#d73a49; color:#fff; padding:4px 8px; border-radius:6px;
                        text-decoration:none; font-size:12px; }
          .form { margin-top:20px; background:#21262d; padding:12px; border-radius:8px; }
          input { padding:6px; margin:4px; border:none; border-radius:6px; }
          button { background:#238636; color:#fff; padding:6px 12px; border:none; border-radius:6px; }
          .empty { color:#8b949e; }
        </style>
      </head>
      <body>
        <h1>🚀 Crypto Alerts Bot</h1>
        <h2>Your Alerts</h2>
        ${alertsHtml}
        <div class="form">
          <form action="/add-alert" method="GET">
            <input type="hidden" name="userId" value="${userId}" />
            <input type="text" name="symbol" placeholder="e.g. BTC" required />
            <input type="number" step="0.01" name="target" placeholder="Target price" required />
            <button type="submit">+ Add Alert</button>
          </form>
        </div>
      </body>
      </html>
    `;
    return new Response(html, { headers: { "content-type": "text/html" } });
  }
};
