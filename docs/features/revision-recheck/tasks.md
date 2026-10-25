# revision-recheck — 작업 순서

선행: `revision-continuity`(선택 정체성, 리로드 유지), `comments-readability`(대상 표시 헬퍼). 검증 명령은 AGENTS.md 'Commands'의 것만 쓴다. `[커밋]`은 커밋 경계다.

1. **측정**: 캔버스 20개, 댓글 1,000개 프로젝트에서 Home·Overview의 "N to check" 계산(댓글 파일 읽기와 fold) 시간을 잰다. 앵커 스냅샷에 화면 밖 노드 사각형이 있는지 확인한다.
   - 검증: 측정 결과를 이 항목 아래에 적는다. command undecided — needs user confirmation(측정 스크립트는 `.scratch/`에 둔다).
2. **fold 출력 `lastResolution`**: 공유 fixture를 먼저 추가하고 TS·Go를 구현한다.
   - 검증: `go test ./...`, `npm --prefix app test` green. `[커밋]`
3. **순수 함수 테스트 먼저(`/tdd`)**: `toCheck`, `advanceCheck`, `sortResolved`, `activityKind`, `resolvedActivity`, `bottomLabel`, `nextFocus`, `resolutionText`, `locateView`.
   - 검증: `npm --prefix app test`에서 red를 확인한다.
4. **순수 함수 구현**.
   - 검증: `npm --prefix app test` green, `npm --prefix app run typecheck`. `[커밋]`
5. **위치로 가기(L-1)**: 컨트롤러 `locate`, 앵커 사각형, 범위 유지.
   - 검증: 컨트롤러 테스트 green. `[커밋]`
6. **해결 메타, 정렬, 성공 상태 줄과 포커스(L-7 일부, L-9)**.
   - 검증: CommentsPanel·CommentsSession 테스트 green. `[커밋]`
7. **Activity와 하단 라벨(L-7)**.
   - 검증: activity·controller 테스트 green. `[커밋]`
8. **확인 상태 저장소와 Review 흐름(N1), Home·Overview "N to check"**.
   - 검증: main 저장소 테스트와 renderer 테스트 green. `[커밋]`
9. **해결된 댓글 편집(Q4), Outdated 표시(Q3), 사라진 대상(Q6)**. Save and reopen의 단일 append와 재시도를 검증한다.
   - 검증: service·session 테스트 green. `[커밋]`
10. **skill 한 줄 추가와 `/agent-eval`**: 다시 열린 댓글 시나리오를 포함한다.
    - 검증: `npm --prefix app run package` 뒤 `node eval/run.ts --scenarios <new>` 결과를 `docs/USABILITY-EVAL.md`에 기록한다. `node eval/run.ts --self-test` PASS. `[커밋]`
11. **런타임 회귀**: `app/e2e/`에 추가한다.
    - 화면 밖 대상 위치로 가기
    - CLI resolve 뒤 알림과 Review 단계(다음, Reopen, Done)
    - 숨김과 재시작 뒤 알림 유지
    - 해결자 표시와 정렬
    - 사람 Resolve 뒤 상태 줄과 포커스
    - Save and reopen 뒤 `doan comments`에 다시 나타남
    - 검증: `npm --prefix app run e2e` 최종 PASS, exit 0. `[커밋]`
12. **전체 게이트**: `node .agents/skills/verify/scripts/verify.mjs --runtime --eval`
    - 검증: 최종 PASS, exit 0.
13. **결론 승격**: PRODUCT §5 항목 5·6과 §7(Updated/Activity 변경, 재확인 표시, Save and reopen, 사라진 대상 동작), ARCH §2(fold 출력)·§3·§12, DESIGN.md를 영어로 갱신한다. 그 뒤 `docs/features/revision-recheck/`를 삭제한다.
    - 검증: 문서 diff 검토. `[커밋]`
