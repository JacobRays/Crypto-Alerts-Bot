// ----------------- KV helpers -----------------
async function getKV(env, kvName, key, fallback) {
  const kv = env[kvName];
  if (!kv) { console.error(`KV binding "${kvName}" undefined`); return fallback; }
  try { 
    const val = await kv.get(key, { type: "json" }); 
    return val || fallback; 
  } catch(e) { console.error(`KV get error ${key}:`, e); return fallback; }
}

async function putKV(env, kvName, key, value) {
  const kv = env[kvName];
  if (!kv) { console.error(`KV binding "${kvName}" undefined`); return; }
  try { await kv.put(key, JSON.stringify(value)); } 
  catch(e) { console.error(`KV put error ${key}:`, e); }
}

// ----------------- Safe fetch -----------------
async function safeFetch(url, options={}) {
  try {
    const res = await fetch(url, options);
    const text = await res.text();
    if (!res.ok) throw new Error(`Status ${res.status} - ${text}`);
    try { return JSON.parse(text); } 
    catch(e) { console.error("JSON parse error", e, "text:", text); return null; }
  } catch(e) { 
    console.error("Fetch error:", url,e); 
    return null; 
  }
}

// ----------------- Preload dummy data -----------------
async function preloadDummyData(env) {
  let users = await getKV(env, "USERS_KV", "users", {});
  if (!Object.keys(users).length) { users["demoUser"]={vip:false,joined:Date.now()}; await putKV(env,"USERS_KV","users",users);}
  
  let alerts = await getKV(env, "ALERTS_KV", "alerts", {});
  if (!Object.keys(alerts).length) { alerts["demoAlert"]={coin:"bitcoin",targetPrice:50000,above:true,userId:"demoUser"}; await putKV(env,"ALERTS_KV","alerts",alerts);}
  
  let signals = await getKV(env, "SIGNALS_KV", "signals", {});
  if (!Object.keys(signals).length) { signals["demoSignal"]={title:"$BTC pump incoming",type:"High-Signal"}; await putKV(env,"SIGNALS_KV","signals",signals);}
  
  let memes = await getKV(env, "MEMECOINS_KV", "memes", {});
  if (!Object.keys(memes).length) { memes["demoMeme"]={coin:"DOGE",volume:"high"}; await putKV(env,"MEMECOINS_KV","memes",memes);}
  
  let alpha = await getKV(env, "ALPHA_KV", "alpha", {});
  if (!Object.keys(alpha).length) { alpha["demoAlpha"]={text:"TraderXYZ: $ETH heating up"}; await putKV(env,"ALPHA_KV","alpha",alpha);}
  
  let events = await getKV(env, "EVENTS_KV", "events", {});
  if (!Object.keys(events).length) { events["demoEvent"]={title:"Airdrop $TOKEN",date:Date.now()+86400000}; await putKV(env,"EVENTS_KV","events",events);}
  
  let wallets = await getKV(env, "WALLET_KV", "wallets", {});
  if (!Object.keys(wallets).length) { wallets["paypal"]="https://paypal.me/premiumrays01"; wallets["btc"]="demoBTCaddress"; await putKV(env,"WALLET_KV","wallets",wallets);}
}

// ----------------- Telegram notification -----------------
async function sendTelegramMessage(botToken, chatId, text) {
  try {
    await fetch(`https://api.telegram.org/bot${botToken}/sendMessage`, {
      method:"POST", headers:{"Content-Type":"application/json"},
      body:JSON.stringify({chat_id:chatId,text,parse_mode:"HTML"})
    });
  } catch(e){console.error("Telegram send error:",e);}
}

// ----------------- Price check loop -----------------
async function checkAlerts(env) {
  const TELEGRAM_BOT_TOKEN = env.TELEGRAM_BOT_TOKEN || "";
  const TG_CHANNEL_IDS = (env.TG_CHANNEL_IDS || "").split(",");
  const COINGECKO_API = env.COINGECKO_API || "https://api.coingecko.com/api/v3";

  const alerts = await getKV(env,"ALERTS_KV","alerts",{});
  for(const id in alerts){
    const a = alerts[id];
    const data = await safeFetch(`${COINGECKO_API}/simple/price?ids=${a.coin}&vs_currencies=usd`);
    if(data && data[a.coin]){
      const price = data[a.coin].usd;
      if((a.above && price>=a.targetPrice) || (!a.above && price<=a.targetPrice)){
        const msg=`🚨 Alert: ${a.coin} price ${price} crossed ${a.targetPrice}`;
        if(TG_CHANNEL_IDS.length>0) await sendTelegramMessage(TELEGRAM_BOT_TOKEN, TG_CHANNEL_IDS[0], msg);
      }
    }
  }
}

