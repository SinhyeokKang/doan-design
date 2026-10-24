# app-setup — 설계

## 디자인 레퍼런스

- Sorcerer(github.com/gbrasil720/sorcerer, MIT)를 기본 레퍼런스로 삼는다. 2026-10-22 테마 결정의 출처다.
- 필요하면 AGENTS.md가 꼽은 레퍼런스 서비스(Claude Design, Orca, ego-browser, Storybook 등)도 직접 확인한다(사용자 허용 2026-10-25).
- Settings 창, 연결 상태 표시, 셋업 흐름의 초안을 그릴 때 해당 화면을 확인하고, 가져온 것을 초안에 출처와 함께 적는다. 이 문서를 쓰는 시점에는 아직 확인하지 않았다.

## 영향받는 구성 요소

| 구성 요소 | 바뀌는 것 |
|---|---|
| 앱 renderer | 새 진입점 `settings.html` + `settings.tsx`(Connections·Projects 탭). 메인 창 홈에 연결 칩, 배너, Finish 카드. `Onboarding.tsx`: 문구, 2단계 설치 링크, 3단계 추가 판정, 4단계 Add Project·Canvas ready. 새 공유 컴포넌트 `FirstPrompt`(입력란 + 문장 미리보기 + Copy + 대기). |
| 앱 main | Settings 창(단일 인스턴스, 닫으면 파괴). 창별 IPC 허용 목록(`senderAllowed`). 설정 세션을 창별로 둔다. 확인 대화상자는 창 하나만 띄운다. 상태 이벤트는 두 창 모두에 보낸다. `onboarding/states.ts`의 `LinkState`에 `dangling`을 더하고, 연결 요약 IPC를 둔다. 메뉴: "Set Up doan…" 삭제, Settings…(⌘,) 추가, 마법사가 열려 있으면 비활성. 첫 프롬프트 문장·복사가 subject를 받는다. `shell.openExternal`은 고정 URL 둘만 연다. Projects 탭용 읽기 전용 프로젝트 채널을 둔다. 프로젝트 설정은 `doan config --json`을 부르고, 파일 선택(choice)은 Settings 창에 붙인다. |
| electron-vite 설정 | renderer 입력 `settings.html`과 preload 입력 `settings-preload`를 더한다. CSP 플러그인은 페이지별로 둔다: 메인 창은 지금 그대로이고, Settings는 `default-src 'self'`(frame-src 없음)다. 빌드 설정 변경은 R4에서 사용자가 승인했다. 구현 작업에서 diff를 보여주고 한 번 더 확인받는다. |
| CLI | `app_not_running.nextSteps` 문장의 메뉴 이름을 Settings로 바꾼다. 새 명령 `doan config`를 더한다(아래). |
| MCP | 새 도구 `config`(아래). 쓰기이므로 `readOnlyHint`를 달지 않는다. 읽기만 해도 Codex 승인 정책에서는 승인이 필요할 수 있고, 이를 받아들인다(U-002와 같은 이유). |
| 스킬(가이드 본문) | "Set Up doan…" 문장을 Settings로 바꾼다. 명령 목록과 MCP 표에 `config`를 더하고, `init`처럼 "사람이 요청했을 때만 쓴다"는 줄을 둔다. |
| 공유 형식 | JSON Schema는 바뀌지 않는다. config는 v1 그대로 쓴다. `doan config` 결과 모양은 ARCHITECTURE §12에 산문으로 더한다. |

## Settings 창

### 창과 preload

- `BrowserWindow`: 640×560 고정(초안에서 확정), `minimizable: false`, `maximizable: false`, `fullscreenable: false`. 창 제목은 현재 탭 이름이고, 마지막 탭은 userData의 `ui-state.json`(`design-nav`)에 저장한다. `design-nav`가 아직 없으면 메모리에만 둔다.
- 전용 preload는 아래 메서드만 노출한다.
  - 연결 읽기·실행·응답
  - Check Again
  - Projects 목록 구독
  - 프로젝트 config 읽기·쓰기
  - 파일 선택
  - 고정 URL 열기
