# Dragon Fruit Expert Review

Expert-in-the-loop maturity and quality grading of dragon fruit.

```
MY-THESIS/
├── frontend/   Vue 3 + TypeScript + Vite + Pinia + Vue Router + Tailwind 4 + shadcn-vue + Chart.js
└── backend/    FastAPI server that runs the ONNX model
    ├── main.py
    ├── requirements.txt
    ├── extract_reference.py
    ├── model/deploy/   dragonfruit_int8.onnx, ref_embeddings.npy, splits.csv, config.json
    └── data/           pool/ (unlabeled images), reference/ (2131 train images), db.json (expert decisions)
```

The frontend contains no ML code. Every prediction, OOD score, neighbor and metric comes from the backend; inventory counts come from Supabase.

## Run

Backend (terminal 1):

```sh
pip install -r backend/requirements.txt
cd backend
python -m uvicorn main:app --port 8000
```

Frontend (terminal 2):

```sh
cd frontend
npm install --legacy-peer-deps   # the scaffold's ESLint peer ranges conflict with TypeScript 6
cp .env.example .env.local       # then edit
npm run dev                      # http://localhost:5173
npm run build                    # type-check (vue-tsc) + production build
npm run lint
```

## Frontend

Pages: `/dashboard` (Admin Dashboard) · `/inventory` · `/grade` (quick grade) · `/review` (queue) · `/review/:id` (expert review) · `/history`.

Expert review shortcuts: `M`/`Q` switch task · `C` confirm active task · `A` confirm both · `1`/`2` pick label · `Enter` submit · `←`/`→` prev/next. (Ignored while typing in the note field.)

### Environment variables (`frontend/.env.local`)

| Variable                 | Meaning                                                           |
| ------------------------ | ----------------------------------------------------------------- |
| `VITE_API_BASE_URL`      | Backend origin, no trailing slash (e.g. `http://localhost:8000`). |
| `VITE_SUPABASE_URL`      | Supabase project URL (inventory). Empty disables inventory.       |
| `VITE_SUPABASE_ANON_KEY` | Supabase anon/publishable key.                                    |

Run `frontend/supabase/schema.sql` once in the Supabase SQL editor to create the `gradings` table and `inventory` view. To keep the front and back photo of every fruit and allow deleting, also run `frontend/supabase/add-photos.sql` (safe to run again).

### Quick grade (two sides)

Every photo, whether it is taken, uploaded or captured by the live **Scan**, is cropped to a centre square and reduced to **224 x 224** JPEG in the browser right away (`MODEL_INPUT_SIZE` in `frontend/src/config/labels.ts`, which must match `input.size` in `backend/model/deploy/config.json`). That one picture is what the model reads, what the page shows and what is stored in Supabase, about 18 KB each. Tested on 80 dataset images and 8 phone photos: the labels did not change and confidence moved by at most 0.04.

Photograph the front, then the back, of one fruit (both are required), then press Grade this fruit. Each photo is checked on its own: if either is outside what the model knows (confidence below `CONFIDENCE_THRESHOLD` or similarity below `SIMILARITY_THRESHOLD`), no reading, advice or similar fruit is shown, nothing is recorded, and the page asks for that side again. Otherwise the fruit is recorded in the inventory with **both** photos, front and back. A fruit is saved with both or not at all: if either photo or the record fails to save, nothing is kept and the page says so.

### Changing labels (e.g. PNS/BAFPS 115:2013)

Edit `frontend/src/config/labels.ts`. Label `value`s must match `classes` in `backend/model/deploy/config.json`; array order sets the number-key shortcuts. The file also holds the thresholds: `CONFIDENCE_THRESHOLD` (0.75) and `SIMILARITY_THRESHOLD` (0.90).

## Backend

Loads the model named in `backend/model/deploy/config.json` and applies its preprocessing (EXIF rotation, centre crop, 224×224, mean/std).

