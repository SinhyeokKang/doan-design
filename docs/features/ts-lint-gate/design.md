# ts-lint-gate — design

oxlint와 oxlint-tsgolint(typescript-go 기반 타입 검사)를 `app/` devDependency로 넣고, `app/.oxlintrc.json`에서 규칙 네 개만 켜고, `npm --prefix app run lint`를 `verify.mjs`의 typecheck 다음 단계로 둔다. 도구를 고른 근거는 TypeScript 7이다(§3). 정한 것은 §10에 있다(`/feature-review` 뒤 사용자 승인, 2026-11-07).

## 1. 영향 받는 구성 요소

| 영역 | 파일 | 바뀌는 것 |
|---|---|---|
| app manifest | `app/package.json`, `app/package-lock.json` | devDependency 2개, script `lint` 1개(§6) |
| app 설정 | `app/.oxlintrc.json`(새 파일) | 플러그인, 규칙 네 개, 기본 category 끄기, 테스트 제외(§4) |
| app 소스 | `app/src/main/index.ts`, `app/src/renderer/Onboarding.tsx`, `app/src/renderer/SettingsAgents.tsx` | no-misused-promises 4건 고침(§5) |
| gate | `.agents/skills/verify/scripts/verify.mjs`, `verify.test.mjs` | `plan()`에 `lint` 단계(§4) |
| 스킬·문서 | `.agents/skills/verify/SKILL.md`, `.agents/skills/design-sync/SKILL.md`, `AGENTS.md` 'Commands', `docs/ARCHITECTURE.md` §7, `docs/DIRECTORY.md`의 `app/` 항목, `docs/BACKLOG.md` | 마지막 task에서 지금 규칙으로 고침 |
| CLI(Go), formats, 제품 스킬 stub | — | 바뀌지 않는다 |

## 2. 측정 (2026-11-07, 저장소 밖에서)

방법: 세션 scratch(`/private/tmp/claude-501/…/scratchpad/`)에 `app/src`, `app/runtime`, `app/tsconfig.json`과 tsconfig가 include하는 설정 파일 3개, `eval/`을 복사했다. `app/node_modules`는 저장소 것을 symlink로 읽기만 했다. linter는 scratch의 별도 npm 프로젝트에 설치했다. 저장소에는 아무것도 설치하거나 쓰지 않았다.

- A: oxlint 1.92.0 + oxlint-tsgolint 7.0.2006, `--type-aware`, 규칙 네 개만 켬(§4의 설정).
- B: ESLint 10.14.0 + typescript-eslint 8.72.1 + eslint-plugin-react-hooks 7.1.1 + typescript 6.0.3(별도 설치), `projectService`로 `app/tsconfig.json`을 씀.

`app/src`·`app/runtime`, 테스트 파일(`*.test.ts`, `*.test.tsx`) 제외:

| 규칙 | A oxlint | B ESLint | 위치 |
|---|---|---|---|
| rules-of-hooks | 0 | 0 | — |
| no-floating-promises | 0 | 0 | — |
| no-misused-promises | 4 | 4 | `main/index.ts:1230`, `renderer/Onboarding.tsx:217`, `renderer/SettingsAgents.tsx:128`·`:136` |
| exhaustive-deps | 82 (18 파일) | 86 (18 파일) | 전부 renderer. `App.tsx` 15(B 18), `CanvasConversationPanel.tsx` 12, `HomeComposerView.tsx` 9, `ProjectOverview.tsx` 8, `DockedComposer.tsx` 6 |
| 시간 | 0.8–1.5 s | 측정 안 함 | 테스트 포함 전체로는 A 1.8 s, B 23.8 s |

A의 출력에는 위 두 규칙 말고 다른 규칙 이름이 없었다. 설정 없이 돌리면 oxlint는 기본 category(correctness 등)를 켜서 `unicorn/no-useless-spread` 같은 경고를 낸다. 그래서 설정에서 끈다.