- 보안 경계는 main의 `senderAllowed`다. preload 노출은 편의일 뿐이다.

### 창 수명

- Settings…(⌘,)는 창이 없으면 만들고, 있으면 앞으로 가져온다. 마법사 세션이 있으면 메뉴 항목이 비활성이다.
- 이 창의 닫기(빨간 버튼, ⌘W)는 숨기기가 아니라 실제로 닫는다. 메인 창의 숨기기 규칙(2026-10-22)은 메인 창에만 적용한다.
- Dock 클릭(`activate`)은 지금처럼 메인 창을 보인다. ⌘Q는 두 창을 함께 닫는다. 썸네일 숨김 창(`design-nav`)은 창 수명 판단에서 뺀다.
- Settings 창에 포커스가 있을 때 메인 창 전용 메뉴 항목(Add Project…, Home, Quick Open, 줌·Fit·Reload)은 비활성이다(`projects-home` 메뉴 활성 표에 "Settings 포커스" 열 추가).

### IPC 허용 목록 (`senderAllowed`)

| 채널 | 메인 창 | Settings 창 |
|---|---|---|
| 캔버스·코멘트·선택·inspect·폴더 쓰기·추가·제거 | ✓ | — |
| 연결 읽기·실행·응답·Check Again | ✓ | ✓ |
| 프로젝트 목록 구독(읽기 전용, 저장 루트·상태·`git.common`) | ✓ | ✓ |
| `config:read`·`config:write`·`config:choose` | — | ✓ |
| `setup:open-external {target: "claude" \| "codex"}` | ✓ | ✓ |
| 첫 프롬프트 문장·복사 | ✓ | — |

- 발신자는 허용된 창의 main frame이어야 한다(`parent === null`).
- 썸네일 숨김 창은 이 목록에 없다.

### 설정 세션과 동시성

- 지금은 `wizardSession` 하나와 전역 `latestRead`, 대기 중인 확인 하나가 있다(index.ts 348–357). 이것을 창별 세션으로 바꾼다.
  - 마법사 세션(메인 창)과 Settings 세션(Settings 창)은 각자 읽기 토큰을 가진다. 한 창의 읽기가 다른 창의 읽기를 stale로 만들지 않는다.
  - machine 쓰기(Install·Replace·Connect·Fix)는 앱 전체에서 한 번에 하나만 돈다. 다른 창에서 요청하면 `busy`다.
  - 확인 대화상자는 요청한 창만 띄운다. 다른 창은 그동안 해당 버튼을 비활성으로 보인다.
- 마법사가 열려 있으면 Settings 메뉴를 막는다. 그래서 두 창이 같은 단계를 동시에 보이는 일은 없다. 다만 Settings가 먼저 열린 뒤에 마법사가 열리는 경우는 없다. 마법사는 첫 실행에만 열리기 때문이다.

### Connections

순수 함수 `connectionSummary`가 줄 상태를 정한다.

| 줄 | Connected | Needs attention | Not connected | Not installed | Couldn't check |
|---|---|---|---|---|---|
| doan command | 링크가 `ours` | `dangling`, `link-other`, `blocked`, translocated | 링크 `missing` | — | 셸 프로브 실패 |
| Claude Code / Codex | 스킬·(Claude)링크·MCP가 모두 ours | MCP `other`, 스킬 `differs`, 링크 `link-other`·`blocked` | 일부 missing | 실행 파일 없음 | 프로브 실패, MCP `unknown` |

