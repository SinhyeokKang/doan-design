# ts-lint-gate — design

권고안은 oxlint와 oxlint-tsgolint(typescript-go 기반 타입 검사)를 `app/` devDependency로 넣고, `app/.oxlintrc.json`에서 규칙 네 개만 켜고, `npm --prefix app run lint`를 `verify.mjs`의 typecheck 다음 단계로 둔다. 도구를 고르는 근거는 TypeScript 7이다(§3). 열린 선택은 §10 '결정할 점'에 있다.

## 1. 영향 받는 구성 요소

| 영역 | 파일 | 바뀌는 것 |
|---|---|---|
| app manifest | `app/package.json`, `app/package-lock.json` | devDependency 2개, script `lint` 1개(§6) |
| app 설정 | `app/.oxlintrc.json`(새 파일) | 플러그인, 규칙 네 개, 기본 category 끄기, 테스트 제외(§4) |
| app 소스 | `app/src/main/index.ts`, `app/src/renderer/Onboarding.tsx`, `app/src/renderer/SettingsAgents.tsx` | no-misused-promises 4건 고침(§5) |
| gate | `.agents/skills/verify/scripts/verify.mjs`, `verify.test.mjs` | `plan()`에 `lint` 단계(§4) |
| 스킬·문서 | `.agents/skills/verify/SKILL.md`, `AGENTS.md` 'Commands', `docs/ARCHITECTURE.md` §7, `docs/DIRECTORY.md`의 `app/` 항목, `docs/BACKLOG.md` | 마지막 task에서 지금 규칙으로 고침 |
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
| no-misused-promises | 4 | 4 | `main/index.ts:1195`, `renderer/Onboarding.tsx:214`, `renderer/SettingsAgents.tsx:128`·`:136` |
| exhaustive-deps | 82 (18 파일) | 86 (18 파일) | 전부 renderer. `App.tsx` 15(B 18), `CanvasConversationPanel.tsx` 12, `HomeComposerView.tsx` 9, `ProjectOverview.tsx` 8, `DockedComposer.tsx` 6 |
| 시간 | 0.8–1.5 s | 측정 안 함 | 테스트 포함 전체로는 A 1.8 s, B 23.8 s |

A의 출력에는 위 두 규칙 말고 다른 규칙 이름이 없었다. 설정 없이 돌리면 oxlint는 기본 category(correctness 등)를 켜서 `unicorn/no-useless-spread` 같은 경고를 낸다. 그래서 설정에서 끈다.

테스트 파일만(A와 B 같은 수): no-floating-promises 858, no-misused-promises 55, rules-of-hooks 3. floating 858건의 대부분은 두 모양이다. 테스트 helper `render(): ReactNode`(React 19 타입의 `ReactNode`에는 `Promise`가 들어 있다)와 `node:test`의 `test(…)` 호출(`app/runtime` 23건)이다. rules-of-hooks 3건은 가짜 hook harness가 hook을 일반 함수에서 부르는 곳이다(`ComposerParts.test.tsx`, `ConversationThread.locate.test.tsx`, `Toast.test.tsx`).

`eval/`(B만, scratch에서 만든 tsconfig): 테스트 아닌 파일에 no-misused-promises 1건(`eval/lib/socket.ts:530`), 테스트에 floating 290건(전부 `test(`)이다. `eval/`을 include하는 tsconfig는 저장소에 없다. scratch tsconfig(NodeNext)로 `tsc`를 돌리면 오류 110개가 나오므로, `eval/`은 지금 어디서도 타입 검사를 받지 않는다. 시나리오 fixture의 `.tsx` 2개는 parse 오류였다.

BACKLOG의 2026-11-05 측정(ESLint 9.39.1, typescript-eslint 8.46.4)은 misused promise 1건, exhaustive-deps 78건이었다. 그 뒤 코드와 도구 버전이 바뀌어 수가 다르다.

## 3. 도구 선택: TypeScript 7

