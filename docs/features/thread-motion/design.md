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

- 말풍선이 아래에서 16px(`--space-4`) 올라오며 400ms(새 토큰 `--time-thread-enter`, `--ease-enter`)에 나타난다. 앱의 대화상자(12px, 220ms)와 같은 결에서 사용자가 더 길고 느리게 골랐고, 값은 토큰으로 두었다.
- 비교하고 버린 안: composer 자리에서 날아오기(FLIP), 제자리에서 커지기.
- 말풍선은 최종 크기로 자리를 잡고 translate와 opacity만 바꾼다. 그래서 스레드 높이와 스크롤 계산이 흔들리지 않는다.
- reduced motion: 제자리 opacity 페이드만 한다(DESIGN.md 'Motion').
- 턴 인디케이터, 큐 알약, 다음 메시지 제안, 백그라운드 작업 줄은 모션 없이 나타나고 말풍선과 함께 움직이지 않는다.

## 출력 점진 표시 (사용자 결정: B)

- 단어 단위로 펼치고, 새로 보인 단어가 투명에서 진해진다. 비교하고 버린 안: 페이드 없는 단어 단위, 블록 단위.
- 속도: 적응형이다. 가장 오래 숨겨진 글자의 나이가 `MAX_LAG_MS`(400ms)를 넘지 않게 속도를 올린다. 받은 조각이 작으면 받은 만큼만 보인다. 처음에는 250ms로 그렸는데, 사용자가 조금 더 천천히 쓰이는 느낌을 골랐다.
- 페이드: 새로 보인 단어 묶음마다 시작 시각을 따로 갖고, 투명에서 진해지기까지 400ms(`--time-thread-enter`, ease-out)가 걸린다(사용자 결정, 처음 그린 220ms에서 늘렸다). 그래서 줄의 마지막 몇 단어가 부드럽게 따라오고 그 앞은 이미 진하다. 다시 그려도 페이드가 처음부터 다시 시작하지 않아야 한다. 예를 들어 keyframe의 delay를 그 묶음 나이의 음수로 준다. 코드 블록도 줄 단위로 같은 페이드를 쓴다.
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

### PoC 결과 (2026-11-25, T2)

- **결론**: 답 전체를 매 프레임 다시 그려도 기준을 넘지 않는다. 블록 단위 memo는 필요하지 않다. B3는 지금의 `MarkdownText` 한 번 렌더 구조에 점진 표시를 얹으면 된다. 이 PoC의 단순한 블록 분할 memo는 오히려 느렸다(아래 표). 그래서 위 '성능' 항목의 "끝난 블록은 memo, 마지막 블록만 다시 그리는 구조를 기본으로 한다"는 B3에서 기본이 아니다.
- **입력**:
  - 답 10,930자(`##`/`###` 제목, 문단, 목록 3개, 인라인 코드, https 링크, `ts` 코드 블록 3개(각 14줄), 4열 14행 표). 생성 코드는 `measure.mjs`의 `reply()`다.
  - 조각: small은 40자를 30ms마다(약 9.3초), large는 400자를 250ms마다(약 7.6초) 보냈다. 마지막 조각 뒤 300ms에 `message.done`과 `turn.done`을 보냈다.
  - 창 1238 × 780, 캔버스 패널 347(스레드 346). 맥북 프로 M1(MacBookPro17,1, 8코어), 빌드된 앱(`app/out`), node_modules의 Electron 45.3.4.
- **임시 루프**(커밋하지 않았다):
  - rAF마다 `revealStep`과 같은 적응형 속도로 보여줄 길이를 정했다. 가장 오래 숨겨진 글자의 나이를 기준으로 남은 시간 안에 비례해서 펼치고, 400ms가 지난 조각은 반드시 보인다. 자른 위치는 다음 공백까지 늘려 단어 경계에 맞췄다. 링크·표를 잡아 두는 처리와 150ms 마무리는 넣지 않았다(`message.done`에서 바로 전체를 보인다).
  - 보여줄 앞부분을 매 프레임 react-markdown으로 다시 파싱했다. 새로 보인 묶음마다 시작 시각을 두고, rehype 플러그인이 hast의 위치로 그 묶음의 텍스트를 `span.rv`로 감쌌다. `span.rv`에는 400ms opacity 페이드에 그 묶음 나이만큼의 음수 `animation-delay`를 주었다. 코드 블록 안의 위치는 펜스 줄 길이로 어림했다. 프레임마다 페이드 span이 있었다(small whole 한 번에서 542프레임 모두, 많을 때 98개).
  - 블록 memo 변형(blocks): 펜스 밖의 빈 줄로 최상위 블록을 나누고, 끝난 블록은 `memo` 컴포넌트로 한 번만 그리고 마지막 블록만 매 프레임 파싱했다. 각주와 참조 링크는 블록을 넘어가면 깨진다.