- **동작**: 각 줄의 버튼은 지금 마법사의 동작(Install/Replace, Connect, 확인 대화상자, stale 검사)을 그대로 부른다.
- **`dangling`의 Fix**: 확인 대화상자를 거친다. 끊어진 링크는 doan이 만들었다는 것을 증명할 수 없기 때문이다. 확인 문구는 "Current: <대상> (missing). New: <이 앱의 CLI>"다.
- **translocated**: 이 줄은 Fix 대신 "Move doan to Applications, then open it again."을 보인다.
- **PATH 안내**: `~/.local/bin`이 PATH에 없을 때 rc 파일에 넣을 줄을 복사하게 한다. doan command 줄을 펼친 곳에 "Use doan in your terminal" 선택 항목으로 둔다.
- **상태 읽기 시점**
  - 읽는 경우: 앱 시작, 메인 창 포커스(60초 스로틀 — `projects-home`의 git 다시 읽기와 같은 스로틀), Settings 열기, 설정 동작 완료, Check Again.
  - 읽는 중에도 이전 결과를 보인다. 첫 결과 전에는 "Checking…"이다.

### Projects 탭

- 목록은 프로젝트 목록 구독(읽기 전용) 결과다. `groupProjects`(`projects-home`)로 저장소별로 묶는다.
  - 문제 상태 줄은 칩과 홈의 같은 동작 이름을 보인다. 동작 자체는 메인 창으로 보낸다(Show in Finder는 직접 실행).
  - 목록이 갱신되어 고른 줄이 사라지면 첫 줄을 고른다.
- 정상 줄을 고르면 `config:read {root}` → `doan config --json --repo <root>` 결과를 보인다.
- token CSS의 Change…
  - `config:choose {root, kind: "tokenCss"}`가 Settings 창에 시트를 붙인다. 시작 폴더는 루트다.
  - main은 (root, 열기 epoch)에 묶인 choice를 보관하고 renderer에는 `choiceId`만 준다. 지금 `chooseTokenCss`의 uninitialized 전용 choice와는 따로 둔다.
  - 그다음 `config:write {root, op: "setTokenCss", choiceId}`를 보낸다.
- token CSS의 Clear는 `config:write {root, op: "clearTokenCss"}`다.
- serve의 Add…
  - `config:choose {kind: "serve"}`로 파일 또는 폴더를 고른다.
  - renderer가 확인 대화상자 "Canvases in this project will be able to read <path>. Add it to serve?"를 띄운다.
  - 그다음 `config:write {root, op: "addServe", choiceId}`를 보낸다.
- serve 항목의 Remove는 `config:write {root, op: "removeServe", path}`다. `path`는 마지막 읽기 결과에 있는 값만 받는다.
- 쓰기가 성공하면 "Saved"를 보이고 다시 읽는다. 열린 캔버스는 지금의 served 변경 감시가 다시 불러온다. 쓰기가 실패하면 CLI의 `error.message`를 보이고 앱 안내를 덧붙인다(`nextSteps`는 보이지 않음, 2026-10-24 init 규칙과 같다).

## `doan config` (CLI·MCP)

- **명령**: `doan config [--token-css <path>] [--clear-token-css] [--add-serve <path>]... [--remove-serve <path>]... [--json] [--repo <path>]`
  - 쓰기 옵션이 없으면 읽기다. 읽기는 파일을 바꾸지 않는다(mtime 불변).
  - `--token-css`와 `--clear-token-css`를 함께 주면 `usage_error`다.
- **저장소 찾기**: 다른 명령과 같다(ARCHITECTURE §13). `--repo`가 있으면 그 경로만 보고 위로 올라가지 않는다. 없으면 현재 디렉터리에서 위로 찾는다.
- **경로 해석**: 상대 경로는 현재 디렉터리 기준이다(init과 같다). 절대 경로는 `repo.InsideRelative`로 저장소 안인지 확인한다. 저장은 실제 저장소 기준 상대 경로와 디스크 표기로 한다.
  - token CSS는 일반 파일이어야 한다. config 스키마도 통과해야 한다.
  - serve는 존재하는 파일 또는 디렉터리여야 하고, 루트(`.`)나 `.doan/` 안이면 안 된다.
- **같은 값**
  - 같은 serve를 다시 추가하거나 없는 serve를 제거하면 `changed:false`다.
  - 이미 없는데 `--clear-token-css`를 주면 `changed:false`다.
