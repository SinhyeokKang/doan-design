# 답 팝오버 — orch

- 원본: [spec](spec.md) · [design](design.md) · [tasks](tasks.md)
- 체인: [chain-261126-1](../chain-261126-1/chain.md)의 링크 2(answer-popover). check-scope와 병렬 그룹이다.
- 시작 hash: `7e8f22f75`
- 통합 브랜치: `feat/answer-popover` (lead가 develop에서 만들었다)
- conductor: Claude Opus 5.5, worktree `answer-popover-orch`

## 결정 기록

- T1(드래프트)은 끝났다. 드래프트 `.doan/canvases/answer-popover.html`은 사용자가 확정했고 develop에 있다(chain.md). 이 링크는 T2부터 한다.
- 구현 시작 조건인 comment-trim 머지는 develop에 있다(`fa680f913`).
- T2 PoC의 방식(A·B) 선택: conductor가 design.md 기준으로 정한다(chain.md '시작 점검'). 두 방식 모두 요구 항목을 못 채우면 멈추고 사용자에게 묻는다.
- conductor's call — 끝 여백은 방식 A(overlay + ResizeObserver 여백)로 한다. 근거는 design.md 'PoC 결과'다. 남은 항목(여백만 바뀔 때의 거짓 Jump to latest)은 design이 계획한 따라가기 변경으로 T4에서 없애고 B2c `/runtime-test`에서 확인한다.
- 사용자 — 접힌 팝오버가 새 요청으로 펼쳐지면 펼친 채 남는다. 새 요청만 끝나도 다시 접히지 않는다(R1 D1, design '상태'에 반영).
- 사용자 — 위로 스크롤한 채 답해서 생긴 접힌 줄과 turn indicator는 새 내용이므로 Jump to latest가 뜬다(R2 U1, design '끝 여백과 따라가기'에 반영).
- 사용자 — 높이 상한이 머리줄과 버튼 줄보다 작은 크기(프로토타입 창 최소)에서는 머리줄과 버튼 줄을 지킨다. 본문이 먼저 줄고, 모자라면 팝오버가 스레드 영역 위로 올라간다(B2c 질문, design '드래프트에서 정한 것'에 반영).
- conductor's call — 문서에 '확인 필요' 항목이 없으므로 시작 전에 사용자에게 물을 것이 없다(chain.md '시작 점검').
- conductor's call — T6(PRODUCT·ARCHITECTURE·BACKLOG 승격, 기능 디렉터리 삭제)는 문서만 바꾸므로 conductor가 통합 뒤 직접 한다(`/orchestrate` §4·§5).
- conductor's call — T5 `/design-sync`와 `/runtime-test`는 코드를 고칠 수 있으므로 T3·T4를 맡은 워커(B2)가 같은 worktree에서 이어서 한다. 고치는 코드의 주인이 같아야 한다.

## 모델 계열 교차

- 사용자가 체인 '상시 권한'에서 배치 워커에 Codex `gpt-6.1-sol`, effort `high`까지를 허가했다.
- 이 링크에서 Codex를 쓴 범위: 아래 배치 표의 모델 열에 적는다. 리뷰 워커도 배치 워커로 본다.
- 시작 시점 Codex 사용률: 5h 2%, 7d 1%.
- R1(T3 리뷰): Codex `gpt-6.1-sol` `high`. 띄우기 전 사용률 5h 32%, 7d 5%.
- R2(T4 리뷰): Claude Opus high. 띄우기 전 Codex 5h가 52%였고, check-scope의 `/agent-eval`이 같은 Codex 한도를 쓰므로 Claude로 띄웠다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| B1 | T2 PoC(끝 여백 A·B) | `.scratch/answer-popover/`, design.md 'PoC 결과' | 없음 | Claude Opus medium — 격리된 실제 앱에서 스크롤 따라가기를 재고 해석해야 한다 | 비교 항목마다 측정값·스크린샷이 `.scratch/`에 있다 | 통합 `2fd83aea6` |
| B2a | T3 순수 함수 | `questionDraft.ts`, `conversationStore.ts`, `overviewRun.ts`, `threadMotion.ts`와 각 테스트 | 없음 | Claude Opus high — T4·T5를 이어 맡으므로 같은 워커이고, 포커스·따라가기 규칙의 판단이 크다 | `npm --prefix app test`(red → green), `typecheck` | 통합 `54c574aef` |
| B2b | T4 팝오버, 스레드, 진입점 | `app/src/renderer/` 대화 파일 전부와 `styles.css`, 테스트 | B1, B2a | B2a와 같은 워커 | `test`, `typecheck`, `lint` | 통합 `ebc627ecf`(ff) |
| B2c | T5 `/design-sync`, `/runtime-test` | `docs/design/conversation.md`, `docs/design/canvas-conversation.md`, `docs/DESIGN.md`, 고칠 코드 | B2b | B2a와 같은 워커 | 측정값이 드래프트와 같거나 차이가 기록됨, 스크린샷 | 진행 |
| R | 각 구현 배치의 `/code-review` | 보고만 | 해당 배치 | R1 Codex Sol high, R2 Claude Opus high(아래 '모델 계열 교차') — Codex Sol high — 다른 계열이 구현에 묶이지 않은 눈으로 본다 | 🔴 0 | 대기 |
| C | T6 승격과 정리 | PRODUCT, ARCHITECTURE, BACKLOG, 기능 디렉터리 삭제 | B2c | conductor | 옛 문장이 남지 않음(읽어서 확인) | 대기 |

