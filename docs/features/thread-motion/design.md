# 스레드 모션 — design

## 영향 범위

- **app renderer**:
  - `ConversationThread.tsx`:
    - `useFrameText`(`:322`)를 점진 표시로 바꾼다. 마운트할 때 `shown`은 지금처럼 현재 텍스트로 시작한다(`useState(text)`, `:323`). 그래서 대화를 다시 열거나 패널을 접었다 편 뒤에도 스트리밍 중인 답을 처음부터 다시 타이핑하지 않는다.
    - 사용자 메시지 항목에 진입 모션을 단다.
    - 바닥 따라가기(`:819-830`)를 아래 '스크롤 따라가기'로 바꾼다.
  - `conversationStore.ts`: 보낼 때 로컬 전송 표시를 남긴다(아래 '진입 판정').
  - `threadItems.ts`: `threadScroll`/`scrollFollow`(`:393-402`)의 판정은 그대로 두고, 순수 함수를 더한다.
  - `styles.css`: 진입 keyframes와 reduced motion 규칙.
  - 캔버스 패널, Overview, 프로토타입 창(`prototype/PrototypeConversation.tsx:7`가 `CanvasConversation`을 다시 쓴다)에 함께 적용된다.
- **main, CLI, 스킬, 형식**: 바뀌지 않는다. 이벤트와 IPC가 그대로다.
- **`/agent-eval`**: 해당하지 않는다.

## 모션 토큰

- 이미 있는 토큰을 쓴다(DESIGN.md 'Motion'): `--time-fast` 120ms, `--time-state` 150ms, `--time-panel-enter` 180ms, `--time-settle` 220ms, `--ease-enter`, `--ease-settle`, `--ease-state`. 대화상자가 열릴 때 12px 올라오며 220ms에 나타나는 규칙이 있다. 진입 A는 이 결을 따른다.
- 점진 표시와 스크롤의 상수(`MAX_LAG_MS` 400, 마무리 150ms, 지수 감속의 τ)는 컴포넌트 상수로 둔다. 사람이 조절하는 설정이 아니므로 함수 인자로 열어 두지 않는다.

## 진입 판정

- `user.message` 이벤트에는 창이나 composer 정보가 없다(`main/conversation/types.ts:48`). 그리고 캔버스 패널의 바로 보내기(`CanvasConversationPanel.tsx:478-486`)는 보낼 때 아무것도 표시해 두지 않는다. 그래서 이 창에서 보낸 메시지를 터미널에서 온 메시지와 구별할 수 없다.
- 그래서 이 창의 store에 로컬 전송 표시를 남긴다. 모양은 Overview의 `sendPending`(`ProjectOverview.tsx:321`)과 같이 대화 id, 텍스트, 그때의 마지막 seq다. 다음에 오는 같은 텍스트의 `user.message`가 이 표시를 쓰고 지운다. 표시는 화면에 아무것도 그리지 않는다(Sending 줄을 새로 만들지 않는다).
  - 대상: 바로 보내기(패널, Overview, 프로토타입 창), Send now, 턴이 끝난 뒤 이 창의 큐에서 나가는 메시지, 새 대화의 첫 메시지(Home과 각 composer).
  - 새 대화의 첫 메시지는 대화를 여는 render에 있다. 그래도 로컬 전송 표시가 있으면 진입한다.
- Send now의 `q<id>` 항목과 이후의 `user.message` 항목은 키로 이어지지 않는다. `withSending`은 잠깐 둘 다 보일 수 있다고 적어 두었다(`threadItems.ts:355-357`). 그래서 이번 render나 직전 render의 `q` 항목과 텍스트·앵커가 같은 새 사용자 항목은 이미 들어온 메시지로 보고 다시 진입하지 않는다.
- 여러 큐 메시지가 한 번에 나가면 함께 진입한다.

## 진입 모션 (사용자 결정: A)

