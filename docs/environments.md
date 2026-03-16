# Environment Configuration

Healix can connect to different Supabase backends for development vs production. Both Healix (web dashboard) and HealthBite (mobile app) share the same Supabase database.

## Environments

| Environment | Supabase Project | URL |
|-------------|-----------------|-----|
| **Production** | `mfjfcfuwjbhqgqmtmhwe` | `https://mfjfcfuwjbhqgqmtmhwe.supabase.co` |
| **Development** | `nuihvxluxdpdjgkvtdih` | `https://nuihvxluxdpdjgkvtdih.supabase.co` |
| **Local** | Docker (via `supabase start`) | `http://127.0.0.1:54321` |

## Switching Environments

Add `?env=` to any page URL. The choice is saved in `localStorage` and persists across page loads.

```
# Switch to dev
https://usehealix.com/dashboard.html?env=dev

# Switch to local (requires local Supabase running)
http://localhost:8080/dashboard.html?env=local

# Switch back to production
https://usehealix.com/dashboard.html?env=prod
```

Once set, you don't need the query param on subsequent pages — it's remembered until you change it.

### Check current environment

Open the browser console. In dev/local mode you'll see:

```
[Healix] Environment: dev → https://nuihvxluxdpdjgkvtdih.supabase.co
```

Production mode is silent (no console output).

### Reset to production

Either:
- Navigate to any page with `?env=prod`
- Or run in browser console: `localStorage.removeItem('healix_env')` and refresh

## How It Works

`config.js` is loaded before any other script on every page. It:

1. Checks for `?env=` query parameter
2. Falls back to `localStorage.getItem('healix_env')`
3. Defaults to `prod` if neither is set
4. Sets `window.SUPABASE_URL` and `window.SUPABASE_ANON_KEY` globally

All other scripts reference these globals — no hardcoded credentials anywhere else.

## Local Development

To run against a local Supabase instance:

1. Start local Supabase in the **healthbite** project (shared database):
   ```bash
   cd ~/Projects/healthbite
   supabase start
   ```

2. Serve Healix locally:
   ```bash
   cd ~/Projects/healix
   python3 -m http.server 8080
   ```

3. Open `http://localhost:8080/login.html?env=local`

4. Use the seeded test user:
   - Email: `test@healthbite.dev`
   - Password: `password123`

## Important Notes

- **Shared database**: Healix and HealthBite use the same Supabase project. Switching Healix to dev also means it sees dev data (separate from production).
- **Sessions are per-environment**: Logging into prod doesn't log you into dev. If you switch environments, you'll need to log in again.
- **CSP headers**: All HTML files have Content-Security-Policy headers updated to allow connections to all three Supabase endpoints.
