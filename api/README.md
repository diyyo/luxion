# Luxion Anime Scraper API

A robust, high-performance web-scraping REST API built with Node.js and Express. It programmatically extracts and standardizes anime data, episode lists, and streaming embed links from popular Indonesian anime platforms.

## 🌟 Supported Sources

- **Samehadaku**
- **Otakudesu** (Disabled)
- **Animeindo**

## 🚀 Features

- **Cloudflare Bypass**: Seamlessly bypasses advanced Cloudflare protections using the `cloudscraper` library.
- **HTML to Structured JSON**: Parses unstructured, dynamic HTML into clean, predictable JSON schemas via `cheerio`.
- **Dynamic Video Extraction**: Automatically extracts complex multi-server streaming iframe data, including resolving asynchronous AJAX payloads for mirror streams (e.g., handling Otakudesu base64 nonces).
- **CORS Protection**: Secured by default to only accept cross-origin requests from pre-authorized domains (`https://diyyo.pages.dev`).

## 🛠️ Installation & Setup

1. **Clone & Navigate** to the directory.
2. **Install Dependencies**:
   ```bash
   npm install
   ```
3. **Run the Development Server**:
   ```bash
   node index.js
   ```
   > The server will start on port `3000` by default. (e.g. `http://localhost:3000`)

## 📡 API Endpoints

### 1. Search Anime

Searches for anime across specified sources.

- **URL**: `/api/search`
- **Method**: `GET`
- **Query Parameters**:
  - `q` (string, required): Anime title/keyword.
  - `source` (string, optional): Target scraper source (`samehadaku`, `otakudesu`, `animeindo`). Default is `samehadaku`.

**Example:** `/api/search?q=naruto&source=otakudesu`

### 2. Anime Details & Episodes

Retrieves the synopsis, metadata, and full episode list for an anime.

- **URL**: `/api/anime`
- **Method**: `GET`
- **Query Parameters**:
  - `url` (string, required): The direct URL to the anime page from the source site.

**Example:** `/api/anime?url=https://otakudesu.blog/anime/naruto-sub-indo/`

### 3. Get Episode Streaming Links

Extracts available embedded streaming servers and raw download links for a specific episode.

- **URL**: `/api/episode`
- **Method**: `GET`
- **Query Parameters**:
  - `url` (string, required): The direct URL to the specific episode page.

**Example:** `/api/episode?url=https://otakudesu.blog/episode/nrt-episode-1-sub-indo/`

## 📦 Dependencies

- `express`, `cors` — Minimalist web framework and middleware.
- `cheerio` — Core implementation of jQuery engineered for the server to scrape DOM trees.
- `cloudscraper` — Node library specifically tailored for bypassing Cloudflare's anti-bot mechanisms.
- `axios` — Promise-based HTTP client for supplementary requests.

## 🔒 Security Configuration

To modify the allowed CORS origins, update the `allowedOrigins` array in `index.js`.

```javascript
const allowedOrigins = [
  "https://diyyo.pages.dev",
  // 'http://localhost:5500' // Uncomment for local development
];
```

## 🗄️ Google Apps Script Backend (Database API)

Luxion also utilizes a Google Apps Script (`api/gas/code.gs`) serving as a serverless database backend and Admin REST API, leveraging Google Sheets as the storage layer.

### 🌟 Key Features

- **Serverless Google Sheets DB:** Stores Anime lists, Episodes, and Announcements.
- **Auto-Archiving System:** Automatically archives old records into separate sheets (e.g., `Archive_Anime_1`) when the main sheet exceeds 5,000 rows to maintain high performance.
- **Cloudflare Turnstile Integration:** Built-in bot protection that can verify Turnstile tokens before processing read/write operations.
- **Admin Authentication:** Secure `POST` requests via Google OAuth2 `id_token` validation (restricted to a specific admin email).

### 📡 Public Endpoints (GET)

Data fetching operations via `doGet`:

- `?action=getAll` - Fetches all anime series.
- `?action=getAnime&id=<ID>` - Fetches a specific anime and its episode list.
- `?action=getPage&page=1&limit=12` - Fetches paginated anime data.
- `?action=getAllEpisodes` - Fetches all episodes.
- `?action=getAnnouncement` - Fetches the active announcement.

### 🔐 Admin Endpoints (POST)

Data mutation operations via `doPost`. Requires an Admin Google `idToken` and optional `turnstileToken` in the JSON payload:

- **Anime Management**: `addAnime`, `updateAnime`, `deleteAnime`, `deleteAnimeSeries`
- **Episode Management**: `addEpisode`, `updateEpisode`, `deleteEpisode`
- **Utility**: `auth`, `saveAnnouncement`, `bulkInsert`

### ⚙️ GAS Setup

1. Create a new Google Sheet.
2. Open **Extensions > Apps Script** and paste the contents of `api/gas/code.gs`.
3. Set Script Properties (optional):
   - `REQUIRE_TURNSTILE`: Set to `1` to enforce bot protection.
   - `TURNSTILE_SECRET_KEY`: Your Cloudflare Turnstile secret key.
4. Deploy as a **Web App** (Execute as: Me, Access: Anyone).

## 🌐 Deployment

This backend is designed to run seamlessly in server environments or edge services that support standard Node runtime applications natively (e.g. VPS, Render, Railway). It also includes a `vercel.json` if intended for serverless deployment on Vercel.

---

_Copyright 2026 diyyo White | Licensed under MIT License_