- 말풍선이 아래에서 16px(`--space-4`) 올라오며 300ms(새 토큰 `--time-thread-enter`, `--ease-enter`)에 나타난다. 앱의 대화상자(12px, 220ms)와 같은 결에서 사용자가 더 길고 느리게 골랐고, 값은 토큰으로 두었다.
- 비교하고 버린 안: composer 자리에서 날아오기(FLIP), 제자리에서 커지기.
- 말풍선은 최종 크기로 자리를 잡고 translate와 opacity만 바꾼다. 그래서 스레드 높이와 스크롤 계산이 흔들리지 않는다.
- reduced motion: 제자리 opacity 페이드만 한다(DESIGN.md 'Motion').
- 턴 인디케이터, 큐 알약, 다음 메시지 제안, 백그라운드 작업 줄은 모션 없이 나타나고 말풍선과 함께 움직이지 않는다.

## 출력 점진 표시 (사용자 결정: B)

- 단어 단위로 펼치고, 새로 보인 단어가 투명에서 진해진다. 비교하고 버린 안: 페이드 없는 단어 단위, 블록 단위.
- 속도: 적응형이다. 가장 오래 숨겨진 글자의 나이가 `MAX_LAG_MS`(400ms)를 넘지 않게 속도를 올린다. 받은 조각이 작으면 받은 만큼만 보인다. 처음에는 250ms로 그렸는데, 사용자가 조금 더 천천히 쓰이는 느낌을 골랐다.
- 페이드: 새로 보인 단어 묶음마다 시작 시각을 따로 갖고, 투명에서 진해지기까지 220ms(`--time-settle`, ease-out)가 걸린다. 그래서 줄의 마지막 몇 단어가 부드럽게 따라오고 그 앞은 이미 진하다. 다시 그려도 페이드가 처음부터 다시 시작하지 않아야 한다. 예를 들어 keyframe의 delay를 그 묶음 나이의 음수로 준다. 코드 블록도 줄 단위로 같은 페이드를 쓴다.
- 끝날 때:
  - `message.done`: 남은 끝을 약 150ms에 마저 보여준다. `message.done` 하나로 통째로 온 답(`threadItems.ts:260`, delta 없음)도 같다.
  - Stop(누른 순간), 실패, 턴 종료: 즉시 모두 보여준다.
  - 답 뒤에 다른 항목이 오면 그 render에서 즉시 모두 보여준다. 위 텍스트가 늘어나 권한 카드의 Allow를 밀어내지 않게 하기 위해서다.
  - 창이 숨겨져 rAF가 멈췄다가 돌아오면, 그동안 받은 텍스트를 즉시 보여준다. `dtMs`가 크면 `revealStep`이 상한으로 따라잡는다.
- 경계(`revealBoundary`):
  - 단어 경계에서 자른다.
  - 코드 블록은 안에서 줄 단위로 펼친다. 큰 블록이 통째로 튀어나오면 이 feature가 없애려는 점프가 다시 생기기 때문이다. 닫히지 않은 코드 펜스는 CommonMark대로 이미 올바르게 그려진다.
  - 받은 텍스트의 끝에서 아직 완성되지 않은 링크(`doan:` 칩 링크 포함, `ConversationThread.tsx:274`)와 표는 완성될 때까지 잡아 둔다. 지금은 미완성 링크가 텍스트로 보였다가 칩으로 바뀐다.
  - `{{n}}`은 사용자 말풍선의 문법이라(`:466-471`) 답에는 없다.
- 선택: 답 안에서 텍스트를 선택하면 그 답을 즉시 모두 보여주고 따라가기를 멈춘다. 프레임마다 다시 그리면 그 답 안의 선택이 풀리기 때문이다. 코드 블록의 Copy(`textOf(node)`, `:224`)는 받은 전체 텍스트를 복사한다.
- 스크린리더: 답 본문은 live region이 아니다(지금과 같음). 상태 줄만 읽힌다.
- 성능: 점진 표시는 "조각마다 한 번" 파싱하던 것을 "매 프레임" 파싱하게 바꾼다. 그래서 끝난 블록은 memo로 다시 그리지 않고, 마지막 블록만 다시 그리는 구조를 기본으로 한다. T2에서 잰다.

