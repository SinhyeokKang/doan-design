# 주석 정리 — design

## 영향 범위

- **app (Electron + TS)**: `app/src/**`(main, preload, renderer, formats, restore, brand), `app/runtime/`, `app/scripts/`, `app/electron.vite.config.ts`의 `.ts`, `.tsx`, `.mjs`, `.js`, `.css`. 테스트 파일 포함.
- **CLI (Go)**: `cli/**`의 `.go`(테스트 포함), `cli/internal/export/viewer/`의 손으로 쓴 `.js`와 `.css`.
- **eval**: `eval/run.ts`, `eval/lib/`, `eval/scenarios/<id>/`의 코드(`checks.ts` 등). 테스트 포함.
- **스킬 스크립트**: `.agents/skills/*/scripts/`의 코드(`verify.mjs`와 그 테스트).
- **문서**: ARCHITECTURE.md는 옮겨 오는 이유가 있을 때만 바뀐다. PRODUCT.md는 바뀌지 않는다.
- **포맷**: 바뀌지 않는다. 앱 소켓 메시지, CLI 응답, `runtime.json`, `.doan/config.json`, `sessions.v1` 모두 그대로다.

### 제외(생성 파일과 데이터)

- `cli/internal/export/viewer/inspect.js`, `inspectPanel.js`, `viewerApp.js`: `node app/scripts/viewerInspect.mjs`가 app 소스에서 만든다. 생성기는 minify하면서 주석을 지운다(`comments: { legal: false }`). 그래서 소스 주석을 지워도 `--check` 차이가 생기지 않는다. 생성 파일 자체는 고치지 않는다.
- `app/src/renderer/doany.golden.json`, `dockedBuddy.golden.json`: 드래프트에서 만드는 golden이다.
- `fixtures/`, `testdata/`, `seed/` 아래 파일: 테스트 입력 데이터다. 주석이 기대값의 일부일 수 있다.
- `.d.ts`는 범위에 넣는다(`app/src/main/onboarding/raw.d.ts` 등 손으로 쓴 선언).

## 판정 기준

AGENTS.md 'Commit conventions'의 주석 규칙을 그대로 적용한다. 워커가 같은 판단을 하도록 아래처럼 풀어 쓴다.

- **남긴다(1~2줄로)**: 왜 이 값이나 순서인지, 어떤 이름에 무엇이 기대는지, 어떤 플랫폼 버그를 피하는지, 지우면 누군가 깨뜨릴 불변식.
- **지운다**:
  - 코드가 이미 말하는 것: 함수 이름을 문장으로 되풀이하는 doc comment(Go exported 식별자, JSDoc 포함), 다음 줄을 읽어 주는 주석, 섹션 구분선.
  - 이력과 서사: 드래프트, 프레임, 회차, 측정값의 출처, 누가 정했는지, 예전 동작, "이제는", "원래", PoC 결과.
  - `docs/features/` 참조: 절 이름, 결정·task id(`D12`, `T3`, `V1c` 등), feature slug.
  - 화면 묘사: 이 요소가 화면 어디에 무엇으로 보이는지.
  - 낡은 주석: 더 이상 코드와 맞지 않는 설명. 지우되, 코드가 틀렸는지 주석이 틀렸는지 애매하면 코드를 고치지 말고 보고한다.
- **긴 이유**: 2줄로 줄일 수 없는 비자명한 제약이 여러 파일이나 모듈에 걸친 불변식이면 ARCHITECTURE의 해당 절로 옮기고, 주석은 `ARCHITECTURE §N 'Title'`처럼 그 절을 가리킨다. ARCHITECTURE에 이미 있으면 옮기지 않고 가리키기만 한다. 한 파일 안의 함정은 2줄로 줄인다.
- **그대로 둔다(도구가 읽는 주석)**:
  - `oxlint-disable-next-line`, `eslint-disable-next-line` 등 lint 지시 주석(약 80곳). 지시 주석은 바로 다음 줄에 걸리므로, 지시 주석과 대상 줄 사이에 있던 설명 주석을 지우면 대상이 바뀔 수 있다. lint 게이트가 이를 잡는다.
  - `@ts-expect-error`, `//go:build`, `//go:embed`.
  - 테스트나 생성기가 읽는 주석. 예: `exportViewer.test.ts`가 `shell.html`의 placeholder 주석을 읽는다. CSS 검사(`ds/checks.ts`, `ds/controls.test.ts`)는 주석을 지우고 읽으므로 영향이 없다.
  - 지시 주석에 붙은 이유는 한 줄로 줄일 수 있다(`// oxlint-disable-next-line rule -- reason`).
- **grep 후보**(완료 조건 3): `docs/features`, `\bT[0-9]+\b`, `\bD[0-9]+[a-z]?\b`, `draft`, `frame [0-9]`, `round`, `used to`, `previously`, `no longer`, `now `, `measured`, `PoC`. 걸린 줄은 하나씩 보고 남기거나 지운다. grep은 후보를 찾는 수단이고, 판정은 사람(리뷰어)이 한다.

## 동등성 검사

주석만 바뀌었다는 것을 기계로 확인한다. 워커와 conductor가 같은 도구를 쓰도록, conductor가 T1에서 main checkout의 `.scratch/comment-trim/`에 만든다(`.scratch/`는 커밋하지 않는다. 워커 worktree에서는 main checkout의 절대 경로로 실행한다).

