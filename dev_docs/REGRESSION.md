# Testing setup

The entire setup now lives in the repository-root Testing/ folder. This supersedes earlier mobile/tests/regression paths. See [TESTING.md](TESTING.md) for the runbook, [TEST_ACTIONS.md](TEST_ACTIONS.md) for every source-derived UI handler and [TESTING_NATIVE.md](TESTING_NATIVE.md) for native execution options.

| Folder | Contents |
| --- | --- |
| Testing/User/ | User executable tests, eight workflow cases, 149 role-specific UI actions, native login smoke |
| Testing/Agent/ | Agent executable tests, eight workflow cases, 130 role-specific UI actions, native login smoke |
| Testing/Admin/ | Admin executable tests, fifteen workflow cases, 321 role-specific UI actions, native login smoke |
| Testing/Integration/ | Order lifecycle, account effects, before/after financial checkpoints, actual client probe, live development flow and optional Auth smoke |
| Testing/Shared/ | Common fixtures/adapters, actual-screen calculation reader, source inventory, evidence gate and utilities |
| Testing/Native/ | Device CLI launcher; device execution deferred by owner |

There are 432 unique UI handler sites. Shared controls are listed once per relevant role, producing 600 role-context action rows plus 31 workflow rows: 631 UI checklist entries. These are inventory/checklist counts, not executed-button claims.

Current verified local run: 312 assertions and TypeScript passed (10/10 checks). Actual Firebase client profile/PIN reads passed for the three configured identities. The last development service flow passed 50 assertions and retained labelled test orders; it used privileged IAM and does not establish native UI or client-rule correctness.

Native tests have not been executed. The three Maestro flows are login/home smoke preparations, not full automation of all 631 UI rows. The per-role cases and interactive checklist define the remaining exhaustive device work. Missing/stale/pending evidence causes the full pre-build gate to fail.
