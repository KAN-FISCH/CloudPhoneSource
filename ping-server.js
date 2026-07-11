const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const port = 3001;

// Path ke sertifikat SSL Resmi Let's Encrypt
const DOMAIN = 'ping.nsphone.space';
const privateKeyPath = `/etc/letsencrypt/live/${DOMAIN}/privkey.pem`;
const certificatePath = `/etc/letsencrypt/live/${DOMAIN}/fullchain.pem`;

let isHttps = false;
let credentials = {};

try {
    credentials = {
        key: fs.readFileSync(privateKeyPath, 'utf8'),
        cert: fs.readFileSync(certificatePath, 'utf8')
    };
    isHttps = true;
    console.log("✅ Sertifikat SSL (Self-Signed) ditemukan. Menjalankan server dalam mode HTTPS.");
} catch (e) {
    console.log("⚠️ Sertifikat SSL tidak ditemukan. Menjalankan server dalam mode HTTP polos.");
}

const requestHandler = (req, res) => {
    // Rute khusus untuk mengukur ping
    if (req.url && req.url.startsWith('/api/ping')) {
        if (res.socket) res.socket.setNoDelay(true);

        // CORS
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', '*');

        if (req.method === 'OPTIONS') {
            res.writeHead(204);
            res.end();
            return;
        }

        res.writeHead(req.method === 'HEAD' ? 204 : 200, {
            'Content-Type': 'application/json',
            'Connection': 'keep-alive',
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'X-Content-Type-Options': 'nosniff'
        });

        res.end(req.method === 'HEAD' ? undefined : '{"status":"ok"}');
        return;
    }

    res.writeHead(404);
    res.end('Not Found');
};

const server = isHttps
    ? https.createServer(credentials, requestHandler)
    : http.createServer(requestHandler);

server.on('connection', (socket) => {
    socket.setNoDelay(true);
});

server.listen(port, '0.0.0.0', () => {
    console.log(`🚀 Server Ping API berjalan di ${isHttps ? 'https' : 'http'}://0.0.0.0:${port}`);
    console.log(`Pastikan port ${port} sudah di-allow pada Firewall / Security Group di server 156.230.188.72`);
});
