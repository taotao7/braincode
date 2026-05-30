# Login Validation Demo

This demo shows Braincode's safe review patch loop on a small TS/Bun/React fixture.

The fixture starts with a missing validation bug: blank email or password values are sent to the authenticator. The benchmark and demo prompt ask Braincode to add validation, run focused checks, and report the review decision.

## Files

- `project/` - the intentionally incomplete demo app.
- `project/src/login.ts` - the helper Braincode should patch.
- `project/src/LoginForm.tsx` - a minimal React form that uses the helper.
- `project/src/login.bench.ts` - failing regression tests before the patch.
- `project/.braincode/checks.json` - focused check policy for the demo.
- `prompt.txt` - the prompt used in the demo run.
- `expected-final.patch` - the expected shape of the final patch.
- `demo.cast` - an asciinema terminal recording transcript.

## Run The Demo

From the repository root:

```sh
cd examples/login-validation-demo/project
bun install
bun test ./src/login.bench.ts
braincode run --yes "$(cat ../prompt.txt)"
bun test ./src/login.bench.ts
```

For local source checkout testing without a globally installed `braincode` binary:

```sh
cd examples/login-validation-demo/project
bun ../../../apps/cli/src/index.ts run --yes "$(cat ../prompt.txt)"
```

The real run requires a configured provider key. Without a provider, return to the repository root and use the offline execution benchmark to see the same patch/check/review metrics:

```sh
cd ../../..
bun run braincode -- benchmark --execute --task login-validation
```

Expected benchmark shape:

```text
Braincode execution benchmark
Mode: offline mock executor

login-validation       PASSED changed=src/login.ts +5 -1 checks=passed review=approved

Summary: 1/1 tasks passed; 0 failed.
```

## What To Look For

The important signal is not just that the code changes. The report should show:

- routeBrain selected a coding role and support/review workers.
- the patch changed `src/login.ts`.
- checks passed.
- review returned `approved`.
- the final report records all of those facts separately from model prose.
