# Luxion Web

A modern, fast, and feature-rich front-end web application for an anime streaming platform. Built entirely with Vanilla JavaScript, HTML5, and CSS3, this project focuses on performance, simplicity, and an optimal user experience without relying on heavy frameworks.

## 🚀 Features

- **Blazing Fast Performance**: Zero-dependency frontend utilizing pure Vanilla JS for optimal load speeds.
- **Advanced Search & Filtering**: Built-in intelligent search functionality with input debouncing and fast rendering.
- **Turnstile Bot Protection**: Integrated Cloudflare Turnstile to prevent spam and automated bot access, utilizing smart session management via `localStorage` and `sessionStorage`.
- **Lazy Loading Implementation**: High-performance image loading utilizing the native `IntersectionObserver` API. Skeleton loading states are also used to improve perceived performance during data fetching.
- **Admin Dashboard**: Includes an integrated admin management panel (`admin.html`, `admin.js`) for adding, editing, and managing anime data and announcements.
- **Dynamic Content Sections**: Categorized library presentation including "Latest Episodes", "Latest Anime", "Airing", and "Finished" sections.
- **Responsive Design**: Modern and clean user interface fully adaptable across mobile sizes, tablets, and desktop displays.

## 📂 Project Structure

- `index.html` / `app.js` / `style.css`: The main landing page handling the gallery, search functionality, and global routing logic.
- `streaming.html` / `streaming.js`: Dedicated page for individual anime details, episode lists, and embedded streaming players.
- `admin.html` / `admin.js` / `admin.css`: Secured management dashboard for database control operations.

## 🛠️ Configuration

> **Note:** The backend data connection is configured via `APPS_SCRIPT_URL` found in `app.js` and `admin.js`. Ensure you update `YOUR_GAS_URL` or `YOUR_TURNSTILE` site-keys before deployment to production.

```javascript
// In app.js & admin.js
const APPS_SCRIPT_URL = "YOUR_GAS_URL"; // Replace with backend data endpoint
```

```html
<!-- In index.html -->
<div
  class="cf-turnstile"
  data-sitekey="YOUR_TURNSTILE"
  data-callback="onTurnstileSuccess"
></div>
```

## 💻 Tech Stack

- **HTML5 & CSS3** (Vanilla, Grid, Flexbox)
- **Vanilla JavaScript** (ES6+, Modules, Fetch API)
- **Cloudflare Turnstile**

## 🌐 Deployment

The web application is fully static and can be deployed to platforms like **Cloudflare Pages**, **Vercel**, **GitHub Pages**, or **Netlify** easily. Ensure any CORS policies on your backend API allow requests from your deployed domain string.

---

_Copyright 2026 diyyo White | Licensed under MIT License_



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
