const state = { token: localStorage.getItem('token') || null, user: null, markets: [] };

const byId = (id) => document.getElementById(id);

async function api(path, method = 'GET', body) {
  const res = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(state.token ? { Authorization: `Bearer ${state.token}` } : {})
    },
    credentials: 'include',
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

function renderSession() {
  const el = byId('session');
  if (!state.user) {
    el.innerHTML = '<span>Not logged in</span>';
    byId('adminPanel').style.display = 'none';
    return;
  }
  el.innerHTML = `<b>${state.user.username}</b> (${state.user.role}) | Balance: $${state.user.balance.toFixed(2)} <button id="logoutBtn" class="danger">Logout</button>`;
  document.getElementById('logoutBtn').onclick = logout;
  byId('adminPanel').style.display = state.user.role === 'admin' ? 'block' : 'none';
}

function renderMarkets() {
  const container = byId('markets');
  if (!state.markets.length) {
    container.innerHTML = '<p>No markets yet.</p>';
    return;
  }

  container.innerHTML = state.markets.map((m) => {
    const optionsHtml = m.options.map((o) => `
      <div class="option">
        <div class="option-top">
          <strong>${o.name}</strong>
          <span>${o.price}¢</span>
        </div>
        ${m.status === 'open' ? `
          <input id="bet-${m.id}-${o.name}" placeholder="Bet amount in $" />
          <button class="bet" onclick="placeBet(${m.id}, '${o.name.replace(/'/g, "\\'")}')">Buy YES on ${o.name}</button>
        ` : `<small>${m.winning_option === o.name ? '✅ Winner' : '❌ Lost'}</small>`}
      </div>
    `).join('');

    return `
      <article class="market">
        <h3>${m.title}</h3>
        <div class="meta">#${m.id} • <span class="status-${m.status}">${m.status.toUpperCase()}</span></div>
        <p>${m.description || ''}</p>
        ${optionsHtml}
      </article>
    `;
  }).join('');
}

async function refreshMe() {
  if (!state.token) {
    state.user = null;
    renderSession();
    return;
  }
  try {
    const data = await api('/api/auth/me');
    state.user = data.user;
  } catch {
    state.user = null;
    state.token = null;
    localStorage.removeItem('token');
  }
  renderSession();
}

async function loadMarkets() {
  const data = await api('/api/markets');
  state.markets = data.markets;
  renderMarkets();
}

async function login() {
  try {
    const data = await api('/api/auth/login', 'POST', {
      username: byId('username').value,
      password: byId('password').value
    });
    state.token = data.token;
    localStorage.setItem('token', state.token);
    state.user = data.user;
    renderSession();
    await loadMarkets();
  } catch (e) { alert(e.message); }
}

async function register() {
  try {
    const data = await api('/api/auth/register', 'POST', {
      username: byId('username').value,
      password: byId('password').value
    });
    state.token = data.token;
    localStorage.setItem('token', state.token);
    state.user = data.user;
    renderSession();
    await loadMarkets();
  } catch (e) { alert(e.message); }
}

async function logout() {
  await api('/api/auth/logout', 'POST').catch(() => {});
  state.token = null;
  state.user = null;
  localStorage.removeItem('token');
  renderSession();
}

window.placeBet = async (marketId, optionName) => {
  try {
    if (!state.user) throw new Error('Login first');
    const amountRaw = document.getElementById(`bet-${marketId}-${optionName}`)?.value;
    await api('/api/bets', 'POST', {
      market_id: marketId,
      option_name: optionName,
      amount: Number(amountRaw)
    });
    await refreshMe();
    alert('Bet placed!');
  } catch (e) { alert(e.message); }
};

async function createMarket() {
  try {
    await api('/api/markets', 'POST', {
      title: byId('mTitle').value,
      description: byId('mDesc').value,
      options: JSON.parse(byId('mOptions').value)
    });
    await loadMarkets();
    alert('Market created');
  } catch (e) { alert(e.message); }
}

async function resolveMarket() {
  try {
    await api('/api/admin/resolve', 'POST', {
      market_id: Number(byId('resolveMarketId').value),
      winning_option: byId('winningOption').value
    });
    await loadMarkets();
    alert('Market resolved');
  } catch (e) { alert(e.message); }
}

async function adjustBalance() {
  try {
    await api('/api/admin/adjust-balance', 'POST', {
      username: byId('adjUser').value,
      amount_delta: Number(byId('adjDelta').value)
    });
    await refreshMe();
    alert('Balance adjusted');
  } catch (e) { alert(e.message); }
}

byId('loginBtn').onclick = login;
byId('registerBtn').onclick = register;
byId('createMarketBtn').onclick = createMarket;
byId('resolveBtn').onclick = resolveMarket;
byId('adjustBtn').onclick = adjustBalance;

(async function init() {
  await refreshMe();
  await loadMarkets();
})();
