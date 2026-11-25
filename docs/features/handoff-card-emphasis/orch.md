# 핸드오프 카드 강조 — orch

- 출처: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md). 체인 [chain-261125-1](../chain-261125-1/chain.md)의 링크 1이다.
- 시작 해시: `cd697d3b1` (origin/develop, thread-edit-lines #391 `46f91b070` 포함)
- 통합 브랜치: `feat/handoff-card-emphasis`
- Orca Run: `run_0e9a11b2b3ac`
- 런타임: conductor와 워커 모두 Claude. 모델 계열을 넘지 않는다.

## 결정 기록

- T1(드래프트와 메타 결정)은 끝났다. 드래프트 `.doan/canvases/handoff-card-emphasis.html`을 사용자가 2026-11-25에 확정했다. 메타는 후보를 모두 남겼다. — conductor 판단, 근거: 체인 파일 '순서' 1, design.md '드래프트 요청'.
- 상태 줄, 그룹 이름, Open 이름 문구는 드래프트의 `copy` 프레임을 따른다("Handed off to this conversation" 등). — conductor 판단, 근거: 확정된 드래프트.
- T2의 결정 지점: design.md 범위(두 채널을 프로토타입 창에 열기, 재생 중인 root로 제한, 인스턴스 공유)를 넘는 새 캡처 경로나 채널이 필요하면 멈추고 사용자에게 묻는다. — 체인 시작 점검에서 사용자 승인.
- 기존 이벤트 `thumbnails:changed`를 프로토타입 창(재생 중인 root)에도 보내는 것은 T2 범위 안이다. 새 채널이 아니고 같은 데이터이기 때문이다. — conductor 판단.
- T6의 PRODUCT, ARCHITECTURE, BACKLOG 승격과 기능 디렉터리 삭제는 conductor가 문서별 커밋으로 한다. README 캔버스 수정과 이미지 내보내기는 UI 워커(B3)가 한다. — conductor 판단, 근거: `/orchestrate` §4·§5(conductor는 문서 커밋만 쓴다).

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| B1 | T2 썸네일 공유, 프로토타입 창 IPC | `renderer/thumbnails.ts`, `renderer/App.tsx`(썸네일 연결만), `main/senderAllowed.ts`, `main/thumbnails*.ts`, `main/index.ts`의 썸네일 핸들러, `preload/prototype.ts`, `renderer/prototype/` 썸네일 훅 연결부(새 파일 가능), 각 테스트 | 없음 | Opus high — IPC 신뢰 경계와 두 소비자 간 가시성 병합이라 틀리면 보안·경합 결함이 된다 | `npm --prefix app test`, typecheck, lint | 구현 완료 `05b8bc039`·`641395f93`·`85975baba`, 리뷰 중 (`ctx_403cfa771c33`, worktree `hce-b1`) |
| B2 | T3 `handoffCardView`, `canvasCardMeta` | `renderer/handoffView.ts`, `renderer/canvasCardText.ts`, 각 테스트 | 없음 | Sonnet medium — 경우가 정해진 순수 함수와 테스트 | `npm --prefix app test`, typecheck, lint | 통합 완료 `1c1d9eae5`·`07f39ebbf`·`b04ae098f`·`f5c4f1fe5`, 1차 수정 1회. worktree 정리함(브랜치 `SinhyeokKang/hce-b2` 남김) |
| B3 | T4 UI + T5 `/design-sync`·`/runtime-test` + T6 README 캔버스·이미지 | `ConversationThread.tsx`, `styles.css`, `CanvasConversationPanel.tsx`, `ProjectOverview.tsx`, `prototype/PrototypeConversation.tsx`, `App.tsx`(prop 전달), 테스트, `docs/design/conversation.md`, `.doan/canvases/readme-features.html`, `docs/assets/readme/` | B1, B2 통합 | Opus high — 세 화면의 prop, memo deps, 공유 CSS, 실제 앱 측정까지 판단이 많다 | `npm --prefix app test`, typecheck, lint, `/design-sync`, `/runtime-test` | 대기 |
| R1 | B1 리뷰 | 보고만 | B1 | Opus medium — IPC 경계 리뷰 | `/code-review` 보고서 | 진행 중 (`ctx_7c0ea6e68e4c`) |
| R2 | B2 리뷰 | 보고만 | B2 | Sonnet medium — 작은 순수 함수 diff | `/code-review` 보고서 | 완료: 🔴 0, 🟡 1, ⚪ 5 |
| R3 | B3 리뷰 | 보고만 | B3 | Opus medium — UI와 CSS 공유 구조 | `/code-review` 보고서 | 대기 |

conductor 몫(T6): PRODUCT §5 item 2·3·'Overview', ARCHITECTURE §3·§7, BACKLOG 미검증 항목, `styles.css` 한쪽 규칙 확인, 기능 디렉터리 삭제, 최종 `/verify`.

## 파일 겹침과 순서

- B1과 B2는 파일이 겹치지 않아 병렬로 돈다.
- B3는 `App.tsx`(B1)와 두 순수 함수(B2)에 기대므로, B1과 B2를 통합한 뒤 시작한다.
- tasks 항목 대응: T1 완료, T2→B1, T3→B2, T4·T5→B3, T6→B3(README)·conductor(나머지). 주인 없는 항목은 없다.

## 리뷰·검증 기록

- B2 인계: `handoffCardView`에 `openLabel`, `canvasCardMeta`에 다섯째 인자 `{drawing, handedOffAt}`와 `handedOff`를 더했다. 핸드오프 카드에는 Edited가 없다(드래프트). B3는 `threadItems.ts`의 `handoffCard` 항목에 `at`을 싣고, `drawing`에는 `view.icon === "spinner"`를 넘기고, `handoffCardHead` 임시 wrapper를 지운다. gate: test 15653 통과, typecheck, lint 통과.
- R2(B2 리뷰): 🔴 0, 🟡 1(읽을 수 없는 캔버스가 `frames: []`와 함께 와서 "No frames"가 보인다), ⚪ 5. 🟡와 들여쓰기 ⚪를 B2에 1차 수정으로 보냈다(`ctx_cd305a638630`). B3에 넘길 것: `drawing`에는 `card.drawing`이 아니라 상태가 그리는 중인지(`view.icon === "spinner"`)를 넘긴다. `canvasCardMeta`에 넘길 row는 `canvasListed`와 같은 `sameCanvas`(`CanvasConversationPanel.tsx:530`)로 찾는다. `handoffCardHead` wrapper, `CARD_STATUS` 슬라이스를 지운다. T6 PRODUCT에는 "핸드오프 카드는 수정 시각 대신 핸드오프 시각"으로 쓰고, 폴더 예시 `design/checkout`은 옮기지 않는다(나올 수 있는 폴더는 `.doan/ds`뿐).
- B1 인계: App이 `ThumbnailHub`를 갖고 viewer마다 `useThumbnails(hub, root, rows)`를 부른다. main `thumbnails.ts`는 visibility를 창마다 따로 기록하고, 프로토타입 창이 닫히면 그 창의 표시를 지운다. 프로토타입 창은 재생 root에 한해 `thumbnails:get`·`visible`·`changed`를 쓴다(`main/prototype/thumbnailScope.ts`). `visible:false`는 재생 root 밖이어도 받는다(자기 창 표시만 지운다). 새 채널이나 캡처 경로는 없다 — 창별 visibility 기록은 기존 채널 안의 추적이라 결정 지점 범위 안으로 판단했다(conductor). B3 할 일: `PrototypeConversationCalls`에 `ThumbnailCalls`를 더하고, 패널 카드용 `useThumbnails`를 App에서 한 번 더 부른다(카드가 가리키는 row만). T6: ARCHITECTURE §3 'Sender role', §7 'Thumbnail IPC'. gate: test 15630, typecheck, lint 통과.
