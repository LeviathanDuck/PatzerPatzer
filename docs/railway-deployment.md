# Deploying PatzerPro to Railway

## Background

Bluehost (WordPress Plus plan) only serves static files — it cannot run a
persistent Node.js process. The PatzerPro backend (`server.mjs`) requires
Node.js to handle API routes, Lichess OAuth, and data sync.

**Solution:** Host PatzerPro on Railway. Keep `patzerpro.com` registered at
Bluehost but point its DNS to Railway. Existing Bluehost WordPress sites are
completely unaffected.

---

## What Goes Where

| Thing | Where it lives |
|---|---|
| patzerpro.com domain registration | Bluehost (unchanged) |
| Existing WordPress sites | Bluehost (unchanged) |
| PatzerPro app (Node.js + static files) | Railway |

---

## Step-by-Step Setup

### 1. Sign up for Railway
- Go to **railway.app**
- Click Login → sign up with your GitHub account
  (the same one that has the PatzerPatzer repo)

### 2. Create a new project
- Click **New Project**
- Select **Deploy from GitHub repo**
- Select the **PatzerPatzer** repository
- Railway will detect it as a Node.js app

### 3. Set the start command
- In the project, go to **Settings**
- Find **Start Command**
- Set it to: `node server.mjs`

### 4. Check environment variables
- Settings → **Variables**
- Add any environment variables the app needs
- (Ask Claude to confirm what variables are needed)

### 5. Add your custom domain
- Settings → **Domains** → Add Custom Domain
- Enter: `patzerpro.com`
- Railway will give you DNS records to copy (looks like a CNAME or A record)

### 6. Update DNS in Bluehost
- Log into Bluehost
- cPanel → **Zone Editor**
- Find the `patzerpro.com` zone
- Update the records with what Railway gave you
- DNS propagation takes 10–60 minutes

### 7. Verify
- Visit `https://patzerpro.com`
- The app should load and API routes should work
- Test the Lichess login flow

---

## Auto-Deploy

Once set up, every `git push` to the `main` branch automatically deploys
to Railway. No manual steps needed — same workflow as before.

---

## Cost

- **Free tier** — available, app may sleep after inactivity
- **Hobby plan** — ~$5/month, always on, recommended for regular use

---

## Notes

- The `.cpanel.yml` file is no longer needed for deployment once Railway is
  set up, but can be left in the repo without causing any issues
- SSL (HTTPS) is handled automatically by Railway — no setup needed
- If the app ever needs environment secrets, add them in Railway's Variables
  section, never in the code
