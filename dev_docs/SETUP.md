# Local setup

The repository root .env is the only local environment file. The tracked root .env.example documents its keys with private values left empty. The app directory is mobile/; backend code is functions/; documentation is dev_docs/; all tests are in the root Testing/ folder.

## Environment

On a fresh checkout, copy .env.example to .env and fill the required local values. Never overwrite an existing populated .env. The three development accounts use ADMIN_*, CUSTOMER_* and AGENT_* phone, PIN, name and user-ID values. EXPO_PUBLIC_DEMO_MODE controls the app's demo-login display; the production EAS profile sets it false.

Expo account credentials and cloud tokens stay private in this same file. Only EXPO_PUBLIC_* values and explicitly selected demo credentials may enter an app bundle. Do not put server tokens in Expo extra or give them EXPO_PUBLIC_ names. The app configuration selects demo fields explicitly.

mobile/app.config.js reads the root .env for the named development logins. To make public Firebase environment overrides available to Metro as well, run Expo with Node's environment-file option from mobile/:

~~~sh
node --env-file=../.env node_modules/expo/bin/cli start --go --lan --port 8081
~~~

Scan the generated QR in Expo Go on the same Wi-Fi. Restart Expo after changing .env. Saved Expo login state is managed by Expo CLI in the user's Expo directory; it is separate from the project's .env.

## Checks

From mobile/, run npm test (or npm run test:all) for the single regression runner: User/Agent/Admin checks, lifecycle/account effects, actual screen financial calculations, utilities, action inventory and TypeScript. npm run test:auth:live is a separate opt-in command that contacts Firebase; see [REGRESSION.md](REGRESSION.md).

## Backend maintenance

From functions/, npm run grant-admin-claim -- <admin-phone> and npm run data:reset:plan load ../.env through Node's environment-file option. Both scripts require Google Application Default Credentials; FIREBASE_TOKEN is a Firebase CLI refresh token and is not an ADC service-account file. Setting GOOGLE_APPLICATION_CREDENTIALS to a valid local service-account JSON path is one ADC option. No maintenance command deploys rules/functions automatically.

Root .env is local configuration, not an automatic source of deployed Cloud Functions environment variables. Deployed values require a deliberate Firebase deployment/configuration step. Keep ENABLE_BACKGROUND_PUSH false until that deployment is reviewed.