- **오류**
  - `usage_error`: 저장소 밖, 없는 파일, 디렉터리인 token CSS, 루트나 `.doan/` 안의 serve, 상충 옵션
  - `repo_not_found`
  - `invalid_config`, `unsupported_version`
  - 모두 exit 2다(ARCHITECTURE §12 표). 오류가 나면 아무것도 쓰지 않는다.
- **쓰기**
  - 기존 config를 읽어 바꿀 필드만 바꾼다. 같은 디렉터리의 임시 파일에 쓰고 rename한다.
  - 직렬화는 `doan init`과 같다(들여쓰기·키 순서·끝 개행).
  - `changed:false`면 쓰지 않는다. 커밋된 파일에 diff 소음이 생기지 않게 하기 위해서다.
- **결과**: `{repo, tokenCss?, serve: string[], changed: boolean}`
- **MCP `config`**
  - 인자: `repo?`(절대 경로), `tokenCss?`, `clearTokenCss?: boolean`, `addServe?: string[]`, `removeServe?: string[]`
  - `tokenCss`와 serve 경로는 init과 같이 "저장소 기준 상대 경로 또는 저장소 안 절대 경로"다.
  - 도구 결과는 같은 envelope다.

## 홈 표시

- **연결 칩**: 홈 상단 바 오른쪽에 둔다. 접근 이름은 "Claude Code: Connected"처럼 텍스트다. 누르면 Settings › Connections가 열린다.
- **배너**: `homeAlerts`가 정한다. Needs attention인 줄이 있을 때만 뜬다.
  - 문구는 결과를 먼저 말한다. 예: "The doan command link is broken, so agents can't reach doan."
  - Fix…는 Settings를 그 줄을 펼친 채로 연다. Check Again은 다시 읽는다.
- **Finish 카드**: 마법사를 닫았는지 여부(`onboarding.json` 존재)는 main이 연결 요약과 함께 보낸다.
  - 조건: doan 명령이 Not connected, 또는 Connected 에이전트가 없고 Not connected·Not installed만 있음, 또는 저장된 프로젝트가 없음.
  - Needs attention과 Couldn't check는 배너의 몫이다.

## 마법사 변경

- **열기**: 자동으로 열리는 조건(`onboarding.json` 없음)은 그대로다. 메뉴로 다시 여는 길은 없앤다.
- **1단계**: `dangling`을 "Link is broken"과 Fix(확인)로 보인다.
- **2단계**: 설치 링크와 "doan works through Claude Code or Codex…" 문구를 둔다(위 spec).
- **3단계**: Open Project…는 단일 선택이다. main이 `projects-home`의 판정을 그대로 쓴다.
  - 결과가 체크 목록이면, 마법사 안에서 모달로 쌓아 하나만 고르게 한다.
  - 결과가 확인이면 확인 대화상자를 띄운다.
  - 마지막에 루트 하나를 돌려준다. 지금 `openFolder()`의 "stored root or null" 계약을 유지한다.
- **4단계**: `FirstPrompt`를 쓰고, 프로젝트가 없으면 Add Project…를 둔다. 도착하면 "Canvas ready: <title>"과 Open을 보인다.
- **문구**: 결과 중심으로 바꾸고, 경로와 설정 위치는 "Details"로 접는다. 정확한 문구는 `/design-draft`에서 정한다.

## 첫 프롬프트

- **renderer가 보내는 것**: `onboarding:first-prompt {root, subject}`(미리보기)와 `onboarding:copy {kind: "firstPrompt", root, subject}`(복사). main이 같은 함수로 문장을 만들므로, 미리보기와 클립보드 문장이 같다. 검증:
  - `root`가 저장 목록에 있고 `list`인지(지금 규칙)
  - `subject`가 앞뒤 공백을 정리한 한 줄인지, 줄바꿈·제어 문자가 없고 500자 이하인지
