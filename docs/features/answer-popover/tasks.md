# 답 팝오버 — tasks

순서: 드래프트(모습 결정) → 순수 함수 → UI(팝오버, 스레드, 진입점, 모션) → 측정과 실기 확인 → 승격. `[commit]`은 커밋 경계다. 구현(T2 이후)은 comment-trim이 develop에 머지된 뒤 시작한다(거의 모든 파일을 건드리므로). 드래프트(T1)는 그 전에 그려도 된다.

## T1. 드래프트와 모습 결정

- `/design-draft answer-popover`로 design.md '드래프트 요청'의 프레임을 그린다. 스타일 후보를 함께 그리고, 사용자가 앱에서 고른다. 고르지 않은 후보는 지운다.
- 문구는 `clarify` 프리셋으로 정해 `copy` 프레임에 둔다.
- 검증: `doan check <드래프트 경로>`가 통과한다. `doan ls`의 프레임 id가 요청과 같다. 사용자가 고른 모습과 문구가 design.md에 적혀 있다.
- `[commit]` 드래프트(develop에서는 `/design-draft`가 직접 push한다)와 design.md.

## T2. 순수 함수

- `waitingRequests`, 질문 단계 리듀서(`questionDraft.ts`), 팝오버 접힘 상태, 꺼진 이유 문구, 스레드 끝 여백의 따라가기 처리(design.md '순수 함수로 뺄 부분').
- 검증: `npm --prefix app test`에서 새 표 테스트가 먼저 실패(red)를 보이고 나서 통과한다. 기존 `questionDraft.test.ts`와 `threadMotion.test.ts`는 hold 규칙을 지운 부분 말고는 그대로 통과한다.
- `[commit]` `test:` → `feat:`

## T3. 팝오버와 스레드

- 팝오버와 접힌 막대를 만들고, 기다리는 요청을 스레드에서 팝오버로 옮긴다. 끝난 요청의 접힌 줄은 스레드에 그대로 둔다. 세 화면(캔버스 패널, Overview, 프로토타입 창 패널)에 적용한다.
- 검증: `npm --prefix app test`와 `npm --prefix app run typecheck`, `npm --prefix app run lint`가 통과한다. 컴포넌트 테스트는 다음을 확인한다.
  - 기다리는 동안 스레드에 카드가 없고 팝오버가 있다. 끝나면 팝오버가 없고 접힌 줄이 있다.
  - 질문 여럿의 Next/Back/Send, 단계 표시, 꺼진 이유 tooltip, 실패 뒤 답과 단계 유지.
  - 권한 요청의 내용과 버튼, 실패 문구.
  - "1 of 2"와 다음 요청으로 바뀌기.
  - 접기, Esc, 막대 누르기, 새 요청이 오면 펼쳐지기.
  - 포커스: 새 요청은 포커스를 옮기지 않는다. 답한 뒤에는 다음 요청이나 composer로 간다. Next가 Send로 바뀌어도 포커스가 문서로 떨어지지 않는다.
- `[commit]` `test:` → `feat:`

## T4. 진입점과 스레드 모션

- 진입점(토스트·알림의 Open, 사이드바 슬롯, Overview 행, 캔버스 패널의 진입)을 "팝오버를 펼치고 포커스"로 바꾼다. 따라가기의 hold 규칙을 지우고, 끝 여백을 따라가기에 넣는다.
- 검증: `npm --prefix app test`가 통과한다. 화면마다 권한과 질문 둘 다, 효과가 실행되는 진입 포커스 테스트가 있다(postmortem 2026-11-23). `rg -n "scrollToItem\(|focusItem\(" app/src/renderer --glob '!*.test.*'`로 남은 호출을 확인한다(command undecided — needs user confirmation: `rg`는 AGENTS.md 'Commands'에 없다).
- `[commit]` `test:` → `feat:`

## T5. 측정과 실기 확인

- `/design-sync`: 세 화면에서 팝오버, 접힌 막대, 단계, 권한 요청을 드래프트와 computed style로 맞춘다. `docs/design/conversation.md`의 'Agent question card' 측정값과 권한 notice를 새 값으로 고치고, 'Regression pointers'를 갱신한다.
  - 검증: 측정한 속성이 드래프트와 같거나, 다른 점이 'Documented differences'에 이유와 함께 적혀 있다.
- `/runtime-test`: 격리된 실제 앱에서 가짜 스트림으로 권한 요청과 질문(하나, 여럿)을 보낸다.
  - 화면: 캔버스 패널 280·356, Overview, 프로토타입 창 347
  - 항목:
    - 스레드를 맨 위로 스크롤해도 팝오버가 보인다.
    - 접기, 펼치기, Esc
    - Next/Back/Send
    - "1 of 2"
    - 진입점 포커스
    - 바닥에 붙은 상태에서 여백이 바뀔 때
    - 다른 창에서 답했을 때 닫힘
    - reduced motion
  - 검증: 항목마다 드래프트와 같은 모습이 보이고, 스크린샷이 `.scratch/`에 있다. 확인하지 못한 항목은 T6에서 BACKLOG에 적는다.
  - 실제 provider 턴이 필요하면 실제 HOME 로그인을 임시 홈에 복제하고, Keychain은 임시 홈의 버리는 기본 keychain을 쓴다(확인 요청이 뜨지 않게).
- `[commit]` `docs(design):`

## T6. 승격과 정리

- PRODUCT:
  - §5 item 3 'Questions'와 권한 요청 문단에 팝오버, 단계, 여러 요청, 접기, 스레드의 접힌 줄을 적는다.
  - item 2 'Opening'과 Overview 행의 "scrolls to the request" 규칙을 "팝오버를 펼치고 포커스"로 바꾼다.
  - 'Thread motion'의 hold 규칙을 지우고, 끝 여백을 적는다.
- ARCHITECTURE: 바뀌는 구조가 없으면 고치지 않는다. 바뀌면 그 절을 고친다.
- `docs/design/conversation.md`는 T5에서 고쳤다.
- `docs/features/answer-popover/`를 지운다.
- 검증: PRODUCT에 새 규칙이 있고, "scrolls to" 규칙과 hold 규칙이 남아 있지 않다. 기능 디렉터리가 없다.
- `[commit]` `docs(PRODUCT): …`, `docs(feature): remove answer-popover after promotion`