- **Review queue:** drop unlabeled images into `backend/data/pool/`. They are predicted on the next queue request and sorted by entropy.
- **Similar reference fruits:** the 2131 train images behind `ref_embeddings.npy` (rows match the train split of `splits.csv`), plus expert-reviewed fruits. Reference pictures come from `backend/data/reference/`; fill it once with `python extract_reference.py "<maturity dataset>.zip" "<quality dataset>.zip"`. Each reference has only one label (maturity or quality), because the two datasets are separate. Without that folder only expert-reviewed fruits are shown.
- **Expert feedback:** saved in `backend/data/db.json`; those labeled fruits are the kNN memory bank behind "Similar reference fruits". Deleting `db.json` clears History and the memory bank.
- **OOD:** `oodSimilarity` = mean of the top-k cosine similarities to `ref_embeddings.npy`. The UI flags an image when either task's confidence or `oodSimilarity` is below its threshold. OOD uploads are not added to the inventory.
- **No Grad-CAM:** the ONNX model has no heatmap output, so the heatmap controls are hidden. `/api/metrics` returns empty evaluations and no consolidation run, because there is no evaluation or fine-tuning pipeline.
- **CORS:** allows `http://localhost:5173` by default; set `CORS_ORIGINS` (comma separated) to change.

### API contract

Relative image URLs (e.g. `/media/a.jpg`) are resolved against `VITE_API_BASE_URL`. Confidence is 0..1; entropy is the sum over both tasks (nats).

| Method | Path                        | Request                                     | Response                                                                                                                                                                                                                             |
| ------ | --------------------------- | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| GET    | `/api/queue?limit=&offset=` |                                             | `[{id, imageUrl, maturity:{label,confidence}, quality:{label,confidence}, entropy}]`                                                                                                                                                 |
| GET    | `/api/items/:id`            |                                             | queue item + `gradcamUrl` (empty) + `oodSimilarity` + `neighbors:[{id,imageUrl,maturityLabel,qualityLabel,similarity}]`                                                                                                              |
| POST   | `/api/items/:id/feedback`   | JSON `{maturityLabel, qualityLabel, note?}` | 204 (adds the image to the kNN memory bank immediately)                                                                                                                                                                              |
| POST   | `/api/predict`              | multipart: `image` (front, required) and `back` (optional) | same shape as `GET /api/items/:id`, plus `views` (one reading per side). Maturity averages the sides; quality follows the worse side; `oodSimilarity` is the lowest of the sides. Stateless, nothing is stored. |
| GET    | `/api/metrics`              |                                             | `{labelCount, expertQueries, correctionsApplied, evaluations:[{date,accuracy,macroF1}], rounds:[{round,queries,corrections}], lastConsolidation:{runAt,status,accuracyBefore?,accuracyAfter?,reason?}\|null}`                         |
| GET    | `/api/history`              |                                             | `[{id,itemId,imageUrl,modelMaturity,modelQuality,expertMaturity,expertQuality,note?,timestamp}]`                                                                                                                                     |

Agreed vs. corrected and Cohen's kappa are computed in the browser from `history`.

## Deploy

The frontend goes on Vercel. The backend goes on a host that runs a container and gives it a persistent disk (Render, Railway, Fly.io or a VPS). It does not fit Vercel functions as it is: the expert decisions (`db.json`), the review pool and the 272 MB of reference images need storage that survives restarts, and Vercel functions only have a temporary `/tmp`.

### Option A: everything in one container (simplest)

The `Dockerfile` in the project root builds the frontend and puts it inside the backend image, so **one container serves both the app and the API**, on one address. There is no CORS to set and no `VITE_API_BASE_URL`.

```sh
docker build -t dragonfruit \
  --build-arg VITE_SUPABASE_URL=https://xxxx.supabase.co \
  --build-arg VITE_SUPABASE_ANON_KEY=... .
```

Deploy that image on a host with a persistent disk (Fly.io below; Render, Railway or a VPS also work), with the settings in the table below. Tested locally without Docker: the server serves the app, deep links such as `/inventory`, the API and the images from one origin.

#### Fly.io, step by step

`fly.toml` in the project root is ready (Singapore region, 1 GB machine, a 1 GB volume at `/data`, health check on `/api/health`, one machine only).