## 겹침과 순서

- B1과 B2a는 파일이 겹치지 않으므로 병렬로 돌린다. B1은 앱 코드를 고치지 않는다(probe가 실행 중인 renderer에 DOM과 스타일을 넣어서 잰다).
- B2b는 B1의 PoC 결과와 B2a 통합 뒤에 같은 워커에게 새 Task로 보낸다.
- GUI probe(B1, B2c)는 겹치지 않게 돌린다. B2c는 B1이 끝난 뒤에만 시작한다.

## tasks 항목 → 배치

- T1 → 완료(develop)
- T2 → B1
- T3 → B2a
- T4 → B2b
- T5 → B2c
- T6 → C

## 진행 기록

- B1: PoC 커밋 `5d29b6799`를 `2fd83aea6`로 통합했다. probe와 근거는 conductor checkout의 `.scratch/answer-popover/`에 복사했다. 실제 프로토타입 창은 열지 않고 스레드 영역 150으로 근사했다.
- B2a: T3 커밋 3개를 `c5e8d9fe3`, `d3e6ec847`, `54c574aef`로 통합했다. 워커의 `/verify`는 `app/src/main/conversation/editLines.test.ts`의 50 ms 시간 테스트에서 실패했다(부하 평균 약 100, 이 브랜치는 `app/src/main`을 건드리지 않는다). 통합 HEAD의 `/verify`는 마지막에 다시 돌린다. `followResize`가 `ConversationThread.tsx`에서 `threadMotion.ts`로 옮겨 갔다.
- B2b: 같은 워커에 T4를 보냈다(dispatch `ctx_48bdfdebeec6`). 워커는 브랜치를 `feat/answer-popover`로 맞춘 뒤 시작한다.
- R1: T3 diff 리뷰를 Codex에 맡겼다(dispatch `ctx_2ce1c12da0d6`).
- R1: 🔴 0, 🟡 1(F1: `scrollHeight − inset`으로는 내용 성장을 믿을 수 없다. 소수 높이와 뷰포트 하한에서 여백만 바뀌어도 `behind`가 켜진다), ⚪ 2(N1: `resized()`의 raw `grew` 분기, N2: 턴이 resolved 없이 끝나면 접힘이 남는다), 결정 1(D1, 사용자 답 반영). F1·N1·N2와 D1을 B2에 고칠 거리로 보냈다.
- B2b: T4와 R1 고칠 거리(F1, N1, N2, D1)를 `e29991a73`..`ebc627ecf`로 fast-forward 통합했다. 워커의 `/verify`는 `app/src/main/exportViewer.test.ts`의 waitFor 3000 ms 시간 초과에서 실패했다(부하 평균 약 25, 이 브랜치는 `app/src/main`을 건드리지 않는다, 혼자 돌리면 3/3 통과). 격리 앱 probe는 13/13 통과했다. 실제 앱에서 확인하지 못한 것(docked buddy 비켜서기, 권한 요청, 프로토타입 창, Overview, 테마, 모션)과 드래프트와 다른 점(본문 아래 fade, 접기 fade 순서)은 B2c로 넘겼다.
- B2c: 같은 워커에 T5를 보냈다(dispatch `ctx_a4d7ab98a0e0`). R2: T4 리뷰를 새 child worktree `ap-r2`에서 시작했다(dispatch `ctx_bbcbcacec4e3`).
- R2: 🔴 0, 🟡 2(Y1: 팝오버가 요청이 바뀌어도 같은 컨트롤을 다시 써서, 포커스가 다음 요청의 같은 버튼에 남는다. 실제 DOM에서 재현했다. Y2: 캔버스 패널 arrival 경로와 PrototypeWindow 포커스의 효과 실행 테스트가 없다), ⚪ 4, 결정 1(U1, 사용자 답 반영). R1 고칠 거리는 모두 고쳐졌다. Y1·Y2와 ⚪1–3을 B2에 보냈다.
