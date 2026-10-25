# agent-handoff — 작업 순서

선행: `comments-readability`(`targetLabel`). 검증 명령은 AGENTS.md 'Commands'의 것만 쓴다. `[커밋]`은 커밋 경계다.

1. **순수 함수 테스트 먼저(`/tdd`)**: `copyText`(새 문구, id 집합), `handoffRows`, `quickSelect`, `handoffAfterRead`, `selectionHint`, `homeSelectedText`. Go `appError` 문구.
   - 검증: `npm --prefix app test`와 `go test ./...`에서 red를 확인한다.
2. **순수 함수와 CLI 문구 구현**.
   - 검증: `npm --prefix app test`, `go test ./...`, `go vet ./...` green. `[커밋]`
3. **main 복사 검증**(id 집합이 모두 그 캔버스의 열린 댓글인지, 변경 시 거부와 이유 반환).
   - 검증: service 테스트 green. `[커밋]`
4. **Hand off 대화상자(Escape·IME·포커스 복원 규칙 포함)와 넘기기 표시, "fix this" 안내, Home 문구, worktree 안내**.
   - 검증: renderer 테스트 green. `[커밋]`
5. **skill 본문 변경(규칙 C·F, project_not_open, worktree root)**.
   - 검증: `go test ./...`(skill 테스트) green. `[커밋]`
6. **eval 시나리오 2개 추가**: 복사 지시문 그대로, 선택 + 달린 댓글 + "fix this". 패스·실패 fixture를 함께 만든다.
   - 검증: `node --test 'eval/**/*.test.ts'`, `node eval/run.ts --self-test` PASS. `[커밋]`
7. **실제 agent-eval**: `npm --prefix app run package` 뒤 `node eval/run.ts --scenarios <new>,R1,R3 --agents claude,codex`.
   - 검증: 결과와 사용성 문제를 `docs/USABILITY-EVAL.md`에 기록한다. 기준 미달이면 문구를 고치고 다시 측정한다. `[커밋]`
8. **런타임 회귀**: `app/e2e/comments-ui.ts`에 추가한다.
   - 대화상자 미리보기, 체크 해제 뒤 Copy N 개수
   - Selection 빠른 선택
   - 복사 뒤 댓글을 추가하면 Handed off 표시가 지워짐
   - 대화상자를 연 사이 에이전트가 해결하면 복사를 거부함
   - 지시문 내용(클립보드 저장·복원)
   - "fix this" 안내
   - 검증: `npm --prefix app run e2e` 최종 PASS, exit 0. `[커밋]`
9. **전체 게이트**: `node .agents/skills/verify/scripts/verify.mjs --runtime --eval`
   - 검증: 최종 PASS, exit 0.
10. **결론 승격**: PRODUCT §5 항목 6·7과 §7(복사 범위, 지시문, 보고 규약), ARCH §1(Agent rules)·§5·§12, DESIGN.md를 영어로 갱신한다. 그 뒤 `docs/features/agent-handoff/`를 삭제한다.
    - 검증: 문서 diff 검토. `[커밋]`
