const cloudscraper = require('cloudscraper');
const cheerio = require('cheerio');

const SOURCES = { samehadaku: 'https://v2.samehadaku.how' };
const url = 'https://v2.samehadaku.how/overlord-episode-1/';

async function test() {
    console.log("Fetching episode page...");
    const html = await cloudscraper.get(url, { headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    }});
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

    console.log("Server List length:", serverList.length);
    if(serverList.length > 0) {
        const server = serverList[0];
        console.log("Testing server:", server);
        
        try {
            console.log("\nAttempt 1: Original User-Agent");
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
                    'User-Agent': 'Mozilla/5.0',
                    'Referer': url,
                    'X-Requested-With': 'XMLHttpRequest'
                }
            };
            const ajaxResponse = await cloudscraper(postOptions);
            const $$ = cheerio.load(ajaxResponse);
            console.log("Embed url:", $$('iframe').attr('src') || $$('html').text().substring(0, 100));
        } catch (err) {
            console.error("Error:", err.message);
        }

        try {
            console.log("\nAttempt 2: Better User-Agent");
            const postOptionsBetter = {
                method: 'POST',
                uri: `${SOURCES.samehadaku}/wp-admin/admin-ajax.php`,
                form: {
                    action: 'player_ajax',
                    post: server.post,
                    nume: server.nume,
                    type: server.type
                },
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
                    'Referer': url,
                    'X-Requested-With': 'XMLHttpRequest'
                }
            };
            const ajaxResponse = await cloudscraper(postOptionsBetter);
            const $$ = cheerio.load(ajaxResponse);
            console.log("Embed url:", $$('iframe').attr('src') || $$('html').text().substring(0, 100));
        } catch (err) {
            console.error("Error:", err.message);
        }
    }
}
test();
