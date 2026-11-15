# prototype-link-play — orch

- 근거: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md). 체인 [chain-261115-1](../chain-261115-1/chain.md) 링크 2.
- 시작 해시: `32483e73d` (origin/develop, 링크 1 #204 병합 뒤)
- 통합 브랜치: `feat/prototype-link-play` (리드가 만듦, 워크트리 `prototype-link-play-orch`)
- 모델 경계: 체인 상시 권한으로 Codex 워커를 쓴다. 링크 시작 때 Codex 주간 사용량 46%(`$CODEX_HOME` 최신 rollout, `window_minutes` 10080, 2026-11-15 10:19). 쓴 범위는 아래 배치 표와 '모델 교차'에 적는다.

## 결정 기록

| # | 결정 | 근거 |
|---|---|---|
| 1 | 가이드 문구는 E안이다. convention 15로 "Clicking an element with `data-doan-goto="<frame id>"` inside a marked frame plays that marked frame (`preventDefault()` cancels); `doan check` reports `goto_*`."를 더한다. design.md 표의 세 축소(convention 14 꼬리, `doan open` refusals 목록, export `--prototype`의 "plays only that frame")에 더해 `doan open` 줄의 " it only navigates."를 뺀다. `--json` 21,582 B(예산 21,600 B, 18 B 남음). | 사용자 결정(2026-11-15). 코드 네 개 이름을 다 적으면 21,693 B로 예산을 넘는다. |
| 2 | `skill_test.go` 내용 테스트는 가이드가 `data-doan-goto`와 `goto_*`를 담는지 본다(design.md의 "네 코드 이름" 대신). | 결정 1에 따른다. 컨덕터 판단. |
| 3 | 새 eval 시나리오 id는 W9가 아니라 **W11**이다. | 컨덕터 판단: `eval/scenarios/W9`·`W10`이 이미 다른 과제(다른 세션 편집 중)다. ARCHITECTURE §14 'Scenarios are fixed after their first recorded round'. |
| 4 | 배치 순서는 tasks.md대로 S → L → W 직렬, G는 처음부터 병렬. S는 작업 1 PoC가 기대대로 끝난 뒤 시작한다. | `requests.ts`를 S와 L이 함께 고치고, W는 둘의 타입과 판단을 쓴다. PoC가 클릭 판정의 전제다. |

## 배치

| 배치 | 항목 | 맡는 파일 | 선행 | 모델·effort와 이유 | 검증 | 상태 |
|---|---|---|---|---|---|---|
| P | 작업 1 PoC | `.scratch/prototype-link-play/` | — | 컨덕터 | `node .scratch/prototype-link-play/poc.mjs` exit 0 | 완료(세 번 연속 exit 0, design.md 'PoC 관찰') |
| G | 작업 4 가이드·eval | `cli/internal/cli/skill.md`, `skill_test.go`, `eval/scenarios/W11/`, 필요하면 `eval/lib/` | 결정 1 | Codex `gpt-6.1-sol` medium: 문구가 정해졌고 W7 시나리오를 본뜨는 기계적 작업이다 | `go test ./...`, `node --test 'eval/**/*.test.ts'`, `node eval/run.ts --self-test --scenarios W11` | 진행(`plp-g`, dispatch `ctx_a7c76682d132`) |
| S | 작업 2 스크립트·보고 | `prototypeScript.ts`, `canvasScript.ts`, `canvasMessage.ts`, `requests.ts`의 `gotos` 검증과 각 테스트 | P | Claude Opus high: DOM 수집과 클릭 판정이 하위 1·3과 드리프트 없이 맞아야 한다 | `npm --prefix app test`, `typecheck`, `lint` | 진행(`plp-s`, dispatch `ctx_262bc9dc41f8`) |
| L | 작업 3 판단·전이 | `playability.ts`, `prototypePlay.ts`, `requests.ts`의 `goto` 검증, `windowState.ts`, `history.ts`와 각 테스트 | S | Claude Opus high: gen·phase 판단과 기록 전이가 틀리면 창 상태가 엇갈린다(POSTMORTEM 2026-11-14) | `npm --prefix app test`, `typecheck`, `lint` | 대기 |
| W | 작업 5 창·툴바 | `CanvasHeader.tsx`, `frameDrawer.ts`, `host.ts`, `PrototypeWindow.tsx`, `view.ts`, `ipc.ts`, `preload/prototype.ts`, `controller.ts`, 꺼낸 서랍 본문, `CanvasTools.tsx`, `canvasTool.ts`, `App.tsx`와 각 테스트 | S, L | Claude Opus high: 포커스·접근성·Radix 트리거 정체성이 걸린 넓은 UI 배치 | `npm --prefix app test`, `typecheck`, `lint`, `build` | 대기 |
| R-* | 배치별 독립 리뷰(`/code-review`) | 보고만 | 각 배치 | S·L·W: Codex `gpt-6-astra` medium(다른 계열의 판단 리뷰). G: Claude Opus medium | 🔴 0 | 대기 |
| DS | 작업 7 `/design-sync` | 구현 수정, `docs/DESIGN.md` | W 통합 | W 워커의 후속 Task(같은 파일을 안다) | `node .scratch/design-sync/prototype-link-play/measure.mjs` exit 0 | 대기 |
| RT | 작업 8 `/runtime-test` | 보고만 | DS | 컨덕터가 정한다(별도 Claude 워커 가능) | probe exit 0, 스크린샷 | 대기 |
| E | 작업 9 `/agent-eval` 전체 라운드 | `docs/USABILITY-EVAL.md` | 통합, package | 컨덕터가 정한다 | `--repeat 2` 뒤 자동 검사 | 대기 |
| — | 작업 6 통합 확인, 작업 10 승격 | 문서별 커밋 | 모든 배치 | 컨덕터 | `verify.mjs --eval`, tasks.md 작업 10 grep | 대기 |

## 파일 겹침과 순서

- S와 L은 `requests.ts`를 함께 고친다 → 직렬.
- W는 S의 `canvasMessage.ts` 타입과 L의 `playability` 결과를 쓴다 → S·L 뒤.
- G는 `cli/`·`eval/`만 고친다 → 다른 배치와 병렬.

## 모델 교차

- G 구현(Codex Sol), S·L·W 리뷰(Codex Astra). 실제 사용은 배치 상태에 갱신한다.
