# 캔버스 칩 — design

## 영향 범위

- **app (renderer)**:
  - `ShellSidebar.tsx`: 캔버스 행을 끌 수 있게 한다(`draggable`). 끌기 데이터는 Doan 전용 MIME(예: `application/x-doan-canvas`)에 `{root, path}`를 담는다.
  - `canvasRowMenu.ts`: "Add to message" 항목과 그 가능 여부·이유를 더한다.
  - 칩 필드(ProseMirror, ARCHITECTURE §7 'Chip field'):
    - 캔버스 칩 노드를 더한다.
    - 드롭 처리: 놓은 좌표의 위치(`posAtCoords`)에 칩을 넣는다. Doan 전용 MIME만 칩으로 다루고, 파일 드롭은 기존 첨부 경로로 간다.
    - 복사·붙여넣기 규칙
  - composer(캔버스 패널, Overview, Home의 docked composer):
    - 캔버스 칩을 받을지 판정한다.
    - Home의 프로젝트가 바뀌면 다른 프로젝트를 가리키는 칩을 이름으로 바꾼다.
  - 보낸 말풍선: 캔버스 칩을 그리고, 누르면 연다. 연결 규칙은 에이전트 답의 다른 캔버스 칩(`replyChipTarget`)과 같은 방식으로 root의 목록에서 찾는다.
- **app (main)**:
  - `prompt.ts`: `validAnchor`가 캔버스 앵커를 받고, `turnPrompt`가 직렬화한다.
  - 대화 이벤트(`user.message`의 `anchors`)에 캔버스 앵커가 들어간다(`types.ts`).
- **CLI, 스킬, 가이드**: 바뀌지 않는다.

## 앵커 형식

- 지금 앵커는 프레임, 요소, 지점이다(`targetAnchor`, `validAnchor`). 여기에 `{kind: "canvas", path, canvasId}`를 더한다.
  - `path`: 저장소 상대 경로. `canvasKind`(`app/src/formats/canvasPath.ts`)가 받는 `.doan/canvases/` 또는 `.doan/ds/` 아래 `.html`이다.
  - `canvasId`: 그 캔버스의 id. id가 없거나 겹치는 캔버스는 칩을 만들 수 없다. 사이드바 행이 그런 캔버스를 "run `doan check`"로 표시하므로 끌기도 막는다.
- `{{n}}` 표시와 앵커 수 검증은 그대로다. 32곳 한도는 캔버스 앵커를 포함해 센다.
- **포맷 영향**:
  - 대화 이벤트 JSONL은 앱 안의 기기 로컬 형식이다(ARCHITECTURE §7 'Events', `types.ts`). 공유 JSON Schema(§11)는 아니다.
  - 새 kind를 더해도 `v`는 올리지 않는다. 같은 판단을 thread-edit-lines의 `activity.result`에서도 했다.
  - 대신 되돌림 비용이 있다. 이전 Doan은 캔버스 앵커가 든 메시지를 읽지 못할 수 있다. T1에서 이전 빌드의 읽기 동작(무시하는지, 대화 전체를 읽지 못하는지)을 확인하고, 그 결과를 design.md에 적는다. 대화 전체를 읽지 못하면 사용자에게 묻는다.

## 판정 규칙 (순수 함수)

- **`canvasChipTarget(drag, composer)`**: 놓기나 메뉴로 칩을 넣을 수 있는지와 그 이유를 돌려준다.
  - 같은 root인지(캔버스 패널·Overview는 화면의 root, Home은 고른 프로젝트의 root)
  - composer가 입력을 받는지
  - 32곳 한도
  - 캔버스 id가 유효하고 겹치지 않는지
  - 프로토타입 창이면 받지 않는다.
- **끌기 데이터 읽기**: Doan 전용 MIME의 `{root, path}`를 검증한다. 다른 창이나 다른 앱에서 온 끌기, 형식이 틀린 데이터는 칩이 되지 않는다.
- **Home 프로젝트 변경**: 다른 root를 가리키는 칩을 이름 텍스트로 바꾸는 변환.
- **붙여넣기**: 같은 root면 칩, 아니면 이름. 32곳을 넘으면 이름.
- **보낸 칩 열기**: root 목록에서 path와 canvasId로 찾는다. 결과는 열기, 지금 캔버스(아무것도 안 함), 없음("No longer in <project>"), id 중복(토스트), 목록을 아직 읽는 중이거나 문제가 있음(토스트)이다. 에이전트 답 칩의 `replyChipTarget` 규칙과 맞춘다.
- **`validAnchor`의 캔버스 앵커**: path 형식, id 형식, 저장소 밖 경로 거절.

## 동작 세부