테스트 파일만(A와 B 같은 수): no-floating-promises 858, no-misused-promises 55, rules-of-hooks 3. floating 858건의 대부분은 두 모양이다. 테스트 helper `render(): ReactNode`(React 19 타입의 `ReactNode`에는 `Promise`가 들어 있다)와 `node:test`의 `test(…)` 호출(`app/runtime` 23건)이다. rules-of-hooks 3건은 가짜 hook harness가 hook을 일반 함수에서 부르는 곳이다(`ComposerParts.test.tsx`, `ConversationThread.locate.test.tsx`, `Toast.test.tsx`).

`eval/`(B만, scratch에서 만든 tsconfig): 테스트 아닌 파일에 no-misused-promises 1건(`eval/lib/socket.ts:530`), 테스트에 floating 290건(전부 `test(`)이다. `eval/`을 include하는 tsconfig는 저장소에 없다. scratch tsconfig(NodeNext)로 `tsc`를 돌리면 오류 110개가 나오므로, `eval/`은 지금 어디서도 타입 검사를 받지 않는다. 시나리오 fixture의 `.tsx` 2개는 parse 오류였다.

BACKLOG의 2026-11-05 측정(ESLint 9.39.1, typescript-eslint 8.46.4)은 misused promise 1건, exhaustive-deps 78건이었다. 그 뒤 코드와 도구 버전이 바뀌어 수가 다르다. 경고 수는 merge마다 바뀔 수 있으므로, N은 마지막 rebase 뒤 다시 센다(§4 'N 정하기').

## 3. 도구 선택: TypeScript 7

- 앱은 `typescript` 7.0.2를 쓴다. 이 패키지에는 typescript-eslint가 쓰는 JS compiler API가 없다(`lib/`에 `tsc.js`, `version.cjs`, `getExePath.js`만 있고, export는 `.`와 `./unstable/sync`다).
- typescript-eslint 8.72.1(latest)의 peer는 `typescript >=4.8.4 <6.1.0`이다(`npm view`). `app/package.json`·lock 복사본에 `npm install --package-lock-only`를 해 보면 `ERESOLVE … Found: typescript@7.0.2 … peer typescript@">=4.8.4 <6.1.0"`로 거절된다. B를 쓰려면 TypeScript 6.0.x를 두 번째로 두는 별도 npm 프로젝트가 필요하고, 앱 타입 검사와 lint가 서로 다른 컴파일러로 돈다.
- oxlint-tsgolint는 typescript-go를 쓰고 "targets TypeScript 7"이라고 README에 적혀 있다(설치본 7.0.2006). 같은 복사본에 oxlint 1.92.0과 oxlint-tsgolint 7.0.2006을 넣으면 충돌 없이 설치된다. 두 패키지 모두 MIT다.
- A와 B는 같은 4건을 찾았고, exhaustive-deps는 82건 대 86건으로 거의 같다(§2). 테스트 포함 전체 실행에서 A가 약 13배 빠르다(1.8 s 대 23.8 s).
- oxlint의 규칙 이름은 `react/rules-of-hooks`, `react/exhaustive-deps`, `typescript/no-floating-promises`, `typescript/no-misused-promises`다. 출력에는 `react-hooks(exhaustive-deps)`처럼 나온다. disable 주석을 어느 이름으로 써야 듣는지는 T0에서 정한다(§4 'disable 주석').
- **버전 짝**: tsgolint README 'Versioning': "its versions track the TypeScript release they support. For example, in `v7.0.2001`: `7.0.2` is the TypeScript version, `001` is the `tsgolint` patch version". 그래서 oxlint-tsgolint 버전의 앞부분은 앱의 `typescript` 버전과 같게 둔다(지금 `7.0.2` ↔ `7.0.2006`). oxlint 1.92.0의 peer는 `oxlint-tsgolint >=7.0.2005`(optional)이므로, 둘은 같은 커밋에서 함께 올린다. 앱이 TypeScript를 올리면 그 버전을 앞부분으로 가진 oxlint-tsgolint로 함께 올린다. ARCHITECTURE에 이유와 함께 적는다. 누군가 "ESLint가 표준"이라며 B로 바꾸면 TS 7 peer 충돌을 다시 만나기 때문이다.

