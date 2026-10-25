# revision-recheck — 작업 순서

선행: `revision-continuity`, `comments-readability`. 검증 명령은 AGENTS.md 'Commands'에 있는 것만 쓴다. 없으면 "command undecided — needs user confirmation"으로 적는다. `[커밋]`은 커밋 경계다.

**측정 공통 격리 조건**: 스크립트는 `.scratch/revision-recheck/`에 둔다. `app/e2e/runtime.ts`의 격리 방식을 따른다. 임시 HOME·SHELL·`CLAUDE_CONFIG_DIR`·`CODEX_HOME`·userData, `DOAN_CLI`, `DOAN_RUNTIME`을 쓰고, `app/e2e/real-state.ts`로 실제 상태가 바뀌지 않았는지 확인한다(`python3.12` 필요). 종료는 정상 exit 0이어야 한다.

1. **측정**: 캔버스 20개, 댓글 1,000개 프로젝트에서 `comments:project` 읽기와 fold 시간, Home 첫 렌더 시간을 잰다.
   - 기준: Home 수 표시가 첫 렌더 뒤 500ms 안에 나와야 한다. 넘으면 design "측정 의존"의 대안을 사용자와 정하고, 그 전에는 8을 멈춘다.
   - 검증: 측정 결과를 이 항목 아래에 적는다. command undecided — needs user confirmation.
2. **fold `lastResolution`**: 먼저 공유 fixture를 고치고 추가한다.
   - 기존 `expected.json` 5개(basic-lifecycle, shuffled-lines, delete-followups, human-unicode-tied-lifecycle, reopen-idempotent)를 갱신한다.
   - 새 fixture `fold/reopen-cycles`와 `fold/lastresolution-tie`를 만든다.
   - 그다음 TS·Go를 구현한다.
   - 테스트에 넣을 경우: 해결과 다시 열기를 여러 번 반복한 경우, 해결 없이 다시 연 경우, union-merge 중복과 같은 id, 같은 시각의 resolve와 reopen, 다시 연 뒤 edit와 delete, agent reopen 거부. Go `cli` 패키지의 `comments`와 MCP `comments` 출력도 확인한다.
   - 검증: `go test ./...`, `go vet ./...`, `npm --prefix app test` green. `[커밋]`
3. **순수 함수 테스트 먼저(`/tdd`)**: design의 순수 함수 목록 전체.
   - 테스트에 넣을 경우
     - `toReview`: 마지막 review 시각 없음(since 기준), 같은 시각 경계, 미래·과거 `resolvedAt`, 현재 Git 이름의 해결 제외
     - `reviewState`: 빈 목록, 처음에서 Previous, 끝에서 Next, 중간 Reopen, 도착(extras), 다시 열림·삭제 건너뜀, close 진행 보존, Done 범위
     - `sortResolved`: 같은 시각
     - `activityKind`: 이전 rev 없음
     - `resolvedActivity`: 해결자 여러 명, 읽기 사이 resolve→reopen, 첫 읽기 기준선
     - `bottomLabel`: 오늘 아님, 자정 경계
     - `nextFocus`: 첫 카드, 마지막 카드, 유일한 카드
     - `locateView`: 뷰포트보다 큰 사각형, 0 크기
   - 검증: `npm --prefix app test`에서 red를 확인한다.
4. **순수 함수 구현**.
   - 검증: `npm --prefix app test` green, `npm --prefix app run typecheck`. `[커밋]`
5. **위치로 가기와 비선택 이동**: `locate`, `jumpToNode`, locate 표지와 범위 맞춤 예외.
   - 테스트에 넣을 경우: 대상 없음, 중복 `data-doan-id`, 폭 없는 캔버스, 이동 중 리로드나 `moved`(펜스), 핀이 숨은 상태, Resolved 상태 필터 유지.
   - 검증: `npm --prefix app test` green. `[커밋]`
6. **해결 메타, 정렬, 성공 상태 줄과 포커스, Canvas changed**.
   - 테스트에 넣을 경우: 상태 줄 타이머가 캔버스 전환과 문서 교체 때 정리됨, 에이전트 해결로 포커스된 카드가 사라짐, 해결 카드에서 Canvas changed와 Freshness unknown을 숨김.
   - 검증: `npm --prefix app test` green. `[커밋]`
7. **Activity와 하단 라벨**.
   - 검증: `npm --prefix app test` green. `[커밋]`
