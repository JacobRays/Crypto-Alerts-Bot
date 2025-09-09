function ADMIN_HTML(users, alerts, signals, memes, alpha, events) {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>Crypto Alerts Admin</title>
    <meta name="viewport" content="width=device-width,initial-scale=1.0">
    <style>
      body { font-family: 'Segoe UI', Arial, sans-serif; margin:0; background:#0f172a; color:#e2e8f0; }
      header { background:#1e293b; padding:15px 20px; display:flex; justify-content:space-between; align-items:center; }
      header h1 { margin:0; font-size:20px; color:#38bdf8; }
      .btn { background:#2563eb; color:white; padding:8px 14px; border:none; border-radius:8px; cursor:pointer; font-size:14px; transition:0.2s; }
      .btn:hover { background:#1d4ed8; }
      .container { padding:20px; }
      h2 { margin:20px 0 10px; font-size:18px; color:#fbbf24; }
      .section { margin-bottom:25px; }
      details { background:#1e293b; border-radius:10px; padding:12px; margin-top:10px; }
      summary { cursor:pointer; font-weight:bold; color:#38bdf8; }
      .card { background:#334155; padding:12px; margin:8px 0; border-radius:10px; }
      .badge { padding:2px 6px; border-radius:6px; font-size:12px; margin-left:6px; }
      .vip { background:#facc15; color:#000; }
      .free { background:#ef4444; color:#fff; }
      ul { padding-left:18px; margin:5px 0; }
      li { margin:4px 0; }
    </style>
  </head>
  <body>
    <header>
      <h1>⚡ Crypto Alerts Admin</h1>
      <button class="btn" onclick="location.reload()">⟳ Refresh</button>
    </header>
    <div class="container">

      <div class="section">
        <h2>👤 Users</h2>
        <details open>
          <summary>Registered Users (${Object.keys(users).length})</summary>
          ${Object.keys(users).map(u => `
            <div class="card">
              <strong>${u}</strong>
              <span class="badge ${users[u].vip ? 'vip' : 'free'}">
                ${users[u].vip ? 'VIP' : 'Free'}
              </span>
            </div>
          `).join("") || "<p>No users found</p>"}
        </details>
      </div>

      <div class="section">
        <h2>🔔 Alerts</h2>
        <details>
          <summary>Current Alerts (${Object.keys(alerts).length})</summary>
          ${Object.keys(alerts).map(a => `
            <div class="card">
              ${alerts[a].coin} → ${alerts[a].targetPrice} USD
            </div>
          `).join("") || "<p>No alerts set</p>"}
        </details>
      </div>

      <div class="section">
        <h2>📊 Signals</h2>
        <details>
          <summary>High-Signal Alerts</summary>
          <ul>${signals.map(s => `<li>${s}</li>`).join("")}</ul>
        </details>
      </div>

      <div class="section">
        <h2>🚀 MemeRadar</h2>
        <details>
          <summary>MemeCoins</summary>
          <ul>${memes.map(m => `<li>${m}</li>`).join("")}</ul>
        </details>
      </div>

      <div class="section">
        <h2>🧠 Alpha Feed</h2>
        <details>
          <summary>Latest Insights</summary>
          <ul>${alpha.map(a => `<li>${a}</li>`).join("")}</ul>
        </details>
      </div>

      <div class="section">
        <h2>📅 Events</h2>
        <details>
          <summary>Upcoming</summary>
          <ul>${events.map(e => `<li>${e}</li>`).join("")}</ul>
        </details>
      </div>

    </div>
  </body>
  </html>
  `;
}
