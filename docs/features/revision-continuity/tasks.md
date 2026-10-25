# revision-continuity — 작업 순서

검증 명령은 AGENTS.md 'Commands'의 것만 쓴다. 없는 명령은 "command undecided — needs user confirmation"으로 적는다. `[커밋]`은 `/ship`·`/orchestrate`가 따르는 커밋 경계다.

**측정 공통 격리 조건**: 측정 스크립트는 `.scratch/revision-continuity/`에 둔다. `app/e2e/runtime.ts`의 격리 방식을 따른다. 임시 HOME·SHELL·`CLAUDE_CONFIG_DIR`·`CODEX_HOME`·userData, `DOAN_CLI`, `DOAN_RUNTIME`을 쓰고, `app/e2e/real-state.ts`로 실제 상태가 바뀌지 않았는지 확인한다(`python3.12` 필요). 클립보드를 쓰면 저장했다가 복원하고, 종료는 정상 exit 0으로 끝낸다.

1. **저장 방식 측정(R3)**: 아래 방식으로 `design/` 아래 HTML을 바꾸면서, recursive `fs.watch`가 넘기는 (watch path, filename) 원시 로그를 남긴다.
   - Claude Code Write·Edit, Codex apply_patch로 저장한다. 실제 에이전트 실행은 AGENTS의 일회성 등록 방식을 따르고, Codex 실행은 모델 경계를 넘으므로 매번 사용자 허락을 받는다.
   - `mv`, `git checkout`, 임시 파일 뒤 rename으로 저장한다.
   - 검증: 로그 경로와 요약을 이 항목 아래에 적는다. 임시 이름이 섞이면 design 2절과 Q1을 다시 정한 뒤 진행한다. command undecided — needs user confirmation.
   - **결과 (2026-10-26, M1)**: 스크립트 `.scratch/revision-continuity/save-watch.mjs`, 원시 로그 `save-watch.log`, 요약 `save-watch-summary.md`. Claude Code Write·Edit에 임시 이름 `<file>.tmp.<pid>.<hex>`가 섞였다. Codex apply_patch·`mv`·`git checkout`·일반 쓰기에는 없었다. 루트 watcher 이벤트와 null 이름은 없었다. 실제 상태는 바뀌지 않았다. 방식마다 1회씩 측정했다. design 2절에 임시 형제 규칙을 더하고 Q1을 유지했다(orch.md 결정 로그).
2. **리로드 중 위치 표시 측정(T-11)**: 확대한 아래쪽 프레임에서 요소를 선택하고 핀을 띄운 뒤, 캔버스 파일을 바꾼다. 0/100/300/800ms에 "Location unavailable", 핀, Selection 목록과 그 빈 상태 문구, iframe 높이를 기록한다.
   - 재현 기준: 한 샘플이라도 "Location unavailable"이나 빈 Selection 목록이 보이면 재현으로 본다.
   - 검증: 측정 로그와 스크린샷 경로를 이 항목 아래에 적는다. 재현되지 않으면 design 7절의 리로드 부분을 "측정만 기록"으로 닫는다. command undecided — needs user confirmation.
3. **순수 함수 테스트 먼저(`/tdd`)**: design의 "순수 함수" 목록과 그 경우를 모두 다룬다.
   - `classifyDesignChange`, refresher names 누적
   - `canvasViewUpdate`
   - `transitionDraft` 이유·이어 쓰기
   - `continueEnabled`, `guardsSelectionChange`
   - `selectionIdentity`, `shouldGuardEscape`
   - `parseUiState` `canvasId`, `restorePlan`
   - 검증: `npm --prefix app test`에서 새 테스트가 red인 것을 확인한다.
4. **순수 함수 구현**.
   - 검증: `npm --prefix app test` green, `npm --prefix app run typecheck` 통과. `[커밋]`
5. **main: 이름 판정과 행 rev, 썸네일 recheck**.
   - 테스트에 넣을 경우:
     - 폐기된 읽기(`read !== folder.reads`)가 bump와 rev를 잃지 않는다.
     - rearm SERVED와 `design/` 밖 served 경로는 무조건 bump한다.
     - 루트 삭제와 delete-and-recreate 기존 테스트를 유지한다.
     - 다른 캔버스 HTML만 바뀌면 servedRev는 그대로이고 그 행 rev와 썸네일만 갱신된다.
   - 검증: `npm --prefix app test`(watch·shell·thumbnails 테스트) green. `[커밋]`
6. **이어 쓰기(L-2, R1)**: `CommentsSession.continueDraft`, 편집기 버튼·문구·포커스, 같은 캔버스 선택 변경의 가드 예외.
   - 테스트에 넣을 경우:
     - 늦은 성공과 실패, guard 보류, 연타, begin 중 `documentLost`와 `moved`
     - 작성자 정보 missing·failed, 폭 없음으로 begin 실패
     - IME 조합 중 클릭, 저장 불확실 상태에서 버튼 숨김
     - 선택 없음과 "Continue on canvas"
     - 여러 줄 본문 보존, guard가 한 번도 false가 되지 않음
     - 막힌 초안 중 같은 캔버스 클릭은 대화상자 없이 선택이 바뀌고, 다른 캔버스로 가면 대화상자가 뜸
   - 검증: `npm --prefix app test`(CommentsSession·CommentsPanel·useComments·CanvasController 테스트) green. `[커밋]`
