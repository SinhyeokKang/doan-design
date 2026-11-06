# ts-lint-gate — tasks

순서: 도구 설치와 설정 → 기존 위반 고침 → gate 단계 → 승격. 형식(schema·fixture)과 UI는 없다. 아래는 design §10의 권고안 기준이고, 결정이 다르면 해당 task를 고친다.

lint 명령(`npm --prefix app run lint`)은 T0에서 생기고 T3에서 AGENTS.md 'Commands'에 올라간다. 그 전까지 이 명령을 쓰는 검증 줄은 "command undecided — needs user confirmation"으로 적는다.

## T0. 도구 설치와 설정

- `npm view oxlint version`, `npm view oxlint-tsgolint version`으로 그때 버전을 확인하고, `npm --prefix app install --save-exact oxlint@<v> oxlint-tsgolint@<v>`로 설치한다(AGENTS 'Commands').
- `app/package.json`: devDependency 두 줄과 `scripts.lint`(`oxlint --type-aware --max-warnings <N> src runtime`) 말고는 원래 서식으로 되돌린다(design §6 4).
- `app/package-lock.json` diff에 lint 패키지와 그 플랫폼 바이너리만 있는지 본다. 관계없는 항목이 바뀌었으면 멈추고 보고한다(design §6 3).
- `app/.oxlintrc.json`을 design §4대로 만든다.
- 확인: `OXLINT_TSGOLINT_PATH` 없이 type-aware 규칙이 돈다(design §9 (a)). 출력의 규칙 이름이 네 개뿐이다. 테스트 파일이 빠진다. `// eslint-disable-next-line react-hooks/exhaustive-deps`를 임시로 한 줄에 달면 경고가 하나 준다(확인 뒤 지운다). 오류 4건과 경고 수를 다시 세어 design §2와 다르면 그 수를 `<N>`으로 쓰고 차이를 보고한다.
- 검증: `npm --prefix app ci` 뒤 lint 명령이 misused 4건으로 실패하고, 경고 수가 `<N>`이다 — lint 명령은 command undecided — needs user confirmation. `npm --prefix app run typecheck`, `npm --prefix app test`, `npm --prefix app run build`가 그대로 통과한다.
- **commit 경계**: `chore(app): add oxlint with four bug-catching rules`

## T1. 기존 오류 고침

- `/tdd`: `main/index.ts` quit 순서 회귀 테스트(`index.test.ts`). `before-quit` 뒤 `conversations.quit()`가 성공하고 뒤쪽 teardown 하나(`agentAuth.quit()` 등)가 거절해도 오류가 기록되고 `app.quit()`가 불린다(결정 6 (a)). 고치기 전에 빨간 것을 본다.
- `/implement`:
  - quit 순서: 뒤쪽 teardown의 거절을 잡아 기록하고 이어 간다. 순서와 `conversations.quit()` 실패 경로는 그대로다.
  - `SettingsAgents.tsx:128`·`:136`, `Onboarding.tsx:214`: 먼저 `agentStep.ts`의 `install`·`installPage`가 거절을 스스로 처리하는지 확인한다. 처리하면 UI 호출 쪽에서 `void`로 버린다. 처리하지 않으면 고치지 말고 보고한다(design §5).
- `/runtime-test`(AGENTS 'Workflow'): 격리된 앱에서 보통 Quit이 exit code 0으로 끝나고, Settings > Agents의 버튼 하나가 지금처럼 동작한다.
- 검증: `npm --prefix app test`, `npm --prefix app run typecheck` 통과. lint 명령이 오류 0, 경고 `<N>` 이하로 exit 0 — command undecided — needs user confirmation.
- **commit 경계**: `test: a failed teardown step still quits`, 그다음 `fix: quit goes on when a teardown step rejects`(void 처리를 같은 커밋에 넣을지는 `/ship` 단위에서 정한다)

## T2. gate 단계

- `/tdd`: `verify.test.mjs` 첫 테스트에 `lint` 단계 단언을 더한다. 하나만 있고, `typecheck` 다음, `app-test` 앞이며, args가 `["--prefix", "app", "run", "lint"]`다. 빨간 것을 본다.
- `/implement`: `verify.mjs` `plan()`에 `npm("lint", ["run", "lint"])`를 `typecheck` 다음에 넣는다(design §4).
- 검증: `node --test .agents/skills/verify/scripts/verify.test.mjs` 통과. `node .agents/skills/verify/scripts/verify.mjs` exit 0과 `verify: PASS — …, typecheck, lint, app-test, build`.
- **commit 경계**: `test: the shared gate runs the app linter`, 그다음 `feat: run the app linter in the shared gate`

## T3. 승격과 정리

- `AGENTS.md` 'Commands': `verify.mjs` 줄의 "app typecheck/tests/build"를 "app typecheck/lint/tests/build"로 고친다. `npm --prefix app run lint` 줄을 더한다(oxlint, 규칙 네 개, 테스트 제외, `--max-warnings` 상한).
- `.agents/skills/verify/SKILL.md` 'Select the checks' Default 목록에 app lint를 더하고, exhaustive-deps 경고를 줄인 변경은 같은 커밋에서 `--max-warnings`를 낮춘다는 절차를 적는다.
- `docs/ARCHITECTURE.md` §7: 'Verification'이나 'Setup'에 lint 한 항목을 둔다. 도구(oxlint + oxlint-tsgolint)와 그 이유(앱이 TypeScript 7이고 typescript-eslint의 peer는 `<6.1.0`), tsgolint를 앱 TypeScript와 같은 7.x 대로 올린다는 제약, 규칙 네 개와 범위(`app/src`·`app/runtime`, 테스트 제외), exhaustive-deps 상한. 설정 값은 `app/.oxlintrc.json`과 `app/package.json`을 가리킨다.
- `docs/DIRECTORY.md`: `app/` 항목의 "build and test configuration"을 "build, test and lint configuration"으로 고친다.
- `docs/BACKLOG.md`: "A linter in the shared gate …" 줄을 지운다. 결정 2 (a)면 `eval/`의 타입 검사·lint(tsconfig 없음, scratch tsc 오류 110개, `eval/lib/socket.ts:530` misused promise 1건)를 새 줄로 남긴다. 테스트 파일 lint(결정 3)와 `no-unnecessary-condition`(115건, POSTMORTEM 2026-11-06)도 남길지는 그때 사용자에게 묻는다.
- PRODUCT.md는 바꾸지 않는다(제품 판단이 없다).
- `docs/features/ts-lint-gate/`를 지운다.
- 검증: 문서만 바뀌므로 링크와 참조를 직접 확인한다. `grep -n "lint" AGENTS.md .agents/skills/verify/SKILL.md docs/ARCHITECTURE.md`에 새 줄이 있고, `grep -n "A linter in the shared gate" docs/BACKLOG.md`가 비어 있다.
- **commit 경계**: 문서마다 따로(`docs(agents): …`, `docs(verify): …`, `docs(architecture): …`, `docs(directory): …`, `docs(backlog): …`, `docs(feature): remove ts-lint-gate`)
