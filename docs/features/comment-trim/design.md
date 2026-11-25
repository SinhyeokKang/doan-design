# 주석 정리 — design

## 영향 범위

- **app (Electron + TS)**: `app/src/**`(main, preload, renderer, formats, restore, brand), `app/runtime/`, `app/scripts/`, 그리고 `app/` 바로 아래 설정 파일(`electron.vite.config.ts`, `electron.vite.config.test.ts`, `vitest.config.ts`, `vitest.globalSetup.ts`)의 `.ts`, `.tsx`, `.mjs`, `.cjs`, `.js`, `.css`. 테스트 파일과 `*.fixture.*`, `*.test-support.ts`(테스트 보조 코드)도 포함한다. 손으로 쓴 `.d.ts`(`app/src/main/onboarding/raw.d.ts` 등)도 포함한다.
- **CLI (Go)**: `cli/**`와 `schema/embed.go`의 `.go`(테스트와 `exporttest/` 포함).
- **eval**: `eval/run.ts`, `eval/lib/`, `eval/scenarios/<id>/`의 코드(`checks.ts`, `.cjs` 등). 테스트 포함.
- **스킬 스크립트**: `.agents/skills/*/scripts/`의 코드(`verify.mjs`와 그 테스트).
- **문서**: ARCHITECTURE.md는 옮겨 오는 이유가 있을 때만 바뀐다. PRODUCT.md는 바뀌지 않는다.
- **포맷과 출력**: 바뀌지 않는다. 앱 소켓 메시지, CLI 응답, `runtime.json`, `.doan/config.json`, `sessions.v1`, `doan export` 출력 모두 그대로다.

### 제외

- `cli/internal/export/viewer/` 전체:
  - `inspect.js`, `inspectPanel.js`, `viewerApp.js`는 `node app/scripts/viewerInspect.mjs`가 app 소스에서 만든다. 생성기는 minify하면서 주석을 지운다(`comments: { legal: false }`). 그래서 app 소스 주석을 지워도 `--check` 차이가 생기지 않는다.
  - 나머지 손으로 쓴 `.js`, `.css`, `.html`은 `//go:embed viewer/*`(`assemble.go`)로 들어가 내보낸 페이지에 그대로 붙는다. 출력은 `output_test.go`, `assemble_prototype_test.go`가 sha256으로 고정한다.
- `fixtures/`, `testdata/`, `seed/` 디렉터리 아래 파일: 테스트 입력 데이터다.
- `.html` 파일 전체. `app/src/renderer/*.golden.json`은 주석이 없으므로 다루지 않는다.

## 판정 기준

AGENTS.md 'Commit conventions'의 주석 규칙을 그대로 적용한다. 워커가 같은 판단을 하도록 아래처럼 풀어 쓴다.

- **남긴다(1~2줄로)**: 왜 이 값이나 순서인지, 어떤 이름에 무엇이 기대는지, 어떤 플랫폼 버그를 피하는지, 지우면 누군가 깨뜨릴 불변식.
- **지운다**:
  - 코드가 이미 말하는 것: 함수 이름을 문장으로 되풀이하는 doc comment(Go exported 식별자, JSDoc 포함), 다음 줄을 읽어 주는 주석, 섹션 구분선.
  - 이력과 서사: 드래프트의 프레임 번호("frame 3 of the draft"), 회차, 측정값의 출처, 누가 정했는지, 예전 동작, PoC 결과. 제품 용어인 draft canvas, canvas frame, `data-doan-frame`은 이력이 아니다.
  - `docs/features/` 참조: 절 이름, 결정·task id, feature slug.
  - 화면 묘사: 이 요소가 화면 어디에 무엇으로 보이는지.
  - 낡은 주석: 더 이상 코드와 맞지 않는 설명. 지우되, 코드가 틀렸는지 주석이 틀렸는지 애매하면 코드를 고치지 말고 보고한다.