7. **같은 id 따라가기(L-4, R2)와 재시작 복원(Q2)**: 컨트롤러 `moved`, `CommentsSession.rename`, Activity·트리 키 이동, 중복 id 안내, 같은 경로의 id 변경, ui-state `canvasId`.
   - 테스트에 넣을 경우:
     - moved에서 범위·상태 필터와 앵커가 유지된다.
     - 재앵커 뒤 새 경로로 `selection:set`을 보내고, 재앵커 실패 시 안내한다.
     - 요청 없는 편집 초안이 이동 뒤 저장된다.
     - 진행 중·불확실 편집 저장, 카드 변경, 삭제 확인이 있으면 따라가지 않는다(기존 사라짐 처리).
     - 이동 중 진행 중이던 read·copy가 readError나 이전 결과로 덮어쓰지 않는다.
     - 생성 초안이 `reloaded`로 막힌다.
     - rename과 내용 변경이 한 debounce에 들어온다.
     - 다른 하위 폴더로 이동하면 새 조상이 펼쳐진다.
   - 검증: `npm --prefix app test` green. `[커밋]`
8. **범위 유지(L-13), Esc(L-17), 위치 표시(W-9, 측정 시 T-11)**.
   - 기존 `CanvasController.test.ts`의 다음 테스트는 그대로 통과해야 한다: "clears selection on a board margin click…", "prevents the triggering Escape from cancelling its newly opened draft dialog", "keeps synchronous canvas opening…".
   - 테스트에 넣을 경우:
     - 초안이 있고 선택이 없을 때 Esc를 누르면 대화상자도 preventDefault도 없고, 대기 중 Open은 취소된다.
     - iframe에서 전달된 Escape
     - 재앵커 대기 중 Esc는 여전히 가드된다.
     - 같은 doanId에서 selector가 바뀌어도 범위가 유지된다.
     - 폭 없는 캔버스에 Location unavailable이 없다.
   - 검증: `npm --prefix app test` green. `[커밋]`
9. **런타임 회귀**: 새 모듈 `app/e2e/revision-continuity.ts`를 만들고 `app/e2e/runtime.ts`의 import 목록에 등록한다. 폴링은 iframe 교체를 재시도한다. 재시작 시나리오는 exit code와 signal을 확인한다.
   - 다른 캔버스를 일반 저장과 atomic rename으로 바꿔도 새 댓글을 저장할 수 있다.
   - 열린 캔버스를 바꾸면 "Continue on current version"으로 본문을 유지하고 저장한다. 선택이 없으면 요소를 클릭한 뒤 이어 쓴다.
   - 열린 캔버스를 `mv`하면 같은 캔버스, 뷰, 선택, 트리 펼침이 유지되고 Activity에 Moved가 남으며, `doan active`가 새 경로를 돌려준다. 요청 없는 편집 초안도 저장된다.
   - `mv`로 id가 중복되면 Overview로 가고 중복 안내가 뜬다.
   - Canvas 범위가 캔버스 저장 뒤에도 유지된다.
   - 선택 없이 초안이 있을 때 Esc를 눌러도 대화상자가 뜨지 않는다.
   - 폭 없는 캔버스에 Location unavailable이 없다.
   - 앱을 끈 사이 이동한 캔버스를 재시작 때 복원한다.
   - 검증: 아래 10의 `verify.mjs --runtime`이 이 모듈을 포함한 전체 e2e를 실행한다(`/verify` 증거 재사용 규칙을 따르고 e2e를 따로 두 번 돌리지 않는다). `[커밋]`
10. **전체 게이트**: `node .agents/skills/verify/scripts/verify.mjs --runtime`
    - 검증: 최종 verify·runtime PASS, exit 0.
11. **결론 승격**: 다음 위치를 영어로 갱신한다.
    - PRODUCT §5 항목 1(복원의 id 따라가기)
    - PRODUCT §5 항목 3(제거된 캔버스와 복원 대체 문장)
    - PRODUCT §5 항목 4(이동 = 재로드, Esc 가드)
    - PRODUCT §5 항목 5(이어 쓰기, 막힌 초안 중 같은 캔버스 선택 변경 예외, 렌더 문서 없음의 위치 표시)
    - PRODUCT §7: 날짜와 근거를 단다. 2026-10-25 design-nav 줄(제거된 캔버스, 복원)을 대체한다고 적는다.
    - ARCH §3: Transitions, Selection lifetime, 썸네일 캐시 기준, 받아들이는 위험
    - ARCH §7 "Navigation persistence and IPC"의 ui-state 형식과 Restore
    - ARCH §13: 변경 플래그와 다른 캔버스 리로드 문장
    - DESIGN.md: 측정값과 미검증 표면
    
    그 뒤 `docs/features/revision-continuity/`를 삭제한다.
    - 검증: 문서 diff를 검토해 위 위치가 모두 바뀌었는지 확인한다. 남은 참조 검사는 command undecided — needs user confirmation이다. 진행 중인 다른 기능 문서(`docs/features/*`)의 참조는 판정에서 제외한다. `[커밋]`
