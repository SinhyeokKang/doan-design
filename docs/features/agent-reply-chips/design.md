# agent-reply-chips — design

## 형식

```
doan:<canvas-id>/frame/<frame-id>
doan:<canvas-id>/element/<doan-id>
```

- 캔버스 id는 ARCHITECTURE §1 Conventions 2의 패턴(`^[a-z0-9]+(-[a-z0-9]+)*$`)을 따라야 한다.
- 프레임·요소 id는 캔버스 규약상 비어 있지 않은 문자열이다. 링크에서는 퍼센트 인코딩을 풀어 읽고, 길이는 칩 메시지 제한과 같은 200 UTF-16 단위로 자른다(ARCHITECTURE §3 `parseCanvasMessage` 한도와 같게).
- Markdown 링크 텍스트(`[Save]`)는 칩 이름에 쓰지 않는다. 칩 이름은 사람 칩과 같은 `chipLabel`로 id와 열린 캔버스의 현재 프레임 제목에서 만든다. 링크 텍스트는 접근성 이름에도 쓰지 않는다(에이전트 출력은 신뢰하지 않는 데이터).

## 렌더링

- `ConversationThread.tsx`의 `MarkdownText`는 react-markdown 기본 `urlTransform`이 `https`·`http`·`mailto` 등 몇 프로토콜 외의 href를 빈 문자열로 바꾼다. 그래서 `doan:` 링크가 `a` 컴포넌트에 닿으려면 `urlTransform`을 바꿔 `doan:`을 통과시켜야 한다. 다른 프로토콜은 지금처럼 기본 변환을 거친다.
- `COMPONENTS.a`: href가 `doan:`이면 `parseReplyAnchor(href)`로 읽는다. 맞으면 `ReplyChip`, 틀리면 자식(링크 글자)만 평문으로 그린다. `https:`는 지금의 `Link` 그대로다.
- `ReplyChip`은 `SentChip`의 모양과 locate 안내를 재사용한다. 차이는 대상이 다른 캔버스일 수 있다는 점뿐이다.

## 누를 때

- 콜백: 스레드는 지금 `onLocate(anchor)`(캔버스 패널만)를 받는다. 이를 `onReplyChip({ canvas, anchor })`로 넓힌다. App이 판단한다.
  - 같은 root에서 열린 캔버스 id와 같으면 지금의 `locateChip(anchor)`.
  - 아니면 그 root의 캔버스 목록에서 id로 찾아 연다(`openShellCanvas`나 Quick Open의 프레임 이동 경로). 열린 뒤 대상으로 이동한다. 프레임은 `selectFrame`이 아닌 이동만 쓰고(선택을 바꾸지 않음), 요소는 첫 레이아웃 뒤 locate.
  - 목록에 없으면 안내 토스트("<canvas-id> is not in this project.").
- Overview(`ProjectOverview.tsx`)의 스레드도 같은 콜백을 받는다. 지금 Overview 스레드에는 `onLocate`가 없어서 칩이 평문 칩으로 그려진다. 사람 메시지의 칩은 이번 범위가 아니다(그대로 둔다).

## 영향 받는 부분

- **renderer**: `ConversationThread.tsx`(urlTransform, `a` 컴포넌트, `ReplyChip`), `App.tsx`(다른 캔버스 열고 이동), `CanvasConversationPanel.tsx`·`ProjectOverview.tsx`(콜백 전달).
- **shared**: `app/src/main/conversation/messageText.ts` 근처에 `parseReplyAnchor`(renderer와 eval이 같이 씀).
- **CLI 가이드**: `cli/internal/cli/skill.md` 'Agent rules' 또는 새 절 'Naming canvas targets in replies'. 앱 대화의 턴 프롬프트(`app/src/main/conversation/prompt.ts`)에 한 줄을 넣을지는 T5에서 정한다(가이드만으로 충분한지 eval로 본다).
- **eval**: 새 시나리오 R9.
- **형식**: 바뀌지 않는다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- `parseReplyAnchor(href): { canvas: string; anchor: Anchor } | null`: 형식·캔버스 id 패턴·빈 id·길이·퍼센트 인코딩·알 수 없는 종류.
- `replyUrlTransform(url)`: `doan:`은 그대로, 나머지는 react-markdown의 `defaultUrlTransform`.
- `replyChipTarget({ canvas, anchor }, { root, openCanvasId, canvases })`: `"locate" | { open: CanvasRow } | "missing"`.
- eval의 링크 검사: 답 텍스트에서 `doan:` 링크를 뽑아 형식과 실제 id를 확인.

## 형식 변경

- 공유 JSON Schema, 대화 이벤트(event JSONL v1), CLI 응답은 바뀌지 않는다. 링크는 `agent.message` 텍스트 안에 있다.

## 규약 영향

- ARCHITECTURE §1 'Agent rules'에 한 항목이 는다: "답에서 캔버스의 프레임·요소를 가리킬 때 `doan:` 링크를 쓴다". `doan check` 규칙은 바뀌지 않는다.
- 가이드가 바뀌므로 AGENTS.md에 따라 `/agent-eval`을 돌린다.

## 결정 영향

- ARCHITECTURE §7 "only `https:` links become anchors"를 바꾼다: `doan:` 링크는 앵커가 아니라 칩이 된다. 외부로 나가는 링크는 여전히 `https:`만이고 `shell:openLink`만 쓴다. `doan:` 칩은 앱 안의 이동만 한다.
- 에이전트 출력은 신뢰하지 않는 데이터라는 규칙(§2·§7)은 그대로다. 링크의 id는 캔버스 목록 조회와 locate 요청의 값으로만 쓰이고, locate는 지금처럼 주입 스크립트가 `data-doan-id`·`data-doan-frame`을 속성 값 비교로 찾는다(셀렉터 문자열을 만들지 않음, T3에서 확인).
- PRODUCT §5 item 6의 "Home's and the Overview's composers take no chips"는 그대로다. 이 feature는 composer가 아니라 스레드의 에이전트 답만 다룬다.

## PoC 의존

- 없음. react-markdown의 `urlTransform`과 `components.a`는 이미 쓰는 API다.

## POSTMORTEM에서 가져온 함정

- 2026-11-01 'The canvas agent indicator kept another worktree's conversation and its Stop': 캔버스 정체성에 root를 넣지 않으면 워크트리끼리 같은 캔버스 id가 겹친다. 칩의 대상은 언제나 대화의 root 안에서 찾는다.
- 2026-11-02 'A picked model was forgotten…': 새 시작 경로가 기존 기록 경로를 건너뛰었다. 칩으로 캔버스를 여는 경로도 기존 내비게이션 함수(방문 기록, 마지막 캔버스 저장)를 거치게 한다.
