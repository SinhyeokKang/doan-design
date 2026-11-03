# conversation-delete — orch

- 계획: [spec.md](./spec.md), [design.md](./design.md), [tasks.md](./tasks.md). 초안 `.doan/canvases/conversation-delete.html`은 사용자가 확정했다.
- 시작 hash: `787d4907` (main)
- 통합 branch: `feat/conversation-delete`
- 모델 경계: 이번 세션은 교차 허가가 없어 Claude worker만 쓴다.

## 결정 기록

1. **N1 추가(사용자 요청, 지휘 중)**: 새 대화 상태일 때 새 대화 아이콘 버튼(Overview header 끝 `ov-new-conv`, 캔버스 panel `doan-conv-new`)을 비활성으로 한다.
2. N1 세부 — 지휘자 판단(근거: DESIGN 'Locked Back'과 Add to conversation의 `aria-disabled` 관례):
   - `disabled`가 아니라 `aria-disabled`로 둔다. 툴팁과 focus 순서가 남는다. 비활성 색 `--text-disabled`, hover 채움 없음, 기본 cursor.
   - 툴팁은 `New conversation` 그대로다. 제목이 이미 New conversation이라 이유 문구를 따로 두지 않는다.
   - 누르면 아무 일도 없다. 지금의 "이미 새 대화면 composer에 포커스" 동작을 대신한다.
   - 제목 메뉴(서랍)의 New conversation 행과 ⌘N은 바꾸지 않는다. 사용자가 "맞다면 같이"라고 물었고 지휘자가 그대로 두기로 했다. 그 행은 radio 항목이라 새 대화 상태에서는 선택된 행(`current` 채움)으로 보인다. 지금 보이는 대화 행도 비활성이 아니다. 고르면 메뉴가 닫히고 composer로 포커스가 가며, 비활성으로 두면 메뉴 안에 고를 수 없는 행이 하나 생긴다.
   - T5에서 PRODUCT §5 item 3 'Project Overview'의 "or focuses the composer when one is already new"를 현재 규칙으로 고친다.
3. B handoff에서 나온 판단 — 지휘자 판단:
   - `OverviewRun.deleted(id)`는 root를 받지 않고 모든 root에 적용한다(design §3.2 "모든 root").
   - 요청만 걸려 있던 상태는 보이는 화면을 바꾸지 않고 요청만 버린다(spec 완료 조건 7).
   - 제목이 빈 대화의 거절 토스트는 `this conversation` 문구를 쓴다(확인 알림의 `Delete this conversation?`과 맞춤).
   - `not_found` 거절은 이미 main에 없는 대화이므로 C가 성공 경로의 `deleted()` 정리를 적용한 뒤 `“<title>” was already deleted.` 토스트를 띄운다. 정리하지 않으면 다음 목록 읽기까지 지운 대화가 화면에 남는다.
4. D1(사용자 결정, RA Y1): 시작 때 정리는 삭제가 기록한 id의 기록·초안만 지운다. index에 없더라도 기록이 없는 파일은 남긴다(index를 외부 요인으로 잃은 기기에서 다음 실행 때 모든 기록을 지우는 문제). design §2.1·§2.2의 "index에 없는 모든 기록" 규칙을 대신하며 T5에서 ARCHITECTURE에 적는다.
5. C 질문 — 지휘자 판단:
   - Radix probe에서 Delete 툴팁이 열린 동안 첫 Esc가 툴팁만 닫았다. 구조는 그대로 두고 제목 메뉴를 controlled로 바꿔 툴팁의 Esc가 메뉴도 닫게 한다(spec 완료 조건 2).
   - renderer에는 종료 신호가 없다. A가 수정 1회차 뒤 main→renderer 종료 push(before-quit에서 `conversations.quit()` 전)를 더하고, C가 그것으로 종료 중 거절 토스트를 막는다(spec 완료 조건 5, design §3.4).
   - tasks T4의 "OS 알림 클릭이 확인 알림을 Cancel처럼 닫음"은 PRODUCT §5 item 0 'Notifications'(모달 중 클릭은 창만 앞으로)를 따른다. `doan://` 링크는 기존대로 Cancel처럼 닫는다.
