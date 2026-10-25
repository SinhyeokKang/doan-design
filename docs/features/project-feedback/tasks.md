# project-feedback — 작업 순서

선행: `comments-readability`, `revision-recheck`, `revision-continuity`. 선행 기능이 main에 없으면 착수하지 않는다. 검증 명령은 AGENTS.md 'Commands'에 있는 것만 쓴다. 없으면 "command undecided — needs user confirmation"으로 적는다. `[커밋]`은 커밋 경계다.

**측정 공통 격리 조건**: 스크립트는 `.scratch/project-feedback/`에 둔다. `app/e2e/runtime.ts`처럼 격리한다. 임시 HOME·SHELL·`CLAUDE_CONFIG_DIR`·`CODEX_HOME`·userData, `DOAN_CLI`, `DOAN_RUNTIME`을 쓰고, `app/e2e/real-state.ts`(`python3.12`)로 확인한다. 종료는 정상 exit 0이어야 한다.

1. **측정**: 캔버스 50개, 댓글 5,000개 프로젝트에서 다음을 잰다.
   - `comments:project` 읽기·fold 시간
   - Feedback 첫 렌더 시간
   - `design/` 저장이 연달아 일어날 때의 무효화 빈도
   - 기준: Feedback 첫 렌더는 1초 이내, 연속 저장 중에는 다시 읽기를 합쳐 초당 1회 이하. 넘으면 설계를 사용자와 다시 정하고, 그 전에는 5를 멈춘다.
   - 검증: 결과를 이 항목 아래에 적는다. command undecided — needs user confirmation.
2. **Go 테스트 먼저**: `repo.OrphanFiles`, `List` 부분 실패, `orphans` 출력, check message.
   - 기존 `TestInvalidCanvasIDsStillOwnComments`와 `ls` 개수 테스트를 유지한다.
   - 넣을 경우:
     - 중복·무효 id 캔버스는 고아가 아님
     - 캔버스 파일 읽기 불가와 파싱 오류(uncertain)
     - 댓글 파일 읽기 불가
     - 둘 다 읽기 불가
     - 고아 파일 읽기 불가
     - malformed 줄과 unknown v 줄만 있는 고아
     - kebab이 아닌 이름(`Foo.jsonl`)
     - symlink 댓글 파일과 symlink `.doan/comments` 무시
     - `.doan/comments` 없음
     - 열거 실패는 전체 실패
   - 읽기 불가 재현은 chmod 000이다. root로 실행 중이면 skip한다.
   - 검증: `go test ./...`에서 red를 확인한다.
3. **Go 구현과 MCP 동일성**: `TestMCPEnvelopeParity`의 `parityRepo`에 고아 파일, 읽기 불가 댓글 파일, 읽기 불가 캔버스를 더한다. `mcp.go`의 `ls` 설명을 갱신한다.
   - 검증: `go test ./...`, `go vet ./...` green. `[커밋]`
4. **TS 순수 함수 테스트와 구현**: `feedbackGroups`, `idChangeNotice`, `homeSummary`, `orphanWriteAllowed`, `feedbackFocusAfterRemoval`, `view.ts`·`folderState.ts`의 행 오류와 `orphans` 파싱.
   - 넣을 경우:
     - `idChangeNotice`: 새 id가 중복이거나 무효, 경로와 id가 동시에 바뀜(`moved`와의 경계), id 복원 시 사라짐
     - `feedbackGroups`: union-merge 중복 줄이 있을 때 수가 `ls`와 같음
   - 검증: `npm --prefix app test` green, `npm --prefix app run typecheck`. `[커밋]`
5. **main**: `comments:project`의 orphans 확장, 갈 곳 잃은 댓글 쓰기(`orphanWriteAllowed`, 만들지 않는 append), 새 채널의 `senderAllowed` 등록.
   - 넣을 경우:
     - Git 이름 없음
     - create·edit 거부
     - uncertain이나 error 고아 거부, kebab 아닌 id 거부
     - 판정 뒤 파일·디렉터리가 삭제되면 거부하고 아무것도 만들지 않음
     - 판정과 쓰기 사이 캔버스 복원
     - 고아 요청의 status와 재시도(경로 없이)
     - 같은 requestID를 다른 종류로 재사용
     - 파일 하나 읽기 실패 시 그 묶음만 오류
   - 검증: `npm --prefix app test` green, `npm --prefix app run typecheck`. `[커밋]`
