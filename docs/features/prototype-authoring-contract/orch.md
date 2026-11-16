# 프로토타입 작성 계약 — orch

- 출처: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md) · 체인 [chain-261116-1](../chain-261116-1/chain.md) 링크 2
- 시작 해시: `54f471ee` (origin/develop 기준)
- 통합 브랜치: `feat/prototype-authoring-contract` (리드가 만들었다. 컨덕터는 브랜치를 만들거나 바꾸지 않는다)
- 워커 런타임: Claude만(체인 '상시 권한'). Codex 워커 없음.

## 결정 기록

- 가이드 문구: 사용자가 design 초안을 줄인 압축안을 골랐다.
  - 규칙 11 끝: "In a marked frame, see rule 14."
  - 규칙 14: 기존 마크 문법·`doan check` 문장 다음의 "The frame fills the viewport and elements outside it are hidden, so keep modals inside it."를 아래로 바꾸고, Other-page links 문장은 둔다.
    > W×H is the target screen's viewport (1440x900 desktop, 390x844 phone), not the content height. Playing, the frame fills the viewport width and at least its height and elements outside it are hidden; Fit keeps W×H and only scales down, Responsive and exported files fill the window. For a fixed header with inner scroll, give the frame or app root `height: var(--doan-viewport-height, <H>px)`; Doan sets it only while playing, so the board and thumbnails use <H>. Do not define it. Suggested: keep modals and toasts inside the frame (`position: absolute`, frame `position: relative`), scope scripts to their frame, give script-made elements no `data-doan-id`; each play restarts from the document. Start in the default state; draw an open tooltip or dialog as its own frame.
  - Agent rules F(신규): "F. Prototypes: build the interactions the request names, ask only when scope changes the result, and say which are not wired."
- 예산: 압축안을 넣으면 `doan skill`(번들 안내 포함)이 plain 21,590 B, `--json` 22,446 B다(예산 21,600 B). 사용자가 다음을 골랐다.
  - CLI stdout JSON envelope 인코더(`cli/internal/cli/run.go`)에서 HTML 이스케이프를 끈다(`SetEscapeHTML(false)`). 값은 같고 `<` `>` `&`가 `<` 등 6바이트로 바뀌지 않아 `--json`이 약 690 B 준다. ARCHITECTURE에 한 줄 적는다.
  - 캔버스 규칙·명령 문장에서 뜻을 바꾸지 않고 약 250 B를 줄여 plain에도 여유를 둔다. 온보딩 문장은 건드리지 않는다. 통합 전에 그 diff를 사용자에게 보인다.
  - 결과: 22곳 −240 B(`5ae5aace`). plain 21,350 B(여유 250 B), `--json` 21,536 B(여유 64 B). 사용자가 `/agent-eval`에 문제가 없으면 그대로 두기로 했다.
- 실제 휴대폰 Safari: 확인하지 못하면 BACKLOG에 남기고 병합을 막지 않는다(체인 '시작 점검' 4).

## 배치

| 배치 | 항목(tasks) | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| A | 1 check 규칙, 3 가이드(+ envelope 이스케이프, 문장 다듬기), 3b W12 | `cli/internal/check/`, `cli/internal/canvas/`(필요할 때만), `cli/internal/cli/skill.md`·`skill_test.go`·`run.go`와 그 테스트, `eval/scenarios/W12/` | 없음 | Opus high — 가이드 문장과 다듬기는 모든 에이전트에 닿고, W12 fixture는 판정 기준이라 판단이 많다 | `go test ./...`, `go vet ./...`, `node --test 'eval/**/*.test.ts'`, `node eval/run.ts --self-test --scenarios W12` | 대기 |
| B | 2 재생 스크립트 | `app/src/main/prototypeScript.ts`·`prototypeScript.test.ts`, `cli/internal/export/viewer/isolate.js`, `app/src/main/exportViewer.test.ts` | 없음 | Sonnet medium — 두 시트에 같은 CSS 두 규칙을 더하는 기계적 작업이고 drift 테스트가 묶는다 | `npm --prefix app test`, `npm --prefix app run typecheck`, `go test ./...` | 대기 |
| 리뷰 | A·B diff `/code-review` | 읽기만 | A·B | Opus high — 가이드 계약과 check 규칙의 경계 판단 | 보고서 | 🔴 0, 🟡 1(ARCHITECTURE 'Output'에 이스케이프 한 줄, 컨덕터가 승격 때 처리) |
| 컨덕터 | 4 `/runtime-test`, 5 `/verify --eval`, 6 `/agent-eval`, 7 ARCHITECTURE, 8 PRODUCT, 9 BACKLOG, 10 정리 | 문서, `orch.md` | A·B 통합 | — | 각 task의 확인 | 대기 |

