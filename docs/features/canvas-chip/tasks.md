# 캔버스 칩 — tasks

순서: PoC(끌기와 놓기) → 드래프트 → 앵커 형식과 거울 → 판정 규칙 → UI(네 덩어리) → eval → 측정과 실기 확인 → 승격. `[commit]`은 커밋 경계다. T1과 T2는 선행 과제를 기다리지 않고 develop에서 할 수 있다(코드를 바꾸지 않는다).

선행 과제(구현 T3 이후의 시작 조건): check-scope와 thread-polish가 develop에 머지됐다. `git fetch && git ls-tree origin/develop docs/features/check-scope docs/features/thread-polish`의 출력이 비어 있다. check-scope는 `prompt.ts`를, thread-polish는 `ConversationThread.tsx`·`styles.css`를 바꾼다. 후행 과제: canvas-message.

## T1. PoC: 끌기와 놓기

- design.md 'PoC'의 항목을 `.scratch/canvas-chip/`의 probe로 확인한다. 격리된 실제 앱에서 돌린다.
- 검증: 항목마다 결과(스크린샷, 관찰)가 `.scratch/`에 있다. 놓일 자리 표시 방식과 runtime-test의 끌기 방식이 design.md 'PoC 결과'에 적혀 있다. `prosemirror-dropcursor`를 고르면 버전과 고정 방식도 적는다. 실행 명령은 `node .scratch/canvas-chip/probe.mjs`다(일회성 probe).
- `[commit]` design.md

## T2. 드래프트

- `/design-draft canvas-chip`으로 design.md '드래프트 요청'의 프레임을 그린다. 사용자가 앱에서 확정한다.
- 검증: `doan check <드래프트 경로>`가 통과하고, `doan ls`의 프레임 id가 요청과 같다. 사용자가 확정한 모습과 문구가 design.md에 적혀 있다.
- `[commit]` 드래프트와 design.md

## T3. 앵커 형식과 거울

- `Anchor`와 `validAnchor`에 `{canvas: {path, id}}`를 더한다.
- 앵커 거울(`targetKey`, `isAnchor`, `chipLabel`/`messageLine`, `ICONS`, `KIND_PREFIX`)을 맞춘다.
- 검증: `npm --prefix app test`에서 design.md '순수 함수로 뺄 부분'의 앵커와 거울 표 테스트가 먼저 실패(red)를 보이고 나서 통과한다. `npm --prefix app run typecheck`가 통과한다. 프롬프트 거울 테스트(eval의 `prompt.test.ts`들)를 위해 `node .agents/skills/verify/scripts/verify.mjs --eval`이 통과한다.
- `[commit]` `test:` → `feat:`

## T4. 판정 규칙과 보낼 때의 처리

- `canvasChipTarget`, 행의 id 판정, 클립보드 범위 변환, Home root 변경 변환, 보낼 때의 경로 바꾸기와 이름 대체(main, `ipc.ts`).
- 검증: `npm --prefix app test`에서 각 표 테스트가 먼저 실패를 보이고 나서 통과한다. 다음 경우를 담는다.
  - 판정:
    - 같은 root와 다른 root, 같은 프로젝트의 다른 worktree
    - Home의 root 일치와 불일치
    - 읽기 전용, IME, pick 중
    - 32곳 한도(프로토타입 창의 예약 칩 포함)
    - id 없음, `""`, 중복
    - 읽기 오류 행, 목록을 읽는 중
    - 프로토타입 창
  - 보낼 때:
    - 옮겨진 캔버스는 지금 경로로 바뀐다.
    - 지워진 캔버스는 이름이 되고 `{{n}}` 번호를 다시 매긴다.
    - 큐와 Send now도 같은 처리를 거친다.
  - 클립보드: 섞인 칩, 다른 root, 32곳 넘침
- `[commit]` `test:` → `feat:`

## T5. UI (네 덩어리, 덩어리마다 `test:` → `feat:`)

- **T5a. 칩 노드, 끌기, 놓기**:
  - 사이드바 행 drag, 메모리 끌기 상태, 보드 막, 칩 필드 drop과 놓일 자리 표시, 받지 않는 composer의 이유 줄
  - 검증(컴포넌트 테스트):
    - 놓은 자리에 칩이 들어가고, 포커스와 caret이 칩 뒤로 간다.
    - 글 칸 밖에 놓으면 caret이나 끝에 들어간다.
    - undo 한 번으로 되돌아간다.
    - 파일 drop은 첨부가 되고, 캔버스 끌기에는 파일 덮개가 없다.
    - MIME만 있고 메모리에 끌기가 없으면 받지 않는다.
    - 다른 root, IME, 읽기 전용, pick 중에는 받지 않고 이유 줄이 보인다.
    - 트리의 클릭, 방향키, typeahead가 그대로다. 끌기 시작이 행을 열지 않는다.
    - 메뉴 트리거와 chevron은 끌리지 않는다.
- **T5b. 행 메뉴**:
  - "Add to message", 등록된 composer로 넣기, 꺼진 이유
  - 검증:
    - 화면마다 맞는 composer에 들어간다. 캔버스 패널이 접혀 있으면 펼친다.
    - 꺼진 이유가 tooltip과 접근성 설명으로 나온다.
    - 포커스가 composer로 간다(`onCloseAutoFocus`). Esc로 닫으면 행으로 돌아간다.
