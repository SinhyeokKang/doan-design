# prototype-frame-links — design (상위 feature)

하위 feature가 같이 쓰는 조사와 범위다. 코드 위치는 2026-11-14 develop 기준이다.

## 조사

### 프로토타입 창

- 실행마다 새 iframe을 만든다(`app/src/renderer/prototype/PrototypeWindow.tsx:502`, `sandbox="allow-scripts allow-forms"`). main이 `host.load({gen,url,frame})`로 실행을 준비한다(`app/src/main/prototypeWindow.ts:276-280`).
- 캔버스 세계에 있는 Doan 스크립트는 `prototypeScriptSource`(`app/src/main/prototypeScript.ts`) 하나다. `Page.addScriptToEvaluateOnNewDocument`로 주입되고(`prototypeWindow.ts:92-118`), `toString()`으로 직렬화하므로 다른 모듈을 import할 수 없다(`:1-4`). 지금은 클릭 처리가 없다.
- 스크립트는 `parent.postMessage`로 RunMessage `{gen,state,size?,frames}`를 보낸다(`:104-105`). 렌더러의 `forwardedMessage`(`app/src/renderer/prototype/host.ts:79-84`)는 현재 iframe, origin `"null"`, 현재 gen만 받고, `state`가 있으면 결과로, 없으면 프레임 목록으로 나눈다. 새 메시지 종류는 따로 구분자가 필요하다.
- main은 `app/src/main/prototype/requests.ts`(`parseRunReport`, `parseFramesReport`)에서 검증한다. 캔버스가 현재 gen 메시지를 위조할 수 있으므로 받은 것은 main에서 검증한다(ARCHITECTURE §3 'Prototype window').
- 페이지 이동은 `will-frame-navigate`에서 막는다(`app/src/main/prototypeFrame.ts:17-35`). hash 링크와 `pushState`는 이 경로에 오지 않으므로 동작한다.
- **다른 프레임 고르기**: 프레임 메뉴 → `api.choose(frame)` → IPC `prototype:choose` → `controller.ts:225-229` → `windowState.ts:163-169` `choose`(현재 실행이 보고한 `state.frames` 안의 마크된 프레임만) → `playTarget`(`:149-155`) → `start`(`:113-137`: 창 맞춤, 실행 중단, gen 증가, 새 iframe, `recordEntry`). 연결 이동은 이 경로를 그대로 쓸 수 있다.
- **Back과 Forward**: `app/src/main/prototype/history.ts`(`recordEntry`, `stepHistory`, `canStep`). 항목은 `{target: {root, canvas, frame}, size}`다. 지금은 main 창의 Play, `doan open --prototype`, 프레임 메뉴 선택이 기록된다.
- **대화 패널**: 대화 범위는 캔버스 단위다(`conversationScope.ts:17-21`). 같은 캔버스 안의 프레임 이동은 대화 범위를 바꾸지 않는다. 메시지에 붙는 "재생 중인 프레임" 칩만 `view.frame`을 따라간다(`renderer/prototype/conversation.ts:37-66`).

### 마크와 `doan check`

- Go: `cli/internal/canvas/canvas.go`(`Frame.Prototype`, `StrayPrototypes`, 마크 정규식, `Parse`의 `visit`). 지금 `visit`는 요소를 감싼 프레임을 기록하지 않는다(`:119`). `canvas.PrototypeTarget`(`prototype.go:32-53`).
- TS: `app/src/main/prototype/mark.ts`. 주입 스크립트는 같은 문자열을 따로 가진다(`prototypeScript.ts:22`).
- 공유 fixture: `schema/fixtures/prototype-mark/cases.json`(`values`, `placements`). Go(`canvas/prototype_test.go`, `check/check_test.go:389-440`, `formats/validate_test.go`)와 TS(`mark.test.ts`, `prototypeScript.test.ts`, `formats/validate.test.ts`, `eval/scenarios/W7/checks.test.ts`)가 읽는다.
- `doan check` 규칙은 `cli/internal/check/check.go`의 `Run()` 안에 차례로 있다. `invalid_prototype_size`(`:168-178`), `prototype_not_frame`(`:179-185`), 무엇을 가리키는 속성의 예로 `implements_not_found`(`:186+`). 문서 표는 ARCHITECTURE §1(`:43-66`), 코드 순서와 같다.

### 내보내기

- 앱: 창의 Export → `index.ts:962-975` `createPrototypeExport` → `cli.ts:63-67`(`export <path> --frame=<id> --prototype -o <file> --force --repo <root> --json`). `ExportTarget`(`prototype/ipc.ts:231-235`)과 `exportTargetMatches`(`requests.ts:156`)는 프레임 하나를 비교한다.
- CLI: `cli/internal/cli/export.go:28-124`. `exportInput`(`prototype_rules.go:23-46`)는 `--frame`을 하나만 받는다. `export.AssemblePrototype`(`assemble.go:78-124`)가 `viewer/prototype.html` 한 장을 만든다. 캔버스 전체가 `srcdoc` iframe에 들어가고, `isolate.js`가 `const FRAME = <json>;` 하나로 그 프레임만 남긴다.
- `isolate.js`의 click 처리(`:44-57`)가 모든 링크를 막고 `#` hash만 받는다. 새 속성을 가로챌 자리다. 지금 격리는 형제 요소를 영구히 숨기므로(`:61-84`) 프레임을 바꾸려면 srcdoc를 다시 읽거나 격리를 다시 해야 한다.
- 캔버스 전체가 이미 한 번 인라인되므로 묶음이 커져도 자산 바이트는 늘지 않는다. 한도는 50 MiB(`inline.go:15`).
- `app/src/main/exportViewer.test.ts:1161-1210`은 `isolate.js`가 `prototypeScript.ts`와 같은 격리 시트와 KEEP 목록을 갖는지 검사한다. 하위 2와 3이 둘 다 이 테스트를 건드릴 수 있다.