- 앱은 `typescript` 7.0.2를 쓴다. 이 패키지에는 typescript-eslint가 쓰는 JS compiler API가 없다(`lib/`에 `tsc.js`, `version.cjs`, `getExePath.js`만 있고, export는 `.`와 `./unstable/sync`다).
- typescript-eslint 8.72.1(latest)의 peer는 `typescript >=4.8.4 <6.1.0`이다(`npm view`). `app/package.json`·lock 복사본에 `npm install --package-lock-only`를 해 보면 `ERESOLVE … Found: typescript@7.0.2 … peer typescript@">=4.8.4 <6.1.0"`로 거절된다. B를 쓰려면 TypeScript 6.0.x를 두 번째로 두는 별도 npm 프로젝트(자기 `package.json`·lock)가 필요하고, 앱 타입 검사와 lint가 서로 다른 컴파일러로 돈다.
- oxlint-tsgolint는 typescript-go를 쓰고 "targets TypeScript 7"이라고 README에 적혀 있다(설치본 7.0.2006). 같은 복사본에 oxlint 1.92.0과 oxlint-tsgolint 7.0.2006을 넣으면 충돌 없이 설치된다. 두 패키지 모두 MIT다.
- A와 B는 같은 4건을 찾았고, exhaustive-deps는 82건 대 86건으로 거의 같다(§2). 테스트 포함 전체 실행에서 A가 약 13배 빠르다(1.8 s 대 23.8 s).
- oxlint의 규칙 이름은 `react/rules-of-hooks`, `react/exhaustive-deps`, `typescript/no-floating-promises`, `typescript/no-misused-promises`다. 출력에는 `react-hooks(exhaustive-deps)`처럼 나온다. disable 주석은 `eslint-disable`과 `oxlint-disable`을 둘 다 읽는다(바이너리 문자열로 확인. 실제 동작은 T0에서 확인한다).
- 제약: tsgolint는 자기 typescript-go를 내장하므로, 앱의 `typescript` 버전과 따로 움직인다. 앱이 TypeScript를 올리면 oxlint-tsgolint도 같은 7.x 대로 올린다. ARCHITECTURE에 이유와 함께 적는다. 누군가 "ESLint가 표준"이라며 B로 바꾸면 TS 7 peer 충돌을 다시 만나기 때문이다.

## 4. 설정과 gate 단계

`app/.oxlintrc.json`(권고안 기준. T0에서 실제 파일로 확정):

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
- script: `"lint": "oxlint --type-aware --max-warnings 82 src runtime"`(82는 결정 5 권고안. T0에서 다시 센 값으로 정한다). scratch에서 `--max-warnings 82`는 exit 0, `81`은 exit 1이었다.
- gate: `plan()`의 `typecheck` 다음, `app-test` 앞에 `npm("lint", ["run", "lint"])`. 타입 오류가 먼저 보이고, 빠른 lint가 긴 Vitest보다 먼저 실패한다. 완료 표식(`pass`)은 두지 않는다. typecheck처럼 exit code만 본다.
- `verify.test.mjs`: 첫 테스트("static gates include …")에 `lint` 단계가 하나 있고 `typecheck` 다음, `app-test` 앞이며, args가 `["--prefix", "app", "run", "lint"]`라는 단언을 더한다.

## 5. 기존 위반 처리

- 오류 규칙의 4건은 gate를 켜기 전에 고친다(결정 4 권고안).
  - `renderer/SettingsAgents.tsx:128`·`:136`, `renderer/Onboarding.tsx:214`: `run(provider)`가 `session.command(…)`의 `Promise<void> | void`를 돌려주고, 이것이 void를 기대하는 `onClick`·`run` prop으로 간다. `agentStep.ts`의 주석대로 Install·Update·Open install page만 Promise를 돌려주며, 이는 호출자가 결과를 기다릴 수 있게 하려는 것이다. UI 쪽에서는 `void`로 버린다는 것을 드러낸다. 고치기 전에 `install`·`installPage`가 스스로 거절을 처리하는지 확인한다. 처리하지 않으면 `void`는 거절을 숨기므로 거기서 멈추고 보고한다.
  - `main/index.ts:1195`: quit 순서의 `setImmediate(async () => …)`. `conversations.quit()`만 try 안에 있고, 그 뒤의 `mcp.quit()`, `usage.quit()`, `agentAuth.quit()`, `onboarding/addPage.quit()`가 거절하면 처리하는 곳이 없어 `app.quit()`에 닿지 않는다. 각 `quit()`는 대기에 상한을 두지만(`QUIT_WAIT_MS`) 거절하지 않는다는 보장은 코드에 없다. 처리 방식은 결정 6이다.
- exhaustive-deps 82건은 그대로 둔다(결정 5). 파일을 고치는 변경이 그 파일의 경고를 줄이면 같은 커밋에서 `--max-warnings` 값을 낮춘다. 이 절차는 verify 스킬에 적는다.

## 6. manifest·설정 변경 (AGENTS.md 'Decision sources': 요청 없이 깔지 않는 것)

이 feature가 그 요청이다. 바뀌는 것은 아래가 전부다.

