# buzz-conversation — design

[spec](./spec.md)의 결정을 구현하는 방법이다. 공용 디자인 언어, 진행 규칙, 레퍼런스는 부모 [design.md](../buzz-restyle/design.md)를 따른다. 레퍼런스 조사(Subframe, v0, Conductor, Cursor, Lovable)는 [buzz-project design §7](../buzz-project/design.md)로 옮겼다. Figma Make의 대기 프롬프트(작업 중 편집·순서 변경)는 대기열 결정 때 참고했다. Overview 배치의 출발점은 사용자가 공유한 Aside 스크린샷(2026-10-31)이다. 메인은 대화이고, 입력창은 capsule로 시작해 줄바꿈되면 box가 된다. Aside 문서는 확인하지 않았다.

읽은 Doan 프리셋: `harden`, `clarify`, `critique`, `polish`.

## 0. 초안과 초안 결정 (2026-10-31 user)

초안은 `.doan/canvases/buzz-conversation.html`이다(canvas id `buzz-conversation`, 폭 1760). 사용자가 2026-10-31에 디자인을 확정했고, feature-review 뒤에 리뷰에서 정한 상태를 더했다. 프레임은 다음과 같다.

- `hero-composer`: Home 입력창. 출하 기준이고 포커스 보더와 이유 줄 문구만 바뀐다. `/design-sync`는 이 자식에서 이 프레임만 비교한다.
- `docked-composer`: capsule·box, 칩, 전송 중, 실행 중(Stop·Queue·대기열·권한 대기), 새 대화 모드, 거절 이유 줄.
- `thread-messages`, `thread-activity`, `thread-states`(권한 요청·턴 끝), `thread-moves`(승격·보관·복구·읽기 실패·로딩·최신으로 이동).
- `docked`와 스레드 프레임은 `buzz-project`가 Overview에 놓을 때 비교한다.
- 스레드 스타일은 A(지금 초안)·B(Buzz `ec1b9acc5` 기준)·C(합친 안)를 같은 대화로 비교한 뒤 C로 정했다. 비교 프레임은 지웠다.

초안을 그리면서 정한 것:

- Home과 docked는 같은 카드·칩·텍스트 칸·도구로 한 패밀리가 된다.
  - docked에는 Home의 inset 트레이(`.composer`)가 없다. 카드는 패널 위에 바로 놓인다.
  - 에이전트·effort는 카드 아래 일반 줄의 오른쪽에 둔다. Send 열과 줄을 맞춘 자리다.
  - 그 버튼은 Home의 `sm`(32px, label-sm)보다 한 단계 작은 공용 변형 `doan-button[data-ui-size="xs"]`를 쓴다. 높이 24px, caption, 안쪽 4/8, chevron 14다. 구현 때 `ds/controls.css`에 더한다(부모 공통 결정 10의 예외, spec 결정 19).
