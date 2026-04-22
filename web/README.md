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
