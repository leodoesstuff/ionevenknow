# World Weather Tracker

Simple client-side weather dashboard showing:

- Current conditions (including cloud cover)
- 3-day forecast
- Global quick view across major cities

## Run locally

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173`.

## Deploy settings (static hosting)

Use the following values in hosting dashboards that request them:

- **Build Command:** `echo "No build step required for this static site"`
- **Publish Directory:** `.`

A `netlify.toml` is included with these values for Netlify-compatible deployments.

## Render deployment (fixes "Not Found")

If you deploy on Render, create a **Static Site** (or use the included `render.yaml`) with:

- **Build Command:** `echo "No build step required for this static site"`
- **Publish Directory:** `.`

If you still see `Not Found`, it usually means the service was created as the wrong type or route handling is missing. The included `render.yaml` configures:

- `runtime: static`
- `staticPublishPath: .`
- a rewrite from `/*` to `/index.html`

These settings make sure Render serves the app entry page correctly.