- **T5c. 보낸 칩과 누르기, 클립보드**:
  - 검증:
    - 다른 캔버스 열기는 deep link 규칙대로다(Back 한 번).
    - 지금 캔버스는 Fit이다.
    - 없는 캔버스는 누른 뒤 "No longer in <project>"다.
    - 중복은 토스트다.
    - 프로토타입 창에서는 메인 창에서 연다.
    - composer 칩을 눌러도 같다.
    - 보낸 말풍선에서 복사해도 줄바꿈이 없다(postmortem 2026-11-22).
    - Look Up은 보이는 이름이다(postmortem 2026-11-08).
    - 같은 root에서는 칩, 다른 곳에서는 이름으로 붙는다.
- **T5d. Home**:
  - Home composer의 segments와 anchors, 마지막 요청, 시작 초안, 돌려받은 초안, Edit on Home, 종료 뒤 복원, root 변경과 알림
  - 검증:
    - Home에서 보낸 시작에 캔버스 앵커가 실린다.
    - 돌려받은 초안과 Edit on Home에 칩이 남는다.
    - 프로젝트나 worktree를 바꾸면 다른 root 칩이 이름이 되고, 알림이 한 번 있다.
- 모든 덩어리: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`가 통과한다.

## T6. eval

- 새 시나리오 id를 하나 만든다(`/agent-eval` 스킬의 id 규칙).
  - `turn.json`에 캔버스 앵커가 든 Home 또는 캔버스 대화 턴을 둔다.
  - 과제: 참고 캔버스를 바탕으로 새 캔버스를 그리라는 요청
  - 검사:
    - 에이전트가 앵커의 경로를 읽었다(transcript).
    - 참고 캔버스는 바이트 단위로 같다.
    - 새 캔버스가 `doan check`를 통과한다.
  - pass와 fail fixture를 둔다. `prompt.test.ts`는 `turnPrompt`와 대조한다.
- 기존 시나리오의 앵커 검사(R8d, R9b의 `checks.ts`)가 새 모양에서도 맞는지 확인한다.
- 검증:
  - `node --test 'eval/**/*.test.ts'`가 통과한다.
  - `node eval/run.ts --self-test`가 `self-test PASS`와 exit 0이다.
  - `npm --prefix app run package` 뒤 `node eval/run.ts --scenarios <새 id>,R12 --round <name>`에서 새 시나리오가 Claude Code와 Codex 모두 통과한다.
  - 회차가 `docs/usability-eval/rounds-<YYYY-MM>.md`에 적혀 있다.
  - 프롬프트 안내 문장을 바꾸면 거울 `prompt.md`들과 회차를 다시 돈다.
- `[commit]` `test:`(시나리오), `docs(usability-eval): …`

## T7. 측정과 실기 확인

- `/design-sync`: 칩(composer, 말풍선, `ds/`), 끌기 표시, 이유 줄, 메뉴를 드래프트와 computed style로 맞춘다. `docs/design/`의 칩 섹션에 측정값을 적고, 새 섹션이면 `docs/DESIGN.md` 색인에 더한다.
  - 검증: 측정한 속성이 드래프트와 같거나, 다른 점이 'Documented differences'에 이유와 함께 적혀 있다.
- `/runtime-test`:
  - 대부분의 항목은 T1에서 정한 방식(창을 앞으로 가져오지 않는 Playwright drag)으로 돌린다.
  - 네이티브 마우스 끌기는 짧은 구간으로 따로 하고, `showMain`으로 창을 앞에 둔다. 그 전에 사용자에게 알리고, 다른 워커의 GUI probe를 멈춘다. 포커스를 가져간 단계를 보고에 적는다.
  - 항목:
    - 캔버스 패널(열린 캔버스, 다른 캔버스, `ds/`, 하위 폴더)
    - Overview
    - Home(같은 root, 다른 프로젝트, 다른 worktree)
    - 받지 않는 곳과 이유 줄
    - 보드 위
    - 파일 drop과 함께
    - 행 메뉴
    - 보낸 칩 열기와 Fit
    - 프로토타입 창의 돌려받은 칩
  - 격리된 PATH의 가짜 `claude`가 받은 프롬프트를 기록해, 캔버스 앵커가 지금 경로로 들어가는지 확인한다. 지운 캔버스는 이름으로 바뀌는지도 확인한다.
  - 검증: 항목마다 드래프트와 같은 모습과 동작이 보이고, 스크린샷이 `.scratch/`에 있다. 확인하지 못한 항목은 T8에서 BACKLOG에 적는다.
- `[commit]` `docs(design): …`, 필요하면 `fix:`·`test:`

## T8. 승격과 정리

- PRODUCT: spec '바뀌는 PRODUCT와 ARCHITECTURE 문장'의 PRODUCT 목록을 새 규칙으로 바꾼다.
- ARCHITECTURE: 같은 목록의 ARCHITECTURE 항목을 고친다. §7 'Renderer primitives'의 "Chips reach the canvas panel's composer from a canvas-script pick or…"에 놓기와 행 메뉴를 더한다. §14에 새 시나리오를 더한다.
- BACKLOG:
  - Home 드롭이 합성 이벤트로만 확인됐다는 항목을 고친다.
  - T7에서 확인하지 못한 항목을 더한다.
- `docs/USABILITY-EVAL.md`: 회차에서 문제가 나오면 적는다.
- `docs/features/canvas-chip/`를 지운다.
- 검증: 두 문서에 새 규칙이 있고, "Home's and the Overview's composers take no chips"가 남아 있지 않다. 기능 디렉터리가 없다(문서를 읽어 확인한다).
- `[commit]` 문서마다: `docs(PRODUCT): …`, `docs(ARCHITECTURE): …`, `docs(BACKLOG): …`, `docs(feature): remove canvas-chip after promotion`