8. **확인 상태 저장소, `comments:project` IPC, Review 바와 메뉴, Home·Overview 수**.
   - 테스트에 넣을 경우: 저장소 손상과 검증, `since` 초기화, id 중복과 id 없음, 프로젝트 제거, 댓글 파일 읽기 실패와 invalid 줄이 있을 때의 수, Review 중 추가 해결·리로드·이동, 숨김과 재시작, 초안 중 Review 비활성, Esc 우선순위, ⌘]/⌘[ 메뉴 상태. 알림은 동기 생산자 상태로 계산한다(POSTMORTEM).
   - 검증: `npm --prefix app test` green, `npm --prefix app run typecheck`. `[커밋]`
9. **해결된 댓글 편집(Save and reopen), 사라진 대상(Comment on selection instead)**.
   - 테스트에 넣을 경우
     - 두 줄을 한 번의 append로 쓴다. 같은 event id로 재시도한다. 그 사이 에이전트가 reopen이나 edit를 해서 expected가 어긋난다. Save only.
     - 선택 없음이면 비활성이다. 새 댓글 저장이 실패하면 원본은 그대로다. 삭제 확인을 거절한다. 해결된 댓글에는 이 버튼이 없다.
   - 검증: `npm --prefix app test` green. `[커밋]`
10. **skill 한 줄과 eval 시나리오**: `cli/internal/cli/skill.md`를 고치고, 새 시나리오 `R6`(다시 열린 댓글)를 만든다.
    - R6 구성: seed는 resolve→reopen 이벤트가 든 `.doan/comments/*.jsonl`이다. `prompt.md`, `rubric.md`, `checks.ts`, `fixtures/{pass,fail}`를 둔다.
    - 검증: `go test ./...`(skill 테스트), `node --test 'eval/**/*.test.ts'`, `node eval/run.ts --self-test` PASS. `[커밋]`
11. **실제 agent-eval: 이 링크에서는 실행하지 않는다** (2026-10-25 사용자 결정(실행 횟수 축소)). 세 기능(`revision-recheck`, `agent-handoff`, `project-feedback`)의 실제 라운드는 `project-feedback` task 8에서 한 번에 돈다. 이 링크는 10의 self-test까지만 한다. 그 라운드 전에 skill·CLI 변경이 main에 들어가는 위험은 받아들인다.
12. **런타임 회귀**: 새 모듈 `app/e2e/revision-recheck.ts`를 만들고 `app/e2e/runtime.ts`의 import 목록에 등록한다. 폴링은 iframe 교체를 재시도하고, 재시작 시나리오는 exit code와 signal을 확인한다.
    - 화면 밖 대상으로 위치로 가기(열린 댓글, 해결된 댓글, 필터 유지)
    - CLI resolve 뒤 알림, Review 단계(Next, Reopen, Done), Esc 진행 보존, ⌘] 메뉴
    - 숨김과 재시작 뒤 알림 유지, 내가 해결한 것은 제외
    - 해결자 표시, 정렬, 다시 열린 카드 문구
    - 사람의 Resolve 뒤 상태 줄과 포커스
    - Save and reopen 뒤 `doan comments`에 다시 나타남
    - Opened/Changed/Reloaded 하단 라벨, Home·Overview "N resolved to review"
    - Canvas changed 표시, Comment on selection instead
    - 검증: 13의 `verify.mjs`가 이 모듈을 포함해 실행한다(`/verify` 증거 재사용 규칙). `[커밋]`
13. **전체 게이트**: `node .agents/skills/verify/scripts/verify.mjs --runtime --eval`
    - 검증: 최종 PASS, exit 0.
14. **결론 승격**: 아래 위치를 영어로 갱신한다.
    - PRODUCT §5 항목 1: Home 수
    - PRODUCT §5 항목 3: Overview 카드 수
    - PRODUCT §5 항목 5: 위치로 가기, 해결 메타, Review, Save and reopen, Canvas changed, 사라진 대상
    - PRODUCT §7: 날짜와 근거. 2026-10-22 app-ui Updated/Activity 행 대체, seen marker 문장, Q1–Q6, RR1–RR5
    - ARCH §2: fold Output의 `lastResolution`, 쓰기 규칙의 이벤트 2개 append
    - ARCH §3: 위치로 가기, Review, Activity
    - ARCH §5: MCP `comments` 출력
    - ARCH §6: skill 한 줄
    - ARCH §7: review-state.json, IPC, 메뉴
    - ARCH §12: comments 응답
    - ARCH §14와 `docs/USABILITY-EVAL.md`: R6
    - DESIGN.md: 측정값과 미검증 표면
    - 그 뒤 `docs/features/revision-recheck/`를 삭제한다.
    - 검증: 위 위치 목록을 하나씩 체크한다. 남은 참조 검사는 command undecided — needs user confirmation이고, 진행 중인 다른 기능 문서의 참조는 판정에서 뺀다. `[커밋]`
