# ts-lint-gate — tasks

순서: 도구 설치와 설정 → 기존 위반 고침 → gate 단계 → 승격 → 최신 main rebase 뒤 N 확정과 정리. 형식(schema·fixture)과 UI는 없다. 정한 것은 design §10이다.

lint 명령(`npm --prefix app run lint`)은 T0에서 생기고 T3에서 AGENTS.md 'Commands'에 올라간다. 그 전까지 이 명령을 쓰는 검증 줄은 "command undecided — needs user confirmation"으로 적는다. N은 exhaustive-deps 경고의 정확한 수다(design §4 'N 정하기').

## T0. 도구 설치와 설정

- `npm view oxlint version peerDependencies`, `npm view oxlint-tsgolint versions`로 그때 버전을 확인한다. oxlint-tsgolint는 앞부분이 앱의 `typescript` 버전(지금 `7.0.2`)과 같은 것 중 최신이고, oxlint의 peer 범위 안에 들어야 한다(design §3 '버전 짝'). `npm --prefix app install --save-exact oxlint@<v> oxlint-tsgolint@<v>`로 설치한다(AGENTS 'Commands').
- `app/package.json`: devDependency 두 줄과 `scripts.lint`(`oxlint --type-aware --max-warnings N src runtime`) 말고는 원래 서식으로 되돌린다(design §6 4).
- `app/package-lock.json` diff: lint 패키지와 그 플랫폼 바이너리, 그리고 npm 11.17이 더하는 `@tailwindcss/oxide-wasm32-wasi/node_modules/` 아래 5개 항목(design §6 3)은 그대로 둔다. 그 밖의 변화가 있으면 멈추고 보고한다.
- `app/.oxlintrc.json`을 design §4대로 만든다.
- 확인:
  - `npm --prefix app ci` 뒤 `env -u OXLINT_TSGOLINT_PATH npm --prefix app run lint`가 type-aware 규칙(misused 4건)을 보인다(design §9 (a)).
  - 출력의 규칙 이름이 네 개 규칙의 것뿐이고, 테스트 파일이 빠진다.
  - disable 주석: 지금 경고가 나는 줄 하나에 `// eslint-disable-next-line react/exhaustive-deps`와 `// eslint-disable-next-line react-hooks/exhaustive-deps`를 차례로 달아 보고, 경고 수가 하나 주는 이름을 기록한다(T3에서 문서에 적는다). 확인 뒤 주석을 지운다.
  - 경고 수를 세어 N으로 쓴다. design §2(82)와 다르면 차이를 보고한다. N / N-1 확인은 script를 바꾸지 않고 `app/`에서 `npx oxlint --type-aware -A typescript/no-misused-promises --max-warnings <N 또는 N-1> src runtime`으로 직접 돌린다. T1 전에는 misused 4건이 있어 `-A`로 그 규칙만 끄고 본다. scratch에서 `-A typescript/no-misused-promises`와 `--max-warnings 82`는 exit 0, `81`은 exit 1이었다. N이 exit 0, N-1이 exit 1이어야 한다.
- 이 단계의 lint 명령은 misused 4건 때문에 exit 1로 끝난다. T1까지는 이것이 예상한 결과다. gate에는 아직 들어가지 않았다.
- 검증: 위 확인 결과 — lint 명령은 command undecided — needs user confirmation. `npm --prefix app run typecheck`, `npm --prefix app test`, `npm --prefix app run build`가 그대로 통과한다.
- **commit 경계**: `chore(app): add oxlint with four bug-catching rules`

## T1. 기존 오류 고침

- `/tdd`: `main/index.ts` quit 순서 회귀 테스트(`index.test.ts`, `before-quit` emit 구조). 사례: `conversations.quit()`가 성공하고 앞 단계인 `mcp.quit()`가 거절해도 `usage.quit()`와 `agentAuth.quit()`가 불리고, 거절이 기록되고, `app.quit()`가 불린다. onboarding·addPage 중 하나가 거절해도 `app.quit()`가 불린다. 고치기 전에 빨간 것을 본다.
- `/implement`:
  - quit 순서(design §5): 거절하지 않는 `quitInOrder()`와 `setImmediate(() => { void quitInOrder(); })`. `mcp`·`usage`·`agentAuth`를 같은 순서로 하나씩 try/catch해 기록하고 이어 가며, onboarding·addPage는 `Promise.allSettled`로 기다린다. `conversations.quit()` 실패 경로와 마지막 정리는 그대로다.
  - renderer: `Onboarding.tsx`(202줄 부근)와 `SettingsAgents.tsx`(101줄 부근)의 `run` helper에서 `return session.command(provider, command);`를 `void session.command(provider, command);`로 바꾼다. `install()`·`installPage()`가 실패를 스스로 잡는 것은 확인했다(design §5).
- `/runtime-test`(AGENTS 'Workflow'), 격리된 HOME·SHELL·userData:
  - 보통 Quit: 앱이 exit code 0, 신호 없이 끝난다.
  - Settings > Agents: fake `SHELL`의 `PATH`에 `--version`이 읽을 수 없는 값을 찍는 가짜 `claude`를 둔다. Claude Code 행에 "Couldn’t read the Claude Code version" notice와 Retry가 보이고, Retry를 누르면 다시 확인한 뒤 같은 notice가 돌아온다. Terminal 창과 브라우저는 열리지 않는다. Retry는 `check` 명령이라 `run` helper를 거친다. Install과 Sign in은 Terminal이나 브라우저를 열므로 쓰지 않는다.
- 검증: `npm --prefix app test`, `npm --prefix app run typecheck` 통과. lint 명령이 오류 0, 경고 N으로 exit 0 — command undecided — needs user confirmation.
- **commit 경계**: `test: a failed teardown step still quits`, 그다음 `fix: quit goes on when a teardown step rejects`, `fix: renderer auth commands drop their promise explicitly`