- **긴 이유**: 2줄로 줄일 수 없는 비자명한 제약이 여러 파일이나 모듈에 걸친 불변식이면 ARCHITECTURE로 옮길 후보로 보고하고, 주석은 우선 2줄로 줄여 둔다. ARCHITECTURE에 이미 있으면 그 절을 가리키게만 한다. 한 파일 안의 함정은 2줄로 줄인다.
- **문서가 가리키는 주석은 예외다.** 길어도 남기되, 그 안에서 금지 내용만 지운다. 2026-11-25 기준 목록:
  - ARCHITECTURE: `ipc.ts`("rules in its comment"), `conversation/models.ts`("its comment holds the naming rule"), `providers.ts`("its comments give each switch's reason")
  - DESIGN.md: `tokens.css` 주석
  - T1에서 `docs/`를 grep해 목록을 다시 만든다.
- **그대로 둔다(도구가 읽는 주석)**:
  - 지시 주석: `oxlint-disable*`, `eslint-disable*`(약 80곳), `@ts-expect-error`, `//go:build`, `//go:embed`, `SPDX-License-Identifier`(약 10곳). `--` 뒤의 이유만 한 줄로 줄일 수 있다. 지시 주석과 그 대상 줄 사이에 다른 줄을 넣거나 빼지 않는다.
  - 테스트가 읽는 주석. 테스트 여러 개가 소스 텍스트를 직접 읽는다. 예를 들면 `Home.test.tsx`, `HomeCredit.test.tsx`, `rendererImports.test.ts`, `folderState.test.ts`, `exportViewer.test.ts`(app 소스의 여러 함수와 표, CSS 규칙 본문을 비교한다), `styles.css`를 정규식으로 읽는 `.test.tsx`들이다. CSS 검사(`ds/checks.ts`, `ds/controls.test.ts`)는 주석을 지우고 읽는다.
  - **규칙: 주석을 바꿔서 테스트가 깨지면 그 주석을 되돌리고 보고한다. 테스트 코드는 고치지 않는다.** 표나 규칙 본문 안에 주석을 새로 넣지 않는다.
- **문자열과 template literal 안의 주석은 코드다.** 예: `canvasScript`가 주입하는 CSS, `sheet.replaceSync(\`…\`)`. 손대지 않는다.
- **덩어리 세기**(spec 완료 조건 4): 빈 줄 없이 이어진 `//` 줄과 한 줄에 함께 있는 주석은 한 덩어리다. `/* … */`는 내용이 있는 줄만 세고, `/**`나 `*/`만 있는 줄은 세지 않는다. 코드 줄 끝에 붙은 주석은 그 줄 하나로 센다.
- **grep 후보**(도구가 뽑은 주석 텍스트에만 돌린다):
  - 0이어야 하는 것: `docs/features`, `\bT[0-9]+\b`
  - 줄마다 판정할 후보: `\bfrom the draft\b`, `\bdraft (frame|said|showed|had)\b`, `\bframe [0-9]+\b`, `\bround [0-9]+\b`, `\bused to\b`, `\bno longer\b`, `\bmeasured\b`, `\bPoC\b`
  - 알려진 오탐: eval 시나리오 id(`D1`, `D10g` 등), eval의 `--round`, `measure.js`, `measureLines`

## 동등성 검사

주석만 바뀌었다는 것을 기계로 확인한다. conductor가 T1에서 자기 worktree의 `.scratch/comment-trim/`에 만든다(`.scratch/`는 커밋하지 않는다). 워커는 conductor worktree의 절대 경로로 실행하고, 도구는 검사할 저장소 루트를 인자로 받는다.

