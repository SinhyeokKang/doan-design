# revision-continuity — 작업 순서

검증 명령은 AGENTS.md 'Commands'의 것만 쓴다. `[커밋]`은 `/ship`·`/orchestrate`가 따르는 커밋 경계다.

1. **리로드 중 위치 표시 측정(T-11, W-9)**: `.scratch/`의 격리 Playwright 스크립트로 확대한 아래쪽 프레임에서 요소를 선택하고 핀을 띄운 뒤 캔버스 파일을 바꾼다. 0/100/300/800ms에 "Location unavailable", 핀, Selection 목록, iframe 높이를 기록한다. 폭 없는 캔버스의 댓글 패널도 기록한다.
   - 검증: 측정 로그와 스크린샷 경로를 tasks.md 이 항목 아래에 적는다. 재현되지 않으면 7번을 "측정만 기록"으로 닫는다.
2. **순수 함수 테스트 먼저(`/tdd`)**: `canvasViewUpdate`의 `moved`(0/1/2+), mtime reload, `classifyServedChange`, `transitionDraft` 이유 구분과 `restart`, `selectionIdentity`, `restorePlan` id 따라가기.
   - 검증: `npm --prefix app test`에서 새 테스트가 red인 것을 확인한다.
3. **순수 함수 구현**.
   - 검증: `npm --prefix app test` green, `npm --prefix app run typecheck` 통과. `[커밋]`
4. **main 변경 분류**: `watch.ts`가 `design/` 이벤트의 파일 이름을 넘기고, `shell.ts`가 `classifyServedChange`로 servedRev 증가 여부를 정한다. 행 `mtimeMs`가 갱신되는지 확인한다.
   - 검증: `npm --prefix app test`(watch·shell 테스트) green. `[커밋]`
5. **다시 시작(L-2)**: `CommentsSession.restart()`, 편집기 문구와 버튼, guard 인계, begin 수명 펜스.
   - 검증: 세션 테스트(늦은 성공·실패·guard 보류·연속 다시 시작)가 green이다. `[커밋]`
6. **같은 id 따라가기(L-4)와 복원**: 컨트롤러 `moved` 처리, `CommentsSession.rename`, 기억·저장 경로 갱신, 토스트 문구, `ui-state` canvasId.
   - 검증: `npm --prefix app test` green. `[커밋]`
7. **범위 유지(L-13), Esc 가드(L-17), (측정 시) 위치 pending**.
   - 검증: 컨트롤러·useComments 테스트 green. Esc 동기 경로 기존 테스트가 그대로 통과한다. `[커밋]`
8. **런타임 회귀**: `app/e2e/`에 시나리오를 추가한다.
   - 다른 캔버스를 바꿔도 새 댓글을 저장할 수 있다.
   - 열린 캔버스를 바꾸면 "다시 시작"으로 본문을 유지하고 저장한다.
   - 열린 캔버스를 `mv`하면 같은 캔버스·뷰·선택이 유지되고 `doan active`가 새 경로를 돌려준다.
   - Canvas 범위가 캔버스 저장 뒤에도 유지된다.
   - 선택 없이 초안이 있을 때 Esc를 눌러도 대화상자가 뜨지 않는다.
   - 앱을 끈 사이 이동한 캔버스를 재시작 때 복원한다.
   - 검증: `npm --prefix app run e2e` 최종 PASS와 exit 0. `[커밋]`
9. **전체 게이트**: `node .agents/skills/verify/scripts/verify.mjs --runtime`
   - 검증: 최종 PASS, exit 0.
10. **결론 승격**: PRODUCT §5 항목 1·2·5와 §7 결정 로그(날짜, 근거), ARCH §3(live reload 범위, 같은 id 이동 = 재로드, 다시 시작, 범위 유지)에 영어로 옮긴다. DESIGN.md에는 측정값과 미검증 표면을 적는다. 그 뒤 `docs/features/revision-continuity/`를 삭제한다.
    - 검증: 문서 diff 검토, `rg -n 'revision-continuity' docs` 결과가 결정 로그와 감사 보고서 외에는 없다. `[커밋]`
