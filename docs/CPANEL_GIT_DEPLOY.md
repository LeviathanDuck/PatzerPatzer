# cPanel Git Version Control — Deployment Setup Guide

## Overview

This documents how to set up automatic deployment from GitHub to Bluehost shared
hosting using cPanel's built-in Git Version Control. This approach is safer and
simpler than GitHub Actions + rsync for shared hosting.

---

## How It Works

1. cPanel clones your GitHub repo to a directory on the server
2. When you click "Deploy HEAD Commit", cPanel pulls the latest commits
3. cPanel reads `.cpanel.yml` from the repo root and executes the deployment tasks
4. Tasks copy files from the cloned repo into your live public_html folder

---

## Prerequisites

- Bluehost shared hosting with cPanel access
- A GitHub repository
- A `.cpanel.yml` file in the repo root (see below)
- Built/compiled files committed to the repo (see "Build Strategy" below)

---

## Build Strategy (Important)

Bluehost shared hosting does NOT have Node.js 24 or pnpm available.
This means you cannot run a build step on the server.

**Solution: pre-built deployment**
- Run `pnpm build` locally before committing
- Commit the built output folder (`public/`) into the repo
- `.cpanel.yml` copies those pre-built files to the live folder
- No build step runs on the server

This means your `.gitignore` must NOT exclude your build output folder.

---

## `.cpanel.yml` Format

Place this file in the **repo root**. cPanel reads it automatically on deployment.

```yaml
deployment:
  tasks:
    - >-
      /bin/bash -c 'set -e;
      DEPLOYPATH="/home1/YOUR_CPANEL_USER/public_html/YOUR_SITE_FOLDER";
      SOURCEPATH="$PWD/public";
      [ "$DEPLOYPATH" = "/home1/YOUR_CPANEL_USER/public_html/YOUR_SITE_FOLDER" ] || { echo "ABORT: deploy path mismatch"; exit 1; };
      [ -d "$SOURCEPATH" ] || { echo "ABORT: source directory not found in $PWD"; pwd; ls -la; exit 1; };
      /bin/mkdir -p "$DEPLOYPATH";
      /usr/bin/rsync -a --delete --exclude=".git" "$SOURCEPATH/" "$DEPLOYPATH/";'
```

### Key points:
- `>-` is YAML block scalar — allows multi-line string as a single command
- `set -e` aborts on any error
- `$PWD` is the repo root (cPanel sets this automatically)
- `SOURCEPATH="$PWD/public"` — change `public` to your output folder if different
- Exact equality guard on `DEPLOYPATH` prevents rsync running against wrong folder
- `/usr/bin/rsync` — use full binary path for reliability on shared hosting
- `--delete` removes files in destination that no longer exist in source
- `--exclude=".git"` never copies git internals

### Safety guards (in order):
1. `DEPLOYPATH` must exactly equal the hardcoded string
2. Source directory must exist — aborts with debug info if missing
3. `mkdir -p` creates destination if it doesn't exist
4. rsync only touches files inside `DEPLOYPATH`

---

## cPanel Setup Steps

### Step 1 — Push `.cpanel.yml` to GitHub
Make sure `.cpanel.yml` is in the repo root and pushed to your main branch.

### Step 2 — Open Git Version Control in cPanel
cPanel → **Git Version Control** → **Create**

### Step 3 — Configure the repository
Fill in:
- **Clone URL**: your GitHub repo URL (HTTPS)
  e.g. `https://github.com/YourUsername/YourRepo.git`
- **Repository Path**: where cPanel will clone it on the server
  e.g. `/home1/leftcoc0/repositories/yourrepo`
- **Repository Name**: anything descriptive

Click **Create**.

### Step 4 — Deploy
- After cloning completes, click **Manage** next to your repo
- Click **Deploy HEAD Commit**
- cPanel will execute `.cpanel.yml` tasks

### Step 5 — Debug if needed (first time)
If the folder stays empty, add a debug task to `.cpanel.yml` first:

```yaml
deployment:
  tasks:
    - /bin/bash -c 'pwd > /home1/YOUR_USER/public_html/YOUR_FOLDER/pwd.txt && ls -la > /home1/YOUR_USER/public_html/YOUR_FOLDER/listing.txt'
```

Push, deploy, then read those files in File Manager to confirm:
- `pwd.txt` — the actual working directory cPanel uses
- `listing.txt` — what files are visible (confirms your source folder exists)

Once confirmed, replace with the real deployment script.

---

## Ongoing Deployment Workflow

Every time you make changes:

```bash
# 1. Make your changes
# 2. Build locally
pnpm build

# 3. Commit everything including built files
git add .
git commit -m "Your message"
git push
```

Then in cPanel → Git Version Control → **Deploy HEAD Commit**.

---

## What NOT to do

- Do NOT use `rsync --delete` without the exact equality path guard
- Do NOT assume cPanel has Node, pnpm, npm, or any specific tool installed
- Do NOT use GitHub Actions + rsync on shared hosting (trailing spaces in secrets
  can cause rsync --delete to wipe the parent folder — this happened on this project)
- Do NOT hardcode absolute repo paths — use `$PWD` instead, confirmed via pwd.txt debug

---

## Folder Structure Reference (PatzerPro)

| Location | Purpose |
|---|---|
| `/home1/leftcoc0/repositories/patzerpatzer` | cPanel git clone (source) |
| `/home1/leftcoc0/public_html/patzerpro` | Live website (deploy target) |
| `public/` | Build output folder committed to repo |

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Folder stays empty after deploy | `.cpanel.yml` syntax error or rsync not found | Use full path `/usr/bin/rsync`, check YAML format |
| "ABORT: source directory not found" | Built files not committed to repo | Run `pnpm build` and commit `public/` |
| "ABORT: deploy path mismatch" | DEPLOYPATH was modified | Restore exact hardcoded path |
| Deploy log shows "Not available" | Deployment never ran | Click "Deploy HEAD Commit" manually |
