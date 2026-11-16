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
- 실제 휴대폰 Safari: 확인하지 못하면 BACKLOG에 남기고 병합을 막지 않는다(체인 '시작 점검' 4).

## 배치

| 배치 | 항목(tasks) | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| A | 1 check 규칙, 3 가이드(+ envelope 이스케이프, 문장 다듬기), 3b W12 | `cli/internal/check/`, `cli/internal/canvas/`(필요할 때만), `cli/internal/cli/skill.md`·`skill_test.go`·`run.go`와 그 테스트, `eval/scenarios/W12/` | 없음 | Opus high — 가이드 문장과 다듬기는 모든 에이전트에 닿고, W12 fixture는 판정 기준이라 판단이 많다 | `go test ./...`, `go vet ./...`, `node --test 'eval/**/*.test.ts'`, `node eval/run.ts --self-test --scenarios W12` | 대기 |
| B | 2 재생 스크립트 | `app/src/main/prototypeScript.ts`·`prototypeScript.test.ts`, `cli/internal/export/viewer/isolate.js`, `app/src/main/exportViewer.test.ts` | 없음 | Sonnet medium — 두 시트에 같은 CSS 두 규칙을 더하는 기계적 작업이고 drift 테스트가 묶는다 | `npm --prefix app test`, `npm --prefix app run typecheck`, `go test ./...` | 대기 |
| 리뷰 | A·B diff `/code-review` | 읽기만 | A·B | Opus high — 가이드 계약과 check 규칙의 경계 판단 | 보고서 | 대기 |
| 컨덕터 | 4 `/runtime-test`, 5 `/verify --eval`, 6 `/agent-eval`, 7 ARCHITECTURE, 8 PRODUCT, 9 BACKLOG, 10 정리 | 문서, `orch.md` | A·B 통합 | — | 각 task의 확인 | 대기 |

## 파일 겹침과 순서

- A와 B는 겹치는 파일이 없다. 병렬로 돌린다. A 안에서는 1 → 3 → 3b 순서다(W12 self-test가 새 check 코드를 쓴다).
- 4–10은 A·B 통합 뒤 컨덕터가 한다.
- 모든 tasks 체크 항목(1, 2, 3, 3b, 4–10)이 위 행 하나에 속한다.

## 진행 기록

