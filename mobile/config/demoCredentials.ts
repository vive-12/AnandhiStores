import Constants from 'expo-constants';

export type DemoRole = 'admin' | 'customer' | 'agent';
export type DemoCredential = { phone: string; pin: string; name?: string };
type DemoConfig = { enabled?: boolean } & Partial<Record<DemoRole, DemoCredential>>;

const DEFAULT_CREDENTIALS: DemoConfig = {
  enabled: true,
  admin: { phone: '9003115101', name: 'Vivek', pin: '1234' },
  customer: { phone: '9003115106', name: 'Shivani', pin: '1211' },
  agent: { phone: '9940405016', pin: '1211', name: 'Suresh' },
};

const config = {
  ...DEFAULT_CREDENTIALS,
  ...(Constants.expoConfig?.extra?.demoCredentials ?? {}),
} as DemoConfig;

export function getDemoCredentials(): Array<{ role: DemoRole; credential: DemoCredential }> {
  if (config.enabled === false) return [];
  return (['admin', 'customer', 'agent'] as const)
    .map(role => ({ role, credential: config[role] }))
    .filter((entry): entry is { role: DemoRole; credential: DemoCredential } =>
      Boolean(entry.credential?.phone && entry.credential?.pin),
    );
}

export function isDemoCredential(phone: string, pin: string): boolean {
  return getDemoCredentials().some(({ credential }) =>
    credential.phone.replace(/\D/g, '').slice(-10) === phone && credential.pin === pin,
  );
}

export function getDemoAgentName(): string | undefined {
  return getDemoCredentials().find(entry => entry.role === 'agent')?.credential.name;
}
