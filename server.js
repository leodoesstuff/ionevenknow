const express = require('express');
const path = require('path');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Database = require('better-sqlite3');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123!';

const db = new Database(path.join(__dirname, 'data.db'));
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user','admin')),
  balance REAL NOT NULL DEFAULT 1000,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS markets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  description TEXT,
  options_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('open','resolved')) DEFAULT 'open',
  winning_option TEXT,
  closes_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  market_id INTEGER NOT NULL,
  option_name TEXT NOT NULL,
  amount REAL NOT NULL,
  price REAL NOT NULL,
  settled INTEGER NOT NULL DEFAULT 0,
  payout REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY(market_id) REFERENCES markets(id) ON DELETE CASCADE
);
`);

function seedAdmin() {
  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(ADMIN_USERNAME);
  if (!existing) {
    const password_hash = bcrypt.hashSync(ADMIN_PASSWORD, 12);
    db.prepare(
      'INSERT INTO users(username, password_hash, role, balance) VALUES(?,?,?,?)'
    ).run(ADMIN_USERNAME, password_hash, 'admin', 100000);
    console.log(`Seeded admin user: ${ADMIN_USERNAME}`);
  }
}
seedAdmin();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

function createToken(user) {
  return jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, {
    expiresIn: '7d'
  });
}

function auth(req, res, next) {
  const headerToken = req.headers.authorization?.startsWith('Bearer ')
    ? req.headers.authorization.split(' ')[1]
    : null;
  const token = headerToken || req.cookies.token;
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

function adminOnly(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  next();
}

app.post('/api/auth/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !password || password.length < 8) {
    return res.status(400).json({ error: 'Username and password (min 8 chars) required' });
  }
  const password_hash = bcrypt.hashSync(password, 12);

  try {
    const info = db
      .prepare('INSERT INTO users(username, password_hash, role, balance) VALUES(?,?,?,?)')
      .run(username.trim(), password_hash, 'user', 1000);
    const user = db.prepare('SELECT id, username, role, balance FROM users WHERE id = ?').get(info.lastInsertRowid);
    const token = createToken(user);
    res.cookie('token', token, { httpOnly: true, sameSite: 'lax', secure: false });
    return res.json({ user, token });
  } catch {
    return res.status(400).json({ error: 'Username already exists' });
  }
});

app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body;
  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username?.trim());
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = createToken(user);
  res.cookie('token', token, { httpOnly: true, sameSite: 'lax', secure: false });
  return res.json({
    user: { id: user.id, username: user.username, role: user.role, balance: user.balance },
    token
  });
});

app.post('/api/auth/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ ok: true });
});

app.get('/api/auth/me', auth, (req, res) => {
  const user = db.prepare('SELECT id, username, role, balance FROM users WHERE id = ?').get(req.user.id);
  res.json({ user });
});

app.get('/api/markets', (req, res) => {
  const rows = db
    .prepare('SELECT id, title, description, options_json, status, winning_option, closes_at, created_at FROM markets ORDER BY id DESC')
    .all();
  const markets = rows.map((m) => ({ ...m, options: JSON.parse(m.options_json) }));
  res.json({ markets });
});

app.post('/api/markets', auth, adminOnly, (req, res) => {
  const { title, description, options, closes_at } = req.body;
  if (!title || !Array.isArray(options) || options.length < 2) {
    return res.status(400).json({ error: 'Provide title and at least two options' });
  }

  const normalized = options.map((o) => ({
    name: String(o.name || '').trim(),
    price: Number(o.price)
  }));

  if (normalized.some((o) => !o.name || Number.isNaN(o.price) || o.price <= 0 || o.price >= 100)) {
    return res.status(400).json({ error: 'Each option needs a name and price between 1 and 99' });
  }

  const info = db
    .prepare('INSERT INTO markets(title, description, options_json, closes_at) VALUES(?,?,?,?)')
    .run(title.trim(), description || '', JSON.stringify(normalized), closes_at || null);

  const market = db
    .prepare('SELECT id, title, description, options_json, status, winning_option, closes_at FROM markets WHERE id = ?')
    .get(info.lastInsertRowid);

  res.json({ market: { ...market, options: JSON.parse(market.options_json) } });
});

app.post('/api/bets', auth, (req, res) => {
  const { market_id, option_name, amount } = req.body;
  const stake = Number(amount);
  if (!market_id || !option_name || Number.isNaN(stake) || stake <= 0) {
    return res.status(400).json({ error: 'Invalid bet input' });
  }

  const market = db.prepare('SELECT * FROM markets WHERE id = ?').get(market_id);
  if (!market || market.status !== 'open') return res.status(400).json({ error: 'Market closed' });

  const options = JSON.parse(market.options_json);
  const selected = options.find((o) => o.name === option_name);
  if (!selected) return res.status(400).json({ error: 'Option not found' });

  const user = db.prepare('SELECT id, balance FROM users WHERE id = ?').get(req.user.id);
  if (user.balance < stake) return res.status(400).json({ error: 'Insufficient balance' });

  const tx = db.transaction(() => {
    db.prepare('UPDATE users SET balance = balance - ? WHERE id = ?').run(stake, req.user.id);
    db.prepare(
      'INSERT INTO bets(user_id, market_id, option_name, amount, price, settled, payout) VALUES(?,?,?,?,?,0,0)'
    ).run(req.user.id, market_id, option_name, stake, selected.price);
  });
  tx();

  const updatedUser = db.prepare('SELECT id, username, role, balance FROM users WHERE id = ?').get(req.user.id);
  res.json({ ok: true, user: updatedUser });
});

app.post('/api/admin/resolve', auth, adminOnly, (req, res) => {
  const { market_id, winning_option } = req.body;
  const market = db.prepare('SELECT * FROM markets WHERE id = ?').get(market_id);
  if (!market || market.status !== 'open') {
    return res.status(400).json({ error: 'Market not open' });
  }

  const options = JSON.parse(market.options_json);
  if (!options.some((o) => o.name === winning_option)) {
    return res.status(400).json({ error: 'Winning option invalid' });
  }

  const openBets = db
    .prepare('SELECT id, user_id, option_name, amount, price FROM bets WHERE market_id = ? AND settled = 0')
    .all(market_id);

  const tx = db.transaction(() => {
    db.prepare('UPDATE markets SET status = ?, winning_option = ? WHERE id = ?').run('resolved', winning_option, market_id);

    for (const bet of openBets) {
      let payout = 0;
      if (bet.option_name === winning_option) {
        payout = Number(((bet.amount * 100) / bet.price).toFixed(2));
        db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(payout, bet.user_id);
      }
      db.prepare('UPDATE bets SET settled = 1, payout = ? WHERE id = ?').run(payout, bet.id);
    }
  });
  tx();

  res.json({ ok: true, settled_bets: openBets.length });
});

app.post('/api/admin/adjust-balance', auth, adminOnly, (req, res) => {
  const { username, amount_delta } = req.body;
  const delta = Number(amount_delta);
  if (!username || Number.isNaN(delta)) {
    return res.status(400).json({ error: 'username and numeric amount_delta required' });
  }

  const user = db.prepare('SELECT id, balance FROM users WHERE username = ?').get(username.trim());
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.balance + delta < 0) return res.status(400).json({ error: 'Resulting balance cannot be negative' });

  db.prepare('UPDATE users SET balance = balance + ? WHERE id = ?').run(delta, user.id);
  const updated = db.prepare('SELECT id, username, role, balance FROM users WHERE id = ?').get(user.id);
  res.json({ user: updated });
});

app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