- **끌기 시각**: 끄는 동안의 행 모습(드래그 이미지), composer의 놓일 자리 표시, 놓을 수 없는 composer의 모습은 드래프트가 정한다. macOS 관례대로 놓을 수 없는 곳에서는 `dropEffect = "none"`으로 커서가 바뀐다.
- **Esc와 취소**: 끄는 중 Esc는 브라우저 기본대로 끌기를 취소한다. composer 밖에 놓으면 아무것도 하지 않는다.
- **포커스**: 놓기나 메뉴 뒤 포커스는 그 composer 글 칸으로 간다. 메뉴로 넣을 때 캔버스 패널이 접혀 있으면 먼저 펼친다(지금 Add to message와 같다).
- **트리 키보드와 충돌**: 사이드바 트리의 클릭, 키, typeahead는 그대로다. 행을 누르는 것과 끌기 시작은 포인터 이동 거리로 나뉜다(브라우저 기본). 끌기를 시작해도 행이 열리지 않는다.
- **Home**: 칩을 넣은 뒤 프로젝트를 바꾸면, 다른 root를 가리키는 칩을 이름으로 바꾼다. 다시 원래 프로젝트로 돌아와도 칩으로 되돌아가지 않는다.
- **프롬프트**: `turnPrompt`는 캔버스 앵커를 `{kind, path, canvasId, name}`처럼 데이터 블록에 넣는다. 에이전트가 "이 경로의 캔버스"라고 알 수 있으면 충분하다. 프롬프트 문장(OPEN_GUIDANCE 등)에 설명을 더할지는 T5의 eval 결과로 정한다.

## 형식, 규약, 결정에 미치는 영향

- **형식**: 앱 로컬 대화 이벤트에 앵커 kind가 하나 는다(위 '앵커 형식'). 공유 JSON Schema, CLI 응답, `runtime.json`, 앱 소켓 메시지, `sessions.v1`은 바뀌지 않는다.
- **규약(ARCHITECTURE §1)**: 없다.
- **결정**:
  - PRODUCT §5 item 6의 "Home's and the Overview's composers take no chips; a person's chips point only into the open canvas"가 바뀐다. 사용자가 이 feature에서 정했다.
  - 서빙 범위, sandbox iframe, GitHub 토큰, git 명령과는 관계가 없다.
  - 캔버스 파일은 main이 root 목록으로 확인한 경로만 앵커가 된다(Canvas row menu IPC와 같은 원칙: renderer의 경로는 main 목록의 키).
- **보안**: 앵커의 path는 프롬프트에 신뢰하지 않는 데이터로 들어간다. `validAnchor`가 저장소 밖 경로, `..`, 절대 경로를 거절한다.

## PoC (T1)

- 사이드바 행의 HTML5 drag와 ProseMirror 칩 필드의 drop이 Electron 45에서 같은 창 안에서 동작하는지 확인한다. 확인할 항목은 다음과 같다.
  - 놓은 좌표의 caret 위치
  - 파일 드롭과의 구분
  - 끄는 동안 composer의 표시
  - 트리 행의 클릭과 키가 깨지지 않는지
- 이전 Doan 빌드(직전 릴리스)가 캔버스 앵커가 든 대화를 읽을 때의 동작을 확인한다.

## postmortem에서 가져온 주의점

- 2026-11-22 "Sent anchor chips inserted line breaks into copied text": 캔버스 칩도 보낸 말풍선에서 복사할 때 줄바꿈을 넣지 않는다.
- 2026-11-08 "Look Up named a composer chip by its screen-reader text": 칩의 화면 읽기 이름과 보이는 이름을 섞지 않는다. Look Up, 복사, 붙여넣기는 보이는 이름을 쓴다.
- 2026-11-03 "A canvas row menu closed by Esc dropped focus to the page body": "Add to message" 뒤 포커스는 composer로 간다. 메뉴를 Esc로 닫으면 지금처럼 행으로 돌아간다.

## 드래프트 요청

`/design-draft canvas-chip`으로 새 드래프트를 그린다.

- **프레임**:
  - `chip`: composer 안의 캔버스 칩과 기존 프레임·요소 칩의 비교
  - `drag`: 끄는 행, 놓일 자리 표시, 놓을 수 없는 composer
  - `menu`: 행 메뉴의 Add to message와 꺼진 상태
  - `sent`: 보낸 말풍선의 칩과 없어진 캔버스
  - `home`: Home의 프로젝트 불일치와 프로젝트 변경
  - `copy`: 문구
- 문구는 `clarify` 프리셋으로 정한다.

## 읽은 design preset

- `shape`: 기존 화면을 넓히는 경우. 칩의 시각 체계는 지금 프레임·요소 칩을 이어받는다.
