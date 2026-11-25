# 답 팝오버 — tasks

순서: 드래프트(모습 결정) → PoC(끝 여백 방식) → 순수 함수 → UI와 진입점 → 측정과 실기 확인 → 승격. `[commit]`은 커밋 경계다. 구현(T2 이후)은 comment-trim이 develop에 머지된 뒤 시작한다(거의 모든 파일을 건드리므로). 드래프트(T1)는 그 전에 그려도 된다.

## T1. 드래프트와 모습 결정

- `/design-draft answer-popover`로 design.md '드래프트 요청'의 프레임을 그린다. 스타일 후보를 함께 그리고, 사용자가 앱에서 고른다. 고르지 않은 후보는 지운다.
- 문구는 `clarify` 프리셋으로 정해 `copy` 프레임에 둔다.
- 검증: `doan check <드래프트 경로>`가 통과한다. `doan ls`의 프레임 id가 요청과 같다. 사용자가 고른 모습과 문구가 design.md에 적혀 있다. `.doan/canvases/agent-questions.html`은 바뀌지 않았다(`git diff --stat`).
- `[commit]` 드래프트(develop에서는 `/design-draft`가 직접 push한다)와 design.md.

## T2. PoC: 끝 여백 방식

- design.md 'PoC'대로 `.scratch/answer-popover/`의 probe로 방식 A와 B를 비교한다. 격리된 실제 앱(`app/runtime/` 격리)에서 280×360과 캔버스 패널 기본 크기로 돌린다.
- 검증: 비교 항목마다 결과(스크린샷, 측정값)가 `.scratch/`에 있다. 고른 방식과 이유가 design.md 'PoC 결과'에 적혀 있다. 실행 명령은 `node .scratch/answer-popover/measure.mjs`다(일회성 probe, AGENTS.md 'Commands'의 `/design-sync` measure와 같은 방식).
- `[commit]` design.md

## T3. 순수 함수

- 질문 단계 리듀서, 접힘 상태(`covers`), 진입 대상(가장 먼저 온 요청), 끝 여백의 따라가기 처리(design.md '순수 함수로 뺄 부분').
- hold 규칙(`scrollToItemHolds`, `held`/`release`)과 그 테스트를 지운다.
- 검증: `npm --prefix app test`에서 새 표 테스트가 먼저 실패(red)를 보이고 나서 통과한다. 다음 기존 테스트를 고친다.
  - `questionDraft.test.ts`
  - `threadMotion.test.ts`의 hold 경우
  - `overviewRun.test.ts`의 가장 최근 요청 경우
  - `npm --prefix app run typecheck`가 통과한다. hold 함수를 아직 import하는 곳이 남아 있으면 실패한다.
- `[commit]` `test:` → `feat:`

## T4. 팝오버, 스레드, 진입점 (한 커밋 단위)