- **입력**: `--root <repo>`, `--base <sha>`(기준 ref), `--batch <Bn>`.
- **경로 가드**: 바뀐 파일은 모두 상태가 `M`이고 그 배치의 경로 규칙에 맞아야 한다. 생성 파일, `cli/internal/export/viewer/`, `fixtures/`·`testdata/`·`seed/` 아래 파일이 바뀌면 실패한다.
- **TS·JS**(`.ts`, `.tsx`, `.mjs`, `.cjs`, `.js`):
  - `rolldown/utils`의 `parseSync`(oxc, `app/scripts/viewerInspect.mjs`가 쓰는 것)로 파싱한다. `rolldown`은 `<root>/app/node_modules`에서 불러온다. 레포의 `typescript`(7.0.2)는 printer API를 내보내지 않는다.
  - `start`, `end`, `range`, `loc`를 뺀 AST를 비교한다. 주석은 AST 밖에 따로 오므로 비교에서 빠진다. 정규식 리터럴 안의 `//`와 template literal 안의 `/*`는 코드로 남는다.
  - `.tsx`는 JSX 텍스트 정리 규칙(줄바꿈이 낀 공백 제거)을 `JSXText`마다 먼저 적용하고, 주석만 담은 빈 식 컨테이너를 지우고, 이웃한 문자열을 합친 뒤 비교한다. `foo{/* c */}\n  bar`는 "foobar"인데 중괄호를 지우면 "foo bar"가 된다. 이 경우를 잡아야 한다.
- **Go**: `go/scanner`를 주석을 건너뛰는 모드로 돌려 `(토큰, 리터럴)` 열을 비교한다. `go/printer`는 원래 줄 위치에 따라 빈 줄을 남겨서 거짓 차이를 낸다.
- **CSS**: 주석을 공백 하나로 바꾸고, 문자열 밖에서만 공백을 정규화해 비교한다.
- **지시 주석**: 파일마다 지시 주석(`//go:*`, `oxlint-`, `eslint-`, `@ts-`, `SPDX-License-Identifier`)의 집합을 `--` 앞부분으로 비교하고, 각각이 바로 다음 토큰에 그대로 걸리는지 본다.
- **주석 덩어리와 텍스트**: 파일마다 주석 텍스트를 뽑아 덩어리 수(3줄 이상)와 grep 후보를 보고한다. 문서가 가리키는 주석 목록은 따로 표시한다.
- **출력**: 실패한 파일과 첫 차이 위치. 하나라도 다르면 exit 1이다.
- **자기 검사**: 세 언어 각각에서 다음을 확인한다.
  - 주석만 지운 사본은 통과한다.
  - 식 하나나 문자열 리터럴 하나를 바꾼 사본은 실패한다.
  - JSX 중괄호 경우 두 가지(`foo{/* c */}\n  bar`, `foo\n{/* c */}\nbar`)와 지시 주석을 지우거나 옮긴 사본은 실패한다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- 제품 코드에 새 순수 함수는 없다. 바뀌는 것이 주석뿐이기 때문이다.
- 검증의 핵심은 동등성 검사 도구의 언어별 정규화·비교 함수다. 이 도구는 `.scratch/`의 일회성 도구라 제품 테스트 스위트에 넣지 않고, '자기 검사'로 고정한다.
- 워커가 `/deliver bypass`로 돌 때 `/tdd`는 건너뛴다. `/tdd`의 건너뛰기 목록에 없는 경우이므로, conductor가 `orch.md`에 이 feature의 예외("동작 변경 없음, 동등성 검사로 대신한다")로 적는다.

## 배치 (디렉터리별, 파일이 겹치지 않음)

2026-11-25 기준 주석 줄 수(소스 / 테스트)다. conductor가 T1에서 같은 경로 규칙으로 다시 잰다. 배치끼리 파일이 겹치지 않으므로 모두 병렬로 돌 수 있다. 동시 실행 수는 conductor가 정한다.

