# Patzer Pro — Bluehost Deployment Guide

## Overview

Patzer Pro uses a Node.js server with MySQL for backend persistence and sync. The frontend is static files served from `public/`. This guide covers setting up the MySQL database and Node.js server on Bluehost.

---

## Step 1: Create the MySQL Database

1. Log into your Bluehost cPanel
2. Go to **Databases > MySQL Databases**
3. Create a new database — name it `patzer_pro` (cPanel may prefix it with your username, e.g. `youruser_patzer_pro`)
4. Create a new database user with a strong password
5. Add the user to the database with **ALL PRIVILEGES**
6. Note down:
   - Database name: `youruser_patzer_pro`
   - Database user: `youruser_dbuser`
   - Database password: (the password you set)
   - Database host: `localhost` (Bluehost MySQL is on the same server)

---

## Step 2: Set Up Node.js on Bluehost

### Option A: cPanel Node.js App (if available)

1. In cPanel, go to **Software > Setup Node.js App**
2. Click **Create Application**
3. Settings:
   - Node.js version: 18+ (or highest available)
   - Application mode: Production
   - Application root: the directory where you uploaded the project
   - Application URL: your domain or subdomain
   - Application startup file: `server.mjs`
4. Set environment variables (click "Add Variable" for each):
   ```
   ADMIN_TOKEN    = your-secret-admin-token
   DB_HOST        = localhost
   DB_PORT        = 3306
   DB_USER        = youruser_dbuser
   DB_PASSWORD    = your-database-password
   DB_NAME        = youruser_patzer_pro
   ```
5. Click **Create** then **Run NPM Install**
6. Start the application

### Option B: SSH + PM2 (if cPanel Node.js isn't available)

1. SSH into your Bluehost account
2. Install Node.js via nvm if not available:
   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
   source ~/.bashrc
   nvm install 18
   ```
3. Navigate to your project directory
4. Install dependencies:
   ```bash
   npm install
   ```
5. Create a `.env` file (the server doesn't auto-load it yet, but you can source it):
   ```bash
   cat > .env << 'EOF'
   ADMIN_TOKEN=your-secret-admin-token
   DB_HOST=localhost
   DB_PORT=3306
   DB_USER=youruser_dbuser
   DB_PASSWORD=your-database-password
   DB_NAME=youruser_patzer_pro
   EOF
   ```
6. Start the server:
   ```bash
   # Load env vars and start
   export $(cat .env | xargs) && node server.mjs

   # Or use PM2 for auto-restart:
   npm install -g pm2
   export $(cat .env | xargs) && pm2 start server.mjs --name patzer-pro
   pm2 save
   ```

---

## Step 3: Verify the Setup

### Check the server is running
```
https://your-domain.com/
```
You should see the Patzer Pro app.

### Check database migrations ran
Look at the server logs for:
```
[db] Migration 1 applied
[db] Schema at version 1
```

### Check auth works
```bash
curl -X POST https://your-domain.com/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"token":"your-secret-admin-token"}'
```
Expected: `{"authenticated":true,"bearer":"your-secret-admin-token"}`

### Check sync works
```bash
# Check auth status
curl https://your-domain.com/api/auth/status \
  -H 'Authorization: Bearer your-secret-admin-token'

# Pull data (should be empty initially)
curl https://your-domain.com/api/sync/games \
  -H 'Authorization: Bearer your-secret-admin-token'
```

---

## Step 4: Use the Admin Panel

1. Open `https://your-domain.com/#/admin` in your browser
2. Enter your admin token in the login field
3. Click **Login**
4. You'll see:
   - Data counts (games, puzzles, attempts, etc.)
   - Last sync time
   - **Push to Server** — sends your browser's local data to MySQL
   - **Pull from Server** — downloads server data into your browser
5. Use Push after analyzing games locally to back them up
6. Use Pull on a new device to restore your data

---

## Environment Variables Reference

| Variable | Required | Default | Description |
|---|---|---|---|
| `ADMIN_TOKEN` | Yes | (none) | Secret token for admin authentication |
| `DB_HOST` | No | `localhost` | MySQL server hostname |
| `DB_PORT` | No | `3306` | MySQL server port |
| `DB_USER` | Yes | (none) | MySQL database username |
| `DB_PASSWORD` | Yes | (none) | MySQL database password |
| `DB_NAME` | No | `patzer_pro` | MySQL database name |

---

## Troubleshooting

### "DB_USER not set" warning
The server starts without database support if MySQL credentials aren't configured. Sync endpoints will fail but the frontend works fine.

### "Access denied" MySQL error
- Verify the database user has privileges on the database
- Check the password doesn't have special characters that need escaping
- Verify the database name matches exactly (cPanel often prefixes with username)

### Tables not created
- Check server logs for migration errors
- Verify the database user has CREATE TABLE privileges
- Connect to MySQL directly and run: `SHOW TABLES;`

### Sync push fails
- Check you're authenticated (token in Authorization header)
- Check server logs for MySQL errors
- Verify the database connection is working: `GET /api/auth/status`

---

## Security Notes

- The `ADMIN_TOKEN` is a shared secret — treat it like a password
- Don't commit `.env` files to git (already in `.gitignore`)
- The admin panel at `#/admin` is not linked from navigation — it's a secret URL
- All sync endpoints require the Bearer token
- For production, consider adding HTTPS (Bluehost provides free SSL via Let's Encrypt)