## 파일 겹침과 순서

- A와 B는 겹치는 파일이 없다. 병렬로 돌린다. A 안에서는 1 → 3 → 3b 순서다(W12 self-test가 새 check 코드를 쓴다).
- 4–10은 A·B 통합 뒤 컨덕터가 한다.
- 모든 tasks 체크 항목(1, 2, 3, 3b, 4–10)이 위 행 하나에 속한다.

## 진행 기록

- B 완료: `e238d5de` → `7e47bb87`. 범위 밖 `cli/internal/export/assemble_prototype_test.go`의 고정 digest 4개를 고쳤다(시트가 바뀌면 따라 바뀐다). 워커 release, 워크트리 제거, 브랜치 `SinhyeokKang/pac-B`는 남김.
- A 완료: 7커밋 → `a9f708a3..da7f986e`. 워커는 수정 라운드를 위해 retain.
- 리뷰 1라운드(Opus high): 🔴 0, 🟡 1, ⚪ 9. 보고서는 컨덕터 `.scratch/review-1.md`.
- 검증: `/verify --eval`의 모든 단계가 통과했다. 첫 실행은 eval-self-test 뒤의 실제 상태 검사에서 멈췄다. 사용자가 쓰는 실제 Doan(`/Applications`)이 `ui-state.json`을 고쳤기 때문이다. self-test(45개 PASS)와 build만 다시 돌렸고 둘 다 종료 코드 0이었다.
- 실제 앱 probe(tasks 4, Opus high 워커): 12개 모두 통과했고 실제 상태 검사도 통과했다(run-6). 보고서는 컨덕터 `.scratch/runtime-test/pac/report.md`에 있다. 확인하지 못한 것: 실제 휴대폰 Safari, WebKit 모바일 에뮬레이션, 패키지 앱, 변경 전 빌드와의 비교. 창 배치 규칙은 마지막 실행 뒤에 도착해 적용하지 못했다. 앱이 실행과 Play 때 포커스를 가져갔고, 워커가 그때마다 포커스를 돌려줬다.
- 문서 승격: ARCHITECTURE `d7301824`, PRODUCT `9e5463f7`, BACKLOG `9a4faf48`.
- `/agent-eval` 라운드 pac-1(W 전부, W12, X2, Claude Code 2.1.325, Codex 0.167.1): 자동 검사 실패는 W5-codex 하나다(`no_doan_open`). judge만 partial로 본 실행이 둘이다(W9-codex는 프레임 제목을 쓰지 않았고, W11-claude는 프레임마다 work update를 하지 않았다). W12는 두 에이전트 모두 `var(--doan-viewport-height, 900px)`와 `1440x900`을 썼다. W7·W11·W12에서 질문으로 멈춘 에이전트는 없다. 러너 종료 코드 1은 실제 상태 검사 때문이다. 사용자가 쓰는 실제 Doan의 `ui-state.json`과 Antigravity CLI 메타가 라운드 도중 바뀌었다.
- W5-codex는 `--repeat 2`(pac-1-repeat)에서도 2/2 실패했다. Codex가 `for` 루프의 템플릿 리터럴로 명령을 실행하면 러너가 그 명령을 읽지 못하고, `doan open`이 없었다는 것도 증명하지 못한다. 사용자가 이 PR에서 러너를 고치기로 했다. A 2라운드(Opus high, 새 세션, pac-A 워크트리)가 맡았다. 이전 A 터미널은 다시 쓸 수 없어(`agent_unconfigured`) release했다.
- A 2라운드 통합: `c9d0e833`, `bcf9d4af`. W5-codex를 다시 돌린 결과 2/2 통과했다(pac-1-w5-fix). 라운드 기록 `f0d5e9f1`, 이슈 U-039·U-040을 남겼다.
- origin/develop(링크 1, #234)을 머지했다(`78178a46`, 충돌 없음). 머지 뒤 `/verify --eval`도 통과했다.
- 사용자 요청으로 전체 라운드 pac-full(45개 시나리오 × 두 에이전트)을 돌렸다. `--repeat 2` 뒤에도 자동 검사 실패 7개가 남았다(D10g·D10h·D5·R10·R11 Codex, H5·R11 Claude). 분류로는 모두 이 브랜치와 무관한 러너 결함이다: Codex stderr의 여러 줄 exec 헤더를 첫 줄만 읽는다, 셸 함수와 중괄호 그룹을 읽지 못한다, 사용자 전역 Codex AGENTS.md가 실행에 들어온다. W11 Claude는 judge만 partial로 봤다(4/4). 사용자가 이 PR에서 러너를 고치기로 했다. 배치 E(Opus high, pac-E 워크트리)가 맡았다.
