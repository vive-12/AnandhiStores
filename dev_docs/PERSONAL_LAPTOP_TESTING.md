# Run the phone tests on the personal laptop

The tests are files in the project. They do not need Codex to run. Antigravity can run them on the personal laptop where the phone can be connected.

Use the open-source local Maestro CLI, licensed under [Apache 2.0](https://github.com/mobile-dev-inc/Maestro/blob/main/LICENSE). This setup does not require Maestro Cloud or a paid testing subscription.

## Handoff

1. Pull the latest main branch from vive-12/AnandhiStores on the personal laptop. Confirm the checkout contains the root Testing/User, Testing/Agent and Testing/Admin folders before running tests.
2. Keep the root .env private and transfer it separately using a private method. Do not put it in GitHub or paste its secrets into chat.
3. Ask Antigravity to read dev_docs/TESTING.md, dev_docs/TESTING_NATIVE.md and Testing/User, Testing/Agent and Testing/Admin. It should first check the laptop OS, phone OS and supported local device setup.
4. Start with one phone and test the User, Agent and Admin one after another. Three phones are needed only for simultaneous native sessions.
5. Bring back the test reports and failures. Another assistant can use those results to fix the same project.

## Prompt for Antigravity

~~~text
Read dev_docs/TESTING.md, dev_docs/TESTING_NATIVE.md and dev_docs/PERSONAL_LAPTOP_TESTING.md. Use only open-source local testing tools, without paid/cloud test services. Inspect the laptop and phone operating systems before setting up Maestro. Keep root .env private and never print credentials. Run the local tests first. Then validate the prepared User/Agent/Admin native login flows on my connected phone and work through the role cases and UI inventories. Test roles sequentially on this single phone. Check effects in all roles at every order stage, including revenue, COD/UPI, customer spending, product rankings, agent work and can recovery. Label all live test data; restore temporary credentials/settings; leave orders for later cleanup. Do not claim native cases passed without device evidence. Agent earned delivery fees are a pending task AGENT-MONEY-01, separate from cash collected; do not mark that missing feature as passed. Save reports and list failures/pending cases.
~~~
