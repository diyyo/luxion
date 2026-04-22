// Copyright 2026 diyyo White | Licensed under MIT License
const express = require('express');
const cloudscraper = require('cloudscraper');
const cheerio = require('cheerio');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

// ==========================================
// KONFIGURASI KEAMANAN CORS
// ==========================================
const corsOptions = {
    origin: function (origin, callback) {
        // Daftar domain yang diizinkan
        const allowedOrigins = [
            'https://diyyo.pages.dev'
        ];

        // Izinkan akses jika origin kosong (misal via Postman/Server) atau ada di whitelist
        if (!origin || allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        } else {
            callback(new Error('Akses Ditolak oleh CORS! API ini khusus untuk diyyo.pages.dev'));
        }
    },
    methods: 'GET,POST',
    optionsSuccessStatus: 200
};

app.use(cors(corsOptions));

// ==========================================
// PENGATURAN DOMAIN UTAMA
// ==========================================
const SOURCES = {
    samehadaku: 'https://v2.samehadaku.how',
    otakudesu: 'https://otakudesu.blog',
    animeindo: 'https://anime-indo.lol' // DISABLED
};

const getDefaultOptions = (referer) => ({
    headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Referer': referer
    }
});

// ==========================================
// FUNGSI SCRAPING SAMEHADAKU
// ==========================================
async function searchSamehadaku(query) {
    const html = await cloudscraper.get(`${SOURCES.samehadaku}/?s=${query}`, getDefaultOptions(SOURCES.samehadaku));
    const $ = cheerio.load(html);
    const results = [];

    $('.animpost').each((i, el) => {
        const title = $(el).find('.title h2').text().trim() || $(el).find('h4').text().trim();
        if (title) {
            results.push({
                title: title,
                image: $(el).find('img.anmsa').attr('src'),
                rating: $(el).find('.score').text().trim(),
                type: $(el).find('.type').text().trim(),
                link: $(el).find('a').attr('href'),
                source: 'samehadaku'
            });
        }
    });
    return results;
}

async function getAnimeSamehadaku(url) {
    const html = await cloudscraper.get(url, getDefaultOptions(SOURCES.samehadaku));
    const $ = cheerio.load(html);
    const episodes = [];

    const synopsis = $('.entry-content-single p').text().trim();

    $('.lstepsiode.listeps ul li').each((i, el) => {
        episodes.push({
            episode: $(el).find('.eps a').text().trim(),
            title: $(el).find('.lchx a').text().trim(),
            date: $(el).find('.date').text().trim(),
            link: $(el).find('.lchx a').attr('href') 
        });
    });

    return { synopsis, episodes, source: 'samehadaku' };
}

async function getEpisodeSamehadaku(url) {
    const html = await cloudscraper.get(url, getDefaultOptions(url));
    const $ = cheerio.load(html);
    const serverList = [];

    $('.east_player_option').each((i, el) => {
        serverList.push({
            name: $(el).find('span').text().trim(),
            post: $(el).attr('data-post'),
            nume: $(el).attr('data-nume'),
            type: $(el).attr('data-type')
        });
    });

    const embedLinks = await Promise.all(serverList.map(async (server) => {
        try {
            const postOptions = {
                method: 'POST',
                uri: `${SOURCES.samehadaku}/wp-admin/admin-ajax.php`,
                form: {
                    action: 'player_ajax',
                    post: server.post,
                    nume: server.nume,
                    type: server.type
                },
                headers: {
                    ...getDefaultOptions(url).headers,
                    'X-Requested-With': 'XMLHttpRequest'
                }
            };

            const ajaxResponse = await cloudscraper(postOptions);
            const $$ = cheerio.load(ajaxResponse);
            return {
                server_name: server.name,
                embed_url: $$('iframe').attr('src') || null
            };
        } catch (err) {
            return { server_name: server.name, error: "Gagal mengambil embed" };
        }
    }));

    return { 
        episode_title: $('.entry-title').text().trim(),
        streaming_servers: embedLinks,
        source: 'samehadaku'
    };
}

// ==========================================
// FUNGSI SCRAPING OTAKU DESU
// ==========================================
async function searchOtakudesu(query) {
    const html = await cloudscraper.get(`${SOURCES.otakudesu}/?s=${query}&post_type=anime`, getDefaultOptions(SOURCES.otakudesu));
    const $ = cheerio.load(html);
    const results = [];

    $('.chivsrc li').each((i, el) => {
        const title = $(el).find('h2 a').text().trim();
        if (title) {
            let genres = '', status = '', rating = '';
            $(el).find('.set').each((j, setEl) => {
                const setText = $(setEl).text();
                if (setText.includes('Genres')) genres = setText.replace('Genres :', '').trim();
                if (setText.includes('Status')) status = setText.replace('Status :', '').trim();
                if (setText.includes('Rating')) rating = setText.replace('Rating :', '').trim();
            });

            results.push({
                title: title,
                image: $(el).find('img').attr('src'),
                rating: rating,
                type: status,
                genres: genres,
                link: $(el).find('h2 a').attr('href'),
                source: 'otakudesu'
            });
        }
    });
    return results;
}

