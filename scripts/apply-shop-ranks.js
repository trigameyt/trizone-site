'use strict';

const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, '..', 'server.js');
const wantedLine = "const PAID_RANK_ORDER = ['default_plus', 'vip', 'vip_plus', 'hero', 'emperor'];";
const rankLinePattern = /const\s+PAID_RANK_ORDER\s*=\s*\[[^\]]*\]\s*;/;

if (!fs.existsSync(serverPath)) {
  console.error('[Trizone Stripe] server.js introuvable : ' + serverPath);
  process.exit(1);
}

const source = fs.readFileSync(serverPath, 'utf8');
const match = source.match(rankLinePattern);

if (!match) {
  console.error('[Trizone Stripe] Impossible de trouver PAID_RANK_ORDER dans server.js.');
  process.exit(1);
}

if (match[0] === wantedLine) {
  console.log('[Trizone Stripe] Grades boutique déjà configurés.');
  process.exit(0);
}

const updated = source.replace(rankLinePattern, wantedLine);
fs.writeFileSync(serverPath, updated, 'utf8');

console.log('[Trizone Stripe] Grades boutique configurés : default_plus > vip > vip_plus > hero > emperor');