| 배치 | 경로 | 주석 줄(소스 / 테스트) |
|---|---|---|
| B1 | `app/src/main/conversation/` | 1,842 / 1,064 |
| B2 | `app/src/main/*` 바로 아래 파일(하위 디렉터리 제외) | 2,123 / 1,339 |
| B3 | `app/src/main/`의 conversation 밖 하위 디렉터리(agentAuth, agentSetup, document, mcpConnectors, onboarding, prototype, serve, update) | 1,792 / 610 |
| B4 | `app/src/renderer/**`의 `.ts` 소스(테스트 제외, `*.test-support.ts` 포함) | 3,489 / — |
| B5 | `app/src/renderer/**`의 `.ts` 테스트 | — / 1,870 |
| B6 | `app/src/renderer/**`의 `.tsx`(소스, 테스트, `*.fixture.tsx`) | 2,526 / 2,353 |
| B7 | `app/src/renderer/**`의 `.css`(`ds/` 포함) | 약 970 / — |
| B8 | `cli/**/*.go`, `schema/embed.go` | 약 1,600 / 760 |
| B9 | 나머지: `app/src/preload`, `restore`, `formats`, `brand`, `app/runtime`, `app/scripts`, `app/` 바로 아래 설정 파일, `eval/`, `.agents/skills/*/scripts/` | 약 1,270 / 454 |

- 워커는 ARCHITECTURE를 고치지 않는다. 병렬 배치가 같은 문서를 고치면 충돌하기 때문이다. 옮길 이유는 배치 보고에 "옮길 후보: 원래 주석, 제안 절, 제안 문장"으로 적는다. conductor가 통합 때 ARCHITECTURE를 한 번에 고치고, 주석을 절 참조로 바꾸는 일은 그 파일을 맡은 워커에게 새 태스크로 돌려보낸다(`/orchestrate`: conductor는 배치 코드를 고치지 않는다).
- 배치마다 리뷰는 원래 `/code-review` 그대로다. 리뷰어는 동등성 검사 결과와 grep 후보 목록을 함께 받는다.
- 테스트가 다른 배치의 소스를 읽기 때문에(예: B2의 `exportViewer.test.ts`가 B4·B6·B7 파일을 읽는다), 배치 검증은 배치 안 테스트가 아니라 전체 app 테스트와 Go 테스트로 한다.
- B9의 `app/scripts/*.mjs`와 `.agents/skills/*/scripts/`는 lint와 typecheck 대상이 아니다. 동등성 검사와 해당 스크립트 테스트로 확인한다.

## 형식, 규약, 결정에 미치는 영향

- **형식**: 없다. JSON Schema 원본과 fixture를 바꾸지 않는다.
- **규약(ARCHITECTURE §1)**: 없다. 캔버스 규약과 `doan check` 규칙은 그대로다.
- **결정(ARCHITECTURE)**: 구조 결정은 바뀌지 않는다. 옮겨 오는 이유는 코드에 이미 적혀 있던 제약을 해당 절에 글로 옮기는 것이고, 새 결정이 아니다. 옮긴 내용이 기존 절과 다르게 읽히면 conductor가 멈추고 사용자에게 묻는다.
- **동작**: 없다. 동등성 검사와 `/verify --eval`로 확인한다. `/runtime-test`는 하지 않는다. 앱 동작이 바뀌지 않기 때문이다. `/agent-eval`도 해당하지 않는다. CLI 출력, 안내(`cli/internal/cli/skill.md`), `doan check` 규칙, 스킬 stub이 바뀌지 않기 때문이다.

## 충돌과 시점

- 거의 모든 코드 파일을 건드린다. 그래서 chain-261125-1이 끝난 뒤 시작하고, 이 feature가 도는 동안 lead는 코드를 바꾸는 다른 conductor를 새로 띄우지 않는다. 이 점은 T0에서 lead가 사용자와 확인한다.
- 배치를 모두 `feat/comment-trim`에 통합한 뒤에 `origin/develop`을 머지한다. 그 사이 develop이 움직였으면, 충돌 파일은 develop의 코드를 살린 채 주석만 다시 정리하고, 기준 ref를 새 merge-base로 옮겨 배치별 동등성 검사를 다시 돌린다.

## postmortem에서 가져온 주의점

- `docs/postmortem/`에서 `comment`로 grep한 항목은 모두 이미 지운 앱의 댓글 UI에 관한 것이다. 코드 주석 정리와 관련된 항목은 없다.

## 읽은 design preset

- 없다. UI 흐름이 없는 feature다.