async function getAnimeOtakudesu(url) {
    const html = await cloudscraper.get(url, getDefaultOptions(SOURCES.otakudesu));
    const $ = cheerio.load(html);
    const episodes = [];

    const synopsis = $('.sinopc p').text().trim();

    $('.episodelist ul li').each((i, el) => {
        const linkEl = $(el).find('span a');
        const link = linkEl.attr('href');
        
        if (link && link.includes('/episode/')) {
            episodes.push({
                episode: linkEl.text().trim(),
                title: linkEl.text().trim(),
                date: $(el).find('.zeebr').text().trim(),
                link: link
            });
        }
    });

    return { synopsis, episodes, source: 'otakudesu' };
}

async function getEpisodeOtakudesu(url) {
    const html = await cloudscraper.get(url, getDefaultOptions(url));
    const $ = cheerio.load(html);
    
    const episode_title = $('.venutama h1.posttl').text().trim();
    const default_embed = $('#pembed iframe').attr('src');

    const downloads = [];
    $('.download ul li').each((i, el) => {
        const quality = $(el).find('strong').text().trim();
        const links = [];
        $(el).find('a').each((j, aEl) => {
            links.push({
                provider: $(aEl).text().trim(),
                url: $(aEl).attr('href')
            });
        });
        if(quality) downloads.push({ quality, links });
    });

    let streaming_servers = [];
    const scriptText = $('script:contains("__x__nonce")').text();
    
    if (scriptText) {
        try {
            const actionRegex = /action:"([^"]+)"/g;
            const actions = [];
            let match;
            while ((match = actionRegex.exec(scriptText)) !== null) {
                actions.push(match[1]);
            }
            
            const mirrorAction = actions[0]; 
            const nonceAction = actions[1];

            const nonceRes = await cloudscraper.post(`${SOURCES.otakudesu}/wp-admin/admin-ajax.php`, {
                headers: { 'Referer': url, 'X-Requested-With': 'XMLHttpRequest' },
                form: { action: nonceAction }
            });
            const nonce = JSON.parse(nonceRes).data;

            const mirrorTasks = [];

            $('.mirrorstream ul').each((i, ulEl) => {
                const qualityClass = $(ulEl).attr('class');
                const quality = qualityClass ? qualityClass.replace('m', '') : 'Unknown';
                
                $(ulEl).find('li a').each((j, aEl) => {
                    const server_name = $(aEl).text().trim();
                    const data_content = $(aEl).attr('data-content');
                    
                    if (data_content) {
                        mirrorTasks.push(async () => {
                            try {
                                const payloadStr = Buffer.from(data_content, 'base64').toString('ascii');
                                const payload = JSON.parse(payloadStr);
                                
                                const mirrorRes = await cloudscraper.post(`${SOURCES.otakudesu}/wp-admin/admin-ajax.php`, {
                                    headers: { 'Referer': url, 'X-Requested-With': 'XMLHttpRequest' },
                                    form: { ...payload, nonce: nonce, action: mirrorAction }
                                });
                                
                                const mirrorHtmlBase64 = JSON.parse(mirrorRes).data;
                                const mirrorHtml = Buffer.from(mirrorHtmlBase64, 'base64').toString('ascii');
                                
                                const $$ = cheerio.load(mirrorHtml);
                                const embed_url = $$('iframe').attr('src');
                                
                                return { quality, server_name, embed_url: embed_url || null };
                            } catch (err) {
                                return { quality, server_name, error: "Gagal mengekstrak link" };
                            }
                        });
                    }
                });
            });

            streaming_servers = await Promise.all(mirrorTasks.map(task => task()));

        } catch (error) {
            console.error("Gagal melakukan resolve otomatis server Otakudesu:", error.message);
        }
    }

    return { 
        episode_title,
        default_embed,
        streaming_servers,
        downloads,
        source: 'otakudesu'
    };
}


// ==========================================
// FUNGSI SCRAPING ANIMEINDO (BARU)
// ==========================================
async function searchAnimeindo(query) {
    // Animeindo menggunakan dash (-) sebagai pengganti spasi di path search-nya
    const formattedQuery = query.replace(/\s+/g, '-').toLowerCase();
    
    const html = await cloudscraper.get(`${SOURCES.animeindo}/search/${formattedQuery}/`, getDefaultOptions(SOURCES.animeindo));
    const $ = cheerio.load(html);
    const results = [];

    $('.otable').each((i, el) => {
        const title = $(el).find('td.videsc a').first().text().trim();
        const link = $(el).find('td.videsc a').first().attr('href');
        const image = $(el).find('td.vithumb img').attr('src');
        const typeAndYear = $(el).find('td.videsc span.label').map((j, elem) => $(elem).text().trim()).get().join(' | ');
        const synopsis = $(el).find('td.videsc p.des').text().trim();

        if (title && link) {
            results.push({
                title: title,
                image: image,
                type: typeAndYear,
                synopsis: synopsis,
                link: link,
                source: 'animeindo'
            });
        }
    });

    return results;
}