6. T5(문서 승격)는 지휘자가 한다. DESIGN.md의 `/design-sync` 값은 C가 쓰고, 지휘자가 통합 때 확인한다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| A | T1, T2 | `app/src/main/conversation/{store,drafts,service,ipc}.ts`와 그 테스트(새 `storeDelete.test.ts` 포함), `app/src/main/index.ts`, `app/src/main/notifyService.ts`와 테스트, `app/src/preload/index.ts`와 테스트 | 없음 | Opus high — 되돌릴 수 없는 삭제, index commit 순서, 크래시 뒤 정리, live runner와 늦은 이벤트 경쟁 | `npm --prefix app test`, `npm --prefix app run typecheck` | 통합(`702e3c68`..`7e10089a`, `9539aad1`..`88b0ac33`), 리뷰 4회차 🔴0 🟡0 |
| B | T3 | `app/src/renderer/`의 새 `conversationDelete.ts`, `overviewConversation.ts`, `canvasConversation.ts`, `overviewRun.ts`, `canvasRun.ts`, `homeRun.ts`, `conversationStore.ts`와 그 테스트 | 없음 | Opus high — IPC 답과 목록 이벤트의 순서 경쟁, revision 규칙, 여러 Run의 상태 정리 | `npm --prefix app test`, `npm --prefix app run typecheck` | 통합(`aac23ea4`..`6710020a`), 리뷰 2회차 🔴0 🟡0 |
| C | T4, N1 | `ProjectOverview.tsx`, `CanvasConversationPanel.tsx`, 새 확인 알림 컴포넌트, `styles.css`, `App.tsx`(삭제 호출과 정리 연결), 그 테스트, `docs/DESIGN.md`(`/design-sync` 값) | A·B 통합 | Opus high — Radix 구조 probe, 포커스 반환, 실제 앱 확인과 초안 비교 | test, typecheck, build, `/runtime-test`, `/design-sync` | 대기 |
| RA·RB·RC | 각 배치 `/code-review` | 보고만 | 해당 배치 완료 | Opus high — 데이터 삭제·경쟁·포커스 결함을 찾는 독립 리뷰 | 🔴 0 | 대기 |
| T5 | 문서 승격, feature 디렉터리 삭제 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/BACKLOG.md`, `docs/features/conversation-delete/` | C 통합 | 지휘자 | `verify.mjs`, `rg` 확인 | 대기 |

## 파일 겹침과 순서

- A(main·preload)와 B(renderer 순수 규칙·Run)는 겹치지 않아 병렬로 돈다.
- C는 A의 preload 채널과 B의 규칙을 쓰므로 A·B를 통합한 `feat/conversation-delete`에서 새 worktree로 시작한다.
- N1은 C와 같은 파일(`ProjectOverview.tsx`, `CanvasConversationPanel.tsx`)이라 C에 넣는다.
- tasks.md의 T1~T5와 N1은 모두 위 표의 한 행에 속한다.

## 진행 기록

- run `run_4a5ad927bf28`. A: task `task_5cb6cbf8ae13`, dispatch `ctx_a4f6225bf27e`, worktree `conv-delete-A`(Opus high 확인). B: task `task_ee6385d7b5ea`, dispatch `ctx_677113085527`, worktree `conv-delete-B`(Opus high 확인). 둘 다 `6985e033`에서 시작했다.
- B 완료: `16cb172a` test, `7ca1032c` feat. app test·typecheck·verify.mjs 통과(worker 보고). RB(Opus high, task `task_1cab74a2b171`, dispatch `ctx_d19aab30cb5f`)를 `conv-delete-B` worktree에서 시작했다.
- RB 완료: 🔴 0, 🟡 1(homeRun 진행 중 claim이 지운 대화를 되살림), ⚪ 4. 수정 1회차(🟡1, ⚪1 stale 목록 창, ⚪2·⚪3 테스트 고정)를 B에 보냈다(dispatch `ctx_394155d5ba75`). quitting 중 거절 토스트 확인은 RC가 본다.
- A 완료: `34024e09`..`51afcccc`(4개). app test·typecheck·verify.mjs 통과(worker 보고). 승인한 범위 밖 파일은 `app/src/main/index.test.ts` mock 한 줄. main은 종료 중 거절과 working 거절을 둘 다 `busy`로 답하므로 종료 중 토스트 생략은 C가 renderer 쪽 종료 신호로 처리한다. RA(Opus high, dispatch `ctx_e701d6c32732`)를 `conv-delete-A`에서 시작했다.
- B 수정 1회차 완료: `c2473b77` test, `58579f14` fix. verify.mjs 통과(6434 tests, worker 보고). 🟡1 postmortem은 생략한다(지휘자 판단: main에 들어가기 전 리뷰에서 잡았고, 같은 함정이 POSTMORTEM 2026-10-27 'Awaited conversation work outlived its current turn'에 이미 있다). RB 재리뷰(dispatch `ctx_7c78cef5420b`) 시작.
- RB 재리뷰: 🔴 0, 🟡 0, ⚪ 1(보이지 않는 events 항목, 조치 없음). B 커밋 4개를 `aac23ea4`..`6710020a`로 cherry-pick했다. B·RB worker를 release했다. worktree `conv-delete-B`는 정리 전까지 남는다. handoff와 review는 `.scratch/orch-conversation-delete/evidence/`에 복사했다.
- C step 0 Radix probe: Esc 한 항목만 실패(툴팁이 먼저 닫힘), 나머지 통과. 결정 5로 답했다. A 수정 1회차에는 사용자 결정 D1을 담아 보냈다(dispatch `ctx_65adf4a0fc54`). C는 dispatch `ctx_db9637228489`, worktree `conv-delete-C`, 기준 `7e10089a`.
- A 수정 1회차(D1: `e0e5383e`, `dbf8d3fd`)와 2회차(종료 push `app:quitting`·preload `onQuitting`: `09e3f585`, `9cc5303d`) 완료. RA 재리뷰(dispatch `ctx_7c274c9b258d`) 시작. C는 통합 뒤 `onQuitting`을 연결한다.
- RA 재리뷰(1·2회차): 🔴 0, 🟡 1(Y3: 중단된 종료 뒤 `app:quitting false`인데 서비스는 계속 종료 중이라 거짓 토스트), ⚪ 4. 지휘자 판단 D2: 서비스는 지금처럼 종료 상태로 두고, 중단된 종료에는 false push를 보내지 않는다(이 batch 안의 변경으로 끝남). ⚪1(커밋되지 않은 기록 정리)도 A 수정 3회차에 넣었다. ⚪2·⚪3은 받아들인다. ⚪4(D1과 다른 feature 문서 문구, `deletions.json`, `app:quitting`)는 T5에서 반영한다.
- RA 3회차 재리뷰: 🔴 0, 🟡 0, ⚪ 2(보고만). A 수정 커밋 6개를 `9539aad1`..`88b0ac33`로 cherry-pick했다. A·RA worker를 release했다. 통합 HEAD에서 verify.mjs를 돌린다.
