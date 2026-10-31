# design-system-canvases — design

## 결정 (사용자 확정, 2026-10-31)

- **Q1 위치가 곧 유형이다**(사용자 답 "디렉터리가 곧 유형"): `.doan/ds/` 아래 HTML이면 design-system 캔버스다. 새 meta, `doan ls` 필드, `doan check` 규칙이 없다. 에이전트와 앱이 경로 하나로 같은 판단을 한다.
- **Q2 진입점은 `document` preset 확장**(사용자 답): 처음 만들기와 유지 모두 `document`가 한다. 사람이 요청할 때만 돈다(PRODUCT §3 Out of scope 4). catalog 20개, CLI 명령, `doan init`은 그대로다.
- **Q3 앱은 sidebar만 바꾼다**(사용자 답 "따로 묶어 보임", 이어서 "사이드바만 이 과업에서 진행한다. 프로젝트 오버뷰는 그 과업 진행 시"): sidebar에 'Design system' 묶음을 둔다. Overview는 buzz-restyle `buzz-project`(#7)가 정한다.
- **Q4 이 repo의 design system을 지우고 다시 만든다**(`/feature-review` 중 사용자 답 "도안 리포의 ds 관련 캔버스는 모두 제거하고, ds 폴더에 document로 다시 생성하고 품질 검증", "품질을 보고, 만족될 때 까지 디자인시스템 생성 스킬도 조정한다", "품질 판단은 지휘자가 진행", "클로드와 코덱스 각각 ds 문서를 만들고 품질 검수는 지휘자가. 품질 검수 끝나면 더 나은 거 한벌만 남기고 정리"): `.doan/canvases/buzz-ds.html`과 `notice.html`을 지우고, 확장한 `document`로 `.doan/ds/`에 논리 단위별 캔버스를 처음부터 만든다. Claude Code와 Codex가 같은 시작 commit, 같은 CLI, 같은 프롬프트로 서로 다른 worktree에서 한 벌씩 만든다. 이 task에 한해 사용자가 모델 계열을 넘는 worker를 허용했다(AGENTS.md 'Worker model boundary'). 지휘자(`/orchestrate` 세션)가 두 벌을 아래 '품질 기준'으로 판단한다. 기준에 못 미치면 `document` preset을 고치고, 두 모델 모두 다시 만든다. 남기는 벌이 최종 preset에서 나와야 하기 때문이다. 기준을 채우면 더 나은 한 벌만 `.doan/ds/`에 남기고 다른 벌과 worktree를 정리한다. 마지막 구현 task다. eval 라운드와 문서 승격이 최종 preset을 보도록 그 앞에 둔다. 두 캔버스 모두 코멘트 파일이 없어서(`.doan/comments/` 없음) 지워도 코멘트가 고아가 되지 않는다. 사이드바 초안 `design-system-canvases.html`은 화면 초안이라 지우지 않는다.
- **Q5 Home 추천은 화면 초안만 센다**(사용자 답): '캔버스 없음'과 `critique`·`polish` 대상은 `.doan/canvases/`만 본다. `document`는 `.doan/ds/`가 비었을 때 추천한다.
- **Q6 sidebar는 두 아코디언이다**(`/design-draft` 중 사용자 답 "프로젝트 아래에 디자인시스템 목록과 캔버스 목록을 별개로. 열고닫을 수 있는 아코디언과 갯수 뱃지. empty 상태에도 보임"): 펼친 프로젝트 아래에 'Design system'과 'Canvases' 묶음을 따로 두고, 각 묶음은 열고 닫을 수 있으며 캔버스 수 배지를 단다. 비어 있어도 보인다.
- **Q7 순서는 Design system 먼저**(사용자 답): 짧고 잘 안 바뀌는 목록이 위에 있어서, 캔버스가 많아도 밀려 내려가지 않는다.
- **Q8 아이콘을 나눈다**(사용자 답 "아이콘은 다르게 가야함. ds 캔버스 아이콘은 그에 어울리는 걸로", "캔버스 아이콘이 너무 중의적이면 캔버스 아이콘도 이번에 바꾼다"): design-system 캔버스는 lucide `SwatchBook`, 캔버스는 지금의 `Palette` 대신 lucide `PanelsTopLeft`를 쓴다. `Palette`를 `SwatchBook` 옆에 두면 둘 다 '색'으로 읽히기 때문이다. 같은 아이콘을 쓰는 Quick Open(`QuickOpenDialog.tsx`)도 바꾼다. 결과 행은 경로에 따라 두 아이콘 가운데 하나를 쓰고, Canvases 탭은 두 종류를 모두 담으므로 `PanelsTopLeft`를 쓴다. 배치는 그대로이고, 초안에는 그리지 않는다.
- **Q9 옛 위치 design system의 Home 회귀를 받아들인다**(`/feature-review` 중 사용자 답): `isDesignSystem`을 지우면 `.doan/canvases/design-system.html`만 있는 프로젝트에 `document`가 다시 추천되고, 그 파일이 `critique`·`polish` 대상이 될 수 있다. Home에 옛 경로 예외를 두지 않는다.
- **Q10 현재 캔버스가 든 묶음도 닫을 수 있다**(사용자 답 "닫을 수 있고 굳이 표시도 안한다"): 닫으면 `aria-current` 행이 숨는다. 묶음 머리나 프로젝트 행에 현재 위치를 따로 표시하지 않는다. 확정 초안의 `groups` fnote와 같다.
- **Q11 ←/→는 앱의 tree 규칙(APG)을 따른다**(사용자 답): 프로젝트 행과 Canvas 패널(PRODUCT §5)과 같은 꼴이다. 자세한 키는 아래 'sidebar'.
- **Q12 펼침 상태를 기억하고, 열린 캔버스가 바뀌면 그 묶음을 연다**(사용자 답 "기억하되, 선택 캔버스 묶음을 닫은 경우에는 펼침", "열린 캔버스가 바뀔 때마다"): 닫힌 묶음은 이 기기에 저장한다. 앱을 다시 켜서 캔버스를 복원하거나, 어디서든 다른 캔버스를 열거나, 열린 캔버스가 다른 묶음으로 옮겨지면 그 캔버스가 든 묶음을 연다. 같은 캔버스에 머물러 있는 동안 사람이 닫은 묶음은 그대로 둔다.

## 영향 받는 구성 요소

### CLI (Go)

- `cli/internal/repo/files.go`: 캔버스 목록이 `.doan/canvases/`와 `.doan/ds/`를 같은 규칙으로 걷는다(`.`으로 시작하는 이름 제외, symlink인 `.doan`·디렉터리는 건너뜀, 정규 파일, 확장자 `.html` 대소문자 무시). 결과는 합쳐서 path byte 순서다.
- `cli/internal/repo/scope.go`: 기본 서빙 목록에 `.doan/ds`를 더한다. `MetadataPath`의 예외에도 `.doan/ds`를 더한다. 그래서 `doan config --add-serve`의 `.doan` 메타데이터 거절 규칙과 `css_not_served`가 함께 맞춰진다.
- `cli/internal/check/check.go`: `no_canvases`가 두 디렉터리 모두 비었을 때만 나오고, 메시지가 두 디렉터리를 말한다. `path`는 `.doan/canvases/` 그대로 둔다(메시지는 계약이 아니다, ARCHITECTURE §1).
- `doan init`은 바꾸지 않는다. `.doan/ds/`는 `.doan/assets/`처럼 필요할 때 에이전트가 만든다.
- guide `cli/internal/cli/skill.md`: 다음 네 곳에 `.doan/ds/`를 넣는다.
  - Project files 목록(:11, `canvases/*.html`, `assets/`)
  - 컨벤션 1
  - 컨벤션 7의 서빙 범위 목록
  - `config` 설명의 "(only `canvases/` and `assets/` are served)"(:45)

  remove-mcp 뒤 원본은 17,038 B이고, 예산은 21,600 B다(`skillOutputBudget`, `TestSkillGuideFitsToolOutputCap`). 렌더링된 plain·`--json` 크기는 guide·preset task를 시작할 때 다시 잰다. 문장을 늘리지 않고 기존 문장을 고친다.
- preset 본문 `cli/internal/designskill/presets/`:
  - `document.md`: 'Before you start'(기존 design system 찾기: `.doan/ds/`, 그다음 `.doan/canvases/design-system.html`), 'Step 5'(아래 '`document`의 새 기본'), 'Keep the two in agreement'와 'Verify'(캔버스가 여럿). 가장 많이 늘어나는 본문이라 `design-skill document --json` 출력도 같은 예산(`TestDesignSkillFitsToolOutputCap`) 안에 있어야 한다.
  - 나머지 18개(`adapt` `animate` `audit` `bolder` `colorize` `context` `critique` `delight` `distill` `extract` `generate` `harden` `layout` `onboard` `polish` `quieter` `shape` `typeset`): `.doan/canvases/design-system.html` 한 경로나 `design-system` 캔버스 하나를 "the design-system canvases in `.doan/ds/` (or a legacy `.doan/canvases/design-system.html`)" 뜻으로 바꾼다. 대상은 `rg -n 'design-system' cli/internal/designskill/presets/` 결과다. `context.md:97`의 `document` 트리거 조건("no … `design-system` canvas")도 같은 뜻으로 고친다.
  - `cli/internal/designskill/SOURCES.md`의 `document.md` 행과 'Canvas' 결정 줄, `notices/MODIFICATIONS.md`의 수정 기록을 맞춘다.

### `document`의 새 기본 (Step 5 대체)

- 위치는 `.doan/ds/`다. 프로젝트에 design-system 캔버스가 하나도 없으면 논리 단위마다 캔버스 하나를 제안한다(Q4 사용자 답 "컬러, 타이포, 그림자, 곡률, 사이즈, 버튼, 노티스, 앱셸 등등 논리 단위로"). 단위는 세 종류다.
  - 토큰 그룹: `color`, `typography`, `shadow`, `radius`, `size` 가운데 코드에 있는 것
  - 컴포넌트: `button`, `notice`처럼 코드의 컴포넌트 하나
  - 공용 화면 단위: `app-shell`처럼 여러 컴포넌트를 묶어 여러 화면이 함께 쓰는 틀

  한 캔버스에 두 단위를 섞지 않는다. 파일 이름이 곧 캔버스 id다(`.doan/ds/button.html` → `button`). `doan ls`에 같은 id가 이미 있으면 다른 id를 고르고 답변에 적는다.
- 각 캔버스는 기존 규칙을 그대로 지킨다: `doan:canvas`·`doan:width`, token CSS를 캔버스 위치 기준 상대 경로로 링크(`.doan/ds/`는 `.doan/canvases/`와 깊이가 같다), 프레임마다 `data-doan-implements`, 색과 글자는 token 변수, 코드에 없는 것은 캔버스에 표시.
- 이미 `.doan/ds/`가 있거나 `.doan/canvases/design-system.html`이 있으면 그 구성을 기존 design system으로 읽고 재사용 규칙(충분하면 다시 만들지 않는다)을 따른다. 옛 위치의 캔버스를 `.doan/ds/`로 옮기는 것은 사용자가 요청하거나 동의할 때만 한다. 옮길 때 id는 바꾸지 않는다(에이전트 규칙 H).
- 유지 요청: 코드와 어긋난 캔버스·프레임만 고치고, 범위 밖 캔버스·프레임·id는 그대로 둔다. 새 컴포넌트는 새 캔버스로 더한다.
- 규칙 문서(`DESIGN.md` 등)는 지금처럼 `.doan/` 밖에 하나 둔다. 캔버스가 여럿이어도 문서와 캔버스들이 같은 토큰·컴포넌트·open item을 가리킨다.

### 앱 (Electron + TS)

- 경로 판단을 순수 함수 하나로 모아 `app/src/formats/`에 둔다(main·renderer 공용). 아래의 경로 비교, toast의 디렉터리 이름, sidebar 묶음과 아이콘이 모두 이 함수를 쓴다. buzz-project(#7)의 Overview도 같은 함수와 'Design system' 라벨을 쓸 수 있다. 지금 `.doan/canvases/`를 직접 비교하는 곳:
  - `app/src/main/watch.ts`: `.doan/ds/`에 `.doan/canvases/`와 같은 재귀 감시 대상(REREAD, 이름 전달)을 더한다. 부모 `.doan/` 감시가 이미 있어서 다시 생긴 디렉터리를 본다. `.doan` 루트 이벤트를 BOTH로 분류하는 이름 목록(:132, 지금 `canvases`·`assets`)에 `ds`를 더한다. 이것이 없으면 `.doan/ds`를 지웠다 다시 만들 때 `servedRev`가 오르지 않는다. symlink 처리(`lstat`, :174)도 같게 적용한다. 지웠다 다시 만드는 테스트에서 `served: true`를 단언한다(POSTMORTEM, 아래).
  - 감시 계약 `Change.names`: 지금은 `.doan/canvases/` 기준 상대 이름이라(:13-16), 여러 이벤트를 합치면 두 디렉터리의 `a.html`을 구별하지 못한다. repo 기준 상대 경로(`.doan/canvases/a.html`, `.doan/ds/a.html`)로 바꾸고, 감시 대상마다 자기 접두사를 붙인다.
  - `app/src/main/designChange.ts`: repo 기준 상대 경로를 받아 그대로 `revPaths`로 쓴다(지금의 `.doan/canvases/${name}` 고정, :35를 없앤다). 캔버스 HTML은 그 행의 `rev`, 그 밖의 파일은 `servedRev`. 호출부 `app/src/main/shell.ts`(:101-103)를 함께 맞춘다.
  - `app/src/main/thumbnails.ts` `isCanvas`.
  - `app/src/main/conversation/store.ts`의 저장된 캔버스 경로 검증, `transport.ts`·`acp.ts`의 `insideDesign`.
  - `app/src/renderer/App.tsx`·`quickOpen.ts`의 "was removed from .doan/canvases/" / "is no longer in .doan/canvases/" toast: 캔버스가 있던 디렉터리 이름을 넣는다.
  - `app/src/renderer/homeComposer.ts`: `isDesignSystem`을 지우고 Q5 규칙으로 바꾼다.
  - `app/src/renderer/ProjectSettingsDialog.tsx`의 serve 설명 "Canvases can read files in .doan/canvases/, the token CSS and these paths."에 `.doan/ds/`를 넣는다. 문구는 Doan의 `clarify` preset을 먼저 적용한다.
  - 그대로 두는 곳: `canvasTree.ts`(Overview 섹션, buzz-project 범위), onboarding의 변경 목록(`init`은 `.doan/ds/`를 만들지 않는다), `firstPromptView.ts`의 대기 문구, 주석 속 초안 경로.
- **sidebar** (`app/src/renderer/ShellSidebar.tsx`, Q6~Q8): 목록을 읽은(`list`) 프로젝트를 펼치면 선택한 워크트리 아래에 묶음 머리 두 개가 이 순서로 온다.
  - 'Design system'(`.doan/ds/` 행)과 'Canvases'(`.doan/canvases/` 행). 각 묶음 안의 순서는 지금의 캔버스 순서 규칙이다.
  - 묶음 머리는 tree item이다(`aria-level` 2, `aria-expanded`). 앞의 chevron은 펼침 상태를 보이고, 뒤의 배지는 그 묶음의 캔버스 수다(읽기 오류 행 포함, 코멘트 수가 아니다). 접근 가능한 이름은 `aria-label`의 라벨("Design system", "Canvases")이고, 개수는 "5 canvases"처럼 `aria-describedby`로 붙인다. typeahead는 라벨만 본다. 캔버스 행은 `aria-level` 3이다.
  - 마우스: 머리를 클릭하면 열고 닫는다. Option-click은 일반 클릭과 같다(묶음이 둘뿐이라 전체 펼치기를 두지 않는다).
  - 키(Q11, APG): 머리에서 Enter·Space는 열고 닫는다. →는 닫혀 있으면 열고, 열려 있으면 첫 캔버스 행으로 간다. 빈 묶음에서는 아무 일도 하지 않는다. ←는 열려 있으면 닫고, 닫혀 있으면 프로젝트 행으로 간다. 캔버스 행의 ←는 묶음 머리로 가고(지금은 프로젝트 행), 펼친 프로젝트 행의 →는 첫 묶음 머리로 간다. ↑/↓·Home/End·typeahead는 보이는 행(머리 포함)을 한 줄로 다닌다.
  - 비어 있는 묶음도 머리와 배지 `0`을 보이고, 열려 있으면 빈 줄을 보인다: Design system "No design system yet", Canvases "No canvases yet"(지금 문구).
  - 펼침 상태(Q12)는 처음에 열림이고, 프로젝트 펼침처럼 이 기기에 프로젝트별로 기억한다(device-local `ui-state.json`). `ShellProject`에 `groups?: { ds?: false; canvases?: false }`처럼 고정 id로 닫힘만 저장하고, 없으면 열림이다. 라벨이나 순서로 저장하지 않는다. sanitizer는 `app/src/restore/uiState.ts`(지금 모르는 필드를 버린다)와 `app/src/main/uiState.ts`에서 함께 맞춘다.
  - 열린 캔버스가 바뀌면 그 캔버스가 든 묶음을 열고 저장한다(Q12). 계기는 sidebar·Quick Open·Home 카드·toast·대화 연결로 열기, 재시작 복원, 열린 캔버스가 다른 디렉터리로 옮겨져 같은 id로 따라가기다. 현재 캔버스가 든 묶음도 사람이 닫을 수 있고, 현재 위치를 따로 표시하지 않는다(Q10).
  - 잠금 중에도 묶음은 열고 닫을 수 있다. 프로젝트 펼침과 접기를 잠금 중에도 허용하는 규칙(PRODUCT §5 item 1)과 같다.
  - 닫힌 묶음 안의 행은 '화면에 없음'이다. 그래서 그 행의 상태 slot은 지금 규칙(행이 화면에 없으면 프로젝트 행이 slot을 보인다)대로 프로젝트 행에 보인다. 지금 `shown`(`ShellSidebar.tsx:165`)은 펼친 프로젝트의 모든 캔버스 행을 세므로, `sidebarGroups`가 돌려주는 '보이는 행 키'를 `shown`과 키 이동 목록(:113-121)이 함께 쓴다. 묶음 머리에는 slot이 없다.
  - 목록을 읽지 못한 프로젝트(Not set up 등)는 묶음 없이 지금처럼 상태 한 줄을 보인다.
  - 아이콘: design-system 행은 `SwatchBook`, 캔버스 행은 `PanelsTopLeft`(Q8).
  - 'Design system'은 `document` preset 제목("Document the design system")과 같은 용어다. 크기·간격은 확정한 초안을 따른다.

### 초안 요청

- 경로·id: `.doan/canvases/design-system-canvases.html`, `design-system-canvases`. 출시된 sidebar(`ShellSidebar.tsx`, `styles.css`, DESIGN.md 'App shell')를 복사하고 묶음 머리와 두 아이콘만 새로 그린다.
- 프레임:
  - `groups` — 두 묶음이 열린 상태, Design system이 닫힌 상태, Canvases가 닫혀 있고 design-system 캔버스가 열린 상태.
  - `empty` — design-system 캔버스만 없을 때, 캔버스만 없을 때, 둘 다 없을 때, 목록을 읽지 못한 프로젝트.
  - `row-states` — design-system 행의 상태 slot(permission, working, unseen), 읽기 오류 행과 Details, 긴 이름, 잠긴 상태(`aria-disabled`), 묶음 머리의 hover와 키보드 초점.

### 형식

- JSON Schema 변경 없음. `v` 그대로. `doan ls` 결과 모양 그대로(경로가 유형을 말한다). config schema 그대로(`serve` 거절 규칙은 런타임 `MetadataPath`).
- 새 fixture 없음. schema에는 캔버스 경로를 `.doan/canvases/`로 제한하는 pattern이 없다. `app-socket.v2.schema.json`의 onboarding `changes` enum에 `.doan/canvases/`가 있지만 `doan init` 범위라 그대로 둔다(`init`은 `.doan/ds/`를 만들지 않는다).

### 품질 기준 (이 repo 재생성, 지휘자가 판단)

- 단위: 논리 단위마다 캔버스 하나다. 사용자가 든 단위(color, typography, shadow, radius, size, button, notice, app shell)와 코드에 있는 나머지 공용 컴포넌트(지금 `buzz-ds.html` 프레임이 다루는 icon button, panel, tooltip, menu, popover, dialog, toast, spinner, forms, focus·disabled 등)가 빠짐없이 어느 캔버스에 있다. 한 캔버스에 두 단위가 섞이지 않는다.
- 값: 토큰 캔버스의 값이 `app/src/renderer/tokens.css`와 같다. 컴포넌트 캔버스는 색과 글자에 token 변수를 쓰고, 날값을 쓰지 않는다.
- 근거: 프레임마다 `data-doan-implements`가 있고, 그 경로가 repo에 있다. 코드에 없는 상태나 변형은 그리지 않거나, 캔버스에 표시한다.
- 상태: 코드에 있는 상태(hover, focus, disabled, 오류 등)를 그 단위의 캔버스에서 보인다.
- 렌더: 격리한 앱에서 캔버스마다 스크린숏을 찍고, 같은 컴포넌트가 실제 앱에서 보이는 모습과 지휘자가 비교한다. 깨진 링크, 빠진 폰트, 겹침이 없다.
- 규칙 문서: `docs/DESIGN.md`가 가리키는 design system 참조와 캔버스들이 같은 토큰·컴포넌트를 가리킨다.
- `doan check --repo .`에 이 캔버스들의 error가 없다.

기준에 못 미치면 지휘자가 원인을 `document.md`의 문장으로 고친다. 생성한 캔버스를 지우고 두 모델의 새 세션이 처음부터 다시 만들게 한다. 두 벌이 모두 기준을 채우면 기준별로 비교해 더 나은 벌을 고르고, 고른 이유를 commit 메시지에 적는다. 캔버스를 손으로 고쳐 기준을 맞추지 않는다. preset이 고쳐져야 다른 프로젝트에서도 같은 품질이 나오기 때문이다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- Go `repo` 캔버스 목록: 두 디렉터리를 합친 path byte 순서, `.doan/ds/`만 있을 때, symlink인 `.doan/ds/` 건너뜀, 숨김 이름 제외.
- Go `repo.Scope`·`MetadataPath`: 기본 범위에 `.doan/ds`, `.doan/ds/x.css`가 메타데이터가 아님, `.doan/comments`는 여전히 메타데이터.
- Go `check`: 두 디렉터리 사이의 `duplicate_canvas_id`, `.doan/ds/`만 있을 때 `no_canvases` 없음, `.doan/ds/` CSS에 `css_not_served` 없음, `orphan_comment_file`이 `.doan/ds/` 캔버스 id를 셈.
- TS 경로 판단 함수(`app/src/formats/`, main·renderer 공용): 경로 → `canvases` | `ds` | 캔버스 아님. `.doan/dsx/`, `.doan/ds`(디렉터리 자체), 대소문자 `.HTML`.
- TS `sidebarGroups(rows, closed)`: 두 묶음(Design system 먼저)과 각 순서·개수, 빈 묶음, 닫힌 묶음을 뺀 '보이는 행 키'(키 이동과 slot의 `shown`이 함께 쓴다), 닫힌 묶음의 행이 `shown`에서 빠짐, 열린 캔버스가 바뀔 때 열 묶음, ←/→ 대상(Q11: 머리·첫 행·프로젝트 행, 빈 묶음의 →).
- TS `ui-state` sanitizer: `groups` 필드의 닫힘만 남기고 모르는 값은 버림.
- TS `suggestedPresets`·`suggestedPrompts`: Q5 규칙(design-system 캔버스만 있을 때, 화면 초안만 있을 때, 둘 다).
- TS `designChange`: repo 기준 상대 경로 입력, 두 디렉터리의 같은 파일 이름 구별, `.doan/ds/` 경로의 `rev`·`servedRev` 분류, 임시 저장 파일 무시 규칙 유지.
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

- **remove-mcp는 main에 merge됐다(#48).** MCP 서버 코드가 없으므로 새 preset 문장에 MCP 대안을 쓰지 않는다.
- **buzz-project(#7)**: Overview의 `.doan/ds/` 섹션 표시와, design-system 캔버스만 있는 프로젝트의 Home·Overview 불일치를 넘겨받는다. 마지막 task에서 buzz-restyle spec의 #7 행에 이 범위를 적고, 같은 spec 81행의 예시("디자인 시스템을 만들어줘" → `.doan/canvases/`)를 `.doan/ds/`로 고친다.

## eval

- 시나리오는 첫 라운드 뒤 고정이다(ARCHITECTURE §14). `.doan/canvases/design-system.html`을 기대하는 현재 세트의 D10c는 은퇴하고, 같은 seed·prompt로 `.doan/ds/`를 기대하는 D10d를 만든다. D10c는 `eval/scenarios/D10/checks.ts`의 `d10`을 그대로 부르는데, 그 checks는 `design_system_canvas` 경로를 고정하고 `changesWithin`이 `.doan/ds/`를 허용하지 않으며 `tokens_in_both`가 캔버스 하나만 읽는다. D10은 기록된 시나리오라 그 자리에서 고치지 않는다. D10d는 자기 checks를 둔다: `.doan/ds/` 캔버스가 1개 이상, 토큰이 ds 캔버스 전체와 규칙 문서 양쪽에 있음, 변경은 `.doan/ds/`까지 허용.
- D11d(옛 위치의 완전한 design system 재사용)는 그대로 유효하다. 새 preset도 그것을 재사용하고 옮기지 않아야 하므로 옛 위치 시나리오로 남긴다.
- 새 시나리오:
  - D11e: `.doan/ds/`에 기본과 다른 구성(예: `.doan/ds/design-system.html` 하나)으로 된 완전한 design system을 재사용한다 → 변경 없음, 기본 분할로 다시 나누지 않음. '재사용'과 '기존 구성 따르기'(spec 완료 조건 8)를 함께 본다.
  - D13: 기본 분할된 design system이 있고, 코드에 토큰 하나와 그것을 쓰는 버튼 상태가 더해진다 → 해당 캔버스 파일만 바뀌고, `doan ls`의 id 집합과 다른 캔버스·프레임은 그대로, `doan check` 통과.
- D12 rubric(`eval/scenarios/D12/rubric.md:1`)도 "a `design-system` canvas"를 금지 편집으로 든다. 의도를 명확히 하는 수정이면 그 자리에서 고칠 수 있다(ARCHITECTURE §14). `.doan/ds/`를 포함하는지 판단한다.

## POSTMORTEM에서 가져온 함정

- 2026-10-28 'unified project layout' 재발 기록(줄 570): 경로 접두사를 옮기면서 eval checker와 rubric이 새 디렉터리를 허용하지 않아 거짓 실패가 났다. 앱은 `rg -n '\.doan/canvases|"canvases"' app/src --glob '!*.test.*'`로, eval은 `rg -n 'canvases' eval/scenarios`로 `.doan/canvases/`만 허용하는 판정을 찾아 하나씩 판단한다. `startsWith.*canvases`만으로는 `watch.ts:132`, `designChange.ts:35`, toast를 놓친다.
- 서빙 대상 감시(줄 786~790): "When adding a watch target, add a delete-and-recreate test for it." `.doan/ds/`에도 지웠다 다시 만드는 테스트를 둔다.
- 2026-10-29 'Codex cut the middle out of the doan guide…': guide와 preset 본문 변경은 `skillOutputBudget` 테스트 안에 있어야 한다. `document.md`는 `TestDesignSkillFitsToolOutputCap`이 같은 예산으로 묶는다.
- 2026-10-22 'Filtering root `fs.watch` events by known names…': 루트 감시에서 알려진 이름만 걸러내면 자기 삭제를 놓친다. `.doan/ds/`는 루트가 아니라 `.doan` 이벤트의 이름 목록(:132)에 더하므로 이 분류를 바꾸지 않는다.

## PoC 의존

없음. 디렉터리를 하나 더 걷고, 서빙하고, 감시하는 일은 `.doan/canvases/`·`.doan/assets/`에서 이미 쓰는 경로다. 논리 단위별 분할이 에이전트에게 잘 따라지는지는 이 repo 재생성(Q4)과 eval(D10d, D13)이 확인한다.
