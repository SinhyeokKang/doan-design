# comments-readability — 작업 순서

선행: `revision-continuity`(리로드와 위치 판정). 검증 명령은 AGENTS.md 'Commands'에 있는 것만 쓴다. 없는 명령은 "command undecided — needs user confirmation"으로 적는다. `[커밋]`은 커밋 경계다.

**측정 공통 격리 조건**: 측정 스크립트는 `.scratch/comments-readability/`에 두고 `app/e2e/runtime.ts`의 격리 방식을 따른다. 임시 HOME·SHELL·`CLAUDE_CONFIG_DIR`·`CODEX_HOME`·userData, `DOAN_CLI`, `DOAN_RUNTIME`을 쓰고, `app/e2e/real-state.ts`로 실제 상태가 바뀌지 않았는지 확인한다(`python3.12`가 필요하다). 종료는 정상 exit 0이어야 한다. comments-ui는 이미 main에 있으므로 `/design-sync` 루프 대상이 아니다.

1. **순수 함수 테스트 먼저(`/tdd`)**: `app/src/comments/targetLabel.ts`, `app/src/comments/panelText.ts`(`warningGroups`, `warningText`, `emptyListText`, `commentsPanelState`, `pluralComments`). design "순수 함수" 목록의 경우를 모두 다룬다.
   - 검증: `npm --prefix app test`를 돌려 새 테스트가 red인지 확인한다.
2. **순수 함수 구현**.
   - 검증: `npm --prefix app test` green, `npm --prefix app run typecheck` 통과. `[커밋]`
3. **main identity 원인**: 거부 응답에 `missing | invalid | duplicate`를 담는다.
   - 검증: `npm --prefix app test`(main comments identity·service 테스트) green. `[커밋]`
4. **패널 연결**: 카드·작성기·초안 대화상자의 대상 표시, 대상 줄 button과 span, 경고 묶음, 읽기 실패 블록과 편집기 차단, identity 블록, 빈 목록, 문구 항목.
   - 함께 갱신할 기존 단언: `CommentsPanel.test.tsx`, `useComments` 테스트, `app/e2e/comments-ui.ts`의 문구와 버튼 이름. 버튼 이름 "New selection comment"/"New canvas comment"가 나오는 곳은 `app/e2e/presentation.ts`, `app/e2e/design-nav.ts`, `app/e2e/projects-home.ts`, `app/e2e/onboarding.ts`, `app/e2e/comments-ui.ts`다.
   - 테스트에 넣을 경우: 작성기를 연 상태에서 외부 댓글이 와도 입력과 포커스가 유지된다. IME 조합 중에도 같다. 읽기 실패 중에는 편집 초안의 Save가 비활성이다.
   - 검증: `npm --prefix app test` green, `npm --prefix app run typecheck` 통과. `[커밋]`
5. **배치와 표현**: 작성기 위치, sticky 제목, 작은 패널 입력란 높이, Canvas 정보 수 제거와 안내 순서, 핀과 사이드바 aria 단수형, 포커스 규칙, Updated 배경, 대상 줄 hover.
   - 함께 갱신할 기존 단언: `RightPanel.test.tsx`, `Sidebar.test.tsx`, `canvasInfo` 테스트. `app/e2e/anchors.ts`, `app/e2e/runtime.ts`의 "N open comments" aria와 Canvas 정보 단언.
   - 테스트에 넣을 경우: 핀 Enter 때 초안이 있으면 포커스는 대화상자가 가진다. 필터가 비동기로 바뀐 뒤 첫 카드나 제목으로 간다. Save 뒤에는 새 카드, Cancel 뒤에는 연 버튼으로 간다.
   - 검증: `npm --prefix app test` green. `[커밋]`
