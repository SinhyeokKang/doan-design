# conversation-delete — tasks

순서: 저장소 순수 함수·I/O → 서비스·IPC → renderer 순수 규칙 → UI → 승격. 형식(JSON Schema) 변경이 없어 schema·fixture 단계는 없다. UI가 있으므로 `/feature-review` 뒤 `/design-draft`가 `.doan/canvases/conversation-delete.html`(행 버튼 휴식·hover·하이라이트·하위 메뉴·사용 불가 항목·확인 알림(초안 줄 유무)·거절 토스트·마지막 대화를 지운 빈 목록)을 그리고, 사용자가 앱에서 확인한 뒤 `/tdd`로 들어간다.

## T1. 저장소 삭제와 고아 기록 정리

- `deleteEntries(entries, id)`, `orphanHistories(names, indexIds)` 순수 함수(design §4).
- `ConversationStore.delete(id)`: recover → index 저장(commit) → `<id>.jsonl` unlink(ENOENT·실패는 성공으로 보고 기록만). 생성자에서 recover 뒤 고아 기록 정리, index를 읽을 수 없거나 index.json이 없으면 건너뜀, 파일명은 대소문자 무시(design §2.1).
- 테스트: 실제 임시 디렉터리. 삭제 뒤 `list()`·`read()`, 보관된 대화가 current로 바뀌지 않음, unlink 실패 뒤 재시작 정리, 남은 journal이 먼저 복구됨, 새 버전·손상 index와 index.json이 없을 때 아무것도 지우지 않음, index id와 대소문자만 다른 기록 보존, 마지막 대화를 지우면 `conversations: []`로 저장, 링크·tmp 파일 보존.
- 검증: `npm --prefix app test` green(`storeIndex.test.ts`, `storeRecovery.test.ts` 또는 새 `storeDelete.test.ts`), `npm --prefix app run typecheck` 통과.
- **commit 경계**: `feat(conversation): delete a conversation's index entry and history`

## T2. 서비스 삭제와 IPC 채널

- `DraftStore.discard(id)`와 시작 때 고아 초안 정리 `orphanDrafts`(design §2.2).
- `ConversationService.delete(id)`: quitting·working → `busy`, 없음 → `not_found`, `archive(id)`의 정리 재사용(runner 닫기, idle Codex server 포함, `terminal`·`closed`, evidence·wait; live entry는 지우지 않음), store·drafts·첨부 id 해제, `this.changed(root)`. index commit 뒤 정리 실패는 기록만 하고 성공(design §2.3).
- `conversation:delete` 채널(`ipc.ts` `conversationMethods`, `index.ts`, preload), 성공 뒤 서비스의 삭제 callback으로 그 대화의 알림 닫기(`notifyService.ts`, design §2.4).
- 테스트: `service.test.ts`에 running·waiting·판정 대기·queue flush 대기·exit 대기 중 거절, idle 대화 삭제, 삭제 뒤 늦은 이벤트가 `<id>.jsonl`을 다시 만들지 않음, 삭제 뒤 send·queue·markSeen·setPermissionMode가 `not_found`, 되돌아온 초안이 사라짐, `listChanged` 한 번, drafts가 손상(`broken`)되거나 쓰기에 실패해도 삭제 성공, 손상된 index에서는 `unknown`이고 아무것도 지우지 않음, 삭제 뒤 프로세스 종료 콜백이 reservation을 품, 재시작 때 index에 없는 초안 정리. `ipc.test.ts`·`preload/index.test.ts`에 채널 모양, 알림 서비스 테스트에 닫기.
- 검증: `npm --prefix app test` green, `npm --prefix app run typecheck` 통과.
- **commit 경계**: `feat(conversation): conversation:delete channel`

## T3. renderer 규칙과 삭제 뒤 상태

- `conversationDelete.ts`: `deleteAvailability`, `deleteDialogView`, `deleteRefusalText`(design §3.1). `menuItem`에 `deletable`.
- 삭제 중 표시, `ConversationStore`의 대화별 초안·thread·늦은 이벤트 정리, `OverviewRun.deleted`, `CanvasRun.deleted`, `HomeRun.deleted`(design §3.2). 새 대화 초안은 유지(spec 결정 5).
- 테스트: design §4 표의 사례. 특히 캔버스 현재 대화를 지운 뒤 보관된 대화가 골라지지 않음, 삭제 전 나간 start 답이 새 대화 상태를 덮지 않음, 목록이 삭제 답보다 먼저 와도 초안이 옮겨지지 않음, 거절되면 삭제 중 표시가 풀림, ui-state 기억 해제, `reread` 루프 없음, 캔버스 ID가 중복된 두 캔버스가 같은 대화를 보일 때 둘 다 정리, 삭제 뒤 목록 비교가 승격 notice를 띄우지 않음, 승격 줄·notice 해제, 마지막 대화 삭제 뒤 메뉴에 New conversation 행만 남고 Overview는 새 대화 상태, Overview에서 지운 대화가 다른 캔버스의 상태에 있어도 정리, strip·Edit on Home에서 사라짐, 늦게 온 이벤트가 `unclaimed`에 남지 않음.
- 검증: `npm --prefix app test` green, `npm --prefix app run typecheck` 통과.
- **commit 경계**: `feat(renderer): conversation delete rules and state after deletion`

