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

## 🌐 Deployment

This backend is designed to run seamlessly in server environments or edge services that support standard Node runtime applications natively (e.g. VPS, Render, Railway). It also includes a `vercel.json` if intended for serverless deployment on Vercel.

---

_Copyright 2026 diyyo White | Licensed under MIT License_