## 4. 설정과 gate 단계

`app/.oxlintrc.json`(T0에서 실제 파일로 확정):

```json
{
  "plugins": ["react", "typescript"],
  "categories": { "correctness": "off" },
  "rules": {
    "react/rules-of-hooks": "error",
    "react/exhaustive-deps": "warn",
    "typescript/no-floating-promises": "error",
    "typescript/no-misused-promises": "error"
  },
  "ignorePatterns": ["**/*.test.ts", "**/*.test.tsx"]
}
```

- 설정 파일은 `app/`에 둔다. oxlint는 `ignorePatterns`를 설정 파일 위치 기준으로 읽는다. scratch에서 설정을 다른 폴더에 두었을 때 테스트 제외가 듣지 않았고, `app/`에 두자 들었다. `npm --prefix app run lint`는 cwd가 `app/`이라서 그대로 맞는다.
- 타입 정보: tsgolint가 파일마다 가장 가까운 `tsconfig.json`을 찾는다. `app/src`·`app/runtime`은 `app/tsconfig.json` include 안에 있다. `--tsconfig`는 주지 않는다.
- tsgolint 바이너리: scratch에서는 `app/node_modules`가 symlink라서 oxlint가 tsgolint를 찾지 못해 `OXLINT_TSGOLINT_PATH`를 줬다. 실제 설치에서는 T0이 `npm --prefix app ci` 뒤 `env -u OXLINT_TSGOLINT_PATH npm --prefix app run lint`로 환경 변수 없이 도는지 확인한다.
- script: `"lint": "oxlint --type-aware --max-warnings N src runtime"`. scratch에서 `--max-warnings 82`는 exit 0, `81`은 exit 1이었다.
- gate: `plan()`의 `typecheck` 다음, `app-test` 앞에 `npm("lint", ["run", "lint"])`. 타입 오류가 먼저 보이고, 빠른 lint가 긴 Vitest보다 먼저 실패한다. 완료 표식(`pass`)은 두지 않는다. typecheck처럼 exit code만 본다.
- `verify.test.mjs`: 첫 테스트("static gates include …")에 `lint` 단계가 하나 있고 `typecheck` 다음, `app-test` 앞이며, args가 `["--prefix", "app", "run", "lint"]`라는 단언을 더한다.

### N 정하기 (ratchet)

- N은 exhaustive-deps 경고의 정확한 수다. 여유를 두지 않는다. 확인은 언제나 두 번이다: `--max-warnings N`이 exit 0, `--max-warnings N-1`이 exit 1. 오류 규칙의 위반이 남아 있는 동안(T0)은 둘 다 exit 1이 되므로 `-A typescript/no-misused-promises`로 그 규칙만 끄고 확인한다. scratch에서 이 방법으로 82는 exit 0, 81은 exit 1이었다.
- 정하는 때: T0(설치 직후), T2(gate에 넣을 때), 그리고 마지막 단계인 최신 main rebase 뒤. defect-sweep이 경고가 있는 파일을 고치므로, conductor가 그 rebase에서 다시 센다.
- 지키는 규칙(T3에서 verify 스킬에 적는다):
  - 통과하려고 N을 올리지 않는다.
  - 새 exhaustive-deps 경고는 고치거나, 왜 뺐는지 적은 주석과 함께 disable한다.
  - 경고 수가 N보다 적은 것을 본 사람이 같은 커밋에서 N을 낮춘다.
  - oxlint나 oxlint-tsgolint를 올리면 같은 커밋에서 N을 다시 센다.