// ----------------- Worker Export -----------------
export default {
  async fetch(request, env) {
    try {
      const TELEGRAM_BOT_TOKEN = env.TELEGRAM_BOT_TOKEN || "";
      const TG_CHANNEL_IDS = (env.TG_CHANNEL_IDS || "").split(",");
      const ADMIN_PASSWORD = env.ADMIN_PASSWORD || "Premium01";
      const MAX_FREE_ALERTS = parseInt(env.MAX_FREE_ALERTS || "2");
      const COINGECKO_API = env.COINGECKO_API || "https://api.coingecko.com/api/v3";

      await preloadDummyData(env);

      const url = new URL(request.url);

      // -------- Admin panel --------
      if(url.pathname.startsWith("/admin")){
        const pwd = url.searchParams.get("password");
        if(pwd!==ADMIN_PASSWORD) return new Response("❌ Unauthorized",{status:401});
        const users=await getKV(env,"USERS_KV","users",{});
        const wallets=await getKV(env,"WALLET_KV","wallets",{});
        return new Response(`
          <html><head><title>Admin - Crypto Alerts Bot</title>
          <style>
            body{font-family:sans-serif;padding:20px;background:#0d1117;color:#c9d1d9;}
            h1{color:#58a6ff;}
            .card{background:#161b22;padding:15px;margin:10px;border-radius:8px;}
            button{background:#238636;color:#fff;border:none;padding:8px 12px;margin:5px;border-radius:5px;cursor:pointer;}
            button:hover{box-shadow:0 0 8px #58a6ff;}
          </style></head>
          <body>
            <h1>Admin Panel</h1>
            <h2>Users</h2>
            ${Object.entries(users).map(([id,u])=>`<div class="card">${id} - VIP: ${u.vip}</div>`).join("")}
            <h2>Wallets</h2>
            ${Object.entries(wallets).map(([k,v])=>`<div class="card">${k}: <input value="${v}" data-key="${k}"></div>`).join("")}
          </body></html>`,{headers:{"Content-Type":"text/html"}});
      }

      // -------- VIP upgrade simulation --------
      if(url.pathname.startsWith("/upgrade-vip")){
        const userId = url.searchParams.get("userId");
        if(!userId) return new Response("Missing userId",{status:400});
        let users = await getKV(env,"USERS_KV","users",{});
        if(!users[userId]) users[userId]={vip:true,joined:Date.now()};
        else users[userId].vip=true;
        await putKV(env,"USERS_KV","users",users);
        return new Response(JSON.stringify({success:true,vip:true}),{headers:{"Content-Type":"application/json"}});
      }

      // -------- Telegram Mini App dashboard JSON --------
      const users=await getKV(env,"USERS_KV","users",{});
      const alerts=await getKV(env,"ALERTS_KV","alerts",{});
      const signals=await getKV(env,"SIGNALS_KV","signals",{});
      const memes=await getKV(env,"MEMECOINS_KV","memes",{});
      const alpha=await getKV(env,"ALPHA_KV","alpha",{});
      const events=await getKV(env,"EVENTS_KV","events",{});
      const wallets=await getKV(env,"WALLET_KV","wallets",{});

      const user=users["demoUser"];
      const vip=user.vip;
      return new Response(JSON.stringify({
        user:{id:"demoUser",vip},
        alerts:Object.values(alerts),
        signals:Object.values(signals),
        memes:Object.values(memes),
        alpha:Object.values(alpha),
        events:Object.values(events),
        upgradeButtons:{paypal:wallets.paypal,btc:wallets.btc}
      }),{headers:{"Content-Type":"application/json"}});

    } catch(e){
      console.error("Worker fetch error:",e);
      return new Response(JSON.stringify({error:"Internal server error"}),{status:500,headers:{"Content-Type":"application/json"}});
    }
  },

  async scheduled(event, env) {
    try{ await checkAlerts(env); } catch(e){ console.error("Scheduled error:",e);}
  }
}
