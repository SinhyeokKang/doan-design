# agent-reply-chips — design

## 형식

```
[이름](doan:<canvas-id>/frame/<frame-id>)
[이름](doan:<canvas-id>/element/<doan-id>)
```

`parseReplyAnchor(href)`가 읽는 규칙:
- scheme은 소문자 `doan:`만 받는다. `DOAN:`과 `doan://…`(규칙 J의 deep link)은 형식 오류다.
- 디코드하기 전에 원본 문자열을 `/`로 나눠 정확히 세 조각(캔버스 id, 종류, id)이어야 한다. id 안의 `/`는 `%2F`로만 쓸 수 있다.
- 캔버스 id는 ARCHITECTURE §1 Conventions 2의 패턴(`^[a-z0-9]+(-[a-z0-9]+)*$`)을 따라야 한다. 이 정규식은 새 파일 안에 둔다(`restore/uiState.ts`의 것은 export되지 않고 다른 모듈을 끌어온다).
- 종류는 `frame`과 `element`만 받는다. `point`와 그 밖의 값은 형식 오류다.
- 프레임·요소 id는 퍼센트 인코딩을 풀어 읽는다. 깨진 인코딩(`decodeURIComponent`가 throw), `?`·`#`, 디코드 뒤의 제어 문자, 빈 id는 형식 오류다.
- id가 200 UTF-16 단위를 넘으면 자르지 않고 형식 오류로 본다. `parseCanvasMessage`가 200을 넘는 id를 거부하고(`app/src/renderer/canvasMessage.ts`), 피커도 그런 doanId를 버리는 것과 같다(`canvasScript.ts`). 잘린 id는 접두사가 같은 다른 대상과 맞을 수 있다.
- 결과는 `Anchor`가 아니라 `{ canvas: string; kind: "frame" | "element"; id: string }`이다. 링크에는 selector와 tag가 없다.
- Markdown 링크 텍스트(`[Save]`)는 칩 이름과 접근성 이름에 쓰지 않는다(에이전트 출력은 신뢰하지 않는 데이터).

공유 JSON fixture는 두지 않는다. Go는 이 형식을 만들거나 읽지 않는다. 앱의 턴 프롬프트가 형식을 가르치고, renderer와 eval은 같은 `parseReplyAnchor`를 import한다(eval의 앱 모듈 import 선례: R8 `turn-prompt.ts`, `eval/lib/codex-rule.ts`).

## 렌더링

- `ConversationThread.tsx`의 `MarkdownText`에는 지금 `urlTransform`이 없어서, react-markdown(10.1.0) 기본 `defaultUrlTransform`이 `https`·`http`·`mailto` 등 몇 프로토콜 외의 href를 빈 문자열로 바꾼다. `doan:` 링크가 `a` 컴포넌트에 닿도록 `replyUrlTransform`을 넘긴다. `doan:`으로 시작하는 href는 그대로 두고, 나머지는 기본 변환을 거친다.
- `COMPONENTS.a`: href가 `doan:`이면 `parseReplyAnchor(href)`로 읽는다. 결과가 있으면 `ReplyChip`, 없으면 자식(링크 글자)만 평문으로 그린다. `doan:` href를 가진 `<a>`는 렌더하지 않는다. `https:`는 지금의 `Link` 그대로다. 코드 스팬·코드 블록은 Markdown이 링크로 읽지 않으므로 칩이 되지 않는다.
- `COMPONENTS`는 모듈 상수이고 `MarkdownText`는 memo된다. 그래서 콜백, 열린 캔버스, 캔버스 목록, 비활성 여부는 기존 `Actions` context를 넓혀 전달한다.
- `ReplyChip`은 `SentChip`의 모양과 locate 안내를 재사용한다.
  - 이름: `chipLabel`에 그 칩이 가리키는 캔버스의 프레임 목록을 넘긴다. 같은 캔버스가 열려 보이면 열린 캔버스의 프레임(`state.layout.frames`), 아니면 같은 root 목록 행의 `CanvasRow.frames`(`app/src/main/view.ts`)를 쓴다. 행을 찾지 못하면 빈 목록을 넘겨 id를 보인다.
  - 열린 캔버스가 아닌 칩은 보이는 이름 뒤에 ` · <canvasLabel(row)>`를 붙인다(행이 없으면 캔버스 id). 접근성 이름은 `Open <canvas> and show <label>`, 같은 캔버스 칩은 지금처럼 `Show <label> on canvas`다.
  - 비활성: 같은 캔버스 칩만 사람 칩의 `locateDisabled`를 따른다. 다른 캔버스 칩은 늘 누를 수 있다.
  - "No longer in the canvas"는 같은 캔버스에서만 뜨고, 그 에이전트 답 블록 바로 아래에 `role=status`와 `aria-describedby`로 놓인다(사람 메시지는 말풍선 아래). 시간 규칙은 `useLocateNote`와 같다.
  - 키보드: `button`이므로 Enter·Space와 DESIGN 'Focus'의 포커스 링을 그대로 쓴다. Cmd-click은 일반 클릭과 같다.

