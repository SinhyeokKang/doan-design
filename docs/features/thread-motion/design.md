# 스레드 모션 — design

## 영향 범위

- **app renderer**:
  - `ConversationThread.tsx`: `useFrameText`(`:322`)를 점진 표시로 바꾼다. 사용자 메시지 항목에 진입 모션을 단다. 바닥 따라가기(`:820-831`)가 점진 표시와 함께 움직이게 한다.
  - `threadItems.ts`: `threadScroll`/`scrollFollow`(`:393-402`)는 그대로 두고, 진입 대상 판정 같은 순수 함수를 더한다.
  - `styles.css`: 진입 keyframes와 reduced motion 규칙.
  - 캔버스 패널, Overview, 프로토타입 창이 같은 스레드 컴포넌트를 쓰므로 세 곳에 함께 적용된다.
- **main, CLI, 스킬, 형식**: 바뀌지 않는다. 이벤트와 IPC가 그대로다.
- **`/agent-eval`**: 해당하지 않는다.

## 모션 토큰

- 이미 있는 토큰을 쓴다(DESIGN.md 'Motion'): `--time-fast` 120ms, `--time-state` 150ms, `--time-panel-enter` 180ms, `--time-settle` 220ms, `--ease-enter`, `--ease-settle`, `--ease-state`. 대화상자가 열릴 때 12px 올라오며 220ms에 나타나는 규칙이 있다. 진입 모션은 이 결을 따른다.
- 새 값이 필요하면(예: 점진 표시 속도) 컴포넌트 상수로 두고 드래프트에서 정한다.

## 진입 모션 (드래프트에서 고른다)

- 대상: 이 창의 composer가 보낸 메시지가 스레드에 처음 나타나는 render. 판정은 순수 함수로 한다(아래 `entering`). 대화를 열 때 이미 있던 항목과 대화를 바꾼 직후의 첫 render는 대상이 아니다.
- 후보:
  - (A) 말풍선이 아래에서 8~12px 올라오며 나타난다(opacity와 translate, `--time-settle` `--ease-enter`).
  - (B) 말풍선이 composer 자리에서 스레드 끝으로 날아간다(FLIP). composer와 스레드가 다른 컴포넌트 트리라 위치 전달이 필요하다. 고르면 PoC를 먼저 한다.
  - (C) 말풍선이 제자리에서 살짝 커지며 나타난다(scale 0.98 → 1, opacity).
- 진입 중에도 말풍선의 최종 크기로 자리를 잡는다. translate와 opacity만 바꾸므로 스레드 높이와 스크롤 계산이 흔들리지 않는다.
- Send now의 "Sending" 줄과 이후 `user.message`로 바뀌는 순간(`withSending`의 `q<id>` 키에서 seq 키로)은 같은 메시지다. 이때 진입 모션이 두 번 재생되면 안 된다. 키가 바뀌어도 같은 메시지로 판정한다.

## 출력 점진 표시 (드래프트에서 고른다)

- 지금은 프레임마다 받은 텍스트 전체를 보여준다. 이것을 보여주는 길이(`shown`)가 받은 길이(`target`)를 일정한 속도로 따라가게 바꾼다.
- 후보:
  - (A) 단어 단위로 일정한 속도로 늘어난다.
  - (B) A에 더해, 새로 나타난 단어가 짧게 흐렸다가 진해진다(`--time-state`).
  - (C) 문단(블록) 단위로 나타나며, 새 블록이 아래에서 살짝 올라온다.
- 공통 규칙:
  - 속도는 적응형이다. 뒤처진 양이 커지면 빨라져서, 보여주는 텍스트가 받은 텍스트보다 `MAX_LAG_MS`(초기 후보 600ms)를 넘게 뒤처지지 않는다. 받은 조각이 작으면 받은 만큼만 보인다(기다리지 않는다).
  - 답이 끝나면 남은 텍스트를 즉시 보여준다.
  - 코드 블록, 표, 링크, 앵커 칩처럼 중간에 잘리면 깨지는 요소는 경계를 넘지 않는다. 칩(`{{n}}`)과 링크는 통째로 나타난다. Markdown은 지금처럼 부분 텍스트로 매 프레임 그린다(`MarkdownText streaming`).
  - 스크린리더: 답 본문은 live region이 아니다(지금과 같음). 상태 줄만 읽힌다.

## 스크롤 따라가기 (사용자 결정: 부드럽게)

