# Native UI testing without the interactive browser

Use local Maestro for the Expo/React Native UI. It operates on native accessibility elements and supports React Native/Expo Go; stable testIDs are preferred to label matching. Official reference: [React Native and Expo Go](https://docs.maestro.dev/get-started/supported-platform/react-native).

Testing/User/login.maestro.yaml, Testing/Agent/login.maestro.yaml and Testing/Admin/login.maestro.yaml prepare separate development login/home smoke flows. Login inputs, role-fill buttons and submit now expose stable testIDs. These flows have not run on a device and may need first-launch Expo prompt handling when validated. Start signed out of Anandhi Stores on each target device; the flow deliberately does not wipe the entire Expo Go container. They cover login/home only; cases.json and ui-actions.json describe the rest of each role's device checks. Do not represent the prepared flows as full native coverage.

## One device or three

A single physical Android phone can execute role journeys sequentially. For simultaneous native sessions use three phones/emulators, with one role per device; three tabs on the same Expo Go installation are not independent role sessions. The service tests already exercise three roles through separate isolated local processes, but that does not prove a native three-device UI interaction.

From a shell where the Maestro executable and Android device tools work, with Metro already serving the SDK-58 app:

~~~sh
node Testing/Native/run.cjs --role User --device <user-device-serial> --url exp://<computer-lan-ip>:8081
node Testing/Native/run.cjs --role Agent --device <agent-device-serial> --url exp://<computer-lan-ip>:8081
node Testing/Native/run.cjs --role Admin --device <admin-device-serial> --url exp://<computer-lan-ip>:8081
~~~

Run those in three terminals with three distinct devices if you want simultaneous role homes. Set MAESTRO_BIN in the launching shell if the executable is not on PATH; TEST_APP_ID defaults to the Android Expo Go container host.exp.exponent. The prepared flows assume demo login is enabled and compatible Expo Go is installed. They do not create accounts or reveal PINs in YAML. Use an appropriate supported Maestro/Android setup on Windows; no device tooling was installed in this task.

[Device targeting](https://docs.maestro.dev/maestro-flows/flow-control-and-logic/specify-and-start-devices) and [artifacts](https://docs.maestro.dev/maestro-flows/workspace-management/test-reports-and-artifacts) describe the CLI flags used by the launcher. Native output goes under .verify/tests/native/.

Keep live global mutations coordinated: testing reset/block, QR default or store closure on one role can invalidate another role's current screen. Confirm these are expected effects; do not blindly run conflicting destructive scenarios in parallel. Use a shared run/order ID to correlate all three views and compare every stage with the stage-effects report.

## Playwright alternative

If web testing is allowed later, headless Playwright with three BrowserContexts is the lightweight option for three simultaneous isolated web role sessions. Separate contexts isolate local storage/cookies; three pages in one context do not. [Playwright isolation](https://playwright.dev/docs/browser-contexts) documents multiple contexts in one scenario.

Playwright still uses a browser engine and does not prove native photo permissions, push delivery, safe areas, hardware back/keyboard or phone/map intents. The owner requested no browser testing in this pass, so no Playwright browser was launched or represented as tested. Native execution was explicitly deferred by the owner.