## 누를 때

- 판단은 순수 함수 `replyChipTarget(link, { root, openCanvasId, entry })`가 한다.
  - `openCanvasId`는 캔버스가 실제로 보이는 동안의 열린 캔버스 id다. Overview가 보이는 동안에는 `null`이다. Overview는 레이아웃이 남은 `inert` 캔버스 칸을 덮으므로, `state.open`만 보면 보이지 않는 캔버스를 움직이게 된다.
  - 결과:
    - `"locate"`: `openCanvasId`와 같다.
    - `{ open: CanvasRow }`: 대화 root의 목록에서 그 id를 가진 행이 하나다.
    - `"missing"`: 목록에 없다.
    - `"duplicate"`: 두 행 이상이 그 id를 쓴다.
    - `"unavailable"`: 목록을 읽는 중이거나 프로젝트에 문제가 있다.
  - id가 없는 행은 무시한다. 다른 worktree(root)의 같은 id는 보지 않는다.
- 스레드 콜백 `onLocate(anchor)`(캔버스 패널만)를 `onReplyChip(link)`로 넓히고, App이 결과에 따라 처리한다.
  - `"locate"`: 지금의 `locateChip`. 요소는 `{ id, doanId }`만 보내고 selector는 보내지 않는다(T0).
  - `{ open }`: Quick Open의 `pick`과 deep link 처리가 쓰는 경로 하나로 연다(`App.tsx` `pick`: `locked()`, `cancelRestore()`, `controller.openCanvas(root, row, target, { unavailable, opened: () => completeNavigation(root) })`). 이 경로가 방문 기록과 마지막 캔버스 저장을 처리한다. 프레임은 `selectFrame`이 아닌 이동만 쓴다. 대상을 찾지 못하면 deep link처럼 아무것도 띄우지 않는다.
  - `"missing"`·`"duplicate"`·`"unavailable"`: 이동하지 않고 토스트를 한 번 띄운다. `"unavailable"`은 기존 `unavailableCanvasMessage`(`quickOpen.ts`)를 쓴다. `"missing"`과 `"duplicate"`는 deep link의 `Couldn’t open …` + 이유 형식을 따르고, `"duplicate"`는 `doan check`를 안내한다. 문구는 D1에서 clarify preset을 읽고 정했다(아래 '초안 요청'). 사용자가 초안을 확정하기 전까지는 바뀔 수 있다.
- `CanvasController.openCanvas`는 지금 프레임 id만 받는다. 이를 `{ frame } | { element }` 대상으로 넓힌다. 요소는 `pendingFrame`과 같은 수명 주기의 `pendingLocate`로 첫 레이아웃 뒤에 locate한다. fresh load, 너비 없음, drop에서 지우고, 첫 레이아웃 전에 다른 곳으로 이동하면 버린다. 칩을 연달아 누르면 마지막 요청만 남는다.
- Overview(`ProjectOverview.tsx`)의 스레드도 같은 콜백을 받는다. 사람 메시지의 칩은 이번 범위가 아니다(Overview에서는 지금처럼 누를 수 없는 칩이다).