### disable 주석

oxlint 바이너리에는 `eslint-disable`과 `oxlint-disable` 문자열이 둘 다 있지만, 규칙 이름을 `react/exhaustive-deps`로 써야 하는지 `react-hooks/exhaustive-deps`로 써야 하는지는 확인하지 않았다. T0이 지금 경고가 나는 줄 하나에 두 이름을 차례로 달아 보고, 경고 수가 하나 주는 이름을 기록한다. T3은 그 이름을 ARCHITECTURE §7이나 verify 스킬에 적는다.

## 5. 기존 위반 처리

오류 규칙의 4건은 gate를 켜기 전에 고친다.

- **renderer 3건** (`SettingsAgents.tsx:128`·`:136`, `Onboarding.tsx:217`): `run(provider)`가 `session.command(…)`의 `Promise<void> | void`를 돌려주고, 이것이 void를 기대하는 `onClick`·`run` prop으로 간다. Promise를 돌려주는 경우는 `agentStep.ts`의 `install()`·`installPage()`뿐이고, 둘 다 실패를 스스로 잡는다(확인함, `agentStep.ts` 188–200줄 부근: `openInstall(…).catch((): InstallResult => "failed")`, `openInstallPage(…).catch(() => false)`, 그 뒤 `settleInstall`). 그래서 `void`가 거절을 숨기지 않는다. 고치는 곳은 파일마다 `run` helper 한 곳이다(`Onboarding.tsx` 205줄 부근, `SettingsAgents.tsx` 101줄 부근): `return session.command(provider, command);`를 `void session.command(provider, command);`로 바꾸고, helper의 반환형이 void가 된다.
- **main 1건** (`index.ts:1230`): quit 순서의 `setImmediate(async () => …)`. 지금은 `conversations.quit()`만 try 안에 있고, 그 뒤의 `mcp.quit()`, `usage.quit()`, `agentAuth.quit()`, `Promise.all([onboarding.quit(), addPage.quit()])`가 거절하면 처리하는 곳이 없어 `app.quit()`에 닿지 않는다. 각 `quit()`는 대기에 상한을 두지만(`QUIT_WAIT_MS`) 거절하지 않는다는 보장은 코드에 없다. 고친 모양:
  - 거절하지 않는 함수 `quitInOrder()`를 두고, 부르는 쪽은 `setImmediate(() => { void quitInOrder(); })`로 쓴다. async 함수를 `setImmediate`에 바로 넘기면 no-misused-promises가 여전히 걸린다.
  - `conversations.quit()` 실패 경로는 그대로다(quit을 멈추고 onboarding·addPage를 다시 열고 기록).
  - 그 뒤 단계는 같은 순서로 하나씩 따로 잡는다: `mcp`, `usage`, `agentAuth` 각각 try/catch로 감싸 거절을 기록하고 다음 단계로 간다. onboarding·addPage는 `Promise.all` 대신 `Promise.allSettled`로 기다리고 거절된 것을 기록한다. 마지막의 `quitting = true; … app.quit();`는 그대로다.
  - 순서는 바꾸지 않는다. 각 단계의 주석(MCP 시도는 agent sign-in 앞, usage read도 그 앞, agentAuth는 대화 뒤)이 그 이유다.
- exhaustive-deps 82건은 그대로 두고 N으로 묶는다(§4 'N 정하기').

## 6. manifest·설정 변경 (AGENTS.md 'Decision sources': 요청 없이 깔지 않는 것)

이 feature가 그 요청이다. 바뀌는 것은 아래가 전부다.