## 스크롤 따라가기 (사용자 결정: 부드럽게)

- 지금은 따라가는 동안 높이가 늘면 같은 render에서 `scrollTop = scrollHeight`로 점프한다(`:828`). 그리고 이 효과는 `[items]`가 바뀔 때만 돈다(`docs/design/conversation.md:166`, 턴 인디케이터의 고정 높이가 이 규칙에 기댄다). 점진 표시는 `items`를 바꾸지 않고 `AgentMessage` 안의 상태만 바꾸므로, 지금 구조로는 따라가기가 불리지 않는다.
- 바꾼 뒤:
  - `ThreadBody`가 rAF 루프 하나를 갖고, 콘텐츠에 ResizeObserver를 단다. 높이가 늘면 목표를 새 바닥으로 정한다.
  - `pinned` 플래그: 따라가는 동안 켜져 있고, 그동안 `threadScroll`은 거리를 0으로 본다. 루프가 직접 쓴 `scrollTop`이 아닌 스크롤은 사람의 것으로 보고 `pinned`를 끈다. 사람 입력은 `dockedBuddyShell.ts:286`의 방식(wheel, pointerdown, keydown)을 따르되 범위를 좁힌다.
    - pointerdown은 스크롤러에서만 본다(스크롤바 드래그 포함).
    - keydown은 스레드 안의 스크롤 키(PageUp/PageDown, Home/End, 화살표, Space)만 본다. composer 입력은 따라가기를 끊지 않는다.
    - 마지막 wheel 이벤트 뒤 약 100ms 동안은 따라가기를 다시 켜지 않는다(트랙패드 관성).
  - 움직임:
    - 답이 펼쳐지는 동안(높이가 프레임마다 조금씩 늘 때): 매 프레임 바닥에 바로 붙인다. 펼침이 이미 부드러우므로, 감속을 걸면 쓰고 있는 줄이 늘 화면 아래로 숨는다.
    - 한 번에 늘어날 때(메시지 진입, 새 항목, 답의 마무리): `followStep`의 지수 감속으로 따라간다. `pos += (target − pos)·(1 − e^(−dt/τ))`. 속도 상태가 없고, 목표를 넘지 않고, 목표가 바뀌면 자연스럽게 이어 가고, 0.5px 안에서 끝난다. 목표는 매 프레임 살아 있는 바닥(`scrollHeight − clientHeight`)으로 잘라, composer가 줄어 바닥이 올라온 경우를 처리한다.
  - `scrollToItem`(`:871-876`, 질문·권한 카드로 가는 스크롤)은 `pinned`를 끄고, 사람이 바닥으로 돌아올 때까지 따라가지 않는다. 지금은 `drew` 가드(`threadItems.ts:396-402`)가 이 스크롤을 지키는데, 점진 표시가 매 프레임 높이를 바꾸면 이 가드만으로는 부족하기 때문이다.
  - 따라가는 동안 `behind`는 false이고 `distance`는 0이다. Jump to latest 버튼과 docked buddy가 감속 도중에 바뀌지 않는다.
  - Jump to latest(`:865-870`)는 같은 따라가기로 넘긴다. 네이티브 smooth scroll은 옛 바닥을 향하다가 24px 띠 밖에 멈출 수 있다.
  - 대화를 처음 열 때(`opening`)와 reduced motion에서는 지금처럼 즉시 바닥에 둔다.