- **문장**: `Use the doan skill to make a design canvas in <repo> for <subject>.`. 끝에 `.`이 이미 있으면 하나만 남긴다.
- **대기 상태**(renderer 메모리): `idle → waiting(root, knownPaths) → arrived(path)`
  - `knownPaths`는 Copy 성공 시점의 캔버스 경로 집합이다.
  - 폴더 목록 갱신에 `knownPaths`에 없는 경로가 생기면 `arrived`다. 새 경로가 여럿이면 `mtimeMs`가 가장 큰 것을 연다.
  - 그 루트가 제거되면 `idle`로 돌아간다. 입력 수정은 대기에 영향이 없다.
  - 앱을 다시 켜면 대기는 사라진다.
- **기존 대체**: 사이드바의 "No canvases" 행과 Copy first prompt는 `design-nav`가 이미 바꿨을 수 있다. 나중에 main에 들어가는 쪽이 0개 작업공간의 중앙을 `FirstPrompt`로 통합한다.

## 순수 함수로 분리할 부분 (`/tdd` 대상)

- `linkState` 확장: 대상이 없는 링크는 `dangling`이다(`link-other`와 구분).
- `connectionSummary(machineState, translocated) → {cli, claude, codex}`(위 표)
- `senderAllowed(channel, windowKind) → boolean`(위 표)
- `setupLock` 리듀서: 쓰기 하나, 확인 소유 창, `busy`
- `homeAlerts(summary, entries, onboardingClosed) → {banner?, finishCard?}`
- `promptSentence(repo, subject) → string | {error}`
- `firstPromptReducer`(idle/waiting/arrived, 제거 시 취소)
- `arrival(knownPaths, rows) → path | null`
- `menuState` 확장: 마법사 열림 → Settings 비활성, Settings 포커스 → 메인 전용 항목 비활성
- 마법사 뷰 함수(`onboardingView.ts`)의 새 문구·버튼 분기
- Go `config`: `applyConfigOps(config, ops) → (config, changed, error)`. 파일 I/O는 없다.

## 형식 변경

- 공유 형식(JSON Schema)은 바뀌지 않는다. `onboarding.json`도 지금처럼 `{}`다.
- `doan config` 결과 모양 `{repo, tokenCss?, serve, changed}`를 ARCHITECTURE §12에 산문으로 더한다. 쓰는 형식은 config v1 그대로이고, MCP `config`도 같은 envelope다.

## 컨벤션 영향

- 캔버스 컨벤션은 바뀌지 않는다.
- `serve`를 앱과 CLI로 바꿀 수 있게 된다. 그래도 `css_not_served` 규칙과 서빙 범위 계산(`repo.Scope`)은 그대로다.

## 결정 영향

### 대체되는 결정

- PRODUCT §5 app 0의 "'Set Up doan…' (after About, no shortcut) reopens it at any time; when the wizard is already open … shows that same wizard and step" → Settings…(⌘,)로 바꾸고, 마법사는 첫 실행 전용으로 둔다.
- PRODUCT §5 app 0 Not included의 "(run 'Set Up doan…' again)" → "open Settings".
- PRODUCT §7 2026-10-24 "Set Up doan… with the wizard already open shows the same session and step"과 loop3 행의 "suggest 'Set Up doan…'".
- PRODUCT §7 2026-10-24 first prompt "copied from the wizard and from 'No canvases' rows" → 입력란이 있는 공유 컴포넌트.
- PRODUCT §7 2026-10-24 onboarding draft 문구 결정 → 새 문구.
- ARCHITECTURE §7 'App menu'와 'Onboarding' Lifecycle의 "Set Up doan…" 문장, "one window"와 "IPC that accepts only that window's main frame" → 창별 허용 목록.
- ARCHITECTURE §5 'Unavailable tools'의 "connect the agent through the app menu 'Set Up doan…'".
- ARCHITECTURE §7 renderer→main 계약 "enums, opaque IDs and stored roots only" → 첫 프롬프트 `subject`(자유 텍스트, main이 검증)를 예외로 둔다. `removeServe`의 `path`는 마지막 읽기 결과에 있는 값만 받는다.

### 유지되는 결정

