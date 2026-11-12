# canvas-text-copy — orch

- 원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md)
- 체인: [chain-261112](../chain-261112/chain.md) 링크 3. conductor는 체인 파일을 읽기만 한다.
- 시작 hash: `02e6e505` (origin/develop, PR #178 포함)
- 통합 브랜치: `feat/canvas-text-copy` (lead가 만들었다)
- conductor: Claude Code. 워커도 Claude만 쓴다(계열 넘기 허가 없음).

## 결정 기록

- 시작 점검(lead가 사용자 승인, 2026-11-13): PoC 1·2·3이 실패하면 멈추고 사용자에게 묻는다. probe는 `app/runtime/clipboard.ts`로 클립보드를 저장하고 되돌린다. 격리 앱 창이 사용자 작업 중에 떠도 된다.
- 제품 결정은 design.md '사용자 결정'과 '초안 요청'에 있다. 새로 물을 것은 없다.
- conductor 재량 — `MAX_COPY_TEXT` 값과 사각형 상한 값: design.md가 `/tdd`에서 정한다고 했으므로 구현 워커가 정하고 handoff에 근거를 적는다.
- conductor 재량 — PoC와 구현을 같은 워커에 순서대로 맡긴다: 모든 작업이 같은 파일(`canvasScript.ts`, `CanvasController.ts`)을 바꿔 병렬로 나눌 수 없고, PoC 관찰을 구현이 바로 쓴다.
- 사용자 결정(2026-11-13, R 🟡-1): 위조 `text-range`는 OS 커서가 캔버스 영역 안일 때만(`focusOnClick`과 같은 `pointer:get` 기준) 앱 선택 접기와 캔버스 텍스트 채택을 한다. 클립보드에 캔버스가 고른 문자열을 넣는 길을 포커스 없이 열지 않는다.
- conductor 재량 — R ⚪-7(프레임 밖 경계가 클릭한 요소라 노트 안 인라인 단어를 넘지 못함): 그대로 둔다. 사용자 결정 8과 PRODUCT §5 item 4의 "A click outside every frame selects that element at once as a note"와 같은 규칙이다.
- conductor 재량 — R ⚪-8: tasks 8의 마지막 `rg` 확인이 남는 초안 경로와 POSTMORTEM 이력까지 잡는다. `docs/features/` 인용만 찾도록 좁힌다.
- conductor 재량 — 작업 7(`/verify`)과 8(문서 승격)은 conductor가 통합 뒤 직접 한다. DESIGN.md 측정값은 작업 5(`/design-sync`) 워커가 쓴다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| P | tasks 1 (PoC) | `design.md` 'PoC 의존' 결과, `.scratch/runtime-test/canvas-text-copy/` | 없음 | Opus high — 실제 앱에서 OOPIF 입력·클립보드·메뉴 동작을 판단하고, 실패 시 대체 경로를 설계에 반영해야 한다 | 다섯 항목 관찰이 design.md에 있음, `assertRealState` 통과, 클립보드 복원 | 통합 `8a54288d` |
| I | tasks 3, 4, 5, 6 (`/ship bypass`: tdd → implement → design-sync → runtime-test → code-review → refactor, push 전 멈춤) | `app/src/main/canvasScript.ts`(+test), `app/src/renderer/CanvasController.ts`(+test), `canvasTool.ts`(+test), `canvasMessage.ts`(+test), 새 `canvasTextCopy.ts`(+test), `styles.css` overlay, 필요 시 `app/src/main/index.ts` Edit 메뉴, `docs/DESIGN.md` 측정값, `docs/POSTMORTEM.md`(해당 시) | P 통합 | Opus high — 입력 경로, 늦은 메시지 순서, 신뢰하지 않는 메시지 상한, hover·포커스 회귀 이력이 있는 영역이다 | `npm --prefix app test`·`typecheck`·`lint`·`build`, `/design-sync` 보고서, `/runtime-test` 보고서와 스크린숏 | 대기 |
| R | I의 diff 독립 검토 (`/code-review`, 보고만) | 없음(읽기만) | I 완료 | Opus high — 같은 이유. 구현 워커와 다른 세션이어야 한다 | 🔴 0 | 대기 |
| C | tasks 7 (`/verify`), 8 (승격과 정리) | PRODUCT, ARCHITECTURE, BACKLOG, `docs/features/canvas-text-copy/` 삭제 | R 🔴 0 | conductor | `verify.mjs` PASS, tasks 8의 `rg` 확인 | 대기 |

tasks 2(초안)는 develop에서 끝났다(`6a9a8e82`).

## 겹침과 순서

- P와 I는 같은 파일을 다루므로 직렬이다. I는 P가 통합된 뒤 같은 워커에 새 Task로 보낸다.
- 링크 1(`cli/`, `eval/`)·링크 2(`app/src/main/conversation/`, 스레드 UI, `ds/surfaces.css`)와 코드 파일이 겹치지 않는다. 겹쳐야 하면 lead에게 먼저 알린다.
- GUI probe는 짧게 돌린다. 다른 링크와 같은 순간에 앱 창을 띄운 일이 있으면 PR 본문에 적는다.

## 진행 기록

- P: 워커 `ctc-worker`(Opus high, dispatch `ctx_3211516b9815`). PoC 1–4 통과, 3은 대체 경로 없이 `role: "copy"` 유지, 5는 `text-point`가 필요하다. `d908bb78`을 `8a54288d`로 통합했다. 미검증: 실제 ⌘Tab 키, 실제 트랙패드 핀치(Ctrl 휠로 대체). 사고: 첫 실행의 ⌥ CGEvent가 실제 HID 상태에 Option을 약 5분 남겼다. 워커가 풀었고 오염된 결과는 다시 돌렸다.
- I: 같은 워커에 새 Task로 보냈다(dispatch `ctx_8db6e460b990`). 워커가 `/ship`을 시작한 것을 터미널에서 확인했다.
- I 완료: 커밋 5개를 `431a22d3..bc21eebe`로 통합했다. 워커 브랜치의 HEAD `f570c3b1`에서 `verify.mjs`가 PASS였다. `/design-sync`에서 초안과 다른 값은 0개였다. `/runtime-test`는 22/22 통과했다. 워커는 하위 에이전트가 금지된 것으로 읽어 독립 리뷰를 하지 않았다. 브리프의 뜻은 "Claude만"이었다. 독립 리뷰는 R이 맡는다.
- conductor 재량 — tasks 6이 적은 확인 중 워커가 하지 않은 것(드래그 중 live reload, 드래그 중 `doan open` 전환, 실제 말풍선 선택, spec 완료 조건 6)을 같은 워커에 probe만 하는 후속 Task로 보냈다(dispatch `ctx_2b99bc711a01`). 근거: 검증을 확실히 하는 쪽을 고른다. 다크 모드, forced colors, 다른 버디, OS I-beam 커서, 실제 핀치·⌘Tab은 tasks에 없는 확인이라 BACKLOG로 넘긴다.
- I 후속 완료: 세 확인 모두 통과했다(`add-probe.mjs` 4/4). 드래그 중 다시 불러오기와 `doan open` 전환에서 하이라이트가 지워지고 돌아오지 않았다. 실제 말풍선 선택과 캔버스 텍스트는 마지막에 만든 쪽이 복사됐다. 대화는 격리 userData에 심었고 provider 로그인이나 실제 상태는 쓰지 않았다. 앱 창은 16:47:21–16:47:47 UTC에 떠 있었다. 앱 코드는 바뀌지 않았다.
- R: `ctc-review`(Opus high, dispatch `ctx_e31229020fdf`)가 `43d7587f..bc21eebe`를 검토한다. 읽기만 하므로 I의 후속 probe와 동시에 돈다.
- R 완료: 🔴 0, 🟡 2, ⚪ 8(보고서는 conductor `.scratch/review-R.md`에 복사). 계획 이탈 8개는 모두 타당하다고 판단했다. 테스트는 돌리지 않았다(worktree에 node_modules 없음).
- 수정 1차: 🟡-2와 ⚪-1–5를 I 워커에 보냈다(dispatch `ctx_7698cd6817c7`). 🟡-1은 사용자 결정 뒤 2차로 보낸다. ⚪-6은 BACKLOG로 넘긴다.