- 진입 모션은 transform과 opacity만 쓰므로 바닥 계산에 영향이 없다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- `entering(prev, items, localSends) → Set<key>`: 이번 render에서 진입 모션을 줄 사용자 항목. 입력은 직전 render의 항목 키와 `q` 항목들, 이번 항목, 이 창의 로컬 전송 표시다. 로컬 전송 표시와 맞는 새 사용자 항목만 진입한다. 직전·이번 render의 `q` 항목과 텍스트·앵커가 같은 seq 항목은 진입하지 않는다.
- `revealStep(shown, target, oldestHiddenAgeMs, dtMs, phase) → number`: 다음 프레임에 보여줄 길이. `phase`는 streaming / finishing(`message.done`, 150ms 마무리) / flush(Stop, 실패, 턴 종료, 뒤에 항목이 옴, 선택, 창 복귀)다. 받은 것보다 길어지지 않는다.
- `revealBoundary(text, from, to) → number`: 단어, 코드 블록 안의 줄, 완성되지 않은 링크·표를 고려해 자른 위치.
- `followStep(pos, target, dtMs) → { pos, done }`: 지수 감속의 한 프레임.
- 따라가기 상태 전이(`pinned` 켜기·끄기: 사람 입력, 관성 대기, `scrollToItem`, 바닥 복귀, 선택)도 순수 함수로 뺀다.

## 형식, 규약, 결정에 미치는 영향

- 형식, IPC, CLI: 없다.
- ARCHITECTURE §1 'Conventions'와 `doan check`: 영향이 없다.
- `docs/design/conversation.md:166`의 "The scroll follows `[items]` only" 계약이 바뀐다. 턴 인디케이터의 높이는 지금처럼 고정이고, 따라가기는 ResizeObserver로 높이 변화를 본다. T5에서 그 절을 고친다.
- PRODUCT §5 item 2 'Conversation panel'과 item 3(Project Overview, 턴 인디케이터 규칙이 있는 곳)에 모션 규칙과 reduced motion 규칙을 더한다(T6).

## PoC

- 성능: 1만 자 답(코드 블록, 표 포함)을 347 패널에서 점진 표시하며 프레임 시간을 잰다. 기준은 p95 16ms 이하, 최댓값 50ms 이하다. 입력은 가짜 에이전트 스트림(정해진 조각 크기와 간격)이다. 실제 provider는 1만 자와 표를 매번 같게 보내지 못한다. T3보다 먼저라 임시 점진 표시 루프로 잰다. 넘으면 끝난 블록의 memo를 강화하고 다시 잰다.

## postmortem에서 가져온 주의점

- `docs/postmortem/`에서 "stream", "scroll", "motion"으로 찾은 항목 중 스레드 스크롤과 직접 관련된 것은 없다.
- 2026-10 (`docs/postmortem/2026-10.md:698-704`): 스크롤 컨테이너의 폭을 비교할 때 네이티브 스크롤바를 포함해 잘못 판단했다. → 모션 측정과 테스트는 스크롤 컨테이너의 client 영역을 기준으로 한다.

## 드래프트 요청

- 캔버스: `.doan/canvases/thread-motion.html`, id `thread-motion`.
- 프레임:
  - `entry`: 진입 A를 패널 347에서 반복 재생한다. 큐 메시지 두 개가 함께 들어오는 경우를 포함한다(A로 확정, B·C는 지웠다).
  - `stream`: 점진 표시 A·B·C를 같은 답(큰 조각이 한 번에 오는 구간, 코드 블록 포함)으로 재생한다. 각 안은 바닥 따라가기와 함께 재생해, 지금처럼 점프하는 모습과 나란히 비교한다.
  - `reduced`: reduced motion에서의 모습(진입 페이드만, 즉시 표시, 즉시 스크롤).
- 사용자가 고르면 고르지 않은 안은 지운다(draft follows decisions).

## 읽은 design preset

- `shape`: 기존 화면에 모션을 더하는 경우다. 시각 체계는 그대로다.
- 모션 전용 preset이 있는지는 `/design-draft`에서 `doan design-skill --json`으로 다시 확인한다.
