const fs = require('node:fs');
const path = require('node:path');

function readLocalEnv() {
  const file = path.resolve(__dirname, '..', '.env');
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch { return {}; }
  return Object.fromEntries(text.split(/\r?\n/).flatMap(line => {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match) return [];
    return [[match[1], match[2].replace(/^(?:"([\s\S]*)"|'([\s\S]*)')$/, (_, doubleQuoted, singleQuoted) => doubleQuoted ?? singleQuoted ?? '')]];
  }));
}

const env = { ...readLocalEnv(), ...process.env };
const isDevelopment = process.env.NODE_ENV === 'development';
const demoCredentials = isDevelopment && env.ENABLE_DEMO_LOGIN === 'true' ? {
  enabled: true,
  admin: { phone: env.ADMIN_PHONE || '', pin: env.ADMIN_PIN || '' },
  customer: { phone: env.CUSTOMER_PHONE || '', pin: env.CUSTOMER_PIN || '' },
  agent: { phone: env.AGENT_PHONE || '', pin: env.AGENT_PIN || '', name: 'Smallvivek' },
} : { enabled: false };

module.exports = ({ config }) => ({
  ...config,
  extra: { ...config.extra, demoCredentials },
});