1. `app/package.json` `devDependencies`: `oxlint`, `oxlint-tsgolint`를 정확한 버전으로 추가한다(`app/.npmrc` `save-exact=true`, ARCHITECTURE §7 'Setup'). 측정한 버전은 oxlint 1.92.0(2026-11-06 게시), oxlint-tsgolint 7.0.2006(2026-11-05 게시)이다. oxlint는 거의 매주 나오므로, T0에서 `npm view`로 그때 버전을 확인해 고정한다. oxlint-tsgolint는 앞부분이 앱의 `typescript` 버전(지금 `7.0.2`)과 같은 것 중 최신을 고르고, oxlint의 peer 범위 안에 드는지 확인한다(§3 '버전 짝').
2. `app/package.json` `scripts`: `lint` 하나.
3. `app/package-lock.json`: 위 두 패키지와 플랫폼별 optional 바이너리(`@oxlint/binding-*` 19개, `@oxlint-tsgolint/*` 6개). scratch dry-run에서 npm 11.17이 `@tailwindcss/oxide-wasm32-wasi/node_modules/` 아래 5개 항목(`@emnapi/core`, `@emnapi/runtime`, `@emnapi/wasi-threads`, `@napi-rs/wasm-runtime`, `@tybys/wasm-util`)도 더했다. 이 5개는 그대로 둔다. 이 밖의 변화가 있으면 멈추고 원인을 보고한다.
4. `app/package.json` 서식: `npm install`은 한 줄 배열·객체(`protocols`, `asarUnpack`, `dmg.contents`)를 여러 줄로 다시 쓴다(dry-run에서 확인). 패키지 두 줄과 script 한 줄 말고는 원래 서식으로 되돌린다.
5. 새 파일 `app/.oxlintrc.json`.
6. `tsconfig`, `electron.vite.config.ts`, `vitest.config.ts`, electron-builder 설정(`build`)은 바꾸지 않는다. electron-builder는 devDependency를 패키지에 넣지 않는다.

## 7. 순수 함수로 뺄 부분

- `verify.mjs`의 `plan(flags)`는 이미 순수 함수다. `/tdd` 대상: lint 단계의 존재, 위치, args(§4).
- `main/index.ts`의 `quitInOrder()`(§5): `index.test.ts`가 `app`을 mock하고 `before-quit`을 emit하는 구조라서, 그 구조로 회귀 테스트를 쓴다. 사례: 앞 단계(`mcp.quit()`)가 거절해도 `agentAuth.quit()`가 불리고, 거절이 기록되고, `app.quit()`가 불린다. 더 뽑아낼 필요는 `/tdd`가 이 테스트를 쓸 수 없을 때만 다시 본다.
- 나머지는 도구 설정이라 순수 함수가 없다. lint 명령 자체가 검증이다.

## 8. 형식·규약·결정 영향

- **형식 변경**: 없다. JSON Schema, CLI 응답, `runtime.json`, socket 메시지 모두 그대로다.
- **규약 영향**: ARCHITECTURE §1 'Conventions'와 `doan check` 규칙은 그대로다.
- **결정 영향**: ARCHITECTURE §7 'Setup'의 "devDependencies are pinned exactly"를 지킨다. 같은 절의 "dependencies are not added without a request"(Home tests without a DOM)는 이 feature가 요청이다. §7 'Verification'은 AGENTS 'Workflow'를 따르므로, lint 단계는 정적 gate의 한 줄로 들어가고 e2e 정책은 바뀌지 않는다. `/agent-eval` 대상(guide, CLI 출력, `doan check`, stub)은 건드리지 않는다.

## 9. PoC 의존성과 POSTMORTEM