1. `app/package.json` `devDependencies`: `oxlint`, `oxlint-tsgolint`를 정확한 버전으로 추가한다(`app/.npmrc` `save-exact=true`, ARCHITECTURE §7 'Setup'). 측정한 버전은 oxlint 1.92.0(2026-11-06 게시), oxlint-tsgolint 7.0.2006(2026-11-05 게시)이다. oxlint는 거의 매주 나오므로, T0에서 `npm view`로 그때 버전을 확인해 고정하고 §2의 수를 다시 센다. 결정 1이 B면 이 항목은 `eslint`, `typescript-eslint`, `eslint-plugin-react-hooks`와 두 번째 TypeScript를 담는 별도 패키지 디렉터리로 바뀐다.
2. `app/package.json` `scripts`: `lint` 하나.
3. `app/package-lock.json`: 위 두 패키지와 플랫폼별 optional 바이너리(`@oxlint/binding-*` 19개, `@oxlint-tsgolint/*` 6개). scratch dry-run에서 npm 11.17이 lock에 관계없는 `@tailwindcss/oxide-wasm32-wasi/node_modules/@emnapi/*` 등 5개 항목도 더했다. T0에서 lock diff를 확인하고, lint 패키지 밖의 변화가 있으면 원인을 보고한다.
4. `app/package.json` 서식: `npm install`은 한 줄 배열·객체(`protocols`, `asarUnpack`, `dmg.contents`)를 여러 줄로 다시 쓴다(dry-run에서 확인). 패키지 두 줄과 script 한 줄 말고는 원래 서식으로 되돌린다.
5. 새 파일 `app/.oxlintrc.json`.
6. `tsconfig`, `electron.vite.config.ts`, `vitest.config.ts`, electron-builder 설정(`build`)은 바꾸지 않는다. devDependency는 패키지된 앱에 들어가지 않는다.

## 7. 순수 함수로 뺄 부분

- `verify.mjs`의 `plan(flags)`는 이미 순수 함수다. `/tdd` 대상: lint 단계의 존재, 위치, args(§4).
- `main/index.ts` quit 순서: 결정 6에 따라 거절 처리를 넣으면, 기존 `index.test.ts`가 quit 순서를 어떻게 다루는지 보고 "뒤쪽 teardown 하나가 거절해도 결정된 결과(권고안: 기록하고 `app.quit()`)에 닿는다"를 회귀 테스트로 고정한다. 순서를 함수로 뽑을지는 `/tdd`가 그 테스트 구조를 보고 정한다. 구조를 바꾸지 않고 테스트할 수 있으면 뽑지 않는다.
- 나머지는 도구 설정이라 순수 함수가 없다. lint 명령 자체가 검증이다.

## 8. 형식·규약·결정 영향

- **형식 변경**: 없다. JSON Schema, CLI 응답, `runtime.json`, socket 메시지 모두 그대로다.
- **규약 영향**: ARCHITECTURE §1 'Conventions'와 `doan check` 규칙은 그대로다.
- **결정 영향**: ARCHITECTURE §7 'Setup'의 "devDependencies are pinned exactly"를 지킨다. 같은 절의 "dependencies are not added without a request"(Home tests without a DOM)는 이 feature가 요청이다. §7 'Verification'은 AGENTS 'Workflow'를 따르므로, lint 단계는 정적 gate의 한 줄로 들어가고 e2e 정책은 바뀌지 않는다. `/agent-eval` 대상(guide, CLI 출력, `doan check`, stub)은 건드리지 않는다.

## 9. PoC 의존성과 POSTMORTEM

- **PoC**: §2의 scratch 측정이 PoC 역할을 했다. 남은 가정은 두 가지다. (a) `npm --prefix app ci` 뒤 tsgolint 바이너리를 별도 설정 없이 찾는다. scratch에서는 `app/node_modules`가 symlink였고 oxlint가 그 안에서 tsgolint를 찾지 못해 `OXLINT_TSGOLINT_PATH`를 줬다. 실제로 `app/node_modules`에 설치하면 찾을 것으로 예상하지만 확인하지 않았다. (b) disable 주석이 동작한다. 둘 다 T0에서 먼저 확인한다.
- **POSTMORTEM 인용**:
  - 2026-10-23 'Comment copy reported success before the clipboard committed': "A callback that returned a Promise still satisfied the void callback type." 이 feature의 직접 동기다. no-misused-promises가 같은 모양을 오류로 만든다.
  - 2026-10-25 'Navigation feedback read the previous React snapshot'과 그 Recurrence(2026-10-26): render ref와 effect 순서 때문에 이전 상태를 읽은 버그다. exhaustive-deps는 ref와 commit 순서를 보지 않으므로 이 버그를 잡았으리라고 단정할 수 없다. 동기로 쓰지 않는다.
  - 2026-11-06 'Home remembered its choice on every mount': 네 규칙으로는 잡히지 않는다(`no-unnecessary-condition` 몫, spec 비목표).
  - 2026-10-27 'Awaited conversation work outlived its current turn', 2026-10-23 'A utility-process kill request left its caller pending': await 앞뒤의 상태 검사와 settle 경로 문제라서, Promise를 버렸느냐를 보는 규칙으로는 잡히지 않는다.

