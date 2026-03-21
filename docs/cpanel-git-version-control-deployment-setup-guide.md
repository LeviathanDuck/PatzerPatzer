# cPanel Git Version Control — Deployment Setup Guide

## Overview

This documents how to set up deployment from GitHub to Bluehost shared hosting
using cPanel's built-in Git Version Control.

This hosting setup does **not** provide Node.js or npm in the cPanel Git deployment shell, so
server-side builds are not viable here. The correct deployment model is:

- build locally
- commit the built output directory
- let cPanel deploy those prebuilt files to the live site

---

## How It Works

1. cPanel clones your GitHub repo to a directory on the server
2. You click **Update from Remote** to refresh cPanel’s managed checkout
3. You click **Deploy HEAD Commit** to run the deployment tasks in `.cpanel.yml`
4. `.cpanel.yml` copies the checked-in build output into the live site folder

Important:
- **Update from Remote** and **Deploy HEAD Commit** are separate steps
- a newer repo HEAD in cPanel does **not** mean the live site is updated
- “Last Deployment Information” only advances when the deploy task actually succeeds

---

## Prerequisites

- Bluehost shared hosting with cPanel access
- A GitHub repository
- A checked-in `.cpanel.yml` file in the repo root
- Built site artifacts committed to the repo
- A live document root directory on the server

Example layout:

| Location | Purpose |
|---|---|
| `/home1/YOUR_CPANEL_USER/repositories/YOUR_REPO_NAME` | cPanel git clone (source) |
| `/home1/YOUR_CPANEL_USER/public_html/YOUR_SITE_FOLDER` | Live website (deploy target) |
| `public/` | Example prebuilt site assets committed to repo |

If your site uses a different output folder such as `dist/`, `build/`, or `out/`, substitute that everywhere below.

---

## Build Strategy (Critical)

Bluehost shared hosting on this setup does **not** expose `node` or `npm` in the cPanel
Git deployment environment.

That means this will fail in `.cpanel.yml`:

- `npm install`
- `npm run build`
- any server-side Node build step

### Correct strategy: prebuilt deployment

- Run your build locally
- Commit the updated build output files
- Push to GitHub
- cPanel deploys the checked-in build directory directly

This is the correct model for sites on this hosting setup.

---

## `.cpanel.yml` Format

Place this file in the **repo root**.

```yaml
deployment:
  tasks:
    - >-
      /bin/bash -c 'set -e;
      DEPLOYPATH="/home1/YOUR_CPANEL_USER/public_html/YOUR_SITE_FOLDER";
      SOURCEPATH="$PWD/public";
      [ "$DEPLOYPATH" = "/home1/YOUR_CPANEL_USER/public_html/YOUR_SITE_FOLDER" ] || { echo "ABORT: deploy path mismatch"; exit 1; };
      command -v git >/dev/null 2>&1 || { echo "ABORT: git not available"; exit 1; };
      cd "$PWD";
      echo "Deploy working directory: $PWD";
      echo "Deploy commit: $(git rev-parse HEAD)";
      echo "Deploy path: $DEPLOYPATH";
      echo "Source path: $SOURCEPATH";
      [ -z "$(git status --porcelain)" ] || { echo "ABORT: repository is not clean before deployment"; git status --short; exit 1; };
      [ -d "$SOURCEPATH" ] || { echo "ABORT: build output not found"; exit 1; };
      echo "Deploying prebuilt contents:";
      /bin/ls -la "$SOURCEPATH";
      /bin/mkdir -p "$DEPLOYPATH";
      /usr/bin/rsync -a --delete --exclude=".git" "$SOURCEPATH/" "$DEPLOYPATH/";'
```

### What this does

- uses `set -e` so failures stop immediately
- uses `$PWD` for the repo root instead of guessing the clone path
- logs:
  - working directory
  - deployed commit SHA
  - deploy path
  - source path
- verifies the repo is clean before deployment
- verifies the build output exists
- lists the build directory contents for debug visibility
- rsyncs the build output into the live document root

### Key points

- `SOURCEPATH="$PWD/public"` assumes `public/` is the deployable output
- if your project builds to `dist/`, `build/`, or `out/`, change `SOURCEPATH`
- `DEPLOYPATH` should be hardcoded to the exact live folder
- `/usr/bin/rsync` uses the full binary path for reliability
- `--delete` removes stale files from the live directory
- `--exclude=".git"` ensures Git internals are never copied

### Safety guards

1. `DEPLOYPATH` must exactly match the hardcoded expected path
2. the repo must be clean before deployment
3. the source build directory must exist
4. `mkdir -p` ensures the target exists
5. rsync only touches files inside the exact validated deploy path

---

## cPanel Setup Steps

### Step 1 — Push `.cpanel.yml` to GitHub

Make sure `.cpanel.yml` is in the repo root and committed to the branch cPanel tracks.

### Step 2 — Open Git Version Control in cPanel

cPanel → **Git Version Control** → **Create**

### Step 3 — Configure the repository

Fill in:

- **Clone URL**: your GitHub repo URL
- **Repository Path**: where cPanel clones the repo on the server
- **Repository Name**: any descriptive name

Example:
- Repository Path: `/home1/YOUR_CPANEL_USER/repositories/YOUR_REPO_NAME`

### Step 4 — Refresh the managed checkout

After setup, or after any future push:

- open the repo in cPanel
- click **Update from Remote**

This updates cPanel’s managed checkout to the latest GitHub commit.

### Step 5 — Deploy the refreshed HEAD

After **Update from Remote** finishes:

- click **Deploy HEAD Commit**

