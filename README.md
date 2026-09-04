# Payroll Reply Checker

Single-file static demo — no build step, no dependencies. Everything (HTML/CSS/JS) lives in `index.html`.

## Deploy to Vercel

From this folder:

```
git init
git add .
git commit -m "Payroll Reply Checker demo"
git remote add origin <your-empty-github-repo-url>
git push -u origin main
```

Then in Vercel: **Add New → Project → Import** the repo. Framework preset: **Other** (or "Static"). No build command, no output directory needed — Vercel will serve `index.html` at the root automatically.

Or skip GitHub entirely and deploy straight from this folder with the Vercel CLI:

```
npx vercel --prod
```
