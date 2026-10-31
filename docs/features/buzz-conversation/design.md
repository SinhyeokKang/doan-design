# buzz-conversation — design

[spec](./spec.md)의 결정을 구현하는 방법이다. 공용 디자인 언어, 진행 규칙, 레퍼런스는 부모 [design.md](../buzz-restyle/design.md)를 따른다. 레퍼런스 조사(Subframe, v0, Conductor, Cursor, Lovable)는 부모 design.md의 '조사 메모: 프로젝트 대화와 Overview'에 있다. 그 메모는 `buzz-project`도 쓰므로 부모에 남겨 두고 여기서는 링크만 건다. Overview 배치의 출발점은 사용자가 공유한 Aside 스크린샷(2026-10-31)이다. 메인은 대화, 입력창은 capsule로 시작해 줄바꿈되면 box가 된다. Aside 문서는 확인하지 않았다.

읽은 Doan 프리셋: `harden`(스레드 항목의 빈 상태·긴 내용·실패·권한 상태 목록).

## 0. 초안과 초안 결정 (2026-10-31 user)

초안은 `.doan/canvases/buzz-conversation.html`이다(canvas id `buzz-conversation`, 폭 1760). 프레임은 다음과 같다.

- `hero-composer`: Home 입력창. 출하 기준이고 포커스 보더만 바뀐다. `/design-sync`는 이 자식에서 이 프레임만 비교한다.
- `docked-composer`: capsule·box, 칩, 전송 중, `project_busy` 이유 줄.
- `thread-messages`, `thread-activity`, `thread-states`(권한 요청·턴 끝), `thread-moves`(승격·보관·복구·읽기 실패).
- `docked`와 스레드 프레임은 `buzz-project`가 Overview에 놓을 때 비교한다.

초안을 그리면서 정한 것:

- Home과 docked는 같은 카드·칩·텍스트 칸·도구로 한 패밀리가 된다.
  - docked에는 Home의 inset 트레이(`.composer`)가 없다. 카드는 패널 위에 바로 놓인다.
  - 에이전트·effort는 카드 아래 일반 줄의 오른쪽에 둔다. Send 열과 줄을 맞춘 자리다.
  - 그 버튼은 Home의 `sm`(32px, label-sm)보다 한 단계 작은 새 공용 변형 `doan-button[data-ui-size="xs"]`(24px, caption, 안쪽 4/8, chevron 14)를 쓴다. 구현 때 `ds/controls.css`에 더한다(round 4).