- 팝오버와 접힌 막대를 만들고, 기다리는 요청을 스레드에서 팝오버로 옮긴다. 세 화면에 적용한다.
- 진입점(spec 완료 조건 11의 목록)을 "팝오버를 펼치고 포커스"로 바꾼다. 따라가기에 끝 여백을 넣고, Jump to latest를 옮긴다.
- 이 둘은 함께 바꿔야 기존 진입 포커스 테스트가 중간에 깨지지 않는다.
- 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`가 통과한다.
  - **다시 쓸 기존 테스트**:
    - `ConversationThread.question.test.tsx`: 스레드 안 카드에서 팝오버로. Esc가 아무 일도 하지 않던 경우는 접기로 바꾼다.
    - `ConversationThread.test.tsx`의 기다리는 권한 카드
    - `ConversationThread.focus.test.tsx`
    - `ConversationThread.motion.test.tsx`의 `scrollToItemHolds`
    - `ProjectOverview.entryFocus.test.tsx`
    - `App.conversationPanel.test.tsx`의 진입 포커스와 배지
  - **바뀌지 않고 통과해야 하는 테스트(보호)**:
    - `CanvasConversationPanel.test.tsx`의 docked buddy가 기다림을 듣는 경우
    - `ConversationStripView.test.tsx`
    - `conversationStrip.test.ts`
  - **새 컴포넌트 테스트**:
    - 기다리는 동안 스레드에 카드가 없고 팝오버가 있다. 끝나면 팝오버가 없고 이벤트 순서 자리에 접힌 줄이 있다(질문과 권한의 줄 모두).
    - 질문 여럿:
      - Next, Back, Send
      - "Question 2 of 3"
      - 꺼진 이유 tooltip
      - Next/Send가 같은 요소다.
      - Back의 포커스
      - 여러 선택은 하나로 Next가 켜진다.
      - 공백만 있는 Other로는 Next가 켜지지 않는다.
      - 비밀 답이 Back 뒤에도 가려지고, 접힌 줄에 답이 없다.
      - 선택지가 없는 질문의 단계
      - Antigravity 질문(Other 없음, header 없음)
      - 실패 뒤 답과 단계가 남고 팝오버가 펼쳐진다.
      - "Skip all"
      - Other 칸의 Return은 Next다. 마지막 단계에서는 Send이고, IME 조합 중에는 동작하지 않는다.
    - 권한:
      - `summary`가 `reason`보다 앞이다.
      - 저장되는 선택의 설명
      - 보내는 중 잠금
      - 실패 문구
      - 펼친 직후 Return 자동 반복으로 허용되지 않는다.
    - 여러 요청: "1 of 2 requests", 다음 요청으로 바뀌기, 바뀔 때 한 번 읽어 주기
    - 접기:
      - Collapse, 막대 누르기
      - 접혀 있을 때 새 요청이 오면 펼치고 한 번 읽어 주며, 포커스는 그대로다.
      - 대화를 바꿔도 접힘과 단계가 남는다(호스트에서 확인한다).
      - 다시 불러오면 없어진다.
      - 바깥 포커스로 접히지 않는다.
    - Esc:
      - tooltip을 먼저 닫는다.
      - IME를 끝내는 Esc는 접지 않는다.
      - 캔버스 도구로 가지 않는다.
      - 막대에서는 아무것도 하지 않는다.
    - 포커스가 팝오버 안에 있을 때 요청이 끝나는 경우마다, 포커스가 다음 요청이나 composer로 간다: 답, Skip, Stop, 다른 창의 답(실패 줄 없음), 만료, 턴 종료, CLI 취소.
    - 진입점: spec 11의 목록마다, 권한과 질문 둘 다, 효과가 실행되는 테스트로 팝오버가 펼쳐지고 포커스가 맞는다. 요청에 대해 `scrollToItem`을 부르지 않는다. 핸드오프 카드의 `scrollToItem`은 그대로다.
    - 높이 상한을 넘는 내용은 본문만 스크롤하고, 버튼 줄이 보인다.
    - 재시작 뒤에는 팝오버가 없고 "Expired without an answer" 줄이 있다.
- `[commit]` `test:` → `feat:`

## T5. 측정과 실기 확인

- `/design-sync`:
  - 세 화면에서 팝오버, 접힌 막대, 단계, 권한 요청을 새 드래프트와 computed style로 맞춘다.
  - `docs/design/conversation.md`의 'Agent question card' 섹션을 새 드래프트 기준으로 다시 쓴다(Reference, 측정값, 차이, Not verified, Regression pointers).
  - 권한 요청 측정 섹션을 새로 만든다.
  - 'Thread motion'의 권한 카드와 hold 문장을 고친다.
  - `docs/design/canvas-conversation.md` 'Waiting reason line'을 확인한다.
  - 섹션 이름이 바뀌면 `docs/DESIGN.md` 색인을 고친다.
  - 바뀌지 않은 부분(선택지 줄, 라디오)의 측정값은 이어 쓰고, 그렇다고 적는다.
  - 검증: 측정한 속성이 드래프트와 같거나, 다른 점이 'Documented differences'에 이유와 함께 적혀 있다.
- `/runtime-test`:
  - 격리된 실제 앱에서 가짜 스트림으로 권한 요청, 질문 하나, 질문 여럿, 동시에 기다리는 요청 둘을 보낸다. `app/runtime/`에는 요청 fixture가 없으므로 probe가 이벤트를 만든다.
  - 화면:
    - 캔버스 패널 280, 기본, 최대
    - Overview
    - 프로토타입 창 280×360과 347
    - 메인 창과 프로토타입 창에 같은 대화를 함께 연 상태
  - 항목:
    - 스레드를 맨 위로 스크롤해도 팝오버가 보인다.
    - 팝오버 아래 가장자리가 스레드 영역 바닥과 같다.
    - 접기, 펼치기, Esc(IME 포함)
    - Next/Back/Send
    - "1 of 2 requests"
    - 다른 창에서 답했을 때 닫힘
    - 접힌 채 턴이 끝날 때
    - 바닥에 붙은 상태에서 여백이 바뀔 때, Jump to latest가 거짓으로 뜨지 않는다.
    - 짧은 창에서 긴 선택지
    - 알림 Open으로 접힌 팝오버에 들어가기(창을 앞으로 가져와야 하므로 포커스를 가져간 단계를 보고에 적는다)
    - reduced motion, 다크 모드와 forced colors
  - 검증: 항목마다 드래프트와 같은 모습이 보이고, 스크린샷이 `.scratch/`에 있다. 확인하지 못한 항목은 T6에서 BACKLOG에 적는다.
  - 실제 provider 턴이 필요하면 실제 HOME 로그인을 임시 홈에 복제하고, Keychain은 임시 홈의 버리는 기본 keychain을 쓴다(확인 요청이 뜨지 않게).
- `[commit]` `docs(design): …`, 그리고 `/design-sync`가 코드를 고치면 `fix:`·`test:`

## T6. 승격과 정리

- PRODUCT: spec '바뀌는 PRODUCT와 ARCHITECTURE 문장'의 목록을 모두 새 규칙으로 바꾼다.
- ARCHITECTURE: §7 'Renderer primitives' 'Thread focus'(카드 → 팝오버)와 프로토타입 창 store의 상태 목록(접힘, 단계)을 고친다.
- BACKLOG:
  - 'Not verified'의 질문·권한 화면 항목을 팝오버 기준으로 다시 쓴다.
  - 스레드 모션 항목의 "waiting question card's hold and release"를 지운다.
  - 카드라는 말이 남은 항목을 고친다.
  - T5에서 확인하지 못한 항목을 더한다.
- `docs/features/answer-popover/`를 지운다.
- 검증: PRODUCT에 새 규칙이 있다. spec 목록의 옛 문장("waits in the thread as a card", "Esc do nothing", "newest unanswered request", "latest unanswered request", hold 문장)이 남아 있지 않다. 이 확인은 문서를 읽어서 한다(명령 없음). 기능 디렉터리가 없다.
- `[commit]` 문서마다: `docs(PRODUCT): …`, `docs(ARCHITECTURE): …`, `docs(BACKLOG): …`, `docs(feature): remove answer-popover after promotion`
