const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');

function boolEnv(name, fallback = false) {
  const raw = String(process.env[name] ?? '').trim().toLowerCase();
  if (!raw) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(raw);
}

function connectionOptions() {
  const url = String(process.env.MYSQL_URL || '').trim();
  let base = {};
  if (url) {
    const parsed = new URL(url);
    if (parsed.protocol !== 'mysql:' && parsed.protocol !== 'mariadb:') {
      throw new Error('MYSQL_URL doit commencer par mysql:// ou mariadb://');
    }
    base = {
      host: parsed.hostname,
      port: Number(parsed.port || 3306),
      user: decodeURIComponent(parsed.username || ''),
      password: decodeURIComponent(parsed.password || ''),
      database: decodeURIComponent(parsed.pathname.replace(/^\//, '')),
    };
  } else {
    base = {
      host: String(process.env.MYSQL_HOST || '').trim(),
      port: Number(process.env.MYSQL_PORT || 3306),
      user: String(process.env.MYSQL_USER || '').trim(),
      password: String(process.env.MYSQL_PASSWORD || ''),
      database: String(process.env.MYSQL_DATABASE || '').trim(),
    };
  }

  if (!base.host || !base.user || !base.database) {
    throw new Error('MySQL non configuré. Renseigne MYSQL_URL ou MYSQL_HOST/MYSQL_USER/MYSQL_PASSWORD/MYSQL_DATABASE.');
  }

  const sslEnabled = boolEnv('MYSQL_SSL', false);
  if (sslEnabled) {
    const caInline = String(process.env.MYSQL_SSL_CA || '').trim().replace(/\\n/g, '\n');
    const caPath = String(process.env.MYSQL_SSL_CA_PATH || '').trim();
    const ca = caInline || (caPath ? fs.readFileSync(caPath, 'utf8') : undefined);
    base.ssl = {
      rejectUnauthorized: boolEnv('MYSQL_SSL_REJECT_UNAUTHORIZED', Boolean(ca)),
      ...(ca ? { ca } : {}),
    };
  }

  return {
    ...base,
    waitForConnections: true,
    connectionLimit: Math.max(2, Number(process.env.MYSQL_POOL_SIZE || 8)),
    queueLimit: 0,
    charset: 'utf8mb4',
    timezone: 'Z',
    dateStrings: false,
    supportBigNumbers: true,
    bigNumberStrings: false,
  };
}

const rawPool = mysql.createPool(connectionOptions());

function pgPlaceholdersToMysql(text, params = []) {
  const ordered = [];
  const sql = String(text).replace(/\$(\d+)/g, (_all, n) => {
    const index = Number(n) - 1;
    if (index < 0 || index >= params.length) throw new Error(`Paramètre SQL $${n} manquant.`);
    ordered.push(params[index]);
    return '?';
  });
  return { sql, params: ordered };
}

function normalizeResult(rows) {
  if (Array.isArray(rows)) return { rows, rowCount: rows.length };
  const rowCount = Number(rows?.affectedRows || 0);
  return {
    rows: [],
    rowCount,
    affectedRows: rowCount,
    insertId: rows?.insertId ?? null,
    changedRows: Number(rows?.changedRows || 0),
  };
}

async function executeOn(connection, text, params = []) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return { rows: [], rowCount: 0 };
  if (/^BEGIN$/i.test(trimmed)) { await connection.beginTransaction(); return { rows: [], rowCount: 0 }; }
  if (/^COMMIT$/i.test(trimmed)) { await connection.commit(); return { rows: [], rowCount: 0 }; }
  if (/^ROLLBACK$/i.test(trimmed)) { await connection.rollback(); return { rows: [], rowCount: 0 }; }

  const converted = pgPlaceholdersToMysql(trimmed, params);
  const [rows] = await connection.execute(converted.sql, converted.params);
  return normalizeResult(rows);
}

async function query(text, params = []) {
  return executeOn(rawPool, text, params);
}

const pool = {
  async connect() {
    const connection = await rawPool.getConnection();
    return {
      query: (text, params = []) => executeOn(connection, text, params),
      release: () => connection.release(),
    };
  },
  async end() { await rawPool.end(); },
};

function splitSqlStatements(source) {
  // Supprime les commentaires SQL sur ligne entière avant de parser les quotes.
  // Sinon une apostrophe dans un commentaire (ex: d'éviter) peut être prise
  // pour le début d'une chaîne et empêcher de séparer les requêtes suivantes.
  const input = String(source).replace(/^\s*--.*$/gm, '');

  const statements = [];
  let current = '';
  let quote = null;
  let escaped = false;
  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i];
    if (escaped) { current += ch; escaped = false; continue; }
    if (quote && ch === '\\') { current += ch; escaped = true; continue; }
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === '\'' || ch === '"' || ch === '`') { quote = ch; current += ch; continue; }
    if (ch === ';') {
      const statement = current.trim();
      if (statement) statements.push(statement);
      current = '';
      continue;
    }
    current += ch;
  }
  const tail = current.trim();
  if (tail) statements.push(tail);
  return statements;
}

async function initDatabase() {
  await query('SELECT 1 AS ok');
  const schemaPath = path.join(__dirname, '..', 'database', 'schema.mysql.sql');
  const schema = fs.readFileSync(schemaPath, 'utf8');
  for (const statement of splitSqlStatements(schema)) {
    if (statement) await rawPool.query(statement);
  }
  console.log('[database] MySQL/MariaDB connecté et schéma vérifié.');
}

module.exports = { pool, query, initDatabase, rawPool };
