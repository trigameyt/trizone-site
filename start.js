'use strict';

/*
 * Trizone VIP rank migration bootstrap.
 *
 * Ce fichier est exécuté AVANT server.js.
 * Il corrige automatiquement l'ancien système
 * copper/iron/gold/diamond/netherite sans devoir remplacer
 * tout le gros server.js à la main.
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const SERVER_FILE = path.join(ROOT, 'server.js');
const PUBLIC_DIR = path.join(ROOT, 'public');

const NEW_RANK_LINE =
  "const PAID_RANK_ORDER = ['default_plus', 'vip', 'vip_plus', 'hero', 'emperor'];";

function patchServer() {
  if (!fs.existsSync(SERVER_FILE)) {
    throw new Error(`server.js introuvable : ${SERVER_FILE}`);
  }

  let source = fs.readFileSync(SERVER_FILE, 'utf8');

  const paidRankRegex =
    /const\s+PAID_RANK_ORDER\s*=\s*\[[\s\S]*?\]\s*;/m;

  if (!paidRankRegex.test(source)) {
    throw new Error('PAID_RANK_ORDER introuvable dans server.js.');
  }

  const oldSource = source;
  source = source.replace(paidRankRegex, NEW_RANK_LINE);

  if (source !== oldSource) {
    fs.writeFileSync(SERVER_FILE, source, 'utf8');
    console.log('[Trizone VIP Fix] server.js corrigé : Default+ > VIP > VIP+ > Hero > Emperor');
  } else {
    console.log('[Trizone VIP Fix] server.js déjà configuré avec les nouveaux grades.');
  }
}

function patchPublicTextFile(filePath) {
  let source;
  try {
    source = fs.readFileSync(filePath, 'utf8');
  } catch {
    return;
  }

  const original = source;

  // Texte exact visible dans la page Compte.
  source = source.replaceAll(
    'Copper, Iron, Gold, Diamond et Netherite',
    'Default+, VIP, VIP+, Hero et Emperor'
  );

  // Variantes possibles du texte.
  source = source.replaceAll(
    'Copper / Iron / Gold / Diamond / Netherite',
    'Default+ / VIP / VIP+ / Hero / Emperor'
  );

  if (source !== original) {
    fs.writeFileSync(filePath, source, 'utf8');
    console.log(`[Trizone VIP Fix] texte boutique corrigé : ${path.relative(ROOT, filePath)}`);
  }
}

function walkAndPatchPublic(dir) {
  if (!fs.existsSync(dir)) return;

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walkAndPatchPublic(full);
      continue;
    }

    if (/\.(html|js|css|json|txt)$/i.test(entry.name)) {
      patchPublicTextFile(full);
    }
  }
}

function checkEnvironment() {
  const required = [
    'DISCORD_ROLE_DEFAULT_PLUS_ID',
    'DISCORD_ROLE_VIP_ID',
    'DISCORD_ROLE_VIP_PLUS_ID',
    'DISCORD_ROLE_HERO_ID',
    'DISCORD_ROLE_EMPEROR_ID',
    'STRIPE_PRICE_DEFAULT_PLUS_ID',
    'STRIPE_PRICE_VIP_ID',
    'STRIPE_PRICE_VIP_PLUS_ID',
    'STRIPE_PRICE_HERO_ID',
    'STRIPE_PRICE_EMPEROR_ID',
  ];

  const missing = required.filter((key) => !String(process.env[key] || '').trim());

  if (missing.length) {
    console.warn(
      '[Trizone VIP Fix] Variables Render manquantes : ' + missing.join(', ')
    );
  } else {
    console.log('[Trizone VIP Fix] Les 10 variables grades Stripe/Discord sont présentes.');
  }
}

try {
  patchServer();
  walkAndPatchPublic(PUBLIC_DIR);
  checkEnvironment();
} catch (error) {
  console.error('[Trizone VIP Fix] ERREUR :', error);
  process.exit(1);
}

// Charge le serveur Trizone seulement APRES les corrections.
require('./server.js');
