# quick-open-conversations — tasks

포맷과 fixture 변경은 없다. 초안 → 순수 함수 → 화면 연결 → 문서 순서로 간다.

- [ ] 1. `/design-draft`로 새 초안 `.doan/canvases/quick-open-conversations.html`을 그리고 사용자 확인을 받는다. 프레임: Conversations 탭과 입력란 새 이름, 캔버스 대화·프로젝트 대화 행(시각 포함, readError 행), All의 섞인 결과, 빈 검색어 Conversations(workspace·Home), 빈 결과 문구 네 가지, 읽기 줄, 열 수 없을 때의 토스트. 기존 `doan-search.html`은 고치지 않는다. 검증: `doan check --repo . --json`, `doan ls --repo . --json`.
  - 커밋 경계: 초안.
- [ ] 2. `/tdd`: 다음을 고정하고 red를 확인한다. 검증: `npm --prefix app test`가 새 테스트에서만 실패한다.
  - `canvasConversationRows.test.ts`: `conversationCanvasMatch`의 one·many·none, id 있는 대화와 id 없는 행, 읽기 오류 행의 path 대체, 기존 `canvasConversationRows` 결과가 그대로인 것.
  - `quickOpen.test.ts`:
    - `conversationEntries`: 캔버스 판정 one·many(`duplicate_canvas_id`)·none, 프로젝트 대화, 보관, legacy external, readError.
    - `searchMatch`: 대화 순위, 같은 점수일 때 캔버스 → 프레임 → 대화, worktree 근접 순위, Home과 workspace 범위, 빈 검색어 Conversations의 최근 순서·빈 시각 맨 뒤·50개 상한.
    - `groupResults`: 빈 검색어의 묶음 순서.
    - `readingCount`: 폴더 loading과 대화 목록 loading을 한 번씩만 세는 것, 빈 검색어 All에서는 세지 않는 것, `"error"`를 세지 않는 것.
    - `emptyText`: 새 문구 네 가지, 대화 0개, 대화 목록 loading이면 null, problem root에서 unavailable 문구가 먼저인 것.
    - `resultParts`·`resultKey`: 대화 행, `sameShownConversation`.
  - `QuickOpenDialog.test.tsx`: `quickOpenTabKey` 네 탭.
- [ ] 3. `/implement`: 순수 함수를 구현한다. 검증: `npm --prefix app test`, `npm --prefix app run typecheck`.
  - 커밋 경계: 순수 함수와 테스트.
- [ ] 4. 화면 연결: `QuickOpenDialog.tsx`(탭, 아이콘, 입력란 이름, prop, `canvasDir` 분기), `homeRun.ts`(`canvasRow`가 `conversationCanvasMatch`를 쓰게 하고 미리 찾은 대상으로 여는 메서드), `App.tsx`(목록 전달, `pick` 분기, 같은 화면 판정, 토스트). `QuickOpenDialog.test.tsx`에 대화 행 렌더링, 탭 네 개, props가 바뀌었을 때(대화 삭제·보관·제목 변경) 결과가 바뀌는 것을 더한다. 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`.
  - 커밋 경계: 화면 연결.
- [ ] 5. `/design-sync`로 새 초안과 실제 앱의 대화 행·탭·빈 상태를 맞추고 DESIGN.md 'Quick Open'을 고친다. 검증: `node .scratch/design-sync/<screen>/measure.mjs`.
- [ ] 6. `/runtime-test`: 격리 앱에서 다음을 확인한다. 검증: `/runtime-test` 스크린샷과 probe 결과가 아래 기대값과 같다.
  - Home Quick Open에서 두 프로젝트의 대화가 각 묶음에 나온다.
  - 보관된 캔버스 대화를 고르면 그 캔버스가 열리고, 패널에 그 대화가 보이며, 포커스가 패널 composer 필드에 있고, Back으로 이전 화면에 돌아간다(방문 1개).
  - 다른 root의 프로젝트 대화를 고르면 그 Overview에 그 대화가 보이고 방문 1개가 남는다.
  - 이미 보이는 대화를 고르면 화면과 방문 수가 그대로다.
  - 고르기 직전에 대화를 지우면 토스트가 나오고 화면은 그대로다.
- [ ] 7. `/verify` 후 결론을 승격한다. 그리고 `docs/features/quick-open-conversations/`를 삭제한다. 검증: `node .agents/skills/verify/scripts/verify.mjs`.
  - PRODUCT §5 item 3 'Design navigation'의 Quick Open 줄: 대화 검색, 탭, 순서, 빈 결과 문구.
  - DESIGN.md 'Quick Open': 대화 행, 탭, 입력란 이름, 문구.
  - ARCHITECTURE §7의 Quick Open 항목: Quick Open이 `HomeRun` 목록과 `conversationCanvasMatch`를 쓴다는 것.
  - 커밋 경계: 문서 승격(문서마다 커밋).