## 초안 요청 (`/design-draft`)

- 경로·id: `.doan/canvases/agent-reply-chips.html`, `agent-reply-chips`. 새 파일이고 `buzz-canvas-conversation.html`·`buzz-project.html`은 고치지 않는다.
- 프레임:
  - `panel-chips`: 캔버스 패널, Drafts가 열려 보인다. 답의 문단·목록·표 안 칩과, 그 위 사람 메시지의 칩.
  - `panel-other-canvas`: 다른 캔버스(Checkout) 칩의 ` · Checkout`과 접근성 이름, 180px에서 말줄임되는 긴 이름.
  - `panel-missing`: 같은 캔버스 칩의 대상이 없을 때 답 블록 아래의 "No longer in the canvas".
  - `panel-disabled`: 캔버스 로드 실패. 같은 캔버스 칩은 `aria-disabled`이고, 다른 캔버스 칩은 누를 수 있다.
  - `panel-plain`: 형식 오류 `doan:` 링크와 규칙 J 링크는 평문, `https:` 링크는 링크, 코드 스팬은 코드다.
  - `overview-chips`: Overview의 프로젝트 대화. 모든 칩에 캔버스 이름이 붙는다.
  - `toasts`: missing·duplicate 새 문구와 unavailable 두 가지(기존 문구).
- 토스트 문구(clarify preset, deep link 거절 문구 `openLinkRefusal`와 중복 id 문구의 형식을 따른다). 캔버스는 링크의 id로, 프로젝트는 사이드바 이름으로 부른다:
  - `"missing"`: `Couldn’t open <canvas-id>. The canvas isn’t in <project>.`
  - `"duplicate"`: `Couldn’t open <canvas-id>. More than one canvas in <project> uses this ID. Run doan check in a terminal to find them.`
- 답 블록 아래 안내는 답과 6px(`--space-1h`) 떨어진다. 보낸 말풍선 아래 안내와 같은 간격이다.
- 확정: 아직 안 했다. 사용자가 앱에서 초안을 확인한다.

## 영향 받는 부분

- **main(공유)**: `app/src/main/conversation/types.ts`(`Anchor.element.selector`를 선택 필드로), `app/src/main/canvasScript.ts`(doanId 후보를 selector 분기 밖에서 속성 비교로 계산), `app/src/main/conversation/` 아래 type import만 쓰는 새 파일의 `parseReplyAnchor`, `app/src/main/conversation/prompt.ts`(턴 프롬프트 한 줄).
- **renderer**: `ConversationThread.tsx`(`replyUrlTransform`, `a` 컴포넌트, `ReplyChip`, `Actions` context), `CanvasController.ts`(`openCanvas` 대상, `pendingLocate`), `App.tsx`(`onReplyChip`, 토스트), `CanvasConversationPanel.tsx`·`ProjectOverview.tsx`(콜백 전달), `replyChipTarget`.
- **eval**: 새 시나리오 R9. 턴 프롬프트가 바뀌므로 R8의 `prompt.md`도 바뀐다. ARCHITECTURE §14에 따라 R8을 R8b로 바꾼다.
- **가이드(`cli/internal/cli/skill.md`)**: 바뀌지 않는다.
- **형식**: 바뀌지 않는다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- `parseReplyAnchor(href): { canvas; kind; id } | null`: 위 '형식'의 규칙 전부.
- `replyUrlTransform(url)`: renderer에 둔다(react-markdown을 import하므로 공유 파일에 둘 수 없다).
- `replyChipTarget(link, { root, openCanvasId, entry })`: 위 '누를 때'의 다섯 결과.
- eval의 링크 검사: 최종 답 텍스트(코드 펜스와 인라인 코드 제외)에서 `doan:` 링크를 뽑아 `parseReplyAnchor`로 읽고, 실제 id와 비교한다.

