#!/bin/bash
# Vercel build: stage the browser-served files into .static (the configured
# outputDirectory) so they publish to the CDN; /api/* stays serverless.
set -e
rm -rf .static
mkdir .static
cp index.html app.js styles.css .static/
cp -r services .static/services
[ -d assets ] && cp -r assets .static/assets || true
[ -f manifest.webmanifest ] && cp manifest.webmanifest .static/ || true
[ -d icons ] && cp -r icons .static/icons || true
echo "static staged: $(ls .static | wc -l | tr -d ' ') entries"