### 가이드와 eval

- 가이드 `cli/internal/cli/skill.md`: 출력 예산 21,600 B(`skill_test.go:248`). 설치된 0.1.12의 `--json` 출력이 21,592 B로 8 B 남았다. 프로토타입 부분은 convention 14(`:30`)와 명령(`:58-59`)이다. 체인 `chain-261114-2` 링크 3(`canvas-edit-awareness`)도 가이드를 줄이고 고친다. 하위 2는 그 링크가 병합된 뒤의 가이드에서 시작한다.
- eval: W7(마크 쓰기), W8(`doan open --prototype`), X2(내보낸 파일을 기준 파일과 바이트 비교). 세 시나리오가 같은 `onboarding.html` seed를 쓴다. 시나리오는 첫 기록 뒤 고정되므로 바뀌면 새 id를 쓴다(ARCHITECTURE §14).

## 하위 1의 범위: `prototype-link-convention`

- convention 15: `data-doan-goto`의 문법(값의 형식, 빈 값, 공백, 길이 한도 200 UTF-16), 놓일 수 있는 곳(마크된 프레임 안, 프레임 자신에 다는 것, 중첩 프레임 안), `<template>` 안의 처리.
- Go `canvas.Parse`가 연결마다 요소를 감싼 가장 안쪽 프레임과 값을 기록한다.
- `doan check` 규칙과 심각도: 대상 프레임 없음, 대상 id 공유, 대상에 마크 없음, 마크 없는 프레임 안이나 프레임 밖의 연결, 자기 자신으로 가는 연결. 각 규칙의 이름과 메시지는 하위 1이 정한다.
- 묶음 계산: 연결을 방향 없이 따라 마크된 프레임을 묶는다. 재생할 수 없는 대상으로 가는 연결은 묶음을 잇지 않는다. Go(export, 하위 3)와 TS(프레임 서랍, 하위 2)가 같은 결과를 내야 하므로 공유 fixture로 고정한다.
- 공유 fixture(`schema/fixtures/` 아래)와 Go·TS 테스트, TS 파서(주입 스크립트가 같은 규칙을 따로 가짐).
- 가이드는 바꾸지 않는다(하위 2).

## 하위 2의 범위: `prototype-link-play`

- 주입 스크립트가 클릭을 받는다. 캔버스 스크립트 뒤(bubble 단계 끝, `defaultPrevented` 확인)에서 판단하고, 새 메시지 종류로 main에 보낸다.
- main이 메시지를 검증하고(현재 실행, 현재 gen, 대상이 현재 실행이 보고한 마크된 프레임) `choose`와 같은 경로로 이동한다.
- 재생할 수 없는 대상의 토스트 문구와 모양(프로토타입 창에 토스트 자리가 있는지부터).
- 프레임 서랍의 묶음(결정 8): 주입 스크립트가 프레임 목록과 함께 연결을 보고하고(`parseFramesReport` 확장), 렌더러가 하위 1의 묶음 계산으로 나눈다. 묶음의 모양(머리 이름, 구분선), 묶음과 프레임의 순서, 연결 없는 프레임의 자리, 지금 재생 중인 묶음 표시를 초안으로 정한다. 프레임 서랍은 `PrototypeWindow.tsx`의 `FrameMenu`(556행 근처)다.
- 대화 패널의 "재생 중인 프레임" 칩, 창 제목, 프레임 메뉴가 이동을 따라가는지 확인한다.
- 가이드 문구와 줄일 곳, `/agent-eval` 새 시나리오(연결 쓰기, `doan check` 통과).
- PRODUCT §5 item 2 'Prototype window'의 "frames do not link to each other"와 'Content'를 고친다.

## 하위 3의 범위: `prototype-link-export`

- 묶음 계산(방향 무시, 재생 가능한 대상만 따라감)을 Go에 둔다. 창의 Export와 `doan export --prototype`이 같은 규칙을 쓴다.
- `doan export --frame <id> --prototype`이 묶음을 자동으로 담는지, 플래그를 따로 두는지.
- `isolate.js`와 `prototype.js`의 프레임 전환, hash 기록과 브라우저 Back·Forward, 대상이 재생할 수 없을 때(파일 안에는 토스트가 없음).
- 파일 이름(`<stem>-<frame>.html` 그대로인지), 앱의 `ExportTarget` 비교.
- X2의 기준 파일이 바뀌므로 새 시나리오 id가 필요한지 판단한다.
- PRODUCT §5 item 3 'Export and viewer'와 ARCHITECTURE §12를 고친다.
