# project-feedback — 작업 순서

선행: `comments-readability`, `revision-recheck`, `revision-continuity`. 선행 기능이 main에 없으면 착수하지 않는다. 검증 명령은 AGENTS.md 'Commands'에 있는 것만 쓴다. 없으면 "command undecided — needs user confirmation"으로 적는다. `[커밋]`은 커밋 경계다.

**측정 공통 격리 조건**: 스크립트는 `.scratch/project-feedback/`에 둔다. `app/e2e/runtime.ts`처럼 격리한다. 임시 HOME·SHELL·`CLAUDE_CONFIG_DIR`·`CODEX_HOME`·userData, `DOAN_CLI`, `DOAN_RUNTIME`을 쓰고, `app/e2e/real-state.ts`(`python3.12`)로 확인한다. 종료는 정상 exit 0이어야 한다.

1. **측정**: 캔버스 50개, 댓글 5,000개 프로젝트에서 다음을 잰다.
   - `comments:project` 읽기·fold 시간
   - Feedback 첫 렌더 시간
   - `design/` 저장이 연달아 일어날 때의 무효화 빈도
   - 기준: Feedback 첫 렌더는 1초 이내, 연속 저장 중에는 다시 읽기를 합쳐 초당 1회 이하. 넘으면 설계를 사용자와 다시 정하고, 그 전에는 5를 멈춘다.
   - 검증: 결과를 이 항목 아래에 적는다. command undecided — needs user confirmation.
   - 측정 결과 (2026-10-26, 1단계): `node .scratch/project-feedback/measure.mjs`, 현재 코드(제품 변경 없음). 시드는 캔버스 50개(프레임 3개씩), 댓글 5,000개(open 3,750, resolved 1,250, edit·reopen 포함)다. main 시간은 `-r` 훅이 `comments:project` 핸들러를 감싸 잰다. 스크립트 exit 0, real-state 무변경.
     - 읽기·fold, cold(새 앱 프로세스에서 Home의 첫 읽기, 10회): 중앙값 279.3 ms, 최대 348.3 ms.
     - 읽기·fold, warm(preload `projectComments` 12회): renderer 왕복 중앙값 257.3 ms·최대 286.2 ms, main 중앙값 257.0 ms·최대 285.9 ms. 같은 `doan ls --json`을 앱 밖에서 따로 돌리면 중앙값 207.0 ms라서, 댓글 읽기와 fold는 약 50 ms다.
     - 연속 저장(한 캔버스 파일 20회 덮어쓰기, Home과 Overview 결과가 같다): 50 ms·100 ms 간격이면 저장 중 읽기 0회, 끝난 뒤 2회(약 250 ms 간격)다. 250 ms 간격이면 약 4.8초 동안 22회 읽고, 1초 창 최대 5회, 저장 중 평균 초당 약 3회다. 저장이 debounce(200 ms)보다 뜸하면 거의 저장마다 읽는다.
     - 판정: 연속 저장 중 초당 1회 이하 — **실패**(최악 1초에 5회. 50·100 ms 간격도 한 번의 갱신이 1초 안에 2회 읽어 엄격히는 초과). 첫 렌더 1초 여유 — **통과**(읽기 최대 348.3 ms. 첫 렌더 자체는 2단계에서 잰다).
     - 관찰(원인은 확인하지 않은 추정): 읽기가 약 250 ms 간격으로 두 번씩 온다. watcher 갱신의 `comments:invalidated`(ls 전)와 ls 뒤 행 서명 변경이 각각 읽기를 부르는 것과 맞는다.
     - 원본: `.scratch/project-feedback/stage1.log`, `stage1.json`.
   - 측정 결과 (2026-10-26, 2단계, 배치 V1): 같은 스크립트에 `feedbackFirstRender()`를 채우고 `--stage 2`로 돌렸다(1단계 측정도 같은 실행에 들어 있다). 시드는 1단계와 같다. 시간은 renderer의 `MutationObserver`가 Feedback 트리의 첫 행을 본 시각에서 클릭 직전 시각을 뺀 값이다. 스크립트 exit 0, real-state 무변경.
     - 콜드(새 앱 프로세스, ui-state 없이 Home에서 시작해 프로젝트 행이 보이자마자 들어감, 10회): 중앙값 389.5 ms, 최대 393.3 ms. 10회 모두 "Reading comments…"를 먼저 보였다(Home의 첫 읽기가 아직 진행 중). 첫 렌더의 트리 행은 3,950개다.
     - 웜(캔버스에서 Overview로 돌아옴, 12회): 중앙값 152.0 ms, 최대 326.2 ms. 직전 읽기를 바로 보이므로 "Reading comments…"는 0회였다.
     - 상태 전환(Open↔Resolved, 렌더만, 12회): 중앙값 34.8 ms, 최대 59.5 ms(행 3,950개와 1,450개).
     - 판정: Feedback 첫 렌더 1초 이내 — **통과**(최악 393.3 ms).
     - 연속 저장 중 다시 읽기(Feedback이 열린 Overview 포함): 이 실행에서는 Home 250 ms 구간이 1초 창 최대 2회로 **실패**였다. 읽기 7회의 시작 간격이 998 ms인 쌍이 하나 있었다(main 훅 기준 시각 218, 1216 ms). 나머지 구간은 모두 1회였다. 스케줄러의 간격 규칙(시작 사이 1,000 ms)은 이 배치에서 바꾸지 않았다. `--stage 1 --cold 3 --warm 3`으로 다시 돌린 실행에서는 모든 구간이 1초 창 최대 1회로 **통과**였다(구간별 읽기 2/2/7회, Home과 Overview가 같다). 998 ms는 renderer가 정한 시작 시각과 main이 받은 시각의 차이로 추정하지만 확인하지 않았다.
     - 원본: `.scratch/project-feedback/stage2.log`, `stage2.json`, `stage1-v1.log`, `stage1-v1.json`.
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
    - DESIGN.md: Feedback 패널은 링크 0 초안(`design/project-feedback.html`)과 `/design-sync`의 측정값, 미검증 표면을 적는다.
    - 그 뒤 `docs/features/project-feedback/`를 삭제한다.
    - 검증: 위치 목록을 하나씩 확인한다. 남은 참조 검사는 command undecided — needs user confirmation이고, 진행 중인 다른 기능 문서의 참조는 판정에서 뺀다. `[커밋]`