- 입력창 포커스는 `--border-prominent`(#808080) 링 대신 새 토큰 `--border-field-focus`(`--neutral-5`, #cccccc)에 `--shadow-sm`을 쓴다.
  - Home과 docked에 같이 적용한다.
  - 다른 텍스트 필드는 그대로다.
  - 색 대비만으로는 3:1 권장치에 못 미친다. 캐럿과 그림자가 함께 포커스를 알린다.
- 활동은 연속된 묶음을 한 줄로 접는다.
  - 실행 중에는 스피너와 마지막 활동을 보인다.
  - 다음으로 넘어가면 "N steps"로 줄이고, 누르면 펼친다.
- 스레드 안 노티스(권한 요청, 턴 끝, 읽기 실패)는 버튼을 본문 아래 줄에 두고 텍스트 시작선에 왼쪽 정렬한다. 폭(720·360)과 버튼 수가 달라도 본문 폭이 줄지 않는다(round 2).
- 실패하거나 멈춘 턴은 "Edit and resend"로 마지막 요청을 같은 화면의 docked 입력창에 되돌린다. 다른 초안이 있으면 "Replace your draft?"를 묻는다.
- 사람 메시지는 오른쪽에 연한 액센트 버블로 보인다. 일반 텍스트이고 줄바꿈을 지킨다. 보낸 파일 칩은 삭제 버튼이 없으므로 끝쪽 패딩을 따로 둔다(6/16/6/6, 간격 12).
- 에이전트 메시지는 패널 위에 Markdown으로 보인다(round 3).
  - 그리는 요소: 문단, 굵게·기울임, 링크, 목록·번호 목록(중첩), 제목(h1·h2는 body-lg, 그 아래는 label semibold), 인라인 코드, 코드 블록(가로 스크롤과 Copy 버튼), 표(가로 스크롤), 인용(inset 채움, 시작 쪽 보더 없음), 구분선.
  - 막는 것: 원시 HTML과 이미지. 에이전트 출력은 신뢰할 수 없는 데이터다(코멘트 본문을 텍스트로만 보이는 ARCHITECTURE §2와 같은 기준).
  - 링크: `https`만 시스템 브라우저로 연다. 그 밖의 스킴과 로컬 경로는 텍스트로 둔다. 렌더러의 `setWindowOpenHandler`가 지금 모든 새 창을 막으므로, 여는 일은 main을 거친다.
  - 스트리밍 중에는 delta가 올 때마다 전체 메시지를 다시 렌더링한다.
  - 코드는 인라인·블록 모두 새 토큰 `--type-family-mono`(시스템 mono 스택, 폰트 번들 없음)를 쓴다(2026-10-31 user). 앱의 다른 인라인 코드는 지금처럼 sans 칩이다.
  - 의존성 추가는 승인받았다(2026-10-31 user). `react-markdown@10.1.0`과 `remark-gfm@4.0.1`을 쓴다. 2026-10-31 npm registry에서 확인했고 2025-03 이후 새 버전은 없다. `rehype-raw`는 넣지 않는다. 둘 다 `eval`을 쓰지 않으므로 렌더러 CSP에 걸리지 않는지 R3에서 빌드한 앱으로 확인한다(POSTMORTEM 2026-10-30 'A renderer import of a main module').

## 1. 영향 범위

| 영역 | 바뀌는 것 |
|---|---|
| main (`app/src/main/conversation/`) | 목록 조회, 안 본 종료 기록, 프로젝트 대화 실행 제한, send 확장(첨부·모델·effort), 매 턴 캔버스 스냅샷과 승격, 보관 대화 복구, 새 이벤트 형식 |
| preload (`app/src/preload/index.ts`) | `listConversations`, `markConversationSeen`, `sendConversation`의 입력 확장 |
| renderer | 입력창 프리미티브와 `hero`·`docked`, 스레드 순수 함수와 표시 컴포넌트, Home 재조립, 상태줄·LNB 슬롯을 main 목록에서 다시 세우기 |
| CLI·스킬·`doan check` | 없음 |
| 저장소 형식(`.doan/`, JSON Schema) | 없음. 바뀌는 형식은 모두 기기 로컬(`<userData>/conversations/`)이다 |

## 2. main

### 2.1 목록과 안 본 종료

- `conversation:list {root}`는 그 root의 index 항목마다 요약을 돌려준다.
  - 요약 항목: `conversationId`, `canvas?`, `title`, `state`, `provider`, `model?`, `effort?`, `fromHome`, `phase`, `unseen`, `lastActivityAt`.
  - `phase`는 실행 중·응답 대기(답하지 않은 권한 요청)·끝남(done/failed/interrupted)이다.
  - `phase`는 live 상태와 기록 fold로 정한다. 재시작 뒤에는 fold가 끝나지 않은 턴을 crashed 중단으로 접으므로 '끝남'이 된다.
- **안 본 종료**: 마지막 끝 이벤트의 seq가 그 대화의 `seenSeq`보다 크면 안 본 종료다.
  - renderer는 그 대화가 묶인 캔버스나 워크스페이스를 열 때 `conversation:markSeen {conversationId, seq}`를 부른다. 지금의 방문 시계 규칙(`homeConversations.ts`)과 같은 시점이다.
  - main은 `seenSeq`를 단조 증가로만 저장한다. 오래된 seq로 낮추지 않는다.
- **목록 갱신**: 기존 `conversation:event`를 쓴다. 목록을 다시 읽어야 할 때(승격, 복구, 보관, markSeen)는 그 변화를 이벤트로 함께 보낸다. renderer는 Home 상태줄처럼 '구독한 뒤 읽기'로 합친다(ARCHITECTURE §7 'Events').

### 2.2 프로젝트 대화 실행 제한

- 프로젝트 대화는 `canvas`가 없는 대화다. 같은 root에 실행 중이거나 응답 대기인 프로젝트 대화가 있으면, 다른 프로젝트 대화의 `newDesign` 시작과 send를 `project_busy`로 거절한다.
- 거절은 admission 단계에서 한다. 준비가 끝난 뒤 수락 직전에 다시 확인한다. 근거는 POSTMORTEM 2026-10-27 'Awaited conversation work outlived its current turn'이다.
- 같은 대화의 다음 send는 지금처럼 `busy`와 종료 대기 규칙을 따른다.
- 캔버스 대화와 다른 root는 제한하지 않는다.
- renderer는 Home의 'Home 대화 진행 중' 이유 줄과 Open을 main 목록에서 계산한다. 지금 문구를 그대로 쓴다.

### 2.3 send 확장

- `conversation:send`는 `attachments`, `model`, `effort`를 선택 입력으로 받는다. 검증은 `newDesign`과 같은 함수를 쓴다.
  - `model`은 이번 실행에서 그 root와 대화 공급자에 대해 받은 목록 안에 있어야 한다.
  - `effort`는 그 모델의 단계 안에 있어야 한다.
  - `attachments`는 main이 발급한 id여야 한다.
- 첨부는 수락 직전에 다시 해석해서 `attachment_missing`를 낸다. 붙여 넣은 이미지에는 `sent` 표시를 쓴다. 둘 다 지금 시작 경로와 같다.
- `user.message` 이벤트에 첨부 설명이 실린다. 이벤트 타입은 이미 `attachments?`를 갖고 있다.
- 바꾼 `model`·`effort`는 수락 시점에 index에 저장한다. runner는 지금처럼 매 send에 index 값을 다시 적용한다.
- 공급자는 바꿀 수 없다. 다른 공급자 값을 보내면 `bad_request`다.

### 2.4 매 턴 캔버스 스냅샷과 승격

- **스냅샷 갱신**: 지금 `canvasesAtStart`는 `newDesign` 수락 때 한 번만 저장한다. 앞으로는 프로젝트 대화의 **매 턴 수락** 때마다 그 root의 캔버스 목록으로 덮어쓴다. 이름은 `canvasesAtTurn`으로 바꾼다. 읽을 때는 `canvasesAtStart`도 받는다.
- **새 캔버스**: 폴더 갱신 경로의 묶기 규칙은 그대로 둔다. 새로 목록에 나타난 캔버스, 현재 대화 없음, 스냅샷에 없음, 턴 실행 중이거나 `BIND_GRACE_MS` 안에 끝남. 다만 "첫 턴에서만" 조건이 사라진다.
  - 프로젝트 대화는 root마다 동시에 하나만 실행되므로, 가장 최근 대화에 붙이는 규칙이 다른 대화의 캔버스를 가져가지 않는다.
- **기존 캔버스 수정(승격)**: 턴이 끝날 때(`turn.done`, `turn.failed`, `interrupted`) `promotionTarget`이 후보를 고른다.
  - 후보는 그 턴의 `activity` 중 `kind: "edit"`이고 `path`가 목록의 캔버스 파일을 가리키는 것이다. 판정은 root 기준 상대 경로와 안정 ID로 한다.
  - 후보가 정확히 하나이고, 그 캔버스의 현재 대화가 실행 중이나 응답 대기가 아닐 때만 승격한다.
  - 승격하면 이전 현재 대화를 보관하고(`conversation.archived`), 이 대화에 `canvas`를 저장하고 `conversation.bound {canvas}`를 남긴다.
  - 같은 턴에 새 캔버스로 이미 묶였으면 수정 승격은 하지 않는다.
- **왜 파일 감시가 아니라 대화 자기 이벤트인가**: 같은 시간에 사람의 터미널 에이전트나 다른 캔버스 대화가 같은 캔버스를 고칠 수 있다. 파일 감시로는 누가 고쳤는지 알 수 없다. 대신 `activity` 경로를 주지 않는 공급자에서는 수정 승격이 일어나지 않는다. §5 PoC 참고.
- **실패 처리**: 묶기·승격은 시작·교체와 같은 저장 경로(`start-undo.json` 저널, index rename 커밋)를 쓴다. 저장이 실패하면 아무것도 바뀌지 않는다. 근거는 POSTMORTEM 2026-10-27 'A rejected conversation replacement had already changed current history'다.

### 2.5 보관 대화 복구

- `send`의 대상이 `archived`이면 admission이 복구 경로로 간다.
  - 그 대화의 캔버스를 `resolveListedCanvas`로 다시 찾는다. 없거나 둘 이상이면 `canvas_not_found`다.
  - 그 캔버스의 현재 대화가 실행 중이나 응답 대기이면 `busy`다.
  - 수락 시점에 현재 대화는 `conversation.archived`, 복구할 대화는 `conversation.restored`를 기록하고, index에서 둘의 state를 맞바꾼다. 같은 저널 경로를 쓴다.
- 보관되면서 닫힌 runner는 다시 만든다. 세션 재개 규칙과 실패 코드는 지금 send와 같다.
- `state.ts` fold는 `conversation.restored`를 만나면 `archived`를 풀고 그 뒤 이벤트를 다시 반영한다.

### 2.6 형식

- **이벤트 JSONL**: 새 타입 `conversation.bound`와 `conversation.restored`가 생긴다.
  - 지금 reader는 모르는 타입을 손상으로 거절한다(`store.ts`). 새 타입을 담은 줄만 `v: 2`로 쓴다.
  - reader는 줄마다 v1과 v2를 받는다. 그러면 이전 빌드는 손상이 아니라 알 수 없는 버전으로 거절한다.
  - index v2의 한 방향 이전과 같은 정책이다. 이전 빌드로 돌아가는 것은 지원하지 않는다.
- **index**: v2를 유지하고 선택 키 `seenSeq`와 `canvasesAtTurn`을 더한다. reader는 모르는 키를 무시하므로 이전 빌드도 읽는다.
- `start-undo.json`: 묶기·승격·복구가 같은 저널을 쓴다. 저널 형식에 작업 종류가 필요하면 그 형식의 버전을 올린다. 이 결정은 `/tdd` 전에 저널 코드를 읽고 내린다(tasks T2).
- 저장소 형식, CLI 응답, `runtime.json`, 앱 소켓 메시지는 바뀌지 않는다.

## 3. renderer

### 3.1 입력창 프리미티브와 두 타입

`HomeComposerView.tsx`를 다음과 같이 나눈다. 이름은 구현 때 주변 코드에 맞춘다.

- 공용 프리미티브
  - `ComposerCard`: 카드 틀과 드롭 대상.
  - `ComposerChips`: 첨부·프리셋 칩.
  - `ComposerField`: textarea, 줄바꿈 감지, IME와 Enter 처리.
  - `ComposerTools`: Attach, Presets와 `/` 팝오버, Send.
  - `AgentPicker`, `EffortPicker`.
- `HeroComposer`(Home)
  - 지금 Home과 같다. 프로젝트 선택, box 고정, 도구 줄 안의 에이전트·effort, 워크트리 트레이, `HomeStage` 배치를 쓴다.
  - computed style과 DOM 순서를 바꾸지 않는 것이 이 자식의 회귀 기준이다.
- `DockedComposer`(Overview, 캔버스 패널)
  - 프로젝트 선택이 없다. 대상 root와 대화(있으면)는 호출자가 넘긴다.
  - `data-shape="capsule" | "box"`를 CSS grid 영역으로 바꾼다. capsule은 `[+][Presets][field][Send]` 한 줄이고, box는 칩·field·도구 줄이다.
  - 에이전트·effort는 카드 아래 줄에 둔다. 기존 대화에서는 공급자가 고정이라 그 공급자의 모델만 고른다.
  - textarea는 같은 요소를 유지한다. 모양을 바꿀 때 다시 마운트하면 포커스와 한글 조합이 끊긴다.

### 3.2 모양 판정 (`composerShape`)

입력: 현재 모양, 텍스트가 비었는지, 칩 수, field가 한 줄을 넘었는지(capsule 폭에서 측정). 규칙은 다음과 같다.

- 칩이 있거나 줄을 넘으면 box다.
- 텍스트와 칩이 모두 없으면 capsule이다.
- 그 밖에는 현재 모양을 유지한다.

"줄바꿈이 풀리면 capsule"을 쓰지 않는 이유가 있다. capsule은 텍스트 칸이 좁아서, box에서 한 줄에 들어가는 글이 capsule에서는 다시 줄을 넘는다. 그러면 모양이 계속 번갈아 바뀐다.

### 3.3 스레드 (`threadItems`)

- **입력**: 한 대화의 이벤트 배열(합친 결과). **출력**: 항목 배열이다. 항목 종류는 다음과 같다.
  - 사람 메시지: 텍스트, 앵커 수, 첨부 설명, 프리셋 줄 분리.
  - 에이전트 메시지: `message.delta`를 `messageId`로 합치고, `message.done`이 있으면 그 텍스트를 쓴다.
  - 활동 묶음: 연속된 `activity`를 하나로 묶는다. 명령은 "Running a command"로만 보인다.
  - 권한 요청: 답 전, 답함, 만료.
  - 턴 끝: 실패 코드, 중단 이유.
  - 승격 표시: `conversation.bound`.
  - 보관·복구 표시.
- **표시 컴포넌트** `ConversationThread`는 항목을 그리고, 권한 답과 중단 콜백을 받는다. 배치, 스크롤 고정, 빈 상태 문구는 쓰는 화면이 정한다.
- `harden`으로 다룰 상태는 다음과 같다.
  - 아주 긴 메시지와 경로.
  - 줄바꿈 없는 긴 토큰. `overflow-wrap: anywhere`와 `min-width: 0`으로 처리한다.
  - 빈 에이전트 응답.
  - 응답 대기 중인 권한 요청이 여러 개인 경우.
  - 실패 뒤 다시 보내기.
  - 읽기 실패(`readConversation` 오류).

### 3.4 상태줄과 LNB 슬롯

- 상태줄(`conversationStrip.ts`)과 슬롯(`homeConversations.ts`)의 입력을 renderer 메모리 대신 main 목록과 이벤트에서 만든다. 그래서 다시 로드하거나 재시작해도 남는다.
- 모양과 문구는 바꾸지 않는다.
- 안 본 종료는 `unseen`을 쓰고, 방문하면 `markSeen`을 부른다.
- 지금 방문 시계는 행 단위다. 대화 단위로 옮기면 한 행에 대화가 여러 개일 때 차이가 생긴다. 슬롯은 그 행에 묶인 대화 중 가장 높은 상태 하나를 보이는 지금 규칙을 유지한다.
- '마지막 요청'(Edit on Home)은 실패하거나 멈춘 대화의 마지막 `user.message`에서 다시 만든다.

## 4. 순수 함수 (`/tdd` 대상)

| 함수 | 위치(예정) | 고정할 것 |
|---|---|---|
| `conversationSummary(metadata, folded, live)` | main | phase, unseen, lastActivityAt. 재시작 fold 뒤 끝남 |
| `projectBusy(entries, liveStates, root, exceptId)` | main | 프로젝트 대화만 센다, 같은 대화 제외, 다른 root·캔버스 대화 무시 |
| `validateSendExtras(request, models, attachments)` | main(ipc) | 시작과 같은 규칙, 공급자 변경 거절 |
| `promotionTarget(turnEvents, listed, currentByCanvas)` | main | edit 경로가 캔버스 하나일 때만, 대상이 실행 중이면 없음, 새 캔버스로 이미 묶였으면 없음, ID 우선 경로 비교 |
| `restoreEntries(entries, id)` | main(store) | state 맞바꿈, 다른 캔버스 항목 불변 |
| `mergeEvents` 확장, fold의 `conversation.restored` | main(state) | 복구 뒤 이벤트 반영 |
| 이벤트 줄 v1/v2 판정 | main(store) | v2 타입만 v2, 모르는 v는 unknown_version |
| `composerShape(prev, input)` | renderer | 위 §3.2 규칙과 번갈아 바뀜 방지 |
| `threadItems(events)` | renderer | 위 §3.3 항목, delta 합치기, 명령 숨김 |
| `slotsFromList(list, seen)` / `stripFromList` | renderer | 지금 슬롯·상태줄 순서와 문구 유지 |

## 5. PoC 의존

- **edit activity의 경로**: 수정 승격은 공급자가 캔버스 파일을 고칠 때 `activity`에 `kind: "edit"`와 root 기준 `path`를 내는지에 달려 있다.
  - `transport.ts`에는 Codex 파일 변경과 Claude 도구 요약이 있다. Cursor, Antigravity, Copilot의 ACP 경로가 같은 정보를 주는지는 확인하지 않았다.
  - tasks의 첫 task로 다섯 공급자의 실제 이벤트를 확인한다.
  - 경로를 주지 않는 공급자는 수정 승격을 하지 않는다. 새 캔버스 묶기는 폴더 갱신 경로라 공급자와 상관없이 동작한다. 이 한계는 PRODUCT에 적는다.

## 6. 결정 영향

- **PRODUCT §3 항목 6**: "캔버스당 현재 대화 하나, 새로 시작하면 이전 대화는 보관"은 유지한다. 다음을 더한다.
  - 캔버스에 묶이지 않은 프로젝트 대화.
  - 승격.
  - 보관 대화 복구.
- **PRODUCT §5 항목 1**: 다음을 현재 규칙으로 고친다.
  - "프로젝트당 Home 대화 하나"가 "프로젝트당 실행 중인 프로젝트 대화 하나"가 된다.
  - 상태줄·슬롯이 renderer 메모리에만 있다는 문장을 고친다.
- **ARCHITECTURE §7 'Canvas lifecycle'**: "a conversation that finished without making a canvas stays unbound and never binds later"를 바꾼다. 그 이유(오래된 대화에 붙는 문제)는 프로젝트당 1개 실행 규칙으로 막는다고 적는다.
- **ARCHITECTURE §7 'IPC contract'**: "Only newDesign accepts model, effort and attachments"를 바꾼다.
- 유지하는 구조 결정
  - 대화 기록은 기기 로컬이고 저장소 밖에 둔다.
  - 이벤트는 append-only다. 복구와 승격도 이벤트를 덧붙일 뿐 지우지 않는다.
  - 자동 재시도, fork, 인수는 없다.
  - Doan은 에이전트를 스스로 깨우지 않는다. 복구도 사람의 send로만 일어난다.
- `doan check` 규칙과 ARCHITECTURE §1 규약은 바뀌지 않는다.

## 7. POSTMORTEM에서 가져올 함정

- **2026-10-27 Awaited conversation work outlived its current turn**: send 확장, 복구, 프로젝트 대화 실행 제한은 비동기 준비 뒤 수락 직전에 다시 확인한다. 늦게 온 콜백은 live identity와 turnId로 걸러낸다.
- **2026-10-27 A rejected conversation replacement had already changed current history**: 묶기, 승격, 복구는 저널과 index rename 커밋을 거친다. 거절은 기록을 바꾸지 않는다. rename 앞뒤 재시작 테스트를 둔다.
- **2026-10-28 A send right after turn.done was refused as busy**: 복구된 대화의 첫 send와 첨부를 실은 send도, 이전 프로세스 종료 콜백보다 먼저 보낸 경우를 테스트한다.
- **2026-10-26 The invalidation read overtook the reply**: 목록 갱신 이벤트와 send·markSeen 응답의 도착 순서를 가정하지 않는다. 상태는 seq로 맞춘다.
- **2026-10-25 Navigation feedback read the previous React snapshot**: 목록에서 다시 세운 슬롯이 대화 전환 직후 이전 행의 상태를 보이지 않게 한다. 렌더 사이 테스트를 둔다.
- **2026-10-30 A renderer import of a main module left the built app's window blank**: renderer가 쓰는 요약·스레드 타입은 타입만 import한다. `rendererImports.test.ts`가 지킨다.
- **2026-10-30 Removing a shared dialog class silently disabled two focus guards**: Home 입력창을 나눌 때 클래스 이름을 셀렉터로 쓰는 곳(`referenceHeight`의 `.composer-card`, `.composer-input`, `.home-suggestions`)을 문자열로 검색한다.
