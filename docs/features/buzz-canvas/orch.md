# buzz-canvas — orch

계획 출처: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md). 이 문서에는 배치 분할·결정·상태만 적는다.

- 시작 해시: `285c7694` (2026-11-01, main)
- 통합 브랜치: `feat-buzz-canvas`
- 지휘자 체크아웃: `/Users/sinhyeok/code/doan-design`

## 결정 기록

| 날짜 | 결정 | 출처 |
|---|---|---|
| 2026-11-01 | 이 세션에서 Codex 작업자를 쓸 수 있다(모델 계열 교차). 구현은 주로 Claude가 맡고, Codex는 기계적 배치(BD)와 교차 리뷰를 맡는다 | 사용자("Codex 워커 허용"). 배분은 지휘자 판단이며 사용자 선호(Claude 주 작업, Codex는 교차 리뷰와 일부 기계적 배치)를 따른다 |
| 2026-11-01 | D1(초안)은 끝났다. 초안 리뷰 게이트는 이번 실행에 없다 | tasks D1, 사용자 외형 확정 |
| 2026-11-01 | tasks의 commit 경계는 배치 단위 커밋으로 바꾼다. S·T는 세 병렬 배치(BT·BD·BP)로 나누고, R6과 X1은 한 배치(BR6)로 묶는다. 작업자 커밋마다 typecheck와 빌드가 통과해야 한다 | 지휘자 판단. 순수 함수와 형식 task는 파일이 겹치지 않아 병렬로 돌리고, R6과 X1은 둘 다 `styles.css`·`App.tsx`의 보드·알림 규칙을 바꾼다 |
| 2026-11-01 | R 배치(BR1 → BR4 → BR5 → BR6)는 직렬이다. 모두 `App.tsx`·`styles.css`를 고친다 | `/orchestrate` §0.4 |
| 2026-11-01 | V1(`/design-sync`)과 V2(`/runtime-test`)는 한 배치(BV)가 맡고, Z3(DESIGN.md)도 `/design-sync` 기록으로 BV가 쓴다. Z1·Z2·Z4는 지휘자가 쓴다 | 지휘자 판단. 실제 앱을 띄우는 마지막 배치를 하나로 모아 GUI probe가 겹치지 않게 한다(doan-mascot 선례). DESIGN.md 측정 기록은 `/design-sync`의 일이다 |
| 2026-11-01 | 1차 병렬 배치(BT·BD·BP)는 앱 동작을 바꾸지 않는다(아직 어디에도 연결되지 않은 순수 함수와 파서). `/runtime-test`는 해당하지 않는다고 handoff에 적는다 | 지휘자 판단. AGENTS 'Verification policy'(변경된 앱 동작만 probe) |
| 2026-11-01 | 실제 공급자로 이 캔버스의 대화를 돌려야 하는 작업 표시 probe(BR5 `/runtime-test`, BV의 V2)는 아래 로그인 프로필을 쓴다. 실행 중 상태를 실제로 만들지 못하면 미검증으로 남긴다 | tasks V2, memory 'provider login probes'(실제 HOME과 사용자 로그인 승인이 필요하다) |
| 2026-11-01 | 공급자 로그인은 지휘자가 미리 만든다. 실제 HOME으로 dev 앱을 `/Users/sinhyeok/code/doan-design/.scratch/provider-profile/userData`에 띄우고, 사용자가 브라우저에서 Claude Code 로그인을 승인한다. BR5·BV probe는 이 프로필을 복사해서 쓴다. 이 실행이 끝나도 로그아웃·삭제하지 않고 바로 이어지는 `buzz-canvas-conversation`이 이어 쓰며, 폐기도 그 실행이 한다 | 사용자("CC, Codex 로그인 쓸 일 있음? 미리 실제 HOME에 세션 만들어놓으면 좋겠는데", "로그인 세션은 canvas-conversation에서 이어서 사용하고, 폐기는 거기서 한다"). 공급자는 하나면 된다(지휘자 판단) |
| 2026-11-01 | `/agent-eval`은 해당하지 않는다 | design §1·§4. CLI·형식·스킬·`doan check` 규칙이 그대로다 |
| 2026-11-01 | probe 위치는 `.scratch/runtime-test/buzz-canvas/`, 측정 위치는 `.scratch/design-sync/buzz-canvas/`다 | `/runtime-test`·`/design-sync` 스킬의 위치 규칙 |

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort (이유) | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| BT | T1, T4 | `viewport.ts`·`viewport.test.ts`, 새 `frameDrawer.ts`·`zoomControl.ts`·`agentPresence.ts`와 테스트, `canvasConversationRows.ts`(`sameCanvas` export만) | — | Claude Sonnet high (design §3 표의 경우가 많고, inset 수식과 목록 읽기 실패 뒤 직전 상태 유지가 판단을 조금 요한다. 연결 전이라 틀려도 다음 배치 리뷰에서 잡힌다) | red 기록, `npm --prefix app test`, typecheck, build | 대기 |
| BD | T3 | 새 `dotField.ts`와 테스트 | — | Codex `gpt-6.1-sol` high (malmoi `lib/signin/dot-field.ts`를 doan 값으로 옮기는 기계적 포팅. 경우가 정해져 있고 단계가 많다) | red 기록, `npm --prefix app test`, typecheck | 대기 |
| BP | S1, T2 | `app/src/restore/uiState.ts`와 테스트, `app/src/main/uiState.ts`의 테스트, 새 `rightPanelSize.ts`와 테스트 | — | Claude Sonnet high (공유 파서가 main 저장 검증에도 쓰인다. 틀리면 기기 ui-state의 다른 필드를 잃는다) | red 기록, test, typecheck | 대기 |
| BR1 | R1, R2, R3 | `App.tsx`, `CanvasController.ts`와 테스트, `styles.css`, 새 캔버스 헤더·서랍·배율·도구모음 컴포넌트 | BT | Claude Opus high (서랍의 id 해석, 다시 로드 중 포커스 유지, Radix Esc·포커스 복귀, 휠·핀치 전달. POSTMORTEM 2026-10-25·26 함정이 걸려 있다) | test, typecheck, build, 변경 범위 `/runtime-test` | 대기 |
| BR4 | R4 | `App.tsx`, `styles.css`, `CanvasController.ts`(첫 Fit), 새 패널 껍데기·손잡이 컴포넌트, ui-state 저장 연결 | BR1, BP | Claude Opus high (직접 만든 끌기 손잡이, 저장 시점, 첫 Fit 지연, 캔버스 페이지에서 RightPanel·코멘트 세션 제거) | test, typecheck, build, 변경 범위 `/runtime-test` | 대기 |
| BR5 | R5 | `App.tsx`, `styles.css`, 새 작업 표시·점 필드 컴포넌트 | BR4, BD, BT | Claude Opus high (rAF 수명과 정지 조건, `interruptConversation` 오류 처리, 동작·투명도 줄이기) | test, build, 변경 범위 `/runtime-test` | 대기 |
| BR6 | R6, X1 | `styles.css`, `App.tsx`, `CanvasController.ts`(inset 적용), `canvasView.ts`와 테스트 | BR5 | Claude Sonnet high (CSS 재배치와 grep으로 확인하는 제거. 겹침 순서와 inset 적용만 판단이 필요하다) | test, typecheck, build, X1 grep, 변경 범위 `/runtime-test` | 대기 |
| BV | V1, V2, Z3와 그 수정 | 위 배치들의 파일 수정, `.scratch/design-sync/buzz-canvas/`, `.scratch/runtime-test/buzz-canvas/`, `docs/DESIGN.md` | BR6 | Claude Opus high (실제 앱 측정, 960·1238 겹침, 초안과의 차이 수정, 회귀 테스트) | V1 통과 조건, V2 항목별 결과, DESIGN.md 기록 | 대기 |
| BZ | Z1, Z2, Z4 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/features/buzz-restyle/*`, `docs/features/buzz-canvas/` 삭제 | 모든 배치 | 지휘자 (`/verify`, 문서 승격 커밋) | `verify.mjs` exit 0, tasks Z1·Z2·Z4 grep | 대기 |

리뷰 작업자(보고만, `/code-review`): BT·BP → Codex `gpt-6-astra` medium(교차 리뷰). BD → Claude Sonnet medium(Codex 구현의 교차 리뷰). BR1·BR4·BR5 → Codex `gpt-6-astra` medium(교차 리뷰, 포커스·수명·저장 판단). BR6 → Codex `gpt-6-astra` medium. BV의 코드 수정 → Codex `gpt-6-astra` medium.

## 겹침과 순서

- 1차 병렬: BT, BD, BP. 고치는 파일이 겹치지 않고, 셋 다 GUI를 쓰지 않는다.
- 2차부터 직렬: BR1(BT 통합 뒤) → BR4(BR1·BP 통합 뒤) → BR5(BR4·BD 통합 뒤) → BR6 → BV. 각 배치는 통합 브랜치의 최신 HEAD에서 새 워크트리로 시작한다. 실제 앱을 띄우는 배치는 한 번에 하나다.
- BZ 다음에 push와 PR을 한다. 병합하지 않는다.

## 진행 기록

- 2026-11-01: intake. 결정과 배치 표를 작성했다.
