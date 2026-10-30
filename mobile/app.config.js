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
const demoCredentials = {
  enabled: env.EXPO_PUBLIC_DEMO_MODE !== 'false',
  admin: { phone: env.ADMIN_PHONE || '9003115101', name: 'Vivek', pin: env.ADMIN_PIN || '1234' },
  customer: { phone: env.CUSTOMER_PHONE || '9003115106', name: 'Shivani', pin: env.CUSTOMER_PIN || '1211' },
  agent: { phone: env.AGENT_PHONE || '9940405016', pin: env.AGENT_PIN || '1211', name: 'Suresh' },
};

module.exports = ({ config }) => ({
  ...config,
  extra: { ...config.extra, demoCredentials },
});
