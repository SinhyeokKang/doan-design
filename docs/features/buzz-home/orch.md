# buzz-home — orch

계획 출처: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md). 이 문서는 배치 분할·결정·상태만 적는다.

- 시작 해시: `e050ae45` (2026-10-29, origin/main보다 28커밋 앞섬, 뒤처짐 0)
- 통합 브랜치: `feat-buzz-home`
- 지휘자 체크아웃: `/Users/sinhyeok/code/doan-design`

## 결정 기록

| 날짜 | 결정 | 출처 |
|---|---|---|
| 2026-10-29 | 브랜치 예외: main에서 새로 만들지 않고 feature 문서와 확정 초안이 든 기존 `feat-buzz-home`을 이어 쓴다 | 이전 세션 인계(`.scratch/handoff-buzz-home-orch.md`) |
| 2026-10-29 | 지휘자는 새 Orca 워크트리 대신 원래 체크아웃에서 `feat-buzz-home`으로 바꿔 진행한다 | 지휘자 판단 — 사용자가 이 체크아웃에서 `/orchestrate`를 불렀고 브랜치가 비어 있었다 |
| 2026-10-29 | Codex 작업자 사용 허가(모델 계열 교차) | 사용자 ("Codex 허가") |
| 2026-10-29 | P1·P2는 격리 userData·`DOAN_RUNTIME` 앱의 doan 연결로 probe한다. 다섯 공급자 로그인 승인은 지휘자가 ego-browser로 한다. 비밀번호·2단계 인증이 나오면 사용자에게 넘긴다 | 사용자 |
| 2026-10-29 | V1 (d)~(g) 실제 로그인 앱 확인과 V3 agent-eval을 게이트 통과 뒤 따로 묻지 않고 실행한다 | 사용자 |
| 2026-10-29 | 리뷰는 배치마다 별도 작업자가 하고, 교차 계열 리뷰는 Codex `gpt-6-astra` medium으로 한다 | 지휘자 판단 — 사용자 선호(Claude 주 작업, Codex는 독립 리뷰·기계적 배치) |
| 2026-10-29 | U1은 새 홈 CSS가 있어야 검증할 수 있으므로 U3 배치에 묶는다 | 지휘자 판단 — tasks U1 검증 대상이 새 홈 CSS |
| 2026-10-29 | U2는 작은 renderer 변경이라 U0 배치에 묶는다 | 지휘자 판단 — 파일 겹침 없음, 작업자 수 절약 |
| 2026-10-29 | 프리셋 그룹은 카탈로그에서 연속하지 않아도 되고, 테스트는 그룹 첫 등장 순서와 그룹 안 순서를 고정한다(design §4.4a 정정) | 지휘자 판단 — BT0 질문, 카탈로그 순서에서 `distill`이 Refine 사이에 있음(PRODUCT §5 Skills 13) |

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort (이유) | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| BP | P1, P2 | `.scratch/buzz-home/poc-*/`, `docs/PRODUCT.md` §6 | — | Claude Opus high (실제 공급자 다섯, 해석이 M 설계를 바꿈) | tasks P1·P2 통과 기준, PRODUCT §6 기록 | 대기 |
| BT0 | T0 | `cli/` 프리셋 catalog·Summary·fixture, `app/src/main/designSkills.ts`(+test), 필요하면 `app/src/preload/index.ts`의 프리셋 타입 | — | Codex `gpt-6.1-sol` medium (키 하나 추가, 기계적) | `go test ./...`, `go vet ./...`, `npm --prefix app test` | 대기 |
| BT1 | T1 | `app/src/main/uiState.ts`, `app/src/restore/uiState.ts`, `app/src/main/conversation/types.ts`·`store.ts`(+tests, fixtures) | — | Claude Opus medium (기존 판독기 호환이 깨지면 기록 손실) | `npm --prefix app test`, typecheck | 대기 |
| BT2 | T2, T3, T4 | 새 파일 `app/src/renderer/homeComposer.ts`·`conversationStrip.ts`·`homeConversations.ts`(+tests) | — | Claude Opus high (경우가 많고 UI 전체가 이 함수에 기댐) | `npm --prefix app test`, typecheck | 대기 |
| BU0 | U0, U2 | `app/src/renderer/ds/controls.css`·`surfaces.css`·`checks.test.ts`, `Toast.tsx`(+test), `styles.css`의 토스트 규칙, `agentAuthView.ts`(+test) | — | Claude Opus medium (공용 변형의 우선순위 함정) | `npm --prefix app test`, typecheck | 대기 |
| BM | M1–M4 | `app/src/main/conversation/ipc.ts`·`runners.ts`·`prompt.ts`·`service.ts`·`acpRunner.ts` 등, 새 `app/src/main/attachments.ts`, `app/src/main/index.ts` 연결, `app/src/preload/index.ts` | BP, BT1 통합 | Claude Opus high (IPC 보안·발신자 제한·프로세스) | `npm --prefix app test`, typecheck | 대기 |
| BU3 | U1, U3, U4, U5 | `Home.tsx`, 새 `HomeComposer.tsx`·`ConversationStrip.tsx`, `App.tsx`, `ShellSidebar.tsx`, `styles.css`(토스트 외), `tokens.css`, `setup/homeAlerts.ts` 삭제, `.scratch/buzz-home/token-literals.mjs` | BT0, BT2, BU0, BM 통합 | Claude Opus high (화면 교체와 App 흐름) | `npm --prefix app test`, typecheck, `rg -n homeAlerts app/src` 0건, token-literals 0건 | 대기 |
| BV1 | V1 | `.scratch/runtime-test/`, `docs/PRODUCT.md` §6 | BU3 통합 | Claude Opus medium (실제 앱 probe, 실제 로그인) | tasks V1 | 대기 |
| BV2 | V2 | 앱 CSS·컴포넌트 수정, `docs/DESIGN.md` | BU3 통합 (BV1과 GUI 시간 조율) | Claude Opus high (측정·수정·회귀 테스트) | `/design-sync` 남은 차이 0 또는 문서화 | 대기 |
| BV3 | V3 | `docs/USABILITY-EVAL.md` | BV2 통합 | `/verify`는 지휘자, agent-eval은 Claude Sonnet medium (정해진 명령 실행·기록) | `verify.mjs` 통과, eval 결과 기록 | 대기 |
| BZ | Z1, Z2 | `docs/PRODUCT.md`·`ARCHITECTURE.md`·`DESIGN.md`·`DIRECTORY.md`, `docs/features/buzz-restyle/tasks.md`, `docs/features/buzz-home/` 삭제 | 모든 배치 | 지휘자 (문서 승격 커밋) | tasks Z1 grep, Z2 디렉터리 없음 | 대기 |

