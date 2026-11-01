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
| 2026-11-01 | Antigravity 로그인 실패는 buzz-canvas와 관계없어 별도 배치 BG가 맡는다. main에서 `fix-antigravity-signin` 브랜치를 만들고 PR도 따로 낸다 | 사용자("agy 로그인 문제는 원인 확인되면 이 지휘 세션에서 해결해줘"). 브랜치 분리는 지휘자 판단: 이 PR의 범위가 아니다 |
| 2026-11-01 | spec 완료 조건의 Fit 여백 문장을 design §2·§3의 안전 영역 규칙에 맞춰 고쳤다. 안전 영역에 들어가는 프레임은 그 가운데에, 안전 영역보다 높은 프레임은 위 56px에 둔다. 예외 기준은 '보드보다 높은 프레임'이 아니라 '안전 영역보다 높은 프레임'이다 | 지휘자 판단. RBT 🟡3. 사용자가 확정한 design의 상세 규칙이 있고, 폭 기준 Fit에서는 보드보다 낮지만 안전 영역보다 높은 프레임의 아래 가장자리를 도구모음 위에 둘 수 없다 |
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
| BG | Antigravity 로그인 버그(범위 밖, 별도 브랜치 `fix-antigravity-signin`) | `app/src/main/agentAuth/` 등 원인에 따라. buzz-canvas 파일과 겹치지 않는다 | — | Claude Opus high (실제 공급자 로그인 재현, 인증 수명·vault 판단. 틀리면 사용자 자격 증명을 잃는다) | 원인 증거, 회귀 테스트 red, `verify.mjs`, 복사 프로필로 `/runtime-test` | 진행 중 |
| BZ | Z1, Z2, Z4 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/features/buzz-restyle/*`, `docs/features/buzz-canvas/` 삭제 | 모든 배치 | 지휘자 (`/verify`, 문서 승격 커밋) | `verify.mjs` exit 0, tasks Z1·Z2·Z4 grep | 대기 |

리뷰 작업자(보고만, `/code-review`): BT·BP → Codex `gpt-6-astra` medium(교차 리뷰). BD → Claude Sonnet medium(Codex 구현의 교차 리뷰). BR1·BR4·BR5 → Codex `gpt-6-astra` medium(교차 리뷰, 포커스·수명·저장 판단). BR6 → Codex `gpt-6-astra` medium. BV의 코드 수정 → Codex `gpt-6-astra` medium.

## 겹침과 순서

- 1차 병렬: BT, BD, BP. 고치는 파일이 겹치지 않고, 셋 다 GUI를 쓰지 않는다.
- 2차부터 직렬: BR1(BT 통합 뒤) → BR4(BR1·BP 통합 뒤) → BR5(BR4·BD 통합 뒤) → BR6 → BV. 각 배치는 통합 브랜치의 최신 HEAD에서 새 워크트리로 시작한다. 실제 앱을 띄우는 배치는 한 번에 하나다.
- BZ 다음에 push와 PR을 한다. 병합하지 않는다.

## 진행 기록

- 2026-11-01: intake. 결정과 배치 표를 작성했다.
- 2026-11-01: Run `run_ac5b4279c92b`. BT(`ctx_4c6985551f11`, Sonnet high), BD(`ctx_b532be8d6da5`, Codex `gpt-6.1-sol` high), BP(`ctx_22f21290e57a`, Sonnet high)를 `894b434f`에서 시작했다. `launch.effective`가 요청과 같고, 세 터미널 모두 작업 중인 것을 확인했다. BD의 시작 확인은 30초 안에 관찰되지 않았지만 터미널에서 진행을 확인했다.
- 2026-11-01: BD 질문에 답했다. 테스트만 담은 커밋이 typecheck를 통과할 수 없으면 테스트와 구현을 한 커밋으로 묶고 red 출력을 handoff에 적는다(BT·BP에도 알림). 같은 기반에서 `shell.test.ts`·`thumbnails.test.ts`가 실패했지만, thumbnails는 단독 실행에서 26/26 통과했다. 부하 평균 약 117에서 생긴 시간 초과로 판단했다.
- 2026-11-01: 사용자가 dev 앱으로 Claude Code·Codex·Cursor·Copilot 로그인을 마쳤다(`metadata.json`). Antigravity만 실패했다. 앱 밖에서 같은 서버와 같은 계정으로는 성공했으므로 앱 쪽 문제로 보고 BG(`ctx_d0b91e863083`, Opus high, main 기반)를 시작했다.
- 2026-11-01: BD 완료(`324729b8`). RBD(Claude Sonnet medium) 결과 🔴·🟡 없음, ⚪ 2건. `b81d1de4`로 통합했다. BD와 RBD는 해제했고 워크트리는 Orca로 지웠다.
- 2026-11-01: BP 완료(`2d774666`). RBP(Codex `gpt-6-astra` medium) 결과 🔴·🟡 없음. ⚪2(모든 필드를 채운 ui-state 왕복 테스트)는 BP2로 같은 작업자에게 보냈다(`0f997be8`). `7aafc8e3`·`41db7562`로 통합했다. 관련 테스트 112개 통과. BP는 해제했고 워크트리는 지웠다. S1의 renderer 저장 연결과 '읽은 뒤에만 저장' 규칙은 BR4가 맡는다(RBP ⚪1).
- 2026-11-01: BT 완료(`9ef73ad8`·`2794be62`·`bc6850cf`). RBT(Codex `gpt-6-astra` medium) 결과 🟡 3건: 중복 id 행 key 충돌, 반올림 배율 때문에 한계 전에 −·+가 비활성됨, spec·design의 inset 문장 충돌. 앞의 둘은 BT2로 같은 작업자에게 보냈다. 셋째는 지휘자가 spec 문장을 design에 맞춰 고쳤다. `CanvasController`의 `EVEN_INSET`은 높은 프레임 띠에서 동작을 바꾸므로 BR1·BR6 runtime 증거에 넣는다(RBT ⚪1).