## T2. gate 단계

- `/tdd`: `verify.test.mjs` 첫 테스트에 `lint` 단계 단언을 더한다. 하나만 있고, `typecheck` 다음, `app-test` 앞이며, args가 `["--prefix", "app", "run", "lint"]`다. 빨간 것을 본다.
- `/implement`: `verify.mjs` `plan()`에 `npm("lint", ["run", "lint"])`를 `typecheck` 다음에 넣는다(design §4).
- N 다시 확인: T1 뒤라 오류가 없으므로 `-A` 없이 `app/`에서 `npx oxlint --type-aware --max-warnings <N 또는 N-1> src runtime`으로 돌린다. N이 exit 0, N-1이 exit 1이어야 한다. 수가 바뀌었으면 N을 정확한 수로 고친다.
- 검증: `node --test .agents/skills/verify/scripts/verify.test.mjs` 통과. `node .agents/skills/verify/scripts/verify.mjs` exit 0과 `verify: PASS — …, typecheck, lint, app-test, build`.
- **commit 경계**: `test: the shared gate runs the app linter`, 그다음 `feat: run the app linter in the shared gate`

## T3. 승격

- `AGENTS.md` 'Commands': `verify.mjs` 줄의 "app typecheck/tests/build"를 "app typecheck/lint/tests/build"로 고친다. `npm --prefix app run lint` 줄을 더한다(oxlint, 규칙 네 개, 테스트 제외, `--max-warnings` 상한).
- `.agents/skills/verify/SKILL.md` 'Select the checks' Default 목록에 app lint를 더하고, ratchet 규칙을 적는다(design §4 'N 정하기'): 통과하려고 `--max-warnings`를 올리지 않는다. 새 exhaustive-deps 경고는 고치거나 이유를 적은 주석과 함께 disable한다. 경고 수가 N보다 적은 것을 본 사람이 같은 커밋에서 N을 낮춘다. oxlint·oxlint-tsgolint를 올리면 같은 커밋에서 N을 다시 센다. T0에서 확인한 disable 주석의 규칙 이름도 여기나 ARCHITECTURE에 적는다.
- `.agents/skills/design-sync/SKILL.md`: 'Gates' 목록(`npm --prefix app test`, `typecheck`, `build`)에 `npm --prefix app run lint`를 더한다.
- `docs/ARCHITECTURE.md` §7: 'Verification'이나 'Setup'에 lint 한 항목을 둔다. 도구(oxlint + oxlint-tsgolint)와 그 이유(앱이 TypeScript 7이고 typescript-eslint의 peer는 `<6.1.0`), 버전 짝(oxlint-tsgolint 앞부분 = 앱 `typescript` 버전, oxlint와 함께 올림), 규칙 네 개와 범위(`app/src`·`app/runtime`, 테스트 제외), exhaustive-deps 상한. 설정 값은 `app/.oxlintrc.json`과 `app/package.json`을 가리킨다.
- `docs/DIRECTORY.md`: `app/` 항목에 `.oxlintrc.json`(lint 설정)을 적는다.
- `docs/BACKLOG.md`: "A linter in the shared gate …" 줄을 지우고 세 줄을 더한다(사용자 결정). 각 줄은 왜 이번에 뺐는지 적는다:
  - 테스트 파일 lint: floating 858, misused 55, hooks 3건이고, floating의 대부분은 `ReactNode`에 들어 있는 `Promise`와 `node:test` `test(…)`에서 오는 오탐이다.
  - `eval/` lint: `eval/`을 include하는 tsconfig가 없고, scratch tsconfig로 tsc 오류가 110개다. 타입 검사부터 세워야 한다. 테스트 아닌 파일의 misused promise 1건(`eval/lib/socket.ts:530`).
  - `no-unnecessary-condition`: 테스트 아닌 소스 37개 파일에 115건이다. POSTMORTEM 2026-11-06 'Home remembered its choice on every mount'를 잡았을 규칙이다.
- PRODUCT.md는 바꾸지 않는다(제품 판단이 없다).
- 검증: 문서만 바뀌므로 참조를 직접 확인한다. `grep -n "oxlint\|max-warnings" AGENTS.md .agents/skills/verify/SKILL.md .agents/skills/design-sync/SKILL.md docs/ARCHITECTURE.md docs/DIRECTORY.md`에 새 줄이 있고, `grep -n "A linter in the shared gate" docs/BACKLOG.md`가 비어 있다.
- **commit 경계**: 문서마다 따로(`docs(agents): …`, `docs(verify): …`, `docs(design-sync): …`, `docs(architecture): …`, `docs(directory): …`, `docs(backlog): …`)

## T4. 최신 main rebase 뒤 N 확정과 정리

- 최신 main 위로 rebase한다. defect-sweep이 경고가 있는 파일을 고치므로, conductor가 이 rebase에서 다시 센다.
- lint 명령을 다시 돌려 N을 정확한 수로 고친다. `--max-warnings N`이 exit 0, `--max-warnings N-1`이 exit 1인지 다시 본다. 오류가 새로 나오면(rebase로 들어온 코드의 misused·floating·hooks) 고치고 보고한다.
- `docs/features/ts-lint-gate/`를 지운다.
- 검증: `node .agents/skills/verify/scripts/verify.mjs` exit 0과 `verify: PASS`. lint 명령의 N / N-1 확인 — 이 시점에는 T3에서 AGENTS.md 'Commands'에 올라간 `npm --prefix app run lint`를 쓴다.
- **commit 경계**: N이 바뀌면 `chore(app): recount the exhaustive-deps limit after rebase`, 그다음 `docs(feature): remove ts-lint-gate`