## 형식 변경

- 공유 JSON Schema, 대화 이벤트(event JSONL v1), CLI 응답은 바뀌지 않는다. 링크는 `agent.message` 텍스트 안에 있다.
- `Anchor.element.selector`가 선택 필드가 되는 것은 앱 내부 타입의 변경이다. 사람이 보내는 칩은 지금처럼 selector를 담고, `validAnchor`(`prompt.ts`)와 저장된 이벤트의 검증은 바뀌지 않는다. 이 점은 T0에서 확인한다.

## 규약 영향

- ARCHITECTURE §1 'Agent rules'와 가이드는 바뀌지 않는다. 규칙은 앱 턴 프롬프트에만 있다(ARCHITECTURE §7 'Input and prompt'에 적는다).
- 턴 프롬프트가 바뀌므로 AGENTS.md에 따라 `/agent-eval`을 돌린다.

## 결정 영향

- ARCHITECTURE §7 "only `https:` links become anchors"를 바꾼다: `doan:` 링크는 앵커가 아니라 칩이 된다. 외부로 나가는 링크는 여전히 `https:`만이고 `shell:openLink`만 쓴다. `doan:` 칩은 앱 안의 이동만 한다.
- ARCHITECTURE §7 'Deep links'에 이미 "the in-app reply chip form, which needs no root"라는 문장이 있다. 구현 뒤 이 형식을 가리키도록 맞춘다.
- 에이전트 출력은 신뢰하지 않는 데이터라는 규칙(§2·§7)은 그대로다. 링크의 id는 캔버스 목록 조회와 locate 요청의 값으로만 쓰인다. 지금 locate는 요소에 selector를 요구하고, iframe 쪽은 selector가 있을 때만 doanId 후보를 찾는다(`canvasScript.ts`의 `target.selector !== undefined` 분기). T0에서 doanId를 selector와 상관없이 `data-doan-id` 속성 값 비교로 찾게 바꾸므로, 셀렉터 문자열을 만들지 않는다. 같은 doanId가 둘 이상이면 missing이다.
- PRODUCT §5 item 6의 "chips point only into the open canvas"와 "Locate is disabled while the canvas is not shown"은 사람 칩에만 맞는 문장이 된다. "Home's and the Overview's composers take no chips"는 그대로다. §3 In scope 2는 에이전트 답의 칩을 포함하도록 고친다. 모두 Z1에서 고친다.

## PoC 의존

- 없음. react-markdown의 `components.a`는 이미 쓴다. `urlTransform`은 지금 코드에서 쓰지 않지만 react-markdown 10.1.0의 공개 옵션이고 `defaultUrlTransform`을 export한다.

## POSTMORTEM에서 가져온 함정

- 2026-11-01 'The canvas agent indicator kept another worktree's conversation and its Stop': 캔버스 정체성에 root를 넣지 않으면 워크트리끼리 같은 캔버스 id가 겹친다. 칩의 대상은 언제나 대화의 root 안에서 찾는다. `pendingLocate`도 root와 함께 비교한다.
- 2026-11-02 'A picked model was forgotten…': 새 시작 경로가 기존 기록 경로를 건너뛰었다. 칩으로 캔버스를 여는 경로도 Quick Open의 `pick` 경로(방문 기록, 마지막 캔버스 저장)를 거친다.
- 2026-10-27 'Shell navigation shortcuts lost destination ownership' (recurrence): 이동이 `completeNavigation`을 거치지 않으면 Back이 엉뚱한 곳으로 간다. 구현할 때 그 항목의 `rg` 명령을 다시 돌린다.
- 2026-10-30 'A renderer import of a main module left the built app's window blank': `parseReplyAnchor`가 있는 파일은 type import만 쓴다. `rendererImports.test.ts`가 renderer의 값 import를 따라가 검사한다.
