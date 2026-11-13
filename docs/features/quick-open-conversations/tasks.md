# quick-open-conversations — tasks

포맷과 fixture 변경은 없다. 순수 함수 → 화면 연결 → 문서 순서로 간다.

- [ ] 1. `/feature-review` 후 `/design-draft`로 `.doan/canvases/doan-search.html`에 Conversations 탭, 대화 결과(캔버스 대화·프로젝트 대화·보관 표시), All의 섞인 결과, 빈 상태와 "other results in All" 문구 프레임을 더하고 사용자 확인을 받는다. 검증: `doan check --repo . --json`, `doan ls --repo . --json`.
  - 커밋 경계: 초안.
- [ ] 2. `/tdd`: `quickOpen.test.ts`에 `conversationEntries`(캔버스 해석 0·1·2개, 보관, legacy external), `searchMatch`의 대화 순위와 빈 검색어 Conversations 범위·순서, `readingCount`의 대화 목록 상태, `emptyText` 새 문구, `resultParts`·`resultKey`, `pickTarget`, `quickOpenTabKey` 네 탭을 고정하고 red를 확인한다. 검증: `npm --prefix app test`가 새 테스트에서만 실패한다.
- [ ] 3. `/implement`: `quickOpen.ts` 순수 함수를 구현한다. 검증: `npm --prefix app test`, `npm --prefix app run typecheck`.
  - 커밋 경계: 순수 함수와 테스트.
- [ ] 4. `QuickOpenDialog.tsx`(탭, 아이콘, prop)와 `App.tsx`(목록 전달, `pick` → `run.openConversation`)를 연결한다. `QuickOpenDialog.test.tsx`에 탭 네 개와 대화 행 렌더링을 더한다. 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`.
  - 커밋 경계: 화면 연결.
- [ ] 5. `/design-sync`로 초안과 실제 앱의 대화 행·탭·빈 상태를 맞추고 DESIGN.md 'Quick Open'을 고친다. 검증: `node .scratch/design-sync/<screen>/measure.mjs`.
- [ ] 6. `/runtime-test`: 격리 앱에서 두 프로젝트의 대화가 Home Quick Open에 나오는지, 보관된 캔버스 대화와 프로젝트 대화를 고르면 각각 캔버스 패널과 Overview에 그 대화가 보이는지, 포커스와 Back/Forward가 어떻게 되는지 확인한다. 검증: `/runtime-test` 스크린샷과 probe 결과.
- [ ] 7. `/verify` 후 결론을 승격한다: PRODUCT §5 item 3 'Quick Open'(대화 검색, 탭, 빈 결과 문구), DESIGN.md 'Quick Open'(대화 행, 탭), 필요하면 ARCHITECTURE §7(Quick Open이 `HomeRun` 목록을 쓴다는 것). 그리고 `docs/features/quick-open-conversations/`를 삭제한다. 검증: `node .agents/skills/verify/scripts/verify.mjs`.
  - 커밋 경계: 문서 승격(문서마다 커밋).