This runs the `.cpanel.yml` tasks and copies files into the live site folder.

Important:
- **Deploy HEAD Commit** without **Update from Remote** can redeploy an older managed checkout
- always use this order:
  1. **Update from Remote**
  2. **Deploy HEAD Commit**

---

## Ongoing Deployment Workflow

Every time you want to ship changes:

```bash
# 1. Make source changes locally

# 2. Build locally
npm run build
# or pnpm build
# or your project's equivalent build command

# 3. Commit source changes plus updated built artifacts
git add .
git commit -m "Your message"
git push
```

Then in cPanel:

1. **Update from Remote**
2. **Deploy HEAD Commit**

---

## What to Verify After Deploy

Check both cPanel output and the live filesystem.

### Expected deploy log lines

Your deploy output should include lines like:

- `Deploy working directory: ...`
- `Deploy commit: ...`
- `Deploy path: ...`
- `Source path: ...`
- `Deploying prebuilt contents:`

If those lines do not appear, cPanel may not be executing the expected `.cpanel.yml`.

### Files to verify on the server

Check the files that represent your live site, for example:

- `/home1/YOUR_CPANEL_USER/public_html/YOUR_SITE_FOLDER/index.html`
- `/home1/YOUR_CPANEL_USER/public_html/YOUR_SITE_FOLDER/js/main.js`
- `/home1/YOUR_CPANEL_USER/public_html/YOUR_SITE_FOLDER/css/main.css`

You can compare timestamps between:

- `/home1/YOUR_CPANEL_USER/repositories/YOUR_REPO_NAME/public/...`
- `/home1/YOUR_CPANEL_USER/public_html/YOUR_SITE_FOLDER/...`

If the repo-side built files are newer but the live files are not, the copy step failed.

---

## Important Lessons Learned on This Setup

### 1. cPanel repo HEAD and deployed HEAD are different things

cPanel can show a newer **HEAD Commit** while **Last Deployment Information**
still points at an older SHA.

That means:
- the repo update worked
- the deploy step did not complete successfully

Do not assume “latest HEAD shown in cPanel” means the live site updated.

### 2. Success UI messages are not enough

A cPanel UI success message is not enough proof that the live files changed.

Always verify:
- deploy output
- file timestamps
- live site behavior

### 3. Missing Node/npm can be the real deployment blocker

If the host does not provide `node` or `npm`, any server-side build step in `.cpanel.yml`
will fail before deployment reaches rsync.

### 4. Prebuilt deployment is often the correct model on shared hosting

When server-side build tools are unavailable, `.cpanel.yml` should only deploy checked-in
build output.

### 5. Build output must be committed

If you change source files but do **not** commit the rebuilt output directory, cPanel will
correctly deploy the old build.

---

## What NOT to do

- Do NOT assume Bluehost shared hosting provides `node`, `npm`, or `pnpm`
- Do NOT put server-side build commands in `.cpanel.yml` unless you have verified they exist
- Do NOT click only **Deploy HEAD Commit** when the repo has newer remote commits
- Do NOT use `rsync --delete` without an exact deploy-path guard
- Do NOT point deployment at a parent directory like `public_html`
- Do NOT assume cPanel success messages mean live files actually changed
- Do NOT forget to commit updated built artifacts

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| cPanel shows a newer HEAD commit than the last deployed SHA | Managed repo updated, deploy step did not complete | Run **Update from Remote** then **Deploy HEAD Commit** and inspect deploy output |
| Deploy output says `npm not available` or `node not available` | Host has no Node runtime in deploy shell | Remove server-side build from `.cpanel.yml`; deploy prebuilt output only |
| Live site does not change after deploy | Built artifacts were not rebuilt/committed, or rsync did not run | Rebuild locally, commit output folder, push, then redeploy |
| Repo build files are newer than live files | Copy step failed before or during rsync | Inspect deploy output and confirm `.cpanel.yml` runs fully |
| “Last Deployment Information” stays old | Deploy did not actually complete for latest HEAD | Verify the deploy task succeeded and that live files changed |
| `ABORT: build output not found` | Build folder is missing from the checked-out repo | Run local build, commit build output, push again |
| `ABORT: repository is not clean before deployment` | cPanel-managed checkout has uncommitted changes | Inspect `git status --short` inside the cPanel repo and clean it up before redeploying |
| Deploy log lines do not show `Deploy commit:` / `Source path:` | cPanel is not running the expected `.cpanel.yml` | Confirm `.cpanel.yml` is in repo root and cPanel has the latest commit |

---

## Useful Verification Commands

Run these in cPanel terminal, adapted to your repo and live path:

```bash
cd /home1/YOUR_CPANEL_USER/repositories/YOUR_REPO_NAME
git rev-parse HEAD
git status --short
stat public/index.html
stat public/js/main.js
stat public/css/main.css
stat /home1/YOUR_CPANEL_USER/public_html/YOUR_SITE_FOLDER/index.html
stat /home1/YOUR_CPANEL_USER/public_html/YOUR_SITE_FOLDER/js/main.js
stat /home1/YOUR_CPANEL_USER/public_html/YOUR_SITE_FOLDER/css/main.css
```

If your build output folder is not `public/`, change those paths accordingly.

Use them to confirm:
- the cPanel-managed repo is on the expected commit
- the repo is clean
- the built files are present
- the live deployed files have updated timestamps

---

## Core mindset

- Don’t guess, verify
- Don’t trust UI success alone, inspect logs and files
- Separate repo update from deploy
- Match deployment strategy to actual host capabilities
- On shared hosting without Node in the deploy shell, prebuilt static deployment is the safe path
