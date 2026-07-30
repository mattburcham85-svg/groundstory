# GroundStory v0.2

GroundStory answers one question: **What happened here?**

This repository contains both parts of the project:

- `docs/` — the live GitHub Pages website
- `supabase/` — the cloud database and nearby-stories API
- `project-docs/` — architecture and API notes

## U.S. measurement convention

The public interface and API use **miles**. Distances are stored and calculated internally in meters because PostGIS uses metric geography calculations, then displayed to users in miles or feet.

## Install order

1. Upload this package's folders and files to the root of the GitHub repository.
2. In Supabase SQL Editor, run `supabase/migrations/001_groundstory.sql`.
3. Run `supabase/seed.sql`.
4. Create and deploy the Edge Function from `supabase/functions/nearby-stories/index.ts`.
5. Put the deployed function URL and Supabase anon key into `docs/config.js`.
6. Commit the updated `docs/config.js`; GitHub Pages will redeploy automatically.

See `NEXT-STEPS.txt` for click-by-click instructions.
