# Theater Admin Panel (Vite)

Seat-layout builder frontend. It has **no server of its own** — the API lives in the
root movie server (`server/src/modules/admin/`) and is mounted at `/api/v1/admin`.

## Development

The root API must be running first:

```bash
npm run dev:server          # from the repo root, API on :4000
npm run dev --prefix admin  # Vite on :5174, proxies /api -> :4000
```

Open http://localhost:5174

## Production

```bash
npm run build --prefix admin
```

That writes `admin/dist`. The root server automatically serves it at `/admin`
(it's mounted before the customer SPA catch-all), so one Render service hosts
the API, the storefront and this panel.

## Usage

1. Add a theatre.
2. Manage screens → add an auditorium.
3. Build seats → set rows/columns → click seats to cycle types
   (standard → premium → recliner → wheelchair → gap → disabled → empty).
4. Save layout — each save creates a new `seat_layout_versions` row and makes it
   the auditorium's active layout.

## Auth

Set `ADMIN_TOKEN` in the root server's environment. The panel sends it as
`x-admin-token`. If `ADMIN_TOKEN` is unset the admin API is open (dev only).