- **잰 방법**: 펼침 프레임마다 `flushSync(setState)`로 React의 render와 commit을 동기로 끝내고, 이어서 `offsetHeight`를 읽어 style과 layout까지 강제한 시간을 `performance.now()`로 쟀다(paint와 composite는 포함하지 않는다). 함께 rAF 간격과 long-animation-frame(50ms 넘는 프레임) 수를 기록했다. 펼침 프레임만 세므로 n은 run마다 약 410~540이다.
- **측정값**(ms, 각 run, 조건당 2번):

  | 시점(부하) | 조건 | whole p95 / max | blocks p95 / max |
  |---|---|---|---|
  | 1차(부하 낮음, rAF p95 18.1~18.7) | small | 7.4 / 19.4, 7.0 / 9.0 | 12.5 / 30.5, 12.5 / 16.6 |
  | | large | 7.7 / 10.3, 7.8 / 9.9 | 11.2 / 13.9, 12.2 / 14.0 |
  | 2차(load avg 64, 다른 worker 실행 중) | small | 33.1 / 123.5, 29.6 / 49.4 | 37.1 / 70.2, 33.3 / 43.3 |
  | | large | 34.6 / 67.8, 26.7 / 44.7 | 63.5 / 206.4, 62.1 / 240.8 |
  | 3차(load avg 20~25) | small | 9.5 / 17.7, 20.1 / 26.0 | 23.0 / 37.1, 32.0 / 56.8 |
  | | large | 22.4 / 38.6, 18.7 / 30.6 | 27.8 / 38.7, 23.2 / 38.3 |
  | 4차(load avg 17~20) | small | 11.0 / 21.6, 24.1 / 51.4 | 24.0 / 34.1, 36.1 / 63.7 |
  | | large | 18.4 / 24.7, 29.6 / 64.7 | 42.3 / 65.4, 23.2 / 39.6 |

  - 1차에서 whole은 기준(p95 16, max 50)을 여유 있게 지켰다. p50은 4.9~5.9ms이고, 50ms 넘는 프레임은 없었다.
  - 2~4차는 같은 기계에서 다른 worker들이 빌드와 probe를 돌리던 때다. rAF 간격 자체가 p95 33~83ms로 밀려, 점진 표시의 비용보다 CPU 경쟁이 숫자를 정했다. 이 조건에서는 whole과 blocks 모두 기준을 넘었다. 부하가 낮은 상태에서 다시 재지는 못했다.
  - blocks는 모든 시점에서 whole보다 느렸다. 끝난 블록이 처음 memo로 넘어갈 때 다시 마운트되고, 블록마다 별도의 Markdown 트리가 생기기 때문으로 보인다(원인은 따로 재지 않았다).
- **B3가 알아야 할 것**:
  - 가짜 스트림을 넣는 지점: 대화 히스토리는 격리 userData의 `conversations/index.json`(v2)과 `<id>.jsonl`로 시드하고, 실시간 이벤트는 `electronApp.evaluate`에서 메인 창(`getTitle() !== "Doan thumbnails"`이고 보이는 창)의 `webContents.send("conversation:event", { v: 1, conversationId, seq, turnId, at, ...body })`로 보낸다. 순서는 `turn.started`, `user.message`, `message.delta` × n, `message.done`, `turn.done`이고 seq는 히스토리 다음부터 잇는다. main의 store에는 쓰이지 않으므로 `page.reload()`하면 히스토리만 남은 상태로 돌아간다. `/runtime-test`는 `.scratch/thread-motion/measure.mjs`(T2 worktree)를 그대로 다시 쓸 수 있다.
  - 격리 앱에서 buddy를 고른 적이 없으면 첫 실행 buddy 오버레이가 패널을 덮는다. userData에 `preferences.json`(`{"v":1,"buddy":"doany"}`)을 써 둔다.
  - 지금 구조에서는 점진 표시가 `items`를 바꾸지 않아 바닥 따라가기가 불리지 않는다. probe 화면에서도 답이 펼쳐지는 동안 스레드가 바닥에 붙지 않았다('스크롤 따라가기'의 ResizeObserver가 필요한 이유와 같다).
  - 프레임 비용에는 paint가 빠져 있다. 1차의 rAF 간격 p95가 18.1~18.7ms여서 프레임이 밀리지 않은 것은 확인했지만, B3에서 페이드 span 수가 이 PoC보다 크게 늘면 다시 재야 한다.

## postmortem에서 가져온 주의점

- `docs/postmortem/`에서 "stream", "scroll", "motion"으로 찾은 항목 중 스레드 스크롤과 직접 관련된 것은 없다.
- 2026-10 (`docs/postmortem/2026-10.md:698-704`): 스크롤 컨테이너의 폭을 비교할 때 네이티브 스크롤바를 포함해 잘못 판단했다. → 모션 측정과 테스트는 스크롤 컨테이너의 client 영역을 기준으로 한다.

## 드래프트 요청

- 캔버스: `.doan/canvases/thread-motion.html`, id `thread-motion`.
- 프레임:
  - `entry`: 진입 A를 패널 347에서 반복 재생한다. 큐 메시지 두 개가 함께 들어오는 경우를 포함한다(A로 확정, B·C는 지웠다).
  - `stream`: 점진 표시 A·B·C를 같은 답(큰 조각이 한 번에 오는 구간, 코드 블록 포함)으로 재생한다. 각 안은 바닥 따라가기와 함께 재생해, 지금처럼 점프하는 모습과 나란히 비교한다.
  - `scroll`: 스크롤 따라가기. 새 항목에서 점프(지금)와 감속 따라가기의 비교, 답이 펼쳐지는 중 사람이 위로 스크롤해 멈추고 Jump to latest로 돌아오는 흐름, 답 중간에 권한 카드가 와서 답이 즉시 끝나고 카드 위쪽으로 감속 스크롤되는 흐름. 보드에서는 사람의 스크롤을 흉내 낸다.
  - `reduced`: reduced motion에서의 모습(진입 페이드만, 즉시 표시, 즉시 스크롤).
- 고르지 않은 안은 지웠다. 사용자가 2026-11-25에 앱에서 드래프트를 확인하고 확정했다.

## 읽은 design preset

- `shape`: 기존 화면에 모션을 더하는 경우다. 시각 체계는 그대로다.
- 모션 전용 preset이 있는지는 `/design-draft`에서 `doan design-skill --json`으로 다시 확인한다.
