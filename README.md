# Pawventory 🐾

A pastel, paw-themed app (PWA) that tracks your belongings: a photo of each thing, the date you got it, how old it is, and when it expires or needs replacing. It reminds you with notifications before things expire.

- **Light and dark themes**, a pastel accent color of your choice, and a paw-print background
- **Home**: what needs attention, search, category filters, and every item with its age and status
- **Calendar**: expiry dates by month
- **Reminders**: notifications on your iPhone and Mac, X days before (1/3/7/14/30), on the day, then weekly once expired
- **"I replaced it"**: restarts the same lifespan from today and keeps a history
- **Sync** between iPhone and Mac through a **private** GitHub repo; also works offline

## Set it up (once)

### 1. Publish the app

1. On GitHub, open this repo → **Settings → Pages**.
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Merge to `main` (or run the **Deploy app** workflow from the Actions tab).
   The app goes live at **https://parepiy.github.io/personal_inventory/**.

### 2. Install it on your iPhone

1. Open the link above in **Safari**.
2. Tap **Share → Add to Home Screen**, then open **Pawventory** from your Home Screen.
   (Notifications need iOS 16.4 or later and only work from the Home Screen app.)

### 3. Connect GitHub (sync + notifications)

1. In the app, tap **Create a GitHub token**. It opens GitHub with the `repo` and `workflow` permissions already ticked. Pick an expiration and tap **Generate token**.
2. Paste the token into the app and tap **Connect**.

The app then sets everything up by itself:

- creates the **private** repo `pawventory-data`
- saves your items there in `data/items.json` and your photos in `photos/`
- installs a small daily job (`.github/workflows/reminders.yml`) that sends your notifications

### 4. Turn on notifications

Go to **Reminders**, switch on **Notifications on this iPhone**, allow them, and tap **Send a test notification**. It should arrive within a minute or two.

### 5. On your Mac

Open the same link in **Safari**, choose **File → Add to Dock**, open it from the Dock, and connect with the same token. Then turn on notifications there too.

## How it works

```
iPhone / Mac (this app)  ──sync──▶  your private repo "pawventory-data"
                                      ├─ data/items.json      your items
                                      ├─ photos/*.jpg         photos (shrunk to ≤1280px)
                                      ├─ push/subscriptions.json  devices to notify
                                      └─ daily GitHub Action  ──Web Push──▶ iPhone / Mac
```

- The app saves everything on the device first, so it works offline and syncs when it's back online. If both devices edit at the same time, the most recent edit of each item wins.
- The daily job runs at the time you pick in Reminders (GitHub can start it up to about an hour late). It sends one notification for the day, or nothing if nothing is due.
- Look and feel (theme, accent, paws) is per device. Everything else syncs.

### Privacy

- Your items and photos live only in your **private** repo. This repo (the app's code) is public and holds no personal data.
- The token is stored only on your devices and is only ever sent to GitHub. You can revoke it any time at github.com → Settings → Developer settings.
- The daily job's logs print counts only, never item names.

## Development

No build step: the app is plain HTML, CSS and JavaScript modules in `app/`.

```sh
npm install           # Playwright, for the browser tests
npm run serve         # http://127.0.0.1:8080/
npm test              # unit tests (dates, merging, reminders, daily job)
npm run test:e2e      # the full app in Chromium against a fake GitHub
npm run icons         # redraw app/icons (needs Python + Pillow)
```

| Path | What |
| --- | --- |
| `app/js/store.js` | on-device state, GitHub sync, first-time setup, notifications |
| `app/js/dates.js` | ages, countdowns, renewals, time zones (also used by the daily job) |
| `app/js/model.js` | data format and the iPhone/Mac merge |
| `app/js/reminders.js` | which items are due and the notification text |
| `app/js/remind-job.mjs` | the daily job the app installs into the private repo |
| `app/js/views/` | the screens |
| `app/sw.js` | offline support and notification handling |

If you change the job files, bump `REMOTE_VERSION` in `app/js/store.js` so every device reinstalls them.
