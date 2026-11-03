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
4. T5(문서 승격)는 지휘자가 한다. DESIGN.md의 `/design-sync` 값은 C가 쓰고, 지휘자가 통합 때 확인한다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| A | T1, T2 | `app/src/main/conversation/{store,drafts,service,ipc}.ts`와 그 테스트(새 `storeDelete.test.ts` 포함), `app/src/main/index.ts`, `app/src/main/notifyService.ts`와 테스트, `app/src/preload/index.ts`와 테스트 | 없음 | Opus high — 되돌릴 수 없는 삭제, index commit 순서, 크래시 뒤 정리, live runner와 늦은 이벤트 경쟁 | `npm --prefix app test`, `npm --prefix app run typecheck` | 완료(`34024e09`..`51afcccc`), RA 리뷰 중 |
| B | T3 | `app/src/renderer/`의 새 `conversationDelete.ts`, `overviewConversation.ts`, `canvasConversation.ts`, `overviewRun.ts`, `canvasRun.ts`, `homeRun.ts`, `conversationStore.ts`와 그 테스트 | 없음 | Opus high — IPC 답과 목록 이벤트의 순서 경쟁, revision 규칙, 여러 Run의 상태 정리 | `npm --prefix app test`, `npm --prefix app run typecheck` | 완료(`16cb172a`, `7ca1032c`), RB 리뷰 중 |
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