## 10. 결정 (사용자, 2026-11-07: 일곱 개 모두 권고안)

1. **도구**
   - (a) oxlint + oxlint-tsgolint를 `app/` devDependency로.
   - (b) ESLint + typescript-eslint + eslint-plugin-react-hooks를, TypeScript 6.0.x를 따로 담은 별도 패키지 디렉터리에(예: `app/lint/`, 자기 lock).
   - (c) (b)를 `app/`에 넣고 npm `overrides`나 `--legacy-peer-deps`로 peer 충돌을 덮기.
   - 결정: (a). 앱과 같은 TypeScript 7 계열로 돌고, `app/`에 충돌 없이 들어가며, 같은 4건을 찾고 약 13배 빠르다. (b)는 두 번째 컴파일러와 lock을 하나 더 관리하고, (c)는 지원하지 않는 TS 버전에서 typescript-eslint를 돌린다.
2. **검사할 디렉터리**
   - (a) `app/src`(main, preload, renderer, formats, comments, brand, restore) + `app/runtime`.
   - (b) (a) + `eval/`.
   - (c) `app/src/renderer`만.
   - 결정: (a). 둘 다 `app/tsconfig.json` 안에 있어 타입 정보가 이미 있다. `eval/`은 tsconfig가 없고 지금 tsc 오류가 110개라서, 넣으려면 타입 검사부터 세워야 하는 별도 작업이다. 그래서 BACKLOG에 남긴다. `eval/lib/socket.ts:530`의 misused promise 1건도 BACKLOG 줄에 적는다.
3. **테스트 파일**
   - (a) 뺀다.
   - (b) 넣고 floating 858·misused 55·hooks 3을 정리한다.
   - (c) 테스트에는 no-misused-promises만 켠다.
   - 결정: (a). 858건의 대부분이 `ReactNode`에 들어 있는 `Promise`와 `node:test`의 `test(…)`에서 오는 오탐이라, 켜면 수백 줄에 `void`를 붙이게 된다. 테스트의 버그는 테스트가 빨개지는 것으로 드러난다.
4. **오류 규칙의 기존 위반(misused 4건)**
   - (a) gate를 켜기 전에 고친다.
   - (b) disable 주석으로 남기고 나중에 고친다.
   - (c) no-misused-promises를 warn으로 시작한다.
   - 결정: (a). 4건뿐이고, 그중 quit 순서는 실제로 처리되지 않는 거절이다.
5. **exhaustive-deps 수준**
   - (a) warn + `--max-warnings <현재 수>`(ratchet): 새 경고가 생기면 gate가 실패하고, 줄이면 같은 커밋에서 수를 낮춘다.
   - (b) warn만 두고 상한 없음: gate는 실패하지 않고 log에만 남는다.
   - (c) error로 하고 82건을 먼저 고친다.
   - (d) error로 하고 82건에 disable 주석을 단다.
   - 결정: (a). BACKLOG가 바란 "새 코드는 깨끗하게, 기존 것은 파일을 고칠 때"를 gate가 실제로 지키게 하는 가장 작은 방법이다. (b)는 새 경고를 막지 못한다. (c)는 effect 실행 시점을 한꺼번에 바꾼다. (d)는 18개 파일에 주석 82개를 단다. 한계: 수만 세므로 하나를 고치고 하나를 새로 만들면 통과한다. 수를 낮추지 않으면 그만큼 여유가 생긴다.
6. **quit 순서의 거절(`main/index.ts:1195`)**
   - (a) 뒤쪽 teardown의 거절을 기록하고 quit을 이어 간다(`app.quit()`까지).
   - (b) `conversations.quit()` 실패처럼 quit을 멈추고 창을 다시 연다.
   - (c) `void`로 감싸고 지금 동작을 그대로 둔다.
   - 결정: (a). 사람이 고른 것은 종료다. 대화 기록은 이미 저장된 뒤이고 나머지는 상한이 있는 정리라서, 하나가 거절했다고 앱이 멈춘 채 남는 것은 지금 동작에서 가장 나쁜 결과다. 다만 `agentAuth.quit()`는 credential write-back을 하므로, 거절을 기록해 원인을 남긴다. (c)는 거절을 계속 숨긴다.
7. **gate에서 도는 방식**
   - (a) `verify.mjs` 기본 실행에 넣는다.
   - (b) `--lint` 플래그를 줄 때만 돈다.
   - 결정: (a). 측정상 2초 안쪽이고, 플래그로 빼면 `/ship`·`/orchestrate`가 켜는 것을 잊는 순간 gate가 없는 것과 같다.