```sh
fly auth login
fly apps create dragonfruit-grading            # pick another name if it is taken, and set it in fly.toml
fly volumes create dragonfruit_data --region sin --size 1
fly deploy --ha=false \
  --build-arg VITE_SUPABASE_URL=https://xxxx.supabase.co \
  --build-arg VITE_SUPABASE_ANON_KEY=...
```

Then open `https://<app name>.fly.dev`. To put photos into the review queue:

```sh
fly ssh sftp shell
> put C:\photos\IMG_001.jpg /data/pool/IMG_001.jpg
```

Keep to one machine (`--ha=false`): a Fly volume belongs to a single machine, and the expert decisions are held by one process. Check Fly's current pricing; the machine and the volume are billed.

#### Render, step by step

`render.yaml` in the project root is a blueprint: Docker service, Singapore region, the `starter` plan, a 1 GB disk at `/data`, health check on `/api/health`.

1. Put the project in a Git repository (GitHub or GitLab) and push it. Render deploys from a repository.
2. In Render choose **New > Blueprint**, pick the repository, and enter `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` when asked. Render hands these to the Docker build as build arguments, which is how the frontend gets them. The anon key is public by design.
3. Open the address Render gives you (`https://dragonfruit-grading.onrender.com` or similar). To fill the review queue, copy photos into `/data/pool` (Render's shell, or SFTP over SSH from the service's Connect menu).

- **Free plan:** works only for Quick grade and the Inventory (that data is in Supabase). A free service has no persistent disk, so the History, the memory bank and the review pool are erased on every restart, and it sleeps after 15 minutes without traffic, so the next visitor waits while the model loads. Use a paid plan with the disk for the review queue.
- Measured memory is about 200 MB at most, so the smallest paid instance is enough; confirm the instance size on Render's pricing page.
- A service with a disk runs as a single instance, which is what this app needs.

### Option B: frontend on Vercel or Netlify, backend in a container

Use this when you want the frontend on a CDN. The rest of this section is for option B; the backend settings table also applies to option A.

### 1. Backend (container)

`backend/Dockerfile` builds an image with the model, the reference images and the API. Build it from the `backend` folder: `docker build -t dragonfruit-api .`

| Setting | Value |
| --- | --- |
| Port | the host's `PORT` is used automatically (default 8000) |
| Health check path | `/api/health` |
| Persistent volume | mount it at `/data` (this is `DATA_DIR`: `db.json` and `pool/` live there) |
| `CORS_ORIGINS` | your frontend address, e.g. `https://your-app.vercel.app` (comma separated for several) |
| Memory | 512 MB is enough (measured: about 130 MB at start, 200 MB with 20 gradings at once); 1 GB leaves room |

- Keep **one worker**. Expert decisions are held in memory and saved to a single JSON file, so several workers would overwrite each other.
- Without a persistent volume, every restart erases the History, the memory bank and the review pool. Free tiers that have no disk will do this.
- The image is large (about 0.6 GB) because the 2131 reference photos are baked in.
- Put the photos to review in `/data/pool` (copy them to the volume).

### 2. Frontend (Vercel or Netlify)

Import the project and set:

- **Root Directory:** `frontend` (the build settings come from `frontend/vercel.json`)
- **Node.js version:** 22 or 24
- **Environment variables** (they are baked in at build time, so redeploy after changing them):
  - `VITE_API_BASE_URL` = the backend address, **https**, no trailing slash
  - `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`

On Netlify use `frontend/netlify.toml` instead of `vercel.json` (set the same variables in the site settings). Netlify, like Vercel, cannot host the backend: its functions have no storage that survives restarts.

`frontend/.npmrc` makes `npm install` work with the scaffold's peer-dependency conflict, and `vercel.json` rewrites every path to `index.html` so refreshing `/inventory` does not 404.

### 3. Supabase

Run `frontend/supabase/schema.sql` once, then `frontend/supabase/add-photos.sql` (safe to run again).

### Before real users

The camera (live Scan) only works on https pages, which Vercel provides. These are open on purpose for the demo and must be closed before the link is shared:

- The backend has no login: anyone can read the queue and post feedback.
- The Supabase policies let anyone with the anon key (it is visible in the browser) upload, read and delete photos and rows. Add Supabase Auth and tighten the policies.