async function getAnimeAnimeindo(url) {
    const html = await cloudscraper.get(url, getDefaultOptions(SOURCES.animeindo));
    const $ = cheerio.load(html);
    const episodes = [];

    const synopsis = $('.detail p').text().trim();
    
    // Mengekstrak Genre
    const genres = [];
    $('.detail li a').each((i, el) => {
        genres.push($(el).text().trim());
    });

    // Mengekstrak Daftar Episode
    $('.ep a').each((i, el) => {
        const link = $(el).attr('href');
        const epText = $(el).text().trim();
        
        if (link && epText) {
            episodes.push({
                episode: `Episode ${epText}`,
                title: `Episode ${epText}`,
                date: null, // Animeindo tidak menampilkan tanggal di list episode-nya
                link: link
            });
        }
    });

    return { 
        synopsis, 
        genres: genres.join(', '),
        episodes, 
        source: 'animeindo' 
    };
}

async function getEpisodeAnimeindo(url) {
    const html = await cloudscraper.get(url, getDefaultOptions(url));
    const $ = cheerio.load(html);
    
    const episode_title = $('h1.title').first().text().trim();
    
    // Mengambil iframe embed default yang pertama kali muncul
    let default_embed = $('#tontonin').attr('src');
    if (default_embed && default_embed.startsWith('//')) {
        default_embed = 'https:' + default_embed;
    }

    // Ekstrak server streaming lainnya yang tersedia
    const streaming_servers = [];
    $('.servers a.server').each((i, el) => {
        const server_name = $(el).text().trim();
        let embed_url = $(el).attr('data-video');
        
        if (embed_url) {
            // Perbaiki format URL karena terkadang ada server yang URL-nya menggunakan `//` atau relative path `/`
            if (embed_url.startsWith('//')) {
                embed_url = 'https:' + embed_url;
            } else if (embed_url.startsWith('/')) {
                embed_url = SOURCES.animeindo + embed_url;
            }
            
            streaming_servers.push({
                server_name: server_name,
                embed_url: embed_url
            });
        }
    });

    // Ekstrak link download
    const downloads = [];
    $('.nav .navi a').each((i, el) => {
        const linkText = $(el).text().trim();
        if (linkText.toLowerCase().includes('download')) {
            downloads.push({
                provider: linkText.replace('Download', '').trim(),
                url: $(el).attr('href')
            });
        }
    });

    return { 
        episode_title,
        default_embed,
        streaming_servers,
        downloads,
        source: 'animeindo'
    };
}


// ==========================================
// 1. ENDPOINT SEARCH ANIME
// ==========================================
app.get('/api/search', async (req, res) => {
    const { q: query, source = 'samehadaku' } = req.query;
    if (!query) return res.status(400).json({ error: 'Parameter "q" wajib diisi!' });

    try {
        let results = [];
        if (source === 'otakudesu') {
            results = await searchOtakudesu(query);
        } else if (source === 'animeindo') {
            results = await searchAnimeindo(query);
        } else if (source === 'samehadaku') {
            results = await searchSamehadaku(query);
        } else {
            return res.status(400).json({ error: 'Source tidak didukung. Gunakan "samehadaku", "otakudesu", atau "animeindo".' });
        }

        res.json({ success: true, source, results });
    } catch (error) {
        console.error(`Search Error (${source}):`, error.message);
        res.status(500).json({ success: false, message: 'Gagal mencari anime. ' + error.message });
    }
});

// ==========================================
// 2. ENDPOINT DETAIL & LIST EPISODE
// ==========================================
app.get('/api/anime', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).json({ error: 'Parameter "url" wajib diisi!' });

    try {
        let data;
        // Auto-detect berdasarkan string URL
        if (targetUrl.includes('otakudesu')) {
            data = await getAnimeOtakudesu(targetUrl);
        } else if (targetUrl.includes('anime-indo')) {
            data = await getAnimeAnimeindo(targetUrl);
        } else {
            data = await getAnimeSamehadaku(targetUrl);
        }
        res.json({ success: true, ...data });
    } catch (error) {
        console.error("Anime Detail Error:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

// ==========================================
// 3. ENDPOINT STREAMING & EMBED LINK
// ==========================================
app.get('/api/episode', async (req, res) => {
    const targetUrl = req.query.url;
    if (!targetUrl) return res.status(400).json({ error: 'Parameter "url" wajib diisi!' });

    try {
        let data;
        // Auto-detect berdasarkan string URL
        if (targetUrl.includes('otakudesu')) {
            data = await getEpisodeOtakudesu(targetUrl);
        } else if (targetUrl.includes('anime-indo')) {
            data = await getEpisodeAnimeindo(targetUrl);
        } else {
            data = await getEpisodeSamehadaku(targetUrl);
        }
        res.json({ success: true, ...data });
    } catch (error) {
        console.error("Episode Error:", error.message);
        res.status(500).json({ success: false, message: error.message });
    }
});

app.listen(PORT, () => {
    console.log(`Server Scraper API Berjalan di http://localhost:${PORT}`);
});