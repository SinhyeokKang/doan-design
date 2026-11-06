# ts-lint-gate — spec

앱 TypeScript에 버그를 잡는 linter를 붙이고, 공유 검증 gate(`node .agents/skills/verify/scripts/verify.mjs`)의 한 단계로 돌린다. 규칙은 네 개뿐이다: rules-of-hooks, exhaustive-deps, no-floating-promises, no-misused-promises. 스타일 규칙과 formatter는 넣지 않는다. 출처는 `docs/BACKLOG.md` 'Undecided'의 "A linter in the shared gate for the app's TypeScript" 항목이다.

## 사용자

- **에이전트(개발 세션)**: `/verify`·`/ship`·`/orchestrate`를 돌리는 Claude Code·Codex 세션이다. 이 gate가 Promise 처리 누락과 hook 규칙 위반을 커밋 전에 실패로 보인다. 같은 검사를 손으로 돌리는 명령도 하나 생긴다.
- **사람(개발자)**: 같은 gate를 손으로 돌리는 저장소 소유자다. 앱을 쓰는 사람에게는 바뀌는 것이 없다. linter는 devDependency라서 패키지된 앱에 들어가지 않는다(`app/package.json` `build.files`는 `out/**/*`와 `package.json`만 담는다).

## 문제 (관찰된 사실)

- 저장소에 lint 설정이 없다. `app/`과 루트에 `eslint.config.*`·`.eslintrc*`·`.oxlintrc.json`·`biome.json`이 없고, `app/package.json` scripts에 lint가 없다. gate는 `tsc --noEmit`, Vitest, build, Go test·vet만 돌린다(`verify.mjs` `plan()`).
- `tsc`는 Promise를 돌려주는 callback을 void 자리에 넘겨도 통과시킨다. 이 때문에 생긴 버그가 이미 있다. POSTMORTEM 2026-10-23 'Comment copy reported success before the clipboard committed': Electron 45의 `clipboard.writeText`는 Promise인데 service 의존성이 void로 타입 지정되어 await 없이 불렸고, 거절된 쓰기가 `copied:true`를 돌려줬다. "A callback that returned a Promise still satisfied the void callback type." 이것이 no-misused-promises(`checksVoidReturn`)가 잡는 모양이다.
- 지금 코드에도 같은 모양이 있다. 2026-11-07 측정(design §2)에서 테스트를 뺀 소스에 no-misused-promises 4건이 나왔다: `app/src/main/index.ts:1195`(quit 순서의 `setImmediate(async …)`, try 밖의 `await`가 거절되면 처리하는 곳이 없다), `app/src/renderer/Onboarding.tsx:214`, `app/src/renderer/SettingsAgents.tsx:128`·`:136`(`session.command`의 Promise를 void prop에 넘김).
- exhaustive-deps 경고는 renderer 18개 파일에 82건이다(`App.tsx` 15, `CanvasConversationPanel.tsx` 12, `HomeComposerView.tsx` 9, `ProjectOverview.tsx` 8). BACKLOG의 2026-11-05 측정은 대부분이 일부러 뺀 의존성이나 복잡한 식이라고 적었다. 고치면 effect가 다시 도는 시점이 바뀌므로 한 번에 고치지 않는다.
- 앱의 TypeScript는 7.0.2(`app/package.json` devDependencies)다. 2026-11-07 기준 typescript-eslint 8.72.1의 peer는 `typescript >=4.8.4 <6.1.0`이라서, `app/`에 그대로 설치하면 npm이 `ERESOLVE`로 거절한다(design §3). BACKLOG가 적은 ESLint 조합은 이 저장소에 그대로 들어가지 않는다.

## 완료 조건

1. 새 lint 명령(`app/package.json` script 하나, design §4)이 `app/src`와 `app/runtime`의 테스트가 아닌 `.ts`·`.tsx`를 `app/tsconfig.json`의 타입 정보로 검사하고, 켜진 규칙은 네 개뿐이다. 출력에 다른 규칙 이름이 나오지 않는다.
2. rules-of-hooks, no-floating-promises, no-misused-promises 위반이 하나라도 있으면 명령이 0이 아닌 코드로 끝난다.
3. exhaustive-deps는 결정 5에 따라 다룬다. 권고안이면 경고 수가 기록된 상한을 넘을 때 명령이 실패하고, 상한 이하면 통과한다.
4. design §2의 no-misused-promises 4건이 고쳐져 명령이 오류 0으로 끝난다. quit 순서의 거절 처리는 결정 6을 따르고 회귀 테스트가 있다.
5. `verify.mjs`의 기본 실행(결정 7)에 lint 단계가 있고, lint가 실패하면 gate가 그 단계에서 멈춘다. `verify.test.mjs`가 단계의 존재와 순서를 고정한다.
6. 기존 gate 단계(typecheck, app-test, build, Go)의 결과가 바뀌지 않는다. `npm --prefix app ci` 뒤 별도 설치 없이 lint가 돈다.
7. AGENTS.md 'Commands', verify 스킬, ARCHITECTURE §7이 lint 명령과 도구 선택 이유를 지금 규칙으로 적고, BACKLOG의 해당 줄이 지워진다.

## 비목표

- formatter와 스타일 규칙. formatter는 대부분의 줄을 다시 쓴다(BACKLOG).
- 네 개 밖의 규칙. 예: `no-unnecessary-condition`은 POSTMORTEM 2026-11-06 'Home remembered its choice on every mount'(`Provider | null`을 `!== undefined`와 비교)을 잡았을 규칙이지만, 2026-11-07 측정에서 테스트 아닌 소스 37개 파일에 115건이 나왔다. 이번에는 넣지 않고 측정값만 남긴다.
- 테스트 파일 검사(결정 3), `eval/` 검사(결정 2).
- exhaustive-deps 82건 일괄 정리. 파일을 고칠 때 그 파일의 것을 정리한다.
- Go linter(golangci-lint 등), CI, 편집기 연동, pre-commit hook.
- `app/tsconfig.json`의 include나 컴파일 옵션 변경.
