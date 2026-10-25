# agent-handoff — 작업 순서

선행: `comments-readability`(`targetLabel`), `revision-continuity`(키 원칙, rename). 검증 명령은 AGENTS.md 'Commands'에 있는 것만 쓴다. 없으면 "command undecided — needs user confirmation"으로 적는다. `[커밋]`은 커밋 경계다.

1. **테스트 먼저(`/tdd`)**: design의 순수 함수 목록 전체와 Go `appError`·skill 문구를 다룬다.
   - 함께 고칠 기존 테스트:
     - `app/src/comments/projection.test.ts`(one/all)
     - `app/src/main/comments/service.test.ts`(`kind: "all"/"one"`, 클립보드 실패)
     - `CommentsPanel.test.tsx`(Copy, Copied, Copy all open)
     - `cli/internal/cli/skill_test.go`(규칙 C 원문, project_not_open)
     - `cli/internal/cli/active_test.go`(project_not_open nextSteps)
   - 테스트에 넣을 경우:
     - 0개 체크
     - 연 사이 전부 해결됨
     - 다른 캔버스 id, 모르는 id, 빈 집합, 중복 id, 1,001개
     - 읽을 수 없는 범위
     - 한 줄짜리 긴 본문
     - 선택 없음이나 다른 캔버스에서 Selection 빠른 선택
     - branch가 null(detached, git 아님)이거나 worktree가 하나일 때의 안내
     - Handed off: 일부 해결되면 유지, 모두 해결되면 지움, 새 댓글이 생겨도 유지, 다른 복사가 있으면 교체, rename 뒤에도 유지(고정 clock으로 검사)
     - 단수와 복수
   - 검증: `npm --prefix app test`와 `go test ./...`에서 red를 확인한다.
2. **순수 함수와 CLI 문구 구현**.
   - 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `go test ./...`, `go vet ./...` green. `[커밋]`
3. **main 복사 검증**(`parseCopyScope`, 디스크 재확인, `not_open` 거부).
   - main 읽기와 클립보드 쓰기 사이에 resolve가 끼는 경우를 테스트에 넣는다.
   - 검증: `npm --prefix app test`, `npm --prefix app run typecheck` green. `[커밋]`
4. **Hand off 대화상자와 Handed off 표시**.
   - 키보드 경우: 초기 포커스, Return, Escape, Space, Tab 순서, IME 중 Return/Escape 무시, 포커스 복원.
   - 상태 경우: 복사 중, 복사 실패와 재시도, 연 사이 바뀜 거부, 성공, 복사 중에 닫음.
   - 그 밖의 경우: 대화상자 우선순위 체인, (root, canvas id) 변경 시 닫힘, 초안·폭 무효·author 없음에서도 열림.
   - 검증: `npm --prefix app test`, `npm --prefix app run typecheck` green. `[커밋]`
5. **"fix this" 안내, Home 문구, "Copy all open"을 가리키던 문구, worktree 안내**.
   - 검증: `npm --prefix app test` green. `[커밋]`
6. **skill 본문 변경**(규칙 C·F, worktree 문장, project_not_open).
   - 검증: `go test ./...`(skill 테스트) green. `[커밋]`
7. **eval 러너 worktree 지원과 시나리오 3개**.
   - 러너: `scenario.json`의 `worktree`, 두 번째 worktree 생성, cwd와 root 분리. eval 단위 테스트를 둔다.
   - 시나리오:
     - `H6`: 복사 지시문 그대로. `prompt.md`가 `copyText` 결과와 같은지 테스트한다.
     - `R7`: 선택 + 달린 댓글 + "fix this". R2b처럼 `mcp: true`와 `selection.json`을 둔다.
     - `H7`: worktree 불일치.
     - 시나리오마다 pass·fail fixture를 둔다. fail fixture: 적용하지 않은 댓글 해결, 목록 밖 해결, 마지막 답에 보고 없음(H4의 `answer.ts` 재사용), 다른 worktree 수정.
   - 검증: `node --test 'eval/**/*.test.ts'`, `node eval/run.ts --self-test` PASS. `[커밋]`
8. **실제 agent-eval**: `npm --prefix app run package` 뒤 `node eval/run.ts --scenarios H6,R7,H7,R1,R2,R2b,R3 --agents claude,codex --repeat 3 --round <name>`(`--no-judge` 없이, `python3.12` 필요).
   - 기준: 새 시나리오에서 두 에이전트 모두 3/3 pass. 기존 시나리오는 이전 라운드보다 나빠지지 않는다.
   - 미달이면 사용자 결정 지점에서 멈춘다. 프롬프트를 바꾸면 새 시나리오 id를 쓴다(ARCH §14).
   - 같은 브랜치에서 `revision-recheck`·`project-feedback`과 함께 통합하면 한 라운드로 잰다.
   - 검증: 결과와 사용성 문제를 `docs/USABILITY-EVAL.md`에 기록한다. `[커밋]`
9. **런타임 회귀**: `app/e2e/comments-ui.ts`에 추가하고 `app/e2e/projects-home.ts`의 `/^Selected:/` 단언을 갱신한다. 클립보드는 기존 장치로 저장·복원한다.
   - 대화상자 미리보기, 체크 해제 뒤 Copy N 개수, Selection 빠른 선택
   - 키보드만으로 하는 흐름(Return 복사, Escape 닫기와 포커스 복원)
   - 클립보드 내용이 미리보기 원문과 같음, 대화상자 안의 클립보드 실패
   - 에이전트가 CLI로 resolve하면 Handed off가 지워짐(모두 해결된 경우), 새 댓글이 생겨도 유지
   - 연 사이 에이전트가 해결하면 거부와 안내
   - 해결된 카드에 Hand off…가 없음
   - "fix this" 안내, Home "Selected for your agent", worktree 안내
   - 검증: 10의 `verify.mjs`가 실행한다(`/verify` 증거 재사용 규칙). `[커밋]`
10. **전체 게이트**: `node .agents/skills/verify/scripts/verify.mjs --runtime --eval`
    - 검증: 최종 PASS, exit 0.
11. **결론 승격**: 아래 위치를 영어로 갱신한다.
    - PRODUCT §5 항목 6·7
    - PRODUCT §7: 2026-10-23 Q6 행(PRODUCT.md:433)을 대체하는 새 행. Q1–Q3과 AH1–AH5도 날짜와 함께 적는다.
    - ARCH §1 Agent rules
    - ARCH §3 Comment documents(Hand off)
    - ARCH §6 skills
    - ARCH §7 Comment preload contract(`CopyScope`, 거부 코드)
    - ARCH §12(`project_not_open` nextSteps)
    - ARCH §14(러너 worktree)
    - DESIGN.md: 대화상자 측정값과 미검증 표면
    - 그 뒤 `docs/features/agent-handoff/`를 삭제한다.
    - 검증: 위 위치 목록을 하나씩 확인한다. 남은 참조("Copy all open", "open this project in Doan", "Selected:") 검사는 command undecided — needs user confirmation이고, 진행 중인 다른 기능 문서의 참조는 판정에서 뺀다. `[커밋]`
