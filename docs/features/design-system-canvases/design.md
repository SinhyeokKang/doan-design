# design-system-canvases — design

## 결정 (사용자 확정, 2026-10-31)

- **Q1 위치가 곧 유형이다**(사용자 답 "디렉터리가 곧 유형"): `.doan/ds/` 아래 HTML이면 design-system 캔버스다. 새 meta, `doan ls` 필드, `doan check` 규칙이 없다. 에이전트와 앱이 경로 하나로 같은 판단을 한다.
- **Q2 진입점은 `document` preset 확장**(사용자 답): 처음 만들기와 유지 모두 `document`가 한다. 사람이 요청할 때만 돈다(PRODUCT §3 Out of scope 4). catalog 20개, CLI 명령, `doan init`은 그대로다.
- **Q3 앱은 sidebar만 바꾼다**(사용자 답 "따로 묶어 보임", 이어서 "사이드바만 이 과업에서 진행한다. 프로젝트 오버뷰는 그 과업 진행 시"): sidebar에 'Design system' 묶음을 둔다. Overview는 buzz-restyle `buzz-project`(#7)가 정한다.
- **Q4 이 repo의 캔버스를 옮기고 나눈다**(사용자 답 "옮기고 나눔"): 확장한 `document`를 이 repo에 실제로 돌려 기본 분할 제안을 먼저 검증한다. 두 캔버스 모두 코멘트 파일이 없어서(`.doan/comments/buzz-ds.jsonl`, `notice.jsonl` 없음) 옮기고 나눠도 코멘트가 고아가 되지 않는다.
- **Q5 Home 추천은 화면 초안만 센다**(사용자 답): '캔버스 없음'과 `critique`·`polish` 대상은 `.doan/canvases/`만 본다. `document`는 `.doan/ds/`가 비었을 때 추천한다.

## 영향 받는 구성 요소

### CLI (Go)

- `cli/internal/repo/files.go`: 캔버스 목록이 `.doan/canvases/`와 `.doan/ds/`를 같은 규칙으로 걷는다(`.`으로 시작하는 이름 제외, symlink인 `.doan`·디렉터리는 건너뜀, 정규 파일, 확장자 `.html` 대소문자 무시). 결과는 합쳐서 path byte 순서다.
- `cli/internal/repo/scope.go`: 기본 서빙 목록에 `.doan/ds`를 더한다. `MetadataPath`의 예외에도 `.doan/ds`를 더한다. 그래서 `doan config --add-serve`의 `.doan` 메타데이터 거절 규칙과 `css_not_served`가 함께 맞춰진다.
- `cli/internal/check/check.go`: `no_canvases`가 두 디렉터리 모두 비었을 때만 나오고, 메시지가 두 디렉터리를 말한다. `path`는 `.doan/canvases/` 그대로 둔다(메시지는 계약이 아니다, ARCHITECTURE §1).
- `doan init`은 바꾸지 않는다. `.doan/ds/`는 `.doan/assets/`처럼 필요할 때 에이전트가 만든다.
- guide `cli/internal/cli/skill.md`: 컨벤션 1에 `.doan/ds/`를 넣고, 컨벤션 7의 서빙 범위 목록에 `.doan/ds/`를 넣는다. 현재 plain 20,471 B, 예산 21,600 B라 남은 여유가 약 1.1 KB다. 문장을 늘리지 않고 기존 문장을 고친다.
- preset 본문 `cli/internal/designskill/presets/`:
  - `document.md`: 'Before you start'(기존 design system 찾기: `.doan/ds/`, 그다음 `.doan/canvases/design-system.html`), 'Step 5'(아래 '`document`의 새 기본'), 'Keep the two in agreement'와 'Verify'(캔버스가 여럿).
  - `adapt`·`bolder`·`colorize`·`distill`·`extract`·`onboard`·`polish`: `.doan/canvases/design-system.html` 한 경로를 "the design-system canvases in `.doan/ds/` (or a legacy `.doan/canvases/design-system.html`)" 뜻으로 바꾼다.
  - `SOURCES.md`의 `document.md` 행과 'Canvas' 결정 줄, `notices/MODIFICATIONS.md`의 수정 기록을 맞춘다.
- MCP: 도구가 `cli.Run`을 감싸므로 코드 변경이 없다. remove-mcp가 먼저 merge되면 MCP 자체가 없다.

### `document`의 새 기본 (Step 5 대체)

- 위치는 `.doan/ds/`다. 프로젝트에 design-system 캔버스가 하나도 없으면 토큰 그룹별 캔버스(예: `color`, `typography`, `spacing`, `radius`, `elevation` 가운데 코드에 있는 것)와 대표 컴포넌트별 캔버스(5~10개)를 제안한다. 파일 이름이 곧 캔버스 id다(`.doan/ds/button.html` → `button`). `doan ls`에 같은 id가 이미 있으면 다른 id를 고르고 답변에 적는다.
- 각 캔버스는 기존 규칙을 그대로 지킨다: `doan:canvas`·`doan:width`, token CSS를 캔버스 위치 기준 상대 경로로 링크(`.doan/ds/`는 `.doan/canvases/`와 깊이가 같다), 프레임마다 `data-doan-implements`, 색과 글자는 token 변수, 코드에 없는 것은 캔버스에 표시.
- 이미 `.doan/ds/`가 있거나 `.doan/canvases/design-system.html`이 있으면 그 구성을 기존 design system으로 읽고 재사용 규칙(충분하면 다시 만들지 않는다)을 따른다. 옛 위치의 캔버스를 `.doan/ds/`로 옮기는 것은 사용자가 요청하거나 동의할 때만 한다. 옮길 때 id는 바꾸지 않는다(에이전트 규칙 H).
- 유지 요청: 코드와 어긋난 캔버스·프레임만 고치고, 범위 밖 캔버스·프레임·id는 그대로 둔다. 새 컴포넌트는 새 캔버스로 더한다.
- 규칙 문서(`DESIGN.md` 등)는 지금처럼 `.doan/` 밖에 하나 둔다. 캔버스가 여럿이어도 문서와 캔버스들이 같은 토큰·컴포넌트·open item을 가리킨다.

### 앱 (Electron + TS)

- 경로 판단을 순수 함수 하나로 모은다(아래). 지금 `.doan/canvases/`를 직접 비교하는 곳:
  - `app/src/main/watch.ts`: `.doan/ds/`에 `.doan/canvases/`와 같은 재귀 감시 대상(REREAD, 이름 전달)을 더한다. 부모 `.doan/` 감시가 이미 있어서 다시 생긴 디렉터리를 본다. 지웠다 다시 만드는 테스트를 더한다(POSTMORTEM, 아래).
  - `app/src/main/designChange.ts`: 감시자가 넘긴 이름을 디렉터리별로 `revPaths`로 바꾼다. `.doan/ds/`의 캔버스 HTML은 그 행의 `rev`, 그 밖의 파일은 `servedRev`.
  - `app/src/main/thumbnails.ts` `isCanvas`.
  - `app/src/main/conversation/store.ts`의 저장된 캔버스 경로 검증, `transport.ts`·`acp.ts`의 `insideDesign`.
  - `app/src/renderer/App.tsx`·`quickOpen.ts`의 "was removed from .doan/canvases/" / "is no longer in .doan/canvases/" toast: 캔버스가 있던 디렉터리 이름을 넣는다.
  - `app/src/renderer/homeComposer.ts`: `isDesignSystem`을 지우고 Q5 규칙으로 바꾼다.
  - `app/src/renderer/ProjectSettingsDialog.tsx`의 serve 설명 "Canvases can read files in .doan/canvases/, the token CSS and these paths."에 `.doan/ds/`를 넣는다. 문구는 Doan의 `clarify` preset을 먼저 적용한다.
  - 그대로 두는 곳: `canvasTree.ts`(Overview 섹션, buzz-project 범위), onboarding의 변경 목록(`init`은 `.doan/ds/`를 만들지 않는다), `firstPromptView.ts`의 대기 문구, 주석 속 초안 경로.
- **sidebar** (`app/src/renderer/ShellSidebar.tsx`): 선택한 워크트리의 행을 두 묶음으로 나눈다. 먼저 `.doan/canvases/` 행(지금 순서 규칙), 다음에 'Design system' 묶음과 `.doan/ds/` 행(같은 순서 규칙). 묶음 제목은 tree item이 아니다(초점, 펼침 상태, 저장 없음). tree에서는 `role="group"`과 `aria-label="Design system"`으로 묶고, ↑/↓·Home/End·typeahead는 두 묶음의 행을 한 줄로 이어서 다닌다. `.doan/ds/` 행만 있으면 묶음만 보인다. 두 디렉터리 모두 비었을 때의 기존 표시는 그대로다. 크기·간격·제목 모양은 `/design-draft`가 그린 초안을 사용자가 확정한 뒤 정한다. 'Design system'은 `document` preset 제목("Document the design system")과 같은 용어다.

### 형식

- JSON Schema 변경 없음. `v` 그대로. `doan ls` 결과 모양 그대로(경로가 유형을 말한다). config schema 그대로(`serve` 거절 규칙은 런타임 `MetadataPath`).
- 새 fixture 없음. `sessions.v1`·`app-socket.v1` schema는 캔버스 경로를 `.doan/canvases/`로 제한하지 않는다(`rg -n canvases schema/*.schema.json` 결과 없음).

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- Go `repo` 캔버스 목록: 두 디렉터리를 합친 path byte 순서, `.doan/ds/`만 있을 때, symlink인 `.doan/ds/` 건너뜀, 숨김 이름 제외.
- Go `repo.Scope`·`MetadataPath`: 기본 범위에 `.doan/ds`, `.doan/ds/x.css`가 메타데이터가 아님, `.doan/comments`는 여전히 메타데이터.
- Go `check`: 두 디렉터리 사이의 `duplicate_canvas_id`, `.doan/ds/`만 있을 때 `no_canvases` 없음, `.doan/ds/` CSS에 `css_not_served` 없음, `orphan_comment_file`이 `.doan/ds/` 캔버스 id를 셈.
- TS 경로 판단 함수(main·renderer 공용): 경로 → `canvases` | `ds` | 캔버스 아님. `.doan/dsx/`, `.doan/ds`(디렉터리 자체), 대소문자 `.HTML`.
- TS `sidebarGroups(rows)`: 두 묶음과 각 순서, 한쪽만 있을 때, 키 이동 순서.
- TS `suggestedPresets`·`suggestedPrompts`: Q5 규칙(design-system 캔버스만 있을 때, 화면 초안만 있을 때, 둘 다).
- TS `designChange`: `.doan/ds/` 이름의 `rev`·`servedRev` 분류, 임시 저장 파일 무시 규칙 유지.
- TS 사라진 캔버스 toast 문구(디렉터리 이름 포함).

## 컨벤션 영향

- ARCHITECTURE §1 'Project directory': `.doan/`에 `ds/`가 더해지고 기본 서빙에 들어간다.
- 캔버스 컨벤션 1: "`.doan/canvases/` 또는 `.doan/ds/` 아래 HTML 파일 하나가 캔버스 하나다. `.doan/ds/`는 design-system 캔버스(토큰, 컴포넌트, 그 규칙)를 둔다." 컨벤션 7의 서빙 범위 목록.
- `doan check` 규칙 표: 새 code 없음. `no_canvases` 조건, `css_not_served`의 범위 설명.
- 에이전트 규칙 A~H는 그대로다.

## 결정 영향

- 서빙 범위가 넓어진다(ARCHITECTURE §3): `.doan/ds/`는 `.doan/canvases/`와 같은 성격의 파일(에이전트가 쓴 캔버스와 그 자산)이라 비밀이 섞일 위험이 늘지 않는다. 설정·코멘트는 계속 범위 밖이다(`MetadataPath`).
- sandbox iframe, append-only 코멘트, 토큰 처리 없음, git 작업 없음은 그대로다. 캔버스 이동은 에이전트가 파일을 옮기는 것이고 앱·CLI는 git을 쓰지 않는다.
- 코멘트 파일 `.doan/comments/<id>.jsonl`의 id 이름 공간은 두 디렉터리가 함께 쓴다. 그래서 id 중복을 두 디렉터리에 걸쳐 검사한다.
- PRODUCT §5 item 1 'Design presets'(Home 추천 규칙), item 13 `document` 설명, item 1 sidebar 설명, 'Dogfooding' 절이 바뀐다.

## 순서와 다른 feature

- **remove-mcp가 먼저다.** remove-mcp T5가 같은 preset 본문 19개, guide, `MODIFICATIONS.md`를 고치고 T3이 D10b를 지운다. 이 feature의 구현은 remove-mcp가 main에 merge된 뒤 시작한다. 그래서 새 preset 문장에 MCP 대안을 쓰지 않는다.
- **buzz-project(#7)**: Overview의 `.doan/ds/` 섹션 표시를 넘겨받는다. 마지막 task에서 buzz-restyle spec의 #7 행에 이 범위를 적는다.

## eval

- 시나리오는 첫 라운드 뒤 고정이다(ARCHITECTURE §14). `.doan/canvases/design-system.html`을 기대하는 현재 세트의 D10c는 은퇴하고, 같은 seed·prompt로 `.doan/ds/`를 기대하는 D10d를 만든다.
- D11d(옛 위치의 완전한 design system 재사용)는 그대로 유효하다. 새 preset도 그것을 재사용하고 옮기지 않아야 하므로 옛 위치 시나리오로 남긴다.
- 새 시나리오: D11e(`.doan/ds/`에 나뉜 완전한 design system 재사용 → 변경 없음), D13(나뉜 design system이 있고 코드에 토큰 하나와 그것을 쓰는 버튼 상태가 더해짐 → 해당 캔버스만 고치고 다른 캔버스·프레임·id는 그대로, `doan check` 통과).

## POSTMORTEM에서 가져온 함정

- 2026-10-28 'unified project layout' 재발 기록(줄 570): 경로 접두사를 옮기면서 eval checker와 rubric이 새 디렉터리를 허용하지 않아 거짓 실패가 났다. `rg -n 'startsWith.*canvases' eval app/src`로 `.doan/canvases/`만 허용하는 판정을 찾아 하나씩 판단한다.
- 서빙 대상 감시(줄 786~790): "When adding a watch target, add a delete-and-recreate test for it." `.doan/ds/`에도 지웠다 다시 만드는 테스트를 둔다.
- 2026-10-29 'Codex cut the middle out of the doan guide…': guide와 preset 본문 변경은 `skillOutputBudget` 테스트 안에 있어야 한다. guide 여유는 약 1.1 KB다.
- 2026-10-22 'Filtering root `fs.watch` events by known names…': 루트 감시에서 알려진 이름만 걸러내면 자기 삭제를 놓친다. `.doan/ds/` 추가가 이 분류를 바꾸지 않게 한다.

## PoC 의존

없음. 디렉터리를 하나 더 걷고, 서빙하고, 감시하는 일은 `.doan/canvases/`·`.doan/assets/`에서 이미 쓰는 경로다. 토큰 그룹별·컴포넌트별 분할이 에이전트에게 잘 따라지는지는 eval(D10d, D13)과 이 repo 적용(Q4)이 확인한다.