6. **renderer**: Feedback 패널(상태표, tree 키보드, 고아 카드, Review 진입, 행 클릭과 필터 맞춤), id 변경 안내, 트리 행 오류, Home 요약.
   - 넣을 경우: 초안이 있을 때 행 클릭은 가드, 고아 Delete의 기존 확인 대화상자, 행이 사라진 뒤 포커스.
   - 테스트 파일: `ProjectOverview`·`RightPanel`·`FeedbackPanel`·`CommentsPanel`·`Sidebar`·`Home` 테스트.
   - 검증: `npm --prefix app test` green. `[커밋]`
7. **skill과 eval**: skill의 `ls` 설명과 고아 안내를 고친다. 새 시나리오 `H8`을 만든다.
   - `H8`: 고아 파일을 seed한다. 에이전트가 `ls`를 읽고 고아 파일을 지우거나 고치지 않고 사용자에게 알리는지 본다. pass·fail fixture를 둔다.
   - 검증: `go test ./...`(skill), `node --test 'eval/**/*.test.ts'`, `node eval/run.ts --self-test` PASS. `[커밋]`
8. **실제 agent-eval(세 기능을 묶은 한 라운드)**: 2026-10-25 사용자 결정(실행 횟수 축소). `npm --prefix app run package` 뒤 `node eval/run.ts --scenarios R6,R7,H6,H7,H8,R1,R2b --agents claude,codex --repeat 2 --round <name>`을 실행한다(`--no-judge` 없이, `python3.12` 필요). 새 시나리오는 `revision-recheck`의 R6, `agent-handoff`의 R7·H6·H7, 이 기능의 H8이다.
   - 기준: 새 시나리오는 두 에이전트 모두 2/2 pass다. R1·R2b는 이전 라운드보다 나빠지지 않아야 한다.
   - 미달이면 사용자 결정 지점에서 멈춘다. 원인이 앞선 기능이면 고치는 작업은 그 기능의 후속 `/ship`으로 보낸다.
   - 검증: 결과와 사용성 문제를 `docs/USABILITY-EVAL.md`에 기록한다. `[커밋]`
9. **런타임 회귀**: 새 모듈 `app/e2e/project-feedback.ts`를 만들고 `app/e2e/runtime.ts`의 import 목록에 등록한다. 폴링은 iframe 교체를 재시도한다.
   - 댓글 파일 읽기 불가 시 트리가 유지되고 그 캔버스만 오류
   - 캔버스 파일 읽기 불가 행과 갈 곳 잃은 묶음 읽기 전용
   - id 변경 뒤 안내와 Show
   - Feedback 묶음, 키보드, 행 클릭 이동과 필터 맞춤
   - 캔버스 삭제 뒤 갈 곳 잃은 묶음의 Resolve·Reopen·Delete(`doan comments`에 반영)
   - 판정 뒤 캔버스 복원 시 Resolve 거부와 캔버스 묶음으로 이동
   - Home 요약 줄
   - 검증: 10의 `verify.mjs`가 실행한다(`/verify` 증거 재사용 규칙). `[커밋]`
10. **전체 게이트**: `node .agents/skills/verify/scripts/verify.mjs --runtime --eval`
    - 검증: 최종 PASS, exit 0.
11. **결론 승격**: 아래를 영어로 갱신한다.
    - PRODUCT §5
      - 항목 1: Home 요약
      - 항목 3: Overview 오른쪽 패널 Feedback. design-nav "stays 'No canvas open'"을 대체한다.
      - 항목 5: 갈 곳 잃은 댓글 동작, 행 단위 읽기 오류
      - 항목 9·11: `ls` 응답, 고아 경고 message
    - PRODUCT §7: 날짜와 근거와 함께 Q1–Q3, PF1–PF4를 적는다. 대체하는 design-nav 행을 명시한다.
    - ARCH
      - §1: check 표의 `orphan_comment_file` message
      - §2: App authority and retries 확장, 파일을 만들지 않는 append
      - §5: MCP `ls` 설명
      - §6: skill
      - §7: IPC
      - §12: `ls` 응답 계약
      - §13: 프로젝트 상태, 행 오류
      - §14·`docs/USABILITY-EVAL.md`: H8
    - DESIGN.md: Feedback 패널은 초안이 없는 새 화면이므로 측정값과 미검증 표면만 적는다.
    - 그 뒤 `docs/features/project-feedback/`를 삭제한다.
    - 검증: 위치 목록을 하나씩 확인한다. 남은 참조 검사는 command undecided — needs user confirmation이고, 진행 중인 다른 기능 문서의 참조는 판정에서 뺀다. `[커밋]`