## T4. 제목 메뉴의 행 버튼, 하위 메뉴, 확인 알림

- 먼저 확인: Radix `RadioItem` + 형제 `Sub`의 동작을 격리된 실제 앱에서 짧게 probe한다(design §8). 통과 조건: ↓ 순서가 행 → 버튼 → 다음 행, 버튼이 하이라이트된 동안 행 채움 유지, hover만으로 하위 메뉴가 열리지 않고 클릭·→·Enter로 열림, ← 뒤 `document.activeElement`가 그 버튼, Esc 뒤 제목 메뉴가 닫히고 포커스가 trigger, `SubContent`가 `.doan-floating` 위에 뜸(스크린샷). 실패하면 구조를 바꾸기 전에 멈추고 보고한다.
- `ProjectOverview.tsx`, `CanvasConversationPanel.tsx`: 행 wrapper, `SubTrigger` 메뉴 버튼(hover 열기 막음), Delete 항목(사용 불가 이유 줄), clip 숨김·행 하이라이트·구분선 선택자 CSS(design §3.3).
- 확인 알림 컴포넌트와 흐름: 열기, 초안 줄, Cancel·Esc, Delete(진행 중 비활성), 성공 뒤 포커스(보던 대화면 composer, 아니면 trigger), 성공 토스트 없음, 거절 토스트와 trigger 포커스, 종료 중 거절에는 토스트 없음(design §3.4).
- 테스트: 컴포넌트 테스트(버튼 이름, 행 클릭과 버튼 클릭 구분, 키보드 순서, 사용 불가 항목의 `aria-disabled`·`aria-describedby`, 알림 문구·초안 줄·포커스, 거절 토스트, 알림이 열린 동안 `deleteAvailability`가 불가로 바뀌면 Delete가 `aria-disabled`이고 `doan-notice`가 보임, 목록 읽기 실패·읽는 중에 버튼이 없음, OS 알림 클릭이 알림을 Cancel처럼 닫음), CSS 테스트로 숨은 버튼이 `display: none`이 아님과 행 사이 구분선을 고정.
- 검증: `npm --prefix app test` green, `npm --prefix app run typecheck`·`npm --prefix app run build` 통과. 실제 앱 확인은 `/runtime-test`(Overview·canvas panel에서 삭제, 보이던 대화 삭제 뒤 새 대화 상태, 사용 불가 항목, 재시작 뒤 사라짐, 하위 메뉴 스크린샷), 초안과의 비교는 `/design-sync`.
- **commit 경계**: `feat(renderer): delete conversations from the title menus`

## T5. 문서 승격과 feature 디렉터리 삭제

- `docs/PRODUCT.md`(영문, 현재 규칙으로): §5 item 2 'Conversation panel' Title menu와 item 3 'Project Overview' Conversation menu에 행 메뉴 버튼·Delete·사용 불가 조건·확인 알림·삭제 뒤 표시 규칙. §3 In scope 6에 대화를 이 기기에서 지울 수 있고 에이전트 세션 파일은 그대로라는 문장.
- `docs/ARCHITECTURE.md`: §7 'Events'(삭제는 기록 전체와 index 항목을 없애고 이벤트를 다시 쓰지 않음), 'Device-local storage and limits'(삭제 순서, index 먼저, 시작 때 고아 기록·초안 정리와 그 조건, "Every current/archived change goes through the undo journal" 문장을 삭제와 맞게 고침), 서비스 삭제의 `terminal` 표시 이유(늦은 append가 파일을 다시 만듦).
- `docs/DESIGN.md`: `/design-sync`가 잰 값(행 버튼, 하위 메뉴, 확인 알림)과 확인하지 못한 표면.
- `docs/BACKLOG.md`: 남겨 둔 붙여넣기 이미지 사본(spec 결정 7), 기록 쓰기에 실패한 대화는 재시작 전까지 지울 수 없음(spec 결정 15), 실제 앱에서 확인하지 못한 표면.
- `docs/features/conversation-delete/` 삭제.
- 검증: `node .agents/skills/verify/scripts/verify.mjs` 통과, `rg -n "docs/features/conversation-delete" docs AGENTS.md` 결과 없음(DESIGN이 초안 `.doan/canvases/conversation-delete.html`을 인용하는 것은 허용).
- **commit 경계**: 문서별로 나눈다(`docs(product): …`, `docs(architecture): …`, `docs(design): …`, `docs(backlog): …`), 마지막에 `docs(feature): remove conversation-delete documents`. 근거는 commit message에 적는다.
