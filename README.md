# F1 Prediction Market (Kalshi/Polymarket-style)

This repo now contains a full replacement app: a prediction market platform focused on your F1 league.

## Features
- Kalshi/Polymarket-inspired dark UI for event contracts
- Secure account auth with hashed passwords (`bcrypt`) + JWT auth
- Role-based access (`user` and `admin`)
- Betting on market outcomes using option prices (in cents)
- Admin tools to:
  - create markets
  - resolve market outcomes and settle payouts
  - adjust user balances up/down

## Quick start
```bash
npm install
cp .env.example .env
npm start
```

Open: `http://localhost:3000`

Default seeded admin:
- username: `admin`
- password: `Admin123!`

You should change admin credentials and JWT secret in `.env` before production.

## Basic payout model
If a user bets `$amount` on an option priced at `price` cents, win payout is:

`payout = amount * (100 / price)`

Example: bet $20 at 25¢ -> payout $80 (includes stake return under this simplified model).

## Notes for production hardening
- Use HTTPS and set secure cookies
- Add CSRF protection and request rate limiting
- Add audit logs for admin actions
- Add 2FA and stronger password policies
- Replace SQLite with managed Postgres for scale
