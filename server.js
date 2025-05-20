import express from 'express';
import cors from 'cors';
import fetch from 'node-fetch';
import fs from 'node:fs/promises';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Daftar IP yang diblacklist
const BLACKLISTED_IPS = new Set([
    // Tambahkan IP yang ingin Anda blokir di sini
]);

let totalRequests = 0;
let ipMap = new Map();
let requestCounts = new Map();
let blockedIPs = new Set();
const ipLogsFile = 'ip_logs.json';

const HIT_RATE_LIMIT = 10;
const STRICT_RATE_LIMIT = 5;
const BLOCK_DURATION = 60 * 1000;
const RESET_INTERVAL = 3 * 60 * 1000;

async function readIPLogs() {
    try {
        const data = await fs.readFile(ipLogsFile, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        return [];
    }
}

async function writeIPLogs(logs) {
    try {
        await fs.writeFile(ipLogsFile, JSON.stringify(logs, null, 2), 'utf8');
    } catch (error) {
        console.error('Gagal menulis log IP:', error);
    }
}

let ipLogs = await readIPLogs() || [];

async function getWhoisByIP(ip) {
    if (whoisCache.has(ip)) return whoisCache.get(ip);
    try {
        const res = await fetch(`https://ipwhois.app/json/${ip}`);
        const json = await res.json();
        const country = json.country || 'Unknown';
        whoisCache.set(ip, country);
        return country;
    } catch (error) {
        console.error(`Gagal mendapatkan whois untuk IP ${ip}:`, error);
        whoisCache.set(ip, 'Unknown');
        return 'Unknown';
    }
}
let whoisCache = new Map();

const blacklistCheck = (req, res, next) => {
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || ''.split(',')[0].trim();
    if (BLACKLISTED_IPS.has(ip)) {
        console.warn(`Akses diblokir untuk IP ${ip} ke ${req.originalUrl}`);
        return res.status(403).send('Akses ditolak.');
    }
    next();
};

const strictDDoSProtect = (req, res, next) => {
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || '';
    const currentTime = Date.now();

    if (blockedIPs.has(ip)) {
        return res.status(429).send('Terlalu banyak permintaan. IP Anda diblokir sementara.');
    }

    const ipData = requestCounts.get(ip);
    if (ipData && currentTime - ipData.timestamp < 1000) {
        ipData.count++;
        if (ipData.count > STRICT_RATE_LIMIT) {
            console.warn(`Blokir IP ${ip} karena melebihi batas rate limit.`);
            blockedIPs.add(ip);
            return res.status(429).send('Terlalu banyak permintaan. IP Anda diblokir sementara.');
        }
    } else {
        requestCounts.set(ip, { timestamp: currentTime, count: 1 });
    }

    next();
};

const hitDDoSProtect = (req, res, next) => {
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || '';

    ipMap.set(ip, (ipMap.get(ip) || 0) + 1);
    if (ipMap.get(ip) > HIT_RATE_LIMIT) {
        console.warn(`Rate limit terlampaui untuk /hit dari IP ${ip}.`);
        return res.status(429).send('Terlalu banyak permintaan.');
    }

    next();
};

const blockSensitiveFiles = (req, res, next) => {
    if (req.path === '/server.js' || req.path === '/style.css' || req.path === '/script.js') {
        const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || ''.split(',')[0].trim();
        console.warn(`Akses langsung diblokir dan IP diblacklist: ${req.path} dari IP ${ip}`);
        BLACKLISTED_IPS.add(ip);
        return res.status(404).send('Not Found');
    }
    next();
};

app.get('/hit', hitDDoSProtect, (req, res) => {
    totalRequests++;
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress || req.socket.remoteAddress || ''.split(',')[0].trim();
    ipLogs.push({ ip, timestamp: new Date().toISOString() });
    writeIPLogs(ipLogs).catch(console.error);
    res.json({ url: 't.me/sharingscript', message: 'PeeX - Dstat | dstat.peexs.my.id' });
});

app.get('/', blacklistCheck, strictDDoSProtect, (req, res) => {
    res.sendFile(__dirname + '/public/index.html');
});

app.get('/stats', blacklistCheck, strictDDoSProtect, async (req, res) => {
    let mostRequestIP = '';
    let maxRequestCount = 0;
    for (const [ip, count] of ipMap.entries()) {
        if (count > maxRequestCount) {
            maxRequestCount = count;
            mostRequestIP = ip;
        }
    }
    const mostCountry = mostRequestIP ? await getWhoisByIP(mostRequestIP) : 'Unknown';

    const ipCounts = {};
    for (const log of ipLogs) {
        ipCounts[log.ip] = (ipCounts[log.ip] || 0) + 1;
    }

    let mostFrequentIP = '';
    let maxFrequency = 0;
    for (const ip in ipCounts) {
        if (ipCounts[ip] > maxFrequency) {
            maxFrequency = ipCounts[ip];
            mostFrequentIP = ip;
        }
    }
    const whoisMostFrequentIP = mostFrequentIP ? await getWhoisByIP(mostFrequentIP) : 'Unknown';

    const rps = Math.floor(totalRequests / (RESET_INTERVAL / 1000));

    res.json({
        total: totalRequests,
        rps,
        ipCount: ipMap.size,
        mostCountry,
        mostRequestIP,
        whoisMostFrequentIP,
    });
});

app.get('/api/takephoto', (req, res) => {
    const imageUrl = req.query.url;
    if (!imageUrl) {
        return res.status(400).send('Parameter URL tidak ditemukan.');
    }

    fetch(imageUrl)
        .then(response => {
            if (!response.ok) {
                return res.status(response.status).send(`Gagal mengambil gambar: ${response.statusText}`);
            }
            res.setHeader('Content-Type', response.headers.get('Content-Type'));
            response.body.pipe(res);
        })
        .catch(error => {
            console.error('Error saat mengunduh gambar:', error);
            res.status(500).send('Gagal mengunduh gambar.');
        });
});

app.use(blacklistCheck);
app.use(blockSensitiveFiles);

export default async function handler(req, res) {
    await app(req, res);
}