- 지금은 따라가는 동안 높이가 늘면 같은 render에서 `scrollTop = scrollHeight`로 점프한다(`ConversationThread.tsx:829`).
- 바꾼 뒤: 판정은 지금의 `threadScroll`(`bottom`/`behind`/`stay`)을 그대로 쓴다. `bottom`일 때 즉시 점프하지 않고, 목표(새 바닥)를 향해 프레임마다 감속하며 움직인다. 시간과 easing은 드래프트에서 정한다(후보: `--time-settle` 220ms, `--ease-enter`).
  - 움직이는 도중 높이가 더 늘면 목표만 새 바닥으로 바꾸고, 지금 위치와 속도에서 이어 간다. 처음부터 다시 시작하거나 거꾸로 가지 않는다.
  - 점진 표시와 함께 쓰면 매 프레임 높이가 조금씩 늘므로, 감속 스크롤이 그 뒤를 매끄럽게 따라간다.
  - 감속 스크롤이 움직이는 동안 생기는 scroll 이벤트는 사람의 스크롤로 보지 않는다. 그래서 `distance` 측정(`onScroll`, `:860-863`)이 따라가기를 끊지 않는다. 사람의 휠·트랙패드·키보드 입력이 오면 감속 스크롤을 즉시 멈추고, 그때부터 지금의 `behind` 규칙을 따른다.
  - 대화를 처음 열 때(`opening`)와 reduced motion에서는 지금처럼 즉시 바닥에 둔다.
  - 질문·권한 카드로 가는 `scrollIntoView`(`:875`)와 핸드오프 이동 뒤 카드 포커스는 지금 규칙 그대로다. 감속 스크롤이 움직이는 중이면 멈추고 그 스크롤을 우선한다.
- 진입 모션은 translate와 opacity만 쓰므로 바닥 계산에 영향이 없다.
- Jump to latest(`:864-869`, reduced motion에서 `auto`)는 지금과 같다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- `entering(prevKeys, items, ctx) → Set<key>`: 이번 render에서 진입 모션을 줄 사용자 메시지. 대화를 연 첫 render, 대화 전환, 이 창에서 보내지 않은 메시지, 핸드오프 카드를 빼고, Send now의 `q<id>` → seq 키 전환을 같은 메시지로 본다.
- `revealStep(shown, target, dtMs, streaming, rate) → number`: 다음 프레임에 보여줄 길이. 적응형 속도, `MAX_LAG_MS` 상한, 스트림이 끝나면 `target`, 받은 것보다 길어지지 않음.
- `revealBoundary(text, from, to) → number`: 단어·칩·링크·코드 블록 경계로 자른 위치.
- `followStep(pos, velocity, target, dtMs) → { pos, velocity, done }`: 감속 스크롤의 한 프레임. 목표가 바뀌어도 위치와 속도를 이어 가고, 목표를 넘지 않고, 정해진 시간 안에 끝난다.
- 진입 키 매칭은 `withSending`(`threadItems.ts:358`)의 키 규칙과 같이 둔다.

## 형식, 규약, 결정에 미치는 영향

- 형식, IPC, CLI: 없다.
- ARCHITECTURE §1 'Conventions'와 `doan check`: 영향이 없다.
- PRODUCT §5 item 3(대화 패널)과 item 2 'Conversation panel'에 모션 규칙을 더한다(T6). reduced motion 규칙도 함께 적는다.

## PoC

- 성능: 1만 자 답(코드 블록과 표 포함)을 점진 표시할 때 프레임당 Markdown 다시 그리기가 16ms 안에 끝나는지 실제 앱에서 측정한다. 넘으면 이미 그린 블록을 다시 그리지 않도록 나누는 방안을 design에 더한다.
- (B) 날아가는 진입을 고른 경우: composer 위치를 스레드로 넘겨 FLIP이 캔버스 패널, Overview, 프로토타입 창에서 모두 맞는지 확인한다.

## postmortem에서 가져온 주의점

- `docs/postmortem/`에서 "stream", "scroll", "motion"으로 찾은 항목 중 스레드 스크롤과 직접 관련된 것은 없다.
- 2026-10 (`docs/postmortem/2026-10.md:698-704`): 스크롤 컨테이너의 폭을 비교할 때 네이티브 스크롤바를 포함해 잘못 판단했다. → 모션 측정과 테스트는 스크롤 컨테이너의 client 영역을 기준으로 한다.

## 드래프트 요청

- 캔버스: `.doan/canvases/thread-motion.html`, id `thread-motion`.
- 프레임:
  - `entry`: 진입 모션 A·B·C를 패널 347에서 다시 재생할 수 있게 그린다(재생 버튼, 스크립트 허용).
  - `stream`: 출력 점진 표시 A·B·C를 같은 답으로 재생한다. 큰 조각이 한 번에 오는 경우를 포함한다. 각 안은 바닥 따라가기의 감속 스크롤과 함께 재생해, 점프하는 지금 모습과 나란히 비교한다.
  - `reduced`: reduced motion에서의 모습(모션 없음).
- 사용자가 고르면 고르지 않은 안은 지운다(draft follows decisions).

## 읽은 design preset

- `shape`: 기존 화면에 모션을 더하는 경우다. 시각 체계는 그대로다.
- 모션 전용 preset이 있는지는 `/design-draft`에서 `doan design-skill --json`으로 다시 확인한다.
