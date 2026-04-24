# Agreement Visualizations

Static GitHub Pages app for the agreement timeline and coder network visualizations.

## Update data

1. Generate a fresh run in the source `text-prizm-viz` app.
2. Copy the newest JSON into `data/latest-run.json`.
3. Commit and push to `main`.

## Local development

```bash
npm install
npm run dev
```

## Deploy

Push to `main` and GitHub Actions will export and deploy the static site to GitHub Pages.