- 만든 적 없는 것은 덮어쓰지 않는다. 쓰기 직전에 재확인하고, 원자적으로 생성한다.
- 셸 파일은 편집하지 않는다. 바깥에는 버튼으로만 쓴다(2026-10-24).
- Settings는 같은 main 동작을 부르는 새 입구일 뿐이다.

### 근거와 범위

- **Doan does not wake the agent(PRODUCT §3 Out of scope 4)**: 첫 프롬프트는 클립보드로만 나간다.
- **`shell.openExternal`**: 열 수 있는 URL은 main에 고정한 두 개뿐이다. renderer는 열거형만 보낸다.
- **config 쓰기는 Go에서만(POSTMORTEM 2026-10-22 원칙)**: 앱은 TS로 config를 쓰지 않고 `doan config`를 부른다.
- **MCP 표면(PRODUCT §5 12)**: `config`도 MCP 도구로 낸다(Q2). 에이전트가 요청 없이 config를 바꾸지 않도록 가이드에 제한 문장을 둔다. CLI·MCP·가이드가 바뀌므로 `/agent-eval`을 돌린다. 필요하면 시나리오를 새 id로 더한다.
- **serve 편집(R5)**: serve는 캔버스 스크립트가 읽을 수 있는 범위를 넓힌다(ARCHITECTURE §3 serving scope). 그래서 앱에서 추가할 때는 확인 대화상자를 거친다. 루트와 `.doan/`은 CLI가 거부한다(config 스키마와 `repo.Scope`의 루트 제외를 함께 쓴다).
- **빌드 설정(R4, AGENTS.md)**: electron-vite에 두 번째 진입점과 페이지별 CSP를 더한다. 사용자가 승인했다.

## POSTMORTEM에서 가져올 함정

- **2026-10-24 "Setup rejected linked configuration directories"와 그 재발**: 상태 표를 바꿔도 아래 회귀 테스트를 그대로 유지한다.
  - 링크된 설정 디렉터리
  - 같은 대상·다른 대상
  - `dangling`·파일·루프
  - `rg -n 'blockedParent|realTarget|realDirectory|lstatSync' app/src/main/onboarding --glob '*.ts'`
- **2026-10-24 "Setup writes to missing targets could overwrite a competitor"**: Fix도 같은 배타적 생성과 stale 검사를 거친다.
- **2026-10-24 "The setup menu discarded an open wizard session"**: 세션을 창별로 나누므로, 세션 생성과 창 표시를 따로 검증하는 테스트를 새 구조에 맞춰 옮긴다.
- **2026-10-23 "Comment copy reported success before the clipboard committed"**: 첫 프롬프트 Copy는 클립보드 쓰기가 끝난 뒤에만 Waiting으로 넘어간다.
- **2026-10-24 "The onboarding wizard lost keys and clicks to focus and modal stacking"**: 마법사 안의 체크 목록과 확인은 모달로 쌓고, 키는 창에서 처리한다.

## PoC 의존

없다. 셸 프로브와 에이전트 CLI는 PoC 7a·7c에서 통과했다.

## 확인 질문 답

- **Q1**(2026-10-24 사용자): Settings는 별도 창이다(추천안 "창 안의 화면" 대신).
- **Q2**(2026-10-24 사용자): `doan config`를 앱이 부르고(추천안), MCP 도구와 가이드에도 노출한다(추천안 "CLI만" 대신).
- **R4**(2026-10-25 리뷰): 별도 `settings.html`과 전용 preload를 쓴다(추천안 "같은 index.html + 해시 라우트" 대신).
- **R5**(2026-10-25 리뷰): serve 추가·삭제를 허용한다(추천안 "읽기 전용" 대신). 추가할 때는 확인을 거친다.
- **리뷰 일괄 승인**(2026-10-25)으로 반영한 것:
  - Couldn't check·translocated
  - 창별 세션
  - 메뉴 비활성
  - Projects 채널·choice
  - `doan config` 옵션·오류·직렬화
  - subject 복사
  - 도착 판정
  - Canvas ready
  - Finish 카드 조건
  - 칩 접근 이름
  - 저장 후 다시 불러오기