- 입력창 포커스는 `--border-prominent`(#808080) 링 대신 `--border-field-focus`(`--neutral-5`, #cccccc)에 `--shadow-sm`을 쓴다.
  - 토큰은 초안 커밋에서 `tokens.css`에 이미 더했다. R1은 적용만 한다.
  - Home과 docked에 같이 적용한다. 다른 텍스트 필드는 그대로다.
  - 색 대비만으로는 3:1 권장치에 못 미친다. 캐럿과 그림자가 함께 포커스를 알린다.
- 활동은 연속된 묶음을 한 줄로 접는다.
  - 실행 중에는 스피너와 마지막 활동을 보인다.
  - 다음으로 넘어가면 "N steps"("1 step")로 줄이고, 누르면 펼친다.
  - 펼친 단계 행은 종류 아이콘(읽기·명령·수정), 동사, mono 경로다. 끝난 명령은 "Ran a command", 실행 중인 명령은 "Running a command"로만 보이고 명령 내용은 보이지 않는다.
- 스레드 안 노티스(권한 요청, 턴 끝, 읽기 실패)는 버튼을 본문 아래 줄에 두고 텍스트 시작선에 왼쪽 정렬한다.
- 실패하거나 멈춘 턴은 "Edit and resend"로 마지막 요청을 같은 화면의 docked 입력창에 되돌린다. 다른 초안이 있으면 "Replace your draft?"를 묻는다.
- 사람 메시지는 오른쪽에 연한 액센트 버블로 보인다. 일반 텍스트이고 줄바꿈을 지킨다. 보낸 파일 칩은 삭제 버튼이 없으므로 끝쪽 패딩을 따로 둔다(6/16/6/6, 간격 12).
- C는 A의 일반 텍스트 에이전트 답(16px), inset 코드 블록, 버블 아래 첨부에 B의 다섯 가지를 더했다.
  - Buzz에서 읽은 파일: `features/messages/Messages.module.css`, `MessageRow.tsx`, `MessageMarkdown.tsx`, `features/agents/ActivityTranscript.*`, `ActivityExpansion.tsx`.
  - 가져온 것: 활동 단계 행, 표(1px 테두리 상자, 머리 행 `affordance-subtle`, 셀 8/12, 모서리 `radius-chip` 12), medium 제목, 문단 바로 뒤 목록 간격 8, hover·포커스 때만 보이는 Copy.
  - 표 모서리는 Buzz의 20px과 셀 4/8을 쓰지 않는다. 모서리가 첫 셀과 끝 셀 글자를 가리기 때문이다.
  - Buzz와 달리 doan 규칙을 지킨 것: 인용에 시작 쪽 막대를 두지 않는다. mono는 번들하지 않는다. 내 메시지는 액센트 버블이다. 작업 중 표시는 DS 스피너다.
  - 에이전트 답을 버블에 넣지 않는 것은 B를 그려 보고 정했다. 버블에 넣으면 폭이 60ch로 묶이고 코드·표가 한 겹 더 들어간다.
- 에이전트 메시지는 패널 위에 Markdown으로 보인다.
  - 그리는 요소: 문단, 굵게·기울임, 링크, 목록·번호 목록(중첩), 제목(h1·h2는 body-lg, 그 아래는 label, 모두 medium), 인라인 코드, 코드 블록(가로 스크롤과 Copy), 표(가로 스크롤), 인용(inset 채움), 구분선.
  - 막는 것: 원시 HTML과 이미지. `components.img`는 alt 텍스트로 바꾸고 `rehype-raw`는 넣지 않는다. 에이전트 출력은 신뢰할 수 없는 데이터다(코멘트 본문을 텍스트로만 보이는 ARCHITECTURE §2와 같은 기준).
  - 링크: `https`만 §2.7 채널로 연다. 그 밖의 스킴과 로컬 경로는 텍스트로 둔다.
  - 코드는 인라인·블록 모두 `--type-family-mono`(시스템 mono 스택, 폰트 번들 없음)를 쓴다(부모 비목표 '고정폭 역할'의 예외, spec 결정 19). 앱의 다른 인라인 코드는 지금처럼 sans 칩이다.
  - 의존성: `react-markdown@10.1.0`, `remark-gfm@4.0.1`. 2026-10-31 npm registry에서 확인했다. Buzz도 같은 두 패키지로 그린다.
  - 성능: 끝난 메시지는 memo하고, 스트리밍 중인 메시지만 애니메이션 프레임당 한 번 다시 그린다.

## 1. 영향 범위

| 영역 | 바뀌는 것 |
|---|---|
| main (`app/src/main/conversation/`) | 목록 조회, 안 본 종료 기록, 프로젝트 대화 실행 제한, send 확장(첨부·모델·effort), 대기열, 매 턴 캔버스 스냅샷과 승격, 보관 대화 복구, 새 이벤트 타입, 저널 형식, Codex 모델 전달 |
| main (`app/src/main/index.ts`, `senderAllowed.ts`) | 링크 채널 `shell:openLink` |
| preload (`app/src/preload/index.ts`) | `listConversations`, `markConversationSeen`, `onConversationListChanged`, `queueConversation`·`removeQueuedMessage`, `openLink`, `sendConversation`의 입력 확장 |
| renderer | 입력창 프리미티브와 `hero`·`docked`, 스레드 순수 함수와 표시 컴포넌트, Home 재조립과 문구, 상태줄·LNB 슬롯·프로젝트 제거 확인·Edit on Home을 main 목록에서 다시 세우기 |
| 의존성 | `react-markdown@10.1.0`, `remark-gfm@4.0.1` |
| CLI·스킬·`doan check` | 없음 |
| 저장소 형식(`.doan/`, JSON Schema) | 없음. 바뀌는 형식은 모두 기기 로컬(`<userData>/conversations/`)이다 |

## 2. main

### 2.1 목록과 안 본 종료

- `conversation:list {root}`는 그 root의 index 항목마다 요약을 돌려준다.
  - 요약 항목: `conversationId`, `canvas?`, `title`, `state`, `owner`, `provider`, `model?`, `effort?`, `fromHome`, `phase`, `unseen`, `queued`, `lastActivityAt`, `preview`.
  - `preview`(buzz-project 캔버스 행·대화 드롭다운용): 응답 대기면 "Needs your answer: " + 권한 요약, 실행 중이면 마지막 활동 요약(명령은 "Running a command"), 그 밖에는 마지막 에이전트 메시지에서 Markdown 기호를 걷어낸 일반 텍스트. 한 줄로 접은 공백, 길이 상한(구현 때 상수로 정함). 원시 HTML은 텍스트로만 남는다.
  - legacy external 소유 대화도 index에 있으므로 목록에 들어간다.
  - `phase`는 실행 중·응답 대기(답하지 않은 권한 요청)·끝남이다. live 상태와 기록 fold로 정한다.
  - 기록 하나를 읽지 못하면(손상, 256 MiB 초과, 새 빌드의 줄) 그 항목만 `readError`로 돌려준다.
  - 목록은 호출할 때마다 모든 기록을 fold한다. 비용이 문제가 되면 마지막 끝 seq와 활동 시각을 index에 캐시한다. 이번에는 알려진 한계로 둔다.
- **안 본 종료**: 끝난 대화에서 마지막 seq가 `seenSeq`보다 크면 안 본 종료다.
  - 마지막 끝 이벤트가 아니라 마지막 seq를 쓴다. 그래서 crash로 접힌 턴(덧붙인 끝 이벤트가 없음)도 안 본 종료가 된다.
  - `seenSeq`가 없는 기존 대화는 본 것으로 본다. 업그레이드 직후 모든 대화가 켜지지 않게 하기 위해서다. 새 대화는 수락할 때 `seenSeq: 0`을 쓴다.
  - `conversation:markSeen {conversationId, seq}`는 seq를 그 대화의 마지막 seq로 자르고, 단조 증가로만 저장한다.
  - 부르는 시점은 호스트가 정한다. 이 자식의 호스트(상태줄·슬롯)는 지금처럼 그 대화가 묶인 캔버스나 워크스페이스를 열 때와 상태줄의 Dismiss에서 부른다. `buzz-project`는 그 대화의 스레드가 창 포커스와 함께 보일 때 부르고, 그때부터 프로젝트 대화는 워크스페이스·Overview 방문만으로 본 것이 되지 않는다(buzz-project spec 결정 11).
- **목록 갱신**: 새 채널 `conversation:listChanged {root}`로 알린다. 대화 이벤트(`conversation:event`)는 seq를 가진 기록만 싣는다는 규칙(ARCHITECTURE §7 'Events')을 지키기 위해서다. renderer는 알림을 받으면 목록을 다시 읽는다. 응답과 알림의 도착 순서는 가정하지 않는다.

### 2.2 프로젝트 대화 실행 제한

- 같은 root에 일하는 중인 프로젝트 대화가 있으면, 다른 프로젝트 대화의 `newDesign` 시작과 send(복구 포함)를 `project_busy`로 거절한다.
- 판정은 메타데이터가 아니라 live 턴으로 한다. live 항목에 그 턴이 프로젝트 턴으로 수락됐다는 표시를 둔다. 다음 동안 일하는 중으로 센다.
  - 수락 전 준비 중.
  - 실행 중·응답 대기.
  - 턴이 끝난 뒤 판정 창(`BIND_GRACE_MS`)이 끝날 때까지.
  - 그 턴 도중에 캔버스에 묶였더라도 그 턴이 끝날 때까지.
  - 이렇게 해야 두 대화가 겹쳐 새 캔버스가 엉뚱한 대화에 묶이지 않는다.
- 거절은 admission에서 하고, 준비가 끝난 뒤 수락 직전에 다시 확인한다(POSTMORTEM 2026-10-27 'Awaited conversation work outlived its current turn').
- 같은 대화의 다음 send는 대기열로 간다(§2.6). 대기열이 없는 경로의 `busy`와 종료 대기 규칙은 지금과 같다.
- 캔버스 대화와 다른 root는 제한하지 않는다.
- Home 이유 줄, Open, 프로젝트 제거 확인은 main 목록에서 계산한다. 문구는 spec 결정 18이다.

### 2.3 send 확장

- `conversation:send`는 `attachments`, `model`, `effort`를 선택 입력으로 받는다. 공급자 필드는 받지 않는다(있으면 `bad_request`).
  - 검증은 `newDesign`과 같은 함수를 쓴다(`validateSendExtras`). 대화 공급자와 소유를 함께 받는다.
  - `model`은 이번 실행에서 그 root와 대화 공급자에 대해 받은 목록 안에 있어야 한다. renderer는 사람이 바꾼 값만 보낸다. 그래서 재시작 직후 목록을 아직 읽지 않았어도 index 값으로 계속 보낼 수 있다.
  - `effort`는 그 모델의 단계 안에 있어야 한다.
  - `attachments`는 main이 발급한 id여야 한다.
  - legacy external 대화에 세 값 중 하나라도 보내면 `bad_request`다.
- 첨부는 수락 직전에 다시 해석해서 `attachment_missing`를 낸다. 붙여 넣은 이미지에는 `sent` 표시를 쓰고, send 뒤 `store.consume`을 부른다. 지금 시작 경로와 같다.
- 쓰는 순서: 수락 시점에 index(모델·effort·스냅샷)를 먼저 저장하고, 그다음 `user.message`와 `turn.started`를 덧붙인다. 덧붙이기가 실패해도 남는 것은 저장된 선택뿐이라 해가 없다.
- runner 전달: Claude와 ACP는 턴마다 새 프로세스라 index 값을 다시 적용한다. Codex 재사용 서버는 열 때의 값을 쓰므로, `Runner.send`가 턴마다 모델·effort를 받게 바꾼다.

### 2.4 매 턴 캔버스 스냅샷과 승격

- **스냅샷**: `canvasesAtStart` 키 이름을 유지하고, 의미를 "가장 최근 턴을 수락했을 때의 캔버스 목록"으로 바꾼다. 프로젝트 대화의 매 턴 수락마다 덮어쓴다. 이름 변경과 이중 읽기를 하지 않는다. `store.ts:13`의 설명을 고친다.
- **수정 근거 모으기**: 턴 동안 그 대화의 `activity` 중 `kind: "edit"`의 `path`를 live 항목에 모은다.
  - 경로는 `posix.relative(root, posix.resolve(root, path))`로 root 기준으로 바꾼다. 정규 경로 별칭(`/tmp`·`/private/tmp`)도 맞춘다.
  - 같은 턴 동안 폴더 감시가 바꾼 캔버스 파일도 live 항목에 모은다.
- **판정 시점**: 턴이 끝난 뒤 첫 폴더 갱신에서 판정한다. 갱신이 오지 않으면 `BIND_GRACE_MS`가 끝날 때 판정한다. `promotionTarget`이 다음 순서로 고른다.
  1. 새 캔버스는 스냅샷에 없고 지금 목록에 있는 캔버스다. 새 캔버스가 정확히 하나면 그 캔버스.
  2. 새 캔버스가 없으면, 수정 경로와 폴더 변경이 둘 다 가리키는 기존 캔버스가 정확히 하나일 때 그 캔버스.
  3. 그 밖에는 없음. 프로젝트 대화로 남는다.
  - 경로는 목록 행에 대응시켜 `{path, id}`로 바꾼 뒤 `sameCanvas`로 비교한다. 같은 ID가 둘인 행은 후보에서 뺀다.
  - 대상 캔버스의 현재 대화가 일하는 중이면 없음이다.
  - 턴이 실패하거나 멈췄어도 실제로 바뀐 파일이 있으면 같은 규칙을 적용한다.
- **열기**: 새 캔버스가 턴 도중에 나타나면 지금처럼 연다(사람이 그사이 다른 캔버스를 열지 않았을 때). 묶기는 위 판정을 기다린다. 기존 캔버스 수정 승격은 화면을 옮기지 않는다.
- **승격 쓰기**: 다음을 저널(§2.8)과 index rename 커밋으로 한 번에 쓴다. 저장이 실패하면 아무것도 바뀌지 않는다(POSTMORTEM 2026-10-27 'A rejected conversation replacement').
  - 대상 캔버스의 이전 현재 대화에 `conversation.archived`.
  - 이 대화에 `canvas`를 저장하고 `conversation.bound {canvas}`.
- **보관 처리**: 보관하는 대화는 지금 `start()`의 교체와 같이 정리한다. live의 `terminal = true`, `busy = false`로 두고, `runner.close()`, 진행 중인 종료 대기의 `cancelWait`를 부른다.
- **Home 안내문**: `HOME_GUIDANCE`는 `fromHome`이면서 `canvas`가 없을 때만 붙인다.
- **왜 대화 자기 이벤트와 파일 변경을 함께 보나**: 같은 시간에 사람의 터미널 에이전트나 다른 캔버스 대화가 같은 캔버스를 고칠 수 있다. 파일 감시만으로는 누가 고쳤는지 알 수 없다. 반대로 Claude·Codex의 edit 활동은 수정을 시도할 때 나와서(`transport.ts`), 거부되거나 실패한 수정도 포함한다.

### 2.5 보관 대화 복구

- `send`의 대상이 `archived`이면 admission이 복구 경로로 간다.
  - 그 대화의 캔버스를 `resolveListedCanvas`로 다시 찾는다. 없거나 같은 ID가 둘 이상이면 `canvas_not_found`다. 같은 ID로 옮겨진 캔버스는 찾는다.
  - 그 캔버스의 현재 대화가 일하는 중이면 `busy`다.
  - 이전 프로세스가 아직 예약을 들고 있으면 지금 send처럼 종료 대기(`EXIT_WAIT_MS`)를 거친다. 보관되며 닫히는 중인 live를 다시 쓰지 않는다.
  - 수락 직전 재확인: 대상이 아직 보관 상태이고, 바꿀 현재 대화가 준비를 시작할 때와 같은지 본다.
  - 수락 시점에 현재 대화는 `conversation.archived`, 복구할 대화는 `conversation.restored`를 기록한다. index에서 둘의 state를 맞바꾸고, 저널(§2.8)을 거친다.
- 세션 재개 규칙과 실패 코드는 지금 send와 같다. 공급자가 로그아웃됐으면 `not_logged_in`이고 index는 그대로다.
- `state.ts` fold는 `conversation.restored`를 만나면 `archived`를 풀고 그 뒤 이벤트를 다시 반영한다. `previousExit`와 `checkSend`의 `current` 조건을 복구 경로에 맞게 넓힌다.

### 2.6 대기열

- 대화가 일하는 중일 때 온 send는 거절하지 않고 그 대화의 대기열 끝에 붙는다(`conversation:queue`). 응답은 대기 항목 id다.
  - 대기 항목은 텍스트, 앵커, 첨부 id, 프리셋 줄을 담는다. 검증은 send와 같다.
  - 대기열은 main 메모리에 대화별로 둔다. 다시 로드해도 남는다. 재시작하면 사라지므로, 앱을 끝내기 전에 항목을 그 대화의 초안 복원용으로 넘긴다(아래).
- 턴이 `turn.done`으로 끝나면 대기 항목을 순서대로 빈 줄로 이어 붙여 `user.message` 하나로 보낸다.
  - 첨부는 합쳐서 `MAX_ATTACHMENTS`(10)까지다. 넘치면 보내지 않고 초안으로 돌려 이유를 보인다.
  - 앵커 표시 `{{n}}`은 이어 붙이며 다시 번호를 매긴다.
- 턴이 실패하거나 멈추면 보내지 않는다. 대기 항목을 이어 붙인 초안을 renderer에 돌려주고 대기열을 비운다. 복원 방식은 Edit and resend와 같다.
- `conversation:removeQueued {conversationId, itemId}`로 항목을 지운다. 순서 바꾸기와 편집은 없다.
- 대기열이 있는 동안 다른 프로젝트 대화는 여전히 `project_busy`다.
- 자동으로 보내지만 사람이 쓴 메시지를 사람이 보낸 것이다. PRODUCT §3 Out of scope 4(Doan이 스스로 에이전트를 깨우지 않음)에 걸리지 않는다.

### 2.7 링크 채널

- `shell:openLink {url}`: main 창의 main frame만 부를 수 있다(`senderAllowed.ts`).
- main은 `new URL`로 다시 읽고 `protocol === "https:"`와 길이 상한을 확인한 뒤 `electronShell.openExternal`을 부른다. 그 밖은 거절한다.
- renderer는 Markdown `a`를 onClick 핸들러로 그리고, `https:`가 아닌 링크는 텍스트로 그린다. `setWindowOpenHandler`의 전면 차단은 그대로 둔다.

### 2.8 형식

- **이벤트 JSONL**: v1을 유지하고 타입 `conversation.bound {canvas}`와 `conversation.restored`를 더한다. 지금 빌드는 새 타입 줄을 손상으로 읽는다. 이전 빌드로 돌아가는 것은 지원하지 않는다(부모 공통 결정 12).
- **index**: v2를 유지하고 선택 키 `seenSeq`를 더한다. `canvasesAtStart`는 의미만 바뀐다. reader가 모르는 키를 무시하므로 이전 빌드도 index는 읽는다.
- **저널**: 지금 `start-undo.json`은 승격·묶기·복구를 담지 못한다.
  - 커밋 판정이 "새 id가 index에 있는가"이고, 롤백은 새 기록을 지운다(`store.ts` `recoverStart`).
  - 승격·복구의 대상은 이미 index에 있고, 기록은 지우는 대신 앞부분까지 잘라야 한다.
  - 새 저널은 `v`와 작업 종류(`start | bind | promote | restore`)를 가진다.
    - 건드리는 모든 기록(승격·복구 대상 포함)을 앞부분 자르기 대상으로 둔다.
    - 종류별 커밋 판정: start는 지금과 같다. bind·promote는 "그 id에 그 canvas가 있음", restore는 "그 id가 current이고 이전 현재가 archived"다.
  - 버전 없는 이전 저널은 start로 읽는다. ARCHITECTURE의 "The undo journal … unchanged by v2" 문장은 Z1에서 고친다.
- 저장소 형식, CLI 응답, `runtime.json`, 앱 소켓 메시지는 바뀌지 않는다.

## 3. renderer

### 3.1 입력창 프리미티브와 두 타입

`HomeComposerView.tsx`를 다음과 같이 나눈다. 이름은 구현 때 주변 코드에 맞춘다.

- **공용 프리미티브**
  - `ComposerCard`: 카드 틀과 드롭 대상.
  - `ComposerChips`: 첨부·프리셋 칩.
  - `ComposerField`: 입력 칸, 줄바꿈 감지, IME와 Enter 처리. 이번에는 textarea다. 값은 `{text, anchors}`로 주고받는다. 그래서 `buzz-canvas-conversation`이 칩을 담는 칸으로 바꿔도 바깥은 그대로다(spec 결정 17).
  - `ComposerTools`: Attach, Presets와 `/` 팝오버, Send/Stop/Queue 자리.
  - `AgentPicker`, `EffortPicker`.
  - 비활성 Attach·Presets는 `--text-disabled`를 쓴다. 지금 Home은 표준 잉크 규칙이 비활성 잉크를 이겨서 비활성인데도 활성처럼 보인다. 공용 규칙에서 함께 고친다.
- **`HeroComposer`(Home)**
  - 지금 Home과 같다. 프로젝트 선택, box 고정, 도구 줄 안의 에이전트·effort, 워크트리 트레이, `HomeStage` 배치를 쓴다.
  - computed style과 DOM 순서는 포커스 보더 말고는 바꾸지 않는다.
- **`DockedComposer`(Overview, 캔버스 패널)**: 프로젝트 선택이 없다. 호스트가 root, 대화(있으면), placeholder를 넘긴다. 모드는 셋이다.
  - **기존 대화**: 공급자가 고정이라 아래 줄은 그 공급자의 모델·effort만 고른다. 접근 이름은 "Model: Opus 5.5 (Claude Code)"다. 모델 목록이 오기 전에는 index의 모델을 보인다. 목록에 없으면 공급자 기본값으로 돌아간다(Home과 같은 규칙). effort는 그 모델에 단계가 있을 때만 보인다.
  - **새 대화**: 아래 줄은 Home과 같은 공급자·모델 선택이다(readiness 상태, Manage agents…). 기본값은 Settings > New conversations다. Send는 `newDesign` 시작을 부른다.
  - **보관된 대화**: 기존 대화와 같다. 보내면 복구된다. placeholder는 "Reply to make this the current conversation…"이다.
  - `data-shape="capsule" | "box"`만 바꾸고, 두 모양 모두 같은 위치에 같은 key의 textarea를 그린다. 다시 마운트하면 포커스와 한글 조합이 끊긴다.
  - box 모양의 칩 줄은 칩이 있을 때만 grid에 둔다. 빈 줄도 줄 간격을 더해서 위쪽 여백이 Home보다 8px 넓어지기 때문이다. 텍스트 시작은 Home과 같은 카드 위 16px이다.
  - DOM 순서는 field → Attach → Presets → Send → 모델 → effort이고, 두 모양에서 같다. capsule에서는 보이는 순서와 다르지만 Tab 순서를 모양마다 바꾸지 않는 쪽을 택했다.
- **실행 중(spec 결정 9)**
  - 턴이 수락되면 칸을 비우고 포커스를 칸에 둔 채 capsule로 돌아간다.
  - Send 자리: 칸이 비면 Stop(`interruptConversation`), 글이 있으면 Queue다. 대기 항목이 있어도 칸이 비면 Stop이다.
  - 대기 항목은 카드 위에 보낸 순서대로 한 줄씩 보인다. 각 줄에는 Remove만 있다.
  - 권한 요청을 기다리는 동안 이유 줄 "Answer or stop the request above."를 보인다.
  - Esc는 `/` 팝오버만 닫고 턴을 멈추지 않는다. 멈춤 단축키는 없다.
- **거절 이유 줄**: Home과 같은 이유 집합과 문구를 쓴다.
  - Home과 같은 이유: 32,768자 초과, `{{`·`}}`, 첨부 확인 중, `attachment_missing`, 로그인 만료(Sign in again…), 업데이트 필요(Update…).
  - docked에만 있는 이유: `project_busy`("Another conversation is still running in <project>." 또는 "Another conversation in <project> needs your answer.", Open의 접근 이름은 "Open the running conversation"), 복구 `busy`("The current conversation on this canvas is still running.", Open), 복구 `canvas_not_found`.
  - `canvas_not_found`이면 입력창 대신 "This conversation’s canvas is no longer in <project>, so it can’t continue."를 보인다.
  - 이유 줄은 textarea의 `aria-describedby`에도 건다.
- **초안**: 대화 id별로 보관한다. 새 대화 초안은 root별로 보관한다.
- **포커스**
  - 권한 답 뒤에는 다음 대기 중인 요청의 첫 선택지, 없으면 입력 칸.
  - Stop 뒤에는 입력 칸.
  - Edit and resend 뒤와 "Replace your draft?" 대화상자 뒤에는 입력 칸, 캐럿은 끝.
  - send 수락 뒤에는 입력 칸.
  - 이 대상은 `focusAfterStop`처럼 순수 함수로 고정한다.

### 3.2 모양 판정 (`composerShape`)

입력은 현재 모양, 텍스트가 비었는지, 칩 수, field가 한 줄을 넘었는지(capsule 폭에서 측정)다. 측정값은 주입받는다.

- 칩이 있거나 줄을 넘으면 box다.
- 텍스트와 칩이 모두 없으면 capsule이다.
- 그 밖에는 현재 모양을 유지한다.

"줄바꿈이 풀리면 capsule"을 쓰지 않는다. capsule은 텍스트 칸이 좁아서, box에서 한 줄에 들어가는 글이 capsule에서는 다시 줄을 넘는다. 그러면 모양이 계속 번갈아 바뀐다. 줄인 동작 설정에서는 모양 전환 애니메이션을 끈다.

### 3.3 스레드 (`threadItems`, `ConversationThread`)

- **입력**: 한 대화의 이벤트 배열(합친 결과). **출력**: 안정된 key(`seq` 또는 `messageId`)를 가진 항목 배열이다. 항목 종류는 다음과 같다.
  - 사람 메시지: 텍스트 조각과 앵커 위치(`{{n}}`), 첨부 설명, 프리셋 줄.
  - 에이전트 메시지: `message.delta`를 `messageId`로 합치고, `message.done`이 있으면 그 텍스트를 쓴다. 멈춘 턴의 메시지는 받은 데까지만 남기고 캐럿을 지운다.
  - 활동 묶음: 연속된 `activity`를 하나로 묶는다.
  - 권한 요청: 답 전, 답함, 만료.
  - 턴 끝: 실패 코드, 중단 이유.
  - 승격·보관·복구 표시: `conversation.bound`, `conversation.archived`, `conversation.restored`.
- **스크롤**: 프리미티브가 정한다.
  - 처음에는 맨 아래에서 연다.
  - 맨 아래에서 24px 안에 있을 때만 새 내용을 따라 내려간다.
  - 사람이 위로 올렸으면 끌어내리지 않고 "Jump to latest" 버튼을 보인다.
  - 줄인 동작 설정에서는 바로 이동한다.
  - `scrollToItem(key)`를 노출해 알림·권한 토스트의 Open과 표시 줄의 Open이 특정 항목으로 갈 수 있게 한다.
- **로딩**: 기록을 읽는 동안 300ms까지는 아무것도 보이지 않는다. 그 뒤에는 DS 스피너와 "Loading conversation…"을 보인다. 입력창은 쓸 수 있다.
- **읽기 실패**: 스레드 대신 노티스("Doan couldn’t read this conversation", Retry)를 보이고 입력창은 비활성이다. "start a new conversation"은 호스트의 New를 가리킨다.
- **대상이 바뀌는 경우**: 보이는 대화가 다른 곳에서 보관되거나 승격되면 목록 알림으로 표시 줄과 입력창 모드를 바로 갱신한다.
  - 원래 화면에서 승격되면 그 화면은 새 프로젝트 대화 상태로 초기화된다(spec 결정 12).
  - 표시 줄의 Open은 캔버스를 ID로 찾는다. 없으면 Open을 끄고 "No longer in <project>"을 보인다.
- **접근성**
  - 메시지 텍스트는 선택할 수 있다.
  - 실시간으로 도착한 권한 요청에만 `role="alert"`를 건다. 기록을 그릴 때는 걸지 않는다.
  - 단계 변화는 polite 상태 하나로 알린다. 스트리밍 텍스트에는 live region을 두지 않는다.
  - 활동 줄은 `aria-expanded`·`aria-controls`를 가지고, 턴이 실행 중에서 접힘으로 넘어가도 사람이 연 상태를 유지한다.
  - Copy는 `opacity`로만 숨기므로 포커스할 수 있다. 누르면 2초 동안 "Copied"를 polite로 알린다.
- **줄인 동작**: chevron 회전, 펼침, 자동 스크롤, 캐럿 깜빡임을 끈다.
- **harden 상태**: 아주 긴 메시지와 경로, 줄바꿈 없는 긴 토큰, 빈 에이전트 응답("No reply."), 응답 대기 중인 권한 요청 여러 개, 실패 뒤 다시 보내기, 읽기 실패.

### 3.4 상태줄, LNB 슬롯, Home

- 상태줄(`conversationStrip.ts`), 슬롯(`homeConversations.ts`), 프로젝트 제거 확인(`removalConfirm`), Home 이유 줄의 입력을 renderer 메모리 대신 main 목록과 목록 알림에서 만든다.
- 상태줄은 일이 남은 대화(실행 중·응답 대기·안 본 종료)만 보인다. Dismiss는 `markSeen`을 부른다.
- 슬롯은 그 행에 묶인 대화 중 가장 높은 상태 하나를 보이는 지금 규칙을 유지한다. 묶인 캔버스가 지워지거나 옮겨지면 프로젝트 행으로 내려간다.
- 슬롯과 상태줄의 모양은 바꾸지 않는다. 문구는 spec 결정 18만 바꾼다. 실행 중 Home 이유 줄과 제거 확인도 같은 문구다.
- **Edit on Home**: 실패하거나 멈춘 대화의 마지막 `user.message`와 index에서 다시 만든다.
  - 텍스트와 프리셋은 기록에서, 모델·effort는 index에서 가져온다.
  - 첨부는 기록된 경로로 main에 다시 발급을 요청한다(`attachments:fromPaths`, 지금 첨부 확인과 같은 검사).
  - 옮겨졌거나 지워진 파일은 `attachment_missing` 상태 칩으로 보인다.
  - 붙여 넣은 이미지는 `<userData>/attachments/` 경로라 그대로 다시 발급된다.
- `project_busy` 거절이 오면(목록이 늦은 경우) 지금 이유 줄로 바꿔 보인다.

## 4. 순수 함수 (`/tdd` 대상)

| 함수 | 위치(예정) | 고정할 것 |
|---|---|---|
| `conversationSummary(metadata, folded, live)` | main | phase, unseen(마지막 seq, crash 접힘, 키 없음=본 것), queued, lastActivityAt, readError, preview(상태별 선택, Markdown 걷어내기, 명령 숨김, 길이 상한) |
| `clampSeen(seq, lastSeq, current)` | main | 마지막 seq로 자르기, 단조 증가 |
| `projectBusy(entries, live, root, exceptId, now)` | main | 수락 전 준비, 실행·응답 대기, grace 창, 턴 도중 묶인 대화, 다른 root·캔버스 대화 무시 |
| `validateSendExtras(request, provider, owner, models, attachments)` | main(ipc) | 시작과 같은 규칙, 공급자 필드 거절, legacy external 거절 |
| `promotionTarget(turn, listed, snapshot, currentByCanvas)` | main | 후보 0·1·2, 같은 캔버스 두 번 수정은 하나, 캔버스 아닌 파일 무시, 절대·바깥·다른 워크트리·`./`·`..` 경로, 턴 중 이동(옛 경로, 같은 ID 새 경로), 중복 ID, 턴 중 삭제, 실패·중단 턴, 재시작 뒤 소급 없음, 새 캔버스 우선, 거부된 수정(파일 변경 없음) |
| `restoreEntries(entries, id)` | main(store) | state 맞바꿈, 다른 캔버스 항목 불변 |
| fold의 `conversation.bound`·`conversation.restored` | main(state) | 복구 뒤 이벤트 반영 |
| `combineQueued(items)` | main | 순서, 빈 줄 이음, 앵커 번호 다시 매기기, 첨부 10개 상한 |
| 저널 종류별 커밋 판정 | main(store) | start·bind·promote·restore × rename 앞·뒤, 버전 없는 이전 저널 |
| `composerShape(prev, input)` | renderer | §3.2 규칙과 번갈아 바뀜 방지 |
| `composerAction(running, text, queued)` | renderer | Stop·Queue·Send |
| `focusAfter(action, state)` | renderer | §3.1 포커스 대상 |
| `threadItems(events)` | renderer | §3.3 항목, delta 합치기, 앵커 위치, 명령 숨김, 멈춘 메시지 |
| `scrollFollow(atBottom, distance)` | renderer | 24px 규칙 |
| `slotsFromList(list, seen)` / `stripFromList` | renderer | 일이 남은 대화만, 지금 슬롯·상태줄 순서와 문구, 지워진 캔버스는 프로젝트 행 |

## 5. PoC 의존

- **edit activity의 경로**: 수정 승격은 공급자가 캔버스 파일을 고칠 때 `activity`에 `kind: "edit"`와 경로를 내는지에 달려 있다.
  - `transport.ts`에는 Codex 파일 변경과 Claude 도구 요약이 있다. Cursor, Antigravity, Copilot의 ACP 경로가 같은 정보를 주는지는 확인하지 않았다.
  - P1에서 로그인할 수 있는 공급자만 확인한다. 거부한 수정도 함께 본다.
  - 확인하지 못한 공급자는 수정 승격을 '미확인'으로 PRODUCT에 적고 M4는 그대로 진행한다. 파일 변경을 함께 보므로, 경로가 없는 공급자는 승격이 안 될 뿐 잘못 승격되지는 않는다.
  - 새 캔버스 묶기는 폴더 갱신 경로라 공급자와 상관없이 동작한다.

## 6. 결정 영향

- **PRODUCT §3 항목 6**: "캔버스당 현재 대화 하나, 새로 시작하면 이전 대화는 보관"은 유지한다. 다음을 더한다.
  - 캔버스에 묶이지 않은 프로젝트 대화.
  - 승격.
  - 보관 대화 복구.
  - 대기열.
- **PRODUCT §5 항목 1**: 다음을 현재 규칙으로 고친다.
  - "A project runs one Home conversation at a time"이 "root 하나에서 일하는 프로젝트 대화는 하나"가 된다.
  - "Strip, slots, last requests and the one-per-project rule live in renderer memory" 문장을 고친다.
  - Home 문구를 고친다.
  - "a conversation this renderer does not know (after a restart or reload)" 문장을 다시 본다.
- **ARCHITECTURE §7**: 다음을 현재 규칙으로 고친다.
  - 'Canvas lifecycle': "never binds later", 판정 시점, 수정 승격.
  - 'IPC contract': "Only newDesign accepts model, effort and attachments", 링크 채널, 목록 채널.
  - 'App-local ownership': 대기열.
  - 'Device-local storage': 저널 형식, `seenSeq`.
  - Markdown 렌더링 규칙과 두 의존성.
- **DESIGN.md**: 'Home' Composer 행을 고친다. 토큰 표의 두 행은 지금 "적용 예정"이므로 구현 때 현재 사용처로 고친다.
- **부모 spec**: 비목표 '고정폭 역할'과 공통 결정 10에 이 자식의 예외를 적는다(spec 결정 19).
- 유지하는 구조 결정
  - 대화 기록은 기기 로컬이고 저장소 밖에 둔다.
  - 이벤트는 append-only다. 복구와 승격도 이벤트를 덧붙일 뿐 지우지 않는다.
  - 자동 재시도, fork, 인수는 없다.
  - Doan은 에이전트를 스스로 깨우지 않는다. 복구와 대기열도 사람이 보낸 메시지로만 일어난다.
- `doan check` 규칙과 ARCHITECTURE §1 규약은 바뀌지 않는다.

## 7. POSTMORTEM에서 가져올 함정

- **2026-10-27 Awaited conversation work outlived its current turn**: send 확장, 복구, 대기열, 프로젝트 대화 실행 제한은 비동기 준비 뒤 수락 직전에 다시 확인한다. 늦게 온 콜백은 live identity와 turnId로 걸러낸다. 보관되며 닫히는 live는 다시 쓰지 않는다.
- **2026-10-27 A rejected conversation replacement had already changed current history**: 묶기, 승격, 복구는 저널과 index rename 커밋을 거친다. 거절은 기록을 바꾸지 않는다. 종류마다 rename 앞뒤 재시작 테스트를 둔다.
- **2026-10-28 A send right after turn.done was refused as busy**: 복구된 대화의 첫 send, 첨부를 실은 send, 대기열을 보내는 send도 이전 프로세스 종료 콜백보다 먼저 보낸 경우를 테스트한다.
- **2026-10-26 The invalidation read overtook the reply**: 목록 알림과 send·markSeen 응답의 도착 순서를 가정하지 않는다.
- **2026-10-25 Navigation feedback read the previous React snapshot**: 목록에서 다시 세운 슬롯이 대화 전환 직후 이전 행의 상태를 보이지 않게 한다. 렌더 사이 테스트를 둔다.
- **2026-10-30 A renderer import of a main module left the built app's window blank**: renderer가 쓰는 요약·스레드 타입은 타입만 import한다. `rendererImports.test.ts`에 스레드 모듈을 추가 루트로 넣는다. 이 테스트는 패키지 안까지 따라가지 않으므로, 실제 CSP 확인은 빌드한 앱에서 스레드를 처음 띄우는 `buzz-project`가 한다.
- **2026-10-30 Removing a shared dialog class silently disabled two focus guards**: Home 입력창을 나눌 때 클래스 이름을 셀렉터로 쓰는 곳을 문자열로 검색한다. `referenceHeight`의 `.composer-card`, `.composer-input`, `.home-suggestions`와 `App.tsx`의 `.home-shell .composer-input` 포커스 가드가 대상이다.