리뷰 작업자: 구현 배치(BT0·BT1·BT2·BU0·BM·BU3·BV2 코드 수정)마다 Codex `gpt-6-astra` medium이 `/code-review`로 보고만 한다.

## 겹침과 순서

- 1차 병렬: BP, BT0, BT1, BT2, BU0. 서로 파일이 겹치지 않는다. `app/src/preload/index.ts`는 1차에서 BT0만 만질 수 있다.
- BM은 BP 결과가 PRODUCT §6에 기록되고(design §4.7·§4.8과 다르면 그 절을 고치고 사용자 확인 뒤) BT1이 통합된 뒤 시작한다.
- BU3는 BT0·BT2·BU0·BM 통합 뒤. `styles.css`는 BU0(토스트 규칙)이 먼저, BU3가 나중이다.
- BV1·BV2는 BU3 통합 뒤. GUI probe 시간이 겹치지 않게 지휘자가 조율한다.
- BV3 → BZ → push·PR.

## 진행 기록

- 2026-10-29 1차 시작: BP·BT0·BT1·BT2·BU0을 `feat-buzz-home`(`194bfe0e`)의 child 워크트리에서 띄웠다. 실제 적용 모델은 표와 같다(`launch.effective` 확인).
- 2026-10-29 BT1 완료(`52cf0fb5` test, `793143fb` feat; app test 4414 통과, typecheck 통과). 인계 사항: main `uiState.ts`가 renderer 저장마다 main 창 상태를 통째로 바꾸므로 BU3는 저장할 때마다 `home`을 함께 보내야 한다. ui-state의 모르는 키는 design §8대로 버린다(브리프의 '유지' 표현이 틀렸다). 리뷰: Codex `gpt-6-astra` medium.
- 2026-10-29 BT1 리뷰(Codex `gpt-6-astra` medium): 🔴 0 / 🟡 0 / ⚪ 2. 통합 `67043c1f`·`5a6e6403`. 작업자·리뷰어 해제, 워크트리 제거.
- 2026-10-29 BT0 완료(Codex `gpt-6.1-sol` medium, `9b8af9d8`·`b4104036`). 리뷰(Claude Sonnet medium): 🔴 0 / 🟡 0 / ⚪ 2(동시 실행 중 app test 1건 flake, 재실행 통과). 통합 `20e9a2b0`·`8814b998`. 작업자·리뷰어 해제, 워크트리 제거. 통합 `/verify`는 1차 코드 배치(BT2·BU0)를 통합한 뒤 한 번에 돌린다(작업자 테스트와 겹치지 않게).
- 2026-10-29 BU0 완료(`87ed9f6d`·`9e1fb33a`·`3945f2ef`·`631df8ca`). 리뷰(Codex `gpt-6-astra` medium): 🔴 0 / 🟡 0 / ⚪ 0. 통합 `d90fdd01`·`f260bc76`·`dc185500`·`0377484a`. 작업자·리뷰어 해제, 워크트리 제거. BU3로 넘김: 홈 선택자들의 `violetAllowed` 항목(프리셋 칩·추천 프롬프트 아이콘·그라디언트·드롭 외곽선·LNB 슬롯), 칩 × 색(홈 CSS, 색만). BZ로 넘김: DESIGN.md 34·72행과 ARCHITECTURE §7 'Toasts'의 옛 토스트 위치.
- 2026-10-29 BP 로그인: Claude(사용자가 직접 로그인, 지휘자 확인)·Codex·Cursor·Copilot을 지휘자가 ego-browser로 승인했다.