6. **실제 창 측정**: 960×600과 1238×780에서 다음을 잰다.
   - 제목, To:, 입력란, Save의 사각형이 패널 client rect 안에 있는지
   - 대상 줄의 계산 opacity·color와 title
   - 핀 aria
   - 핀 Enter 뒤 activeElement
   - Updated 라벨 대비
   - 카드 동작 줄 줄바꿈
   - 검증: 측정 로그와 스크린샷 경로를 이 항목 아래에 적는다. 명령은 orch.md 결정 로그대로 `node .scratch/comments-readability/measure.mjs`(`npm --prefix app run build` 뒤)다.
   - **결과 (2026-10-26, 배치 E)**: 2회 실행, 매회 두 크기를 재서 40개 검사 모두 통과했다. 두 실행의 값이 같고, 종료 코드 0, 실제 상태는 바뀌지 않았다.
     - 960×600: 작성기를 열면 패널 client height 282, scrollTop 114다. 제목·To:·입력란·Save의 위쪽은 패널 안 0, 70, 93.8, 165.8px이다. 입력란 최소 높이는 64px이고, 위로 스크롤하면 범위·상태 필터에 닿는다. 확정 초안과 숫자가 같다.
     - 1238×780: 패널 462, scrollTop 0, 네 요소 모두 패널 안, 입력란 104px. 초안과 같다.
     - 대상 줄: 위치를 찾을 수 있으면 `button.locatable`, rgb(240,119,58), opacity 1, title "Show on canvas\n<선택자>", hover 밑줄. Location unavailable과 캔버스 댓글은 `span`, rgb(181,179,171), opacity 1. 배지 설명 "Not found in the current canvas."는 rgb(143,142,135)다.
     - Updated 라벨: 배경 rgb(23,23,23), 3px 8px, 6px, 대비 5.45(초안과 같다). 카드 동작 줄은 카드 5개 모두 한 줄(23px)이다. 핀 aria는 "3 open comments"다. Cancel 뒤 포커스는 "Comment on selection", 핀 Enter 뒤 포커스는 첫 카드 article이다.
     - 근거: `.scratch/orch/comments-readability/evidence-E/measure/`(`measure-1.log`, `measure-2.log`, `run-*/measurements.json`, 크기별 스크린샷 4장), 스크립트 사본 `.scratch/comments-readability/measure.mjs`. 화면이 잠긴 상태에서 쟀다(DOM 포커스는 동작한다).
7. **런타임 회귀**: `app/e2e/comments-ui.ts`에 추가한다. 창 크기는 `runtime.ts`의 크기 조정 도구를 export해 쓰거나 `electronApp.evaluate`로 바꾼다.
   - doan-id 없는 요소의 대상 표시와 960×600의 To: 한 줄 말줄임
   - 960×600에서 작성기에 도달할 수 있는지
   - 실제 jsonl fixture로 만든 경고: 잘못된 줄, union merge로 생긴 conflicting duplicate 줄
   - 읽기 실패 한 블록과 Retry 회복("Comments are read-only"가 0개)
   - id 없음·잘못됨·중복 캔버스의 단일 블록
   - 검증: 8의 `verify.mjs --runtime`이 실행한다(`/verify` 증거 재사용 규칙). `[커밋]`
8. **전체 게이트**: `node .agents/skills/verify/scripts/verify.mjs --runtime`
   - 검증: 최종 verify·runtime PASS, exit 0.
9. **결론 승격**: 다음을 영어로 갱신한다.
   - PRODUCT §5 항목 4: Canvas 정보 구성과 안내
   - PRODUCT §5 항목 5: 대상 표시, 경고 문장, identity 블록, 960×600 배치
   - PRODUCT §7: 날짜·근거와 함께 Q1–Q3, C1–C3. 2026-10-22 app-ui 패널 구성 행을 대체한다고 적고, U-50 댓글 부분 변경을 적는다.
   - ARCH §3 "Presentation and data", "Anchors and pins": 핀 aria와 Enter 포커스
   - DESIGN.md comments-ui: 측정값과 미검증 표면
   
   그 뒤 `docs/features/comments-readability/`를 삭제한다.
   - 검증: 문서 diff로 위 위치가 모두 바뀌었는지 확인한다. 남은 참조 검사는 command undecided — needs user confirmation이고, 진행 중인 다른 기능 문서(`docs/features/*`)의 참조는 판정에서 제외한다. `[커밋]`