- **PoC**: §2의 scratch 측정이 PoC 역할을 했다. 남은 가정 두 가지는 T0에서 먼저 확인한다. (a) `npm --prefix app ci` 뒤 tsgolint 바이너리를 환경 변수 없이 찾는다(`env -u OXLINT_TSGOLINT_PATH npm --prefix app run lint`). (b) disable 주석이 어느 규칙 이름으로 듣는다(§4).
- **POSTMORTEM 인용**:
  - 2026-10-23 'Comment copy reported success before the clipboard committed': "A callback that returned a Promise still satisfied the void callback type." 이 feature의 직접 동기다. no-misused-promises가 같은 모양을 오류로 만든다.
  - 2026-10-25 'Navigation feedback read the previous React snapshot'과 그 Recurrence(2026-10-26): render ref와 effect 순서 때문에 이전 상태를 읽은 버그다. exhaustive-deps는 ref와 commit 순서를 보지 않으므로 이 버그를 잡았으리라고 단정할 수 없다. 동기로 쓰지 않는다.
  - 2026-11-06 'Home remembered its choice on every mount': 네 규칙으로는 잡히지 않는다(`no-unnecessary-condition` 몫, BACKLOG로).
  - 2026-10-27 'Awaited conversation work outlived its current turn', 2026-10-23 'A utility-process kill request left its caller pending': await 앞뒤의 상태 검사와 settle 경로 문제라서, Promise를 버렸느냐를 보는 규칙으로는 잡히지 않는다.

## 10. 정한 것

1. **도구**: oxlint + oxlint-tsgolint를 `app/` devDependency로 둔다. 앱과 같은 TypeScript 7 계열로 돌고, `app/`에 충돌 없이 들어가며, 같은 4건을 찾고 약 13배 빠르다. 버린 것: ESLint를 TypeScript 6과 함께 별도 패키지 디렉터리에 두기(두 번째 컴파일러와 lock), `overrides`나 `--legacy-peer-deps`로 peer 충돌 덮기(지원하지 않는 TS 버전에서 typescript-eslint를 돌림).
2. **검사할 디렉터리**: `app/src`(main, preload, renderer, formats, comments, brand, restore)와 `app/runtime`. 둘 다 `app/tsconfig.json` 안에 있어 타입 정보가 이미 있다. `eval/`은 tsconfig가 없고 tsc 오류가 110개라서, 넣으려면 타입 검사부터 세워야 한다. BACKLOG에 남긴다(`eval/lib/socket.ts:530`의 misused promise 1건 포함).
3. **테스트 파일**: 뺀다. floating 858건의 대부분이 `ReactNode`에 들어 있는 `Promise`와 `node:test`의 `test(…)`에서 오는 오탐이라, 켜면 수백 줄에 `void`를 붙이게 된다. BACKLOG에 남긴다.
4. **오류 규칙의 기존 위반(misused 4건)**: gate를 켜기 전에 고친다(§5). 4건뿐이고, 그중 quit 순서는 실제로 처리되지 않는 거절이다.
5. **exhaustive-deps**: warn + `--max-warnings N`(§4 'N 정하기'). 새 코드는 깨끗하게, 기존 것은 파일을 고칠 때 정리한다는 BACKLOG의 방향을 gate가 실제로 지키게 한다. 한계: 수만 세므로 하나를 고치고 하나를 새로 만들면 통과한다. 그래서 줄어든 수를 본 사람이 N을 낮추는 규칙을 둔다. 버린 것: 상한 없는 warn(새 경고를 막지 못함), error로 82건 먼저 고치기(effect 실행 시점을 한꺼번에 바꿈), error로 82건에 disable 주석(18개 파일에 주석 82개).
6. **quit 순서의 거절**: 단계마다 거절을 기록하고 다음 단계와 `app.quit()`까지 간다(§5). 사람이 고른 것은 종료다. 대화 기록은 이미 저장된 뒤이고 나머지는 상한이 있는 정리라서, 하나가 거절했다고 앱이 멈춘 채 남는 것이 지금 동작에서 가장 나쁜 결과다. `agentAuth.quit()`는 credential write-back을 하므로 거절을 기록해 원인을 남긴다.
7. **gate에서 도는 방식**: `verify.mjs` 기본 실행에 넣는다. 측정상 2초 안쪽이고, 플래그로 빼면 `/ship`·`/orchestrate`가 켜는 것을 잊는 순간 gate가 없는 것과 같다.
