# project-feedback — 작업 순서

선행: `comments-readability`(`targetLabel`), `revision-recheck`(위치로 가기). 검증 명령은 AGENTS.md 'Commands'의 것만 쓴다. `[커밋]`은 커밋 경계다.

1. **측정**: 캔버스 50개와 댓글 5,000개 프로젝트에서 모든 댓글 파일 읽기와 fold 시간을 잰다.
   - 검증: 결과를 이 항목 아래에 적는다. command undecided — needs user confirmation(측정 스크립트는 `.scratch/`).
2. **Go 테스트 먼저**: `orphanFiles`, `List`의 부분 실패(댓글 파일·캔버스 파일 읽기 불가), `orphans` 출력, check 문구.
   - 검증: `go test ./...`에서 red를 확인한다.
3. **Go 구현과 MCP 동일성**.
   - 검증: `go test ./...`, `go vet ./...` green. `[커밋]`
4. **TS 순수 함수 테스트와 구현**: `feedbackGroups`, `idChangeNotice`, `homeOrphanText`, `view.ts` 행 오류와 `orphans`.
   - 검증: `npm --prefix app test` green, `npm --prefix app run typecheck`. `[커밋]`
5. **main 피드백 목록 IPC와 갱신, 갈 곳 잃은 댓글 resolve·delete 권한(`orphanWriteAllowed`)**. 판정과 쓰기 사이에 캔버스가 돌아오는 경우와 재시도를 검증한다.
   - 검증: main(service, authority) 테스트 green. `[커밋]`
6. **Feedback 패널, id 변경 안내, 트리 행 오류, Home·Overview 수**.
   - 검증: renderer 테스트 green. `[커밋]`
7. **skill `ls` 설명 갱신과 `/agent-eval`**.
   - 검증: `go test ./...` green. `npm --prefix app run package` 뒤 `node eval/run.ts --scenarios R1,R2,W1` 결과를 `docs/USABILITY-EVAL.md`에 기록한다. `[커밋]`
8. **런타임 회귀**: `app/e2e/`에 추가한다.
   - 댓글 파일 읽기 불가 시 트리 유지와 그 캔버스만 오류
   - id 변경 뒤 안내와 Show
   - Feedback 패널 묶음과 행 클릭 이동
   - 캔버스 삭제 뒤 갈 곳 잃은 묶음과 Resolve·Delete(`doan comments`에 반영)
   - 검증: `npm --prefix app run e2e` 최종 PASS, exit 0. `[커밋]`
9. **전체 게이트**: `node .agents/skills/verify/scripts/verify.mjs --runtime --eval`
   - 검증: 최종 PASS, exit 0.
10. **결론 승격**: PRODUCT §5 항목 3·9·11과 §7, ARCH §12(ls 응답)·§13(프로젝트 상태), DESIGN.md를 영어로 갱신한다. 그 뒤 `docs/features/project-feedback/`를 삭제한다.
    - 검증: 문서 diff 검토. `[커밋]`