- 입력: 기준 ref(`feat/comment-trim`이 갈라진 `origin/develop` 커밋)와 작업 트리. 바뀐 파일마다 비교한다.
- TS·JS(`.ts`, `.tsx`, `.mjs`, `.js`): TypeScript 컴파일러 API로 파싱하고 `createPrinter({ removeComments: true })`로 출력한 문자열을 비교한다. JSX에서 주석만 담은 빈 식 컨테이너(`{}`)는 양쪽에서 지운 뒤 비교한다.
- Go: `go/parser`(주석 없이)와 `go/printer`로 출력한 문자열을 비교한다.
- CSS: `/* … */`를 지우고 공백을 정규화한 문자열을 비교한다. 문자열 안의 `/*`는 CSS 토크나이저 규칙대로 건너뛴다.
- 출력: 다른 파일 목록과 첫 차이 위치. 하나라도 다르면 실패(exit 1)다.
- 자기 검사: 주석만 지운 사본은 통과하고, 식 하나나 문자열 리터럴 하나를 바꾼 사본은 실패해야 한다. 세 언어 모두 확인한다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- 제품 코드에 새 순수 함수는 없다. 바뀌는 것이 주석뿐이기 때문이다.
- 대신 동등성 검사의 비교 함수(언어별 정규화 → 비교)가 검증 도구의 핵심이다. 이 도구는 `.scratch/`의 일회성 도구라 제품 테스트 스위트에 넣지 않는다. 위 '자기 검사'로 고정한다.
- 워커가 `/deliver bypass`로 돌 때 `/tdd`는 "동작 변경 없음, 동등성 검사로 대신한다"를 이유로 건너뛴다.

## 배치 (디렉터리별, 파일이 겹치지 않음)

2026-11-25 기준 주석 줄 수(소스 + 테스트)다. 구현 시작 시점에 conductor가 다시 잰다. 배치끼리 파일이 겹치지 않으므로 모두 병렬로 돌 수 있다. 동시 실행 수는 conductor가 정한다.

| 배치 | 경로 | 주석 줄(소스 / 테스트) |
|---|---|---|
| B1 | `app/src/main/conversation/` | 1,842 / 1,064 |
| B2 | `app/src/main/*.ts` (하위 디렉터리 제외) | 2,123 / 1,339 |
| B3 | `app/src/main/` 하위 디렉터리(conversation 제외: agentAuth, agentSetup, document, mcpConnectors, onboarding, prototype, serve, update) | 1,792 / 610 |
| B4 | `app/src/renderer/` `.ts` 소스(하위 디렉터리 포함, 테스트 제외) | 3,489 / — |
| B5 | `app/src/renderer/` `.ts` 테스트 | — / 1,870 |
| B6 | `app/src/renderer/` `.tsx`(소스와 테스트, 하위 디렉터리 포함) | 2,526 / 2,353 |
| B7 | `app/src/renderer/` `.css`, `cli/internal/export/viewer/*.css` | 약 1,050 / — |
| B8 | `cli/**/*.go`, `cli/internal/export/viewer/`의 손으로 쓴 `.js` | 약 1,600 / 760 |
| B9 | 나머지: `app/src/preload`, `restore`, `formats`, `brand`, `app/runtime`, `app/scripts`, `app/electron.vite.config.ts`, `eval/`, `.agents/skills/*/scripts/` | 약 1,270 / 454 |

- 워커는 ARCHITECTURE를 고치지 않는다. 병렬 배치가 같은 문서를 고치면 충돌하기 때문이다. 옮길 이유는 배치 보고에 "옮길 후보: 원래 주석, 제안 절, 제안 문장"으로 적고, 주석은 우선 2줄로 줄여 둔다. conductor가 통합할 때 ARCHITECTURE를 한 번에 고치고 해당 주석을 절 참조로 바꾼다.
- 배치마다 리뷰는 원래 `/code-review` 그대로다. 리뷰어는 동등성 검사 결과와 grep 후보 목록을 함께 받는다.

## 형식, 규약, 결정에 미치는 영향

- **형식**: 없다. JSON Schema 원본과 fixture를 바꾸지 않는다.
- **규약(ARCHITECTURE §1)**: 없다. 캔버스 규약과 `doan check` 규칙은 그대로다.
- **결정(ARCHITECTURE)**: 구조 결정은 바뀌지 않는다. 옮겨 오는 이유는 이미 코드에 적혀 있던 제약을 해당 절에 글로 옮기는 것이고, 새 결정이 아니다. 옮긴 내용이 기존 절과 다르게 읽히면 conductor가 멈추고 사용자에게 묻는다.
- **동작**: 없다. 동등성 검사와 `/verify`로 확인한다. `/runtime-test`는 앱 동작이 바뀌지 않으므로 하지 않는다. `/agent-eval`도 해당하지 않는다. CLI 출력, 안내, `doan check` 규칙, 스킬 stub이 바뀌지 않기 때문이다. 다만 `cli/internal/cli/skill.md`(임베드된 안내)와 디자인 프리셋 `.md`는 코드가 아니므로 범위 밖이다.

## 충돌과 시점

- 거의 모든 코드 파일을 건드린다. 그래서 chain-261125-1이 끝난 뒤 시작하고, 이 feature가 도는 동안 lead는 코드를 바꾸는 다른 conductor를 새로 띄우지 않는 편이 낫다. 이 점은 시작할 때 lead가 사용자와 확인한다.
- 그 사이에 develop에 머지된 변경이 있으면, conductor가 `origin/develop`을 머지하고 충돌 파일은 develop의 코드를 살린 채 주석만 다시 정리한다. 머지 뒤에는 동등성 검사의 기준 ref를 새 merge-base로 옮겨 다시 돌린다.

## postmortem에서 가져온 주의점

- `docs/postmortem/`에서 `comment`로 grep한 항목은 모두 이미 지운 앱의 댓글 UI에 관한 것이다. 코드 주석 정리와 관련된 항목은 없다.

## 읽은 design preset

- 없다. UI 흐름이 없는 feature다.
