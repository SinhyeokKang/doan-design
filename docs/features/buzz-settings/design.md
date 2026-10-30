# buzz-settings — design

[부모 design](../buzz-restyle/design.md)의 공통 결정·Buzz clone 참조 규칙·CSS 싣는 방법·드래그 영역·금지 표현을 따른다. 이 문서는 이 자식 범위의 세부만 적는다.

## 결정 기록 (2026-10-30 user)

- Settings는 별도 창이 아니라 AppShell 페이지다. AppShell 스타일과 LNB를 그대로 재사용한다. Buzz Settings와 같은 모달·통합 사이드바는 쓰지 않는다.
- Buzz에서 참고하는 것은 본문 패널의 카테고리별 구성 방법뿐이다.
- 지금 구현된 항목만 옮기지 않고, 앱에 필요한 설정을 더한다. 더하는 것: 알림, 새 대화 기본 에이전트·모델·effort, 앱 정보(About, Copy details 포함). Agents(계정)는 부모 C6 계획대로 넣는다.
- 저장소별 Token CSS·Serve는 앱 Settings에서 빼고 프로젝트 아래, 곧 LNB 프로젝트 메뉴의 Project Settings가 여는 다이얼로그로 옮긴다.
- feature-review 결정(모두 추천안 채택): 로그인 상태는 App 수준 컨트롤러가 들고 끝나면 토스트로 알린다, task는 추가 → 전환 → 제거 순서, Home에서 들어올 때 공급자 행 그룹에 포커스, Project Settings 대상 변화 4규칙, 알림 클릭 해석 규칙, 부모 문서 갱신, 새 대화 기본값 적용 규칙, `preferences.json` 복구 규칙, 그 밖의 항목은 아래 각 절에 반영했다.

## 초안 요청 (`/design-draft`)

- 캔버스 `.doan/canvases/buzz-settings.html`, id `buzz-settings`, 폭 2560. Add Projects 초안과 같은 1238 × 780 전체 창 틀(셸 헤더, LNB, 흰 본문 패널)이다.
- 1차(2026-10-30 user: 창만 먼저 그려 구성을 승인받고, 상태 타일은 `--revise`에서 더한다). 창 10개이며 모두 `/design-sync` 비교 대상이다.
  - `agents` — Agents: Connected(연결됨, 만료, Copilot 확인 안 됨)·Not connected(미설치, 미연결) + New conversations
  - `agents-signing-in` — Agents: Codex 로그인 대기, 다른 행의 busy 문구
  - `notifications` — Notifications: 켬
  - `notifications-off` — Notifications: Desktop notifications 꺼짐
  - `connections` — Connections: 지금 행을 설정 그룹으로 옮김, doan command Details 펼침
  - `connections-locked` — Connections: Fix the Doan link? 확인 대화상자와 이동 잠금
  - `about` — About
  - `project-settings` — Project Settings 다이얼로그: 정상 워크트리
  - `project-problem` — Project Settings 다이얼로그: Missing 워크트리
  - `home-agent-picker` — 홈 공급자 선택기의 Settings 동작
- 초안 검토 결정(2026-10-30 user, 추천대로 확정). 구현 때 DESIGN에 적는다.
  - 스위치 썸 14px과 트랙 폭 36px은 컴포넌트 상수다. 값이 같은 `--size-icon-sm`은 아이콘용이라 쓰지 않는다.
  - Project Settings 다이얼로그는 값을 바로 저장하므로 액션이 Done 하나다. DESIGN 'Dialogs'의 "Cancel 먼저, 완료 동작 마지막" 규칙의 예외다.
  - Settings에서 Copilot과 확인되지 않은 연결을 확인하는 버튼은 Check다. 첫 실행의 Retry와 다르다. DESIGN 'Terms shared with onboarding'에 Settings 줄을 더한다.
- 2차(2026-10-30) 상태 타일 6개를 그렸다: `states-agents`, `states-defaults`, `states-notify`, `states-about`, `states-project`, `states-home`. 창이 아니라 본문 열만 그린 타일이며 창 비교 대상이 아니다.
- 초안 확정(2026-10-30 user): `.doan/canvases/buzz-settings.html` 2차(창 10개, 상태 타일 6개)가 이 화면의 정본이다. 이 feature가 main에 병합될 때까지 `/design-sync`의 기준이다.
- feature-review 뒤 초안에 없는 상태: 읽기 단계 `preferences.json` notice, 더 새 버전 파일 안내, About 각 행의 "Checking…", 로그인 완료 토스트, Agents·Connections 소개문의 상호 안내 문장. 구현 때 초안 확정 범위 밖 차이로 DESIGN에 적는다.

## Buzz 레퍼런스

기준 커밋 `c40dfdf4c81aabe759f3a4329c3e77f854746a59`(로컬 HEAD `ec1b9acc`, 2026-10-30 확인, 기준 커밋 파일을 `git show`로 읽었다). 값은 구현할 때 원본에서 다시 읽는다(부모 규칙 4).

| 가져오는 것 | 원본 | 내용 |
|---|---|---|
| 카테고리 본문 구성 | `src/app/NotificationSettings.tsx` | 카테고리 제목(`Header`) → 섹션마다 섹션 제목(`InlineHeader`) + `SettingsGroup` → 행. 섹션 사이 `gap-section-gap` |
| 읽기 열 | `src/app/Settings.module.css` `.detail` | 본문 패딩 `space-8 / space-6 / space-6`, 자식 `max-inline-size: 48rem` 가운데 정렬, 좁은 폭 `@container (max-width: 36rem)` |
| 그룹 | `src/shared/design-system/ui/SettingsGroup.tsx`, `styles/settings-group.css` | `layout` rows(구분선) · form · cards, `--settings-group-inset: var(--space-4)` |
| 행 | `src/shared/design-system/ui/PreferenceRow.tsx`, `SwitchPreferenceRow.tsx`, `styles/components.css` 2207–2295행 | 제목·설명 + 오른쪽 컨트롤 grid, 행 패딩 `space-3 0`, gap `space-4`, 설명 `text-subtle`, disabled는 doan의 `text-disabled`, 24rem 이하에서 버튼 컨트롤이 아래 줄로 |
| 스위치 | `styles/components.css` `.buzz-switch*` 2152–2205행 | 36 × 20 트랙, 14px 썸, 켬은 `affordance-prominent`. 비활성은 doan disabled 역할(`affordance-disabled`) |
| 권한 안내 위치 | `NotificationSettings.tsx` `permissionStatus` | 꺼진 시스템 권한을 행 아래 안내 + 동작 버튼으로 보인다. 안내 모양은 doan의 `doan-notice doan-panel` |

가져오지 않는 것: `Settings.tsx`의 Dialog 표시와 `navigation` 슬롯, `SettingsSidebar.tsx`의 `SidebarNavigation`·`NavigationSection`(doan LNB를 재사용한다), 섹션 그룹 정책(`settings-sections.ts`), 플러그인 목록, 소리 선택, `ToastNotice`(doan은 공용 토스트·notice를 쓴다).

## 영향 컴포넌트

- **앱 main** (`app/src/main/`):
  - 창 제거: `index.ts`의 `settingsWin`·`createSettingsWindow`·`openSettings`(창 생성 부분)·`sendSettings`·창 close 거부, `settings.ts`의 `SETTINGS_WINDOW`·`SETTINGS_TITLES`·`ProjectRow`·`projectRows`·`parseForwardedAction`·`parseSettingsTarget`의 projects 분기. `settings.ts` 파일은 남는다: `INSTALL_URLS`, `parseExternalTarget`, 새 알림 설정 URL과 카테고리 파싱을 둔다.
  - `senderAllowed.ts`: `WindowKind`를 main 하나로 줄인다.
  - `setupBroker.ts`: 읽기 토큰과 락 소유자는 main webContents 하나다.
  - `configBridge.ts`: Settings 세션 → Project Settings 다이얼로그 세션. 파일 선택 시트와 `config:choose`의 발신자 검사를 메인 창 기준으로 바꾼다.
  - `menuState.ts`: `focusedWindow` 제거, `screen: "settings"` 추가.
  - `uiState.ts`(main): `settingsTab` 합성과 `settings:tab-get/save`를 없앤다. 카테고리는 renderer `UiState`(`app/src/restore/uiState.ts`)의 일반 필드 `settingsSection`이 된다.
  - 새로: 환경설정 저장(`preferences.ts`), 알림(`notifications.ts`), About 읽기와 복사 텍스트(`about.ts`).
  - 정리 보강: 메인 창의 `render-process-gone`과 `did-navigate`에서 `broker.drop(owner)`와 `configBridge.clear()`를 부른다. 지금은 Settings 창의 `closed`만 둘을 함께 부른다.
- **preload**: `app/src/preload/settings.ts`와 그 테스트 삭제. 남는 메서드를 `app/src/preload/index.ts`(`window.doan`)로 옮기고, 두 preload에 중복된 agent-auth 메서드는 하나만 남긴다.
- **앱 renderer**:
  - 삭제: `settings.html`, `settings.ts`, `settings.css`, `settings.css.d.ts`, `settingsWindow.tsx`, `settingsWindow.test.tsx`, `settingsProjects.tsx`.
  - 새로: `SettingsPage.tsx`와 카테고리 컴포넌트, `ProjectSettingsDialog.tsx`(지금 `ProjectDetail`을 옮김), App 수준 로그인 컨트롤러.
  - 바뀜: `App.tsx`(화면 `settings`, `TopBar`의 Settings 탭, 알림 클릭 처리), `ShellSidebar.tsx`(Settings 페이지의 카테고리 목록, Project Settings가 다이얼로그를 염), `HomeComposerView.tsx`(공급자 선택기 동작), `homeComposer.ts`(기본값), `agentAuthView.ts`(Settings 맥락), `agentStep.ts`(컨트롤러 분리), `addProjectsNav.ts`(페이지 출발점 규칙을 두 페이지가 공유, 파일 이름은 유지), `SettingsDialog.tsx`(확인 대화상자), `styles.css`·`ds/`(설정 그룹·행·스위치).
- **CLI·MCP·스킬·공유 포맷**: 변경 없음. `doan config` 호출 경로도 그대로다. 온보딩 스킬(`app/src/main/onboarding/SKILL.md`)의 `Settings… > Connections`와 `PRESET_GUIDANCE`(`app/src/main/conversation/prompt.ts`)의 `Settings > Connections`는 Settings… 메뉴와 Connections 카테고리가 남으므로 그대로 맞다.
- **빌드**: `electron.vite.config.ts`의 renderer·preload 진입점과 `settings.html` CSP 분기에서 settings 제거(빌드 설정 변경이지만 이 feature가 요청한 범위다).

## 화면과 내비게이션

- 메인 창의 화면은 Home, `workspace(root)`, `addProjects`, `settings`다. Settings와 Add Projects를 **페이지**라 부른다.
- **출발점**: 페이지에 들어갈 때 숨긴 Projects 쪽 화면이 출발점이다. 숨긴 화면의 상태는 그대로 보존한다. 페이지끼리 옮겨도 출발점은 바뀌지 않는다. 지금 출발점은 Home 또는 workspace이고, 대화 패널 같은 새 화면 상태가 생기면 같은 규칙으로 넓힌다.
- Projects 탭·Back·Escape(입력 중·IME 조합 중·메뉴가 열린 동안 제외)가 출발점으로 돌아간다. 돌아가면 지금 `focusCurrent` 규칙을 따른다(Home은 입력창, workspace는 직전 요소). Forward는 꺼진다. 페이지는 Back/Forward 방문이 아니고, 재시작 때 복원하지 않는다(ui-state에는 출발점만 남긴다). 순수 규칙은 `addProjectsNav.ts`를 두 페이지용으로 넓힌다.
- Add Projects 페이지에서 Settings로 갔다가 돌아오면 Add Projects 입력은 사라진다(`key={page.seq}`). 받아들이는 한계이며 되살리지 않는다.
- **들어가는 길**은 진입 함수 하나 `openSettings({ section?, provider? })`로 모은다: 헤더 Settings 탭, Settings…(Cmd+,), 홈 공급자 선택기 동작, 로그인 토스트의 Open Agents settings. 탭과 메뉴는 마지막 카테고리(`settingsSection`, 기본 Agents)를 연다. 메인 창이 숨겨져 있으면 main이 창을 먼저 보인 뒤 이동을 보낸다.
- **포커스**: 페이지 진입, Settings 페이지에서 다시 누른 Cmd+,는 카테고리 제목에 포커스를 둔다. 공급자가 지정된 진입은 그 공급자 행 그룹에 포커스를 둔다. LNB 카테고리를 클릭하거나 Enter로 바꾸면 포커스는 그 행에 남는다(macOS 사이드바 관례).
- **메뉴**: Settings…는 첫 실행 중, 모달이 열린 동안, 페이지 잠금 중에 꺼진다. Close Window(Cmd+W)는 늘 메인 창을 숨긴다. 다시 보이면 Settings 페이지와 진행 중인 쓰기·확인이 그대로다. Settings 페이지에서 Add Project…는 Add Projects 페이지로 옮긴다. Quick Open은 Add Projects 페이지와 같은 규칙이다. 앱 메뉴의 About Doan은 지금의 기본 패널 그대로 두고 Settings > About으로 바꾸지 않는다.
- **들어오는 대상 큐**: 카테고리가 확인 대화상자나 쓰기를 소유하는 동안 오는 대상(Cmd+,, 홈 선택기, 토스트)은 큐에 두고 끝난 뒤 적용한다(POSTMORTEM 2026-10-25 'A forwarded Settings target discarded a pending setup confirmation').

### LNB

- 기존 `ShellSidebar` 틀(폭 260, Search, 섹션 제목, 32px 행, 무채색 hover·선택)을 그대로 쓴다. Settings 페이지에서는 'Projects' 섹션 자리에 'Settings' 섹션 제목과 카테고리 행 네 개(Agents, Notifications, Connections, About, 각 lucide 아이콘)를 보인다. 선택 행은 `aria-current="page"`.
- Search 행은 남는다. 프로젝트 행·프로젝트 메뉴·캔버스 행은 Settings 페이지에서 보이지 않는다.
- 키보드: 카테고리 행은 일반 버튼 목록이다(Tab/Enter). 프로젝트 트리의 roving tabindex·typeahead는 쓰지 않는다. 행 포커스 링은 목록 안 행 규칙대로 −2px 안쪽이다.

### 본문

- 기존 흰 본문 패널(`.home-panel`과 같은 패널)이 스크롤 컨테이너다(`.doan-scroll`). 본문 글자는 Add Projects 패널처럼 14/20, `font-variant-numeric: normal`이다. 그 안에 48rem 가운데 열, 카테고리 제목 → 섹션(제목 + 그룹 + 행)을 둔다. 값은 Buzz 레퍼런스 표를 따르되 doan 토큰 이름으로 새로 쓴다.
- 새 공용 스타일 `doan-settings-group`, `doan-preference-row`, `doan-switch`를 `app/src/renderer/ds/`에 둔다. 스위치는 `button[role="switch"][aria-checked]`에 건다. 지금 `components/ui/`에는 tooltip뿐이라 shadcn Switch를 들이면 새 의존성이 생기므로 들이지 않는다(공통 결정 4의 Radix 스택과 충돌하지 않는다). 같은 대상을 겨누는 `settings.css`의 옛 규칙은 지운다.
- 값을 고르는 컨트롤(Agent, Model, Effort)은 홈 선택기와 같은 Radix `DropdownMenu`(`role="menu"`)와 공용 `trigger` 변형이다. Radix Select(`role="listbox"`)는 쓰지 않는다. 쓰면 `pageEscape`의 오버레이 검사를 지나 목록을 닫으려던 Escape가 페이지를 떠난다.

### 잠금

- Connections의 설정 쓰기·확인 대기, Agents의 `stop_required` 확인 대화상자가 열려 있는 동안은 페이지를 떠나는 모든 이동을 무시하고 꺼진 것으로 보인다. 대상은 Add Projects 잠금과 같다(헤더 탭, Back, Search, LNB의 다른 카테고리, Home, Quick Open, Add Project…, Undo Remove). 이전 Settings 창의 '쓰기 중 닫기 거부'를 대신한다.
- 로그인 대기는 잠그지 않는다. 이전 창에서는 창을 닫으면 시도가 취소됐지만 창이 사라지지 않으므로 그 규칙은 없어진다. 로그인 상태는 아래 'App 수준 로그인 컨트롤러'가 들고 있어 다른 화면으로 가도 이어진다.
- Add Projects 잠금(설정 쓰기·clone) 중에는 Settings 탭과 Settings…도 잠긴다. 지금은 Settings…가 별도 창이라 잠금 중에도 열렸지만 이제는 페이지 이동이기 때문이다. Project Settings 다이얼로그는 이동이 아니므로 잠금 중에도 열린다.

## 카테고리

### Agents

- 소개문: "Doan signs in to each agent with its own connection, separate from your terminal. One account per agent. To let the agent in your terminal use Doan, see Connections." 끝 문장은 Connections의 "Connected"와 뜻이 다름을 알린다.
- **Connected / Not connected** 섹션: 다섯 공급자 행. 행 문구·버튼·notice·aria는 `agentAuthView.ts`의 `providerView`·`authListView`·`stopDialog`·`pasteDialog`·`replyEffect`·`readyAnnouncements`를 재사용한다. 첫 실행 Agent 단계와 다른 점만 Settings 맥락 인자로 더한다.
  - 상태 칩 대신 섹션을 둘로 나눈다(2026-10-30 user): **Connected**(계정이 있는 공급자, 재인증이 필요한 연결 포함)와 **Not connected**(미설치·미연결·로그인 진행 중). 오른쪽 열에는 동작 버튼만 둔다. 연결된 공급자는 늘 Sign out을 가지고, 계정과 확인 여부(예: "alexkim · not checked")를 이름 아래 줄에 보인다(첫 실행은 실패한 로그아웃·재인증 때만 Sign out이 있다). 연결이 바뀌면 행이 다른 섹션으로 옮겨 가고 포커스는 그 행 그룹을 따라간다. 한쪽 섹션이 비면 그 섹션을 숨긴다.
  - 확인되지 않은 연결의 버튼은 Check다. Copilot은 Check로만 확인하고 행 아래에 "Checking uses one Copilot request."를 보인다(첫 실행은 버튼 옆 "Uses one Copilot request").
  - 자동 확인: 페이지에 들어갈 때와 설치 페이지에서 돌아올 때 Copilot을 뺀 공급자를 확인한다(첫 실행과 같은 규칙). `autoCheck` helper 문구는 Settings에서 "Doan checks this automatically when you open Agents."다.
  - `not_owner` 문구는 창이 하나뿐이므로 "Finish this sign-in where it started."로 바꾼다.
  - `stop_required`는 확인 대화상자 뒤 `stop: true`로 다시 보낸다. `sign_out_failed`는 지금 문구를 쓴다.
  - 각 행은 `role="group"`, 이름은 공급자 이름, `tabindex="-1"`이다. 공급자가 지정된 진입은 이 그룹에 포커스를 두고, 사이드바 행 강조와 같은 2.4초 강조를 보인다. 자동 확인이 버튼을 비활성화하거나 확인 뒤 버튼이 사라져도 포커스가 남는다.
- **App 수준 로그인 컨트롤러**: prompt 구독, 받아 둔 prompt, 시도의 소유 표시, 준비 알림을 `AgentStep` 인스턴스가 아니라 App이 renderer당 하나 가진다. Settings 페이지와 첫 실행 Agent 단계는 이 컨트롤러의 view만 읽는다. main은 prompt를 소유 창에 한 번만 보내므로, 페이지가 사라진 동안 온 prompt도 잃지 않는다. 로그인이 Agents가 보이지 않는 동안 끝나면 공용 토스트로 한 번 알린다: 성공 "<Provider> connected.", 실패 "<Provider> sign-in didn’t finish." + Open Agents settings. 창을 앞으로 올리지 않는다.
- **New conversations** 섹션: Agent(Last used · 연결된 공급자), Model(Default · 목록), Effort(Default · 목록).
  - 모델 목록은 공급자·root별로만 읽히므로(`listConversationModels`), 홈이 기본으로 고를 프로젝트(`defaultProject`)의 root로 읽는다. 정상 프로젝트가 없으면 Model을 끄고 이유를 말한다. 읽는 중과 실패(Retry)를 보인다.
  - Last used를 고르면 Model·Effort 행을 숨긴다. 둘은 마지막으로 보낸 대화를 따른다.
  - 적용 규칙: 홈 입력창은 처음 열 때와 보낸 뒤에 고정 기본값으로 시작한다. 사람이 홈 선택기에서 고른 값은 그 입력을 보낼 때까지 유지한다. 앱을 다시 시작하면 기본값으로 돌아간다. Settings에서 바꾼 값은 다음 새 입력부터 적용한다.
  - 폴백: 고른 공급자의 연결이 끊겼으면 지금 규칙(마지막 사용값 → 첫 ready)으로 시작하고, Settings 행 아래에 "Codex isn’t signed in, so Home starts with the agent you sent with last."를 경고로 보인다. 그 프로젝트에 고른 모델이 없으면 그 공급자의 기본 모델을 쓴다.
  - Settings는 모델 목록을 읽기 위해 `conversation:models`만 부른다. 대화를 시작·전송하지 않는다.
- **홈 공급자 선택기**: 실행할 수 없는 그룹은 머리에 짧은 상태 문구(`providerShortStatus`)를 보이고, 그 아래에 동작 하나를 `DropdownMenu.Item`(`role="menuitem"`)으로 둔다: 만료 "Sign in again…", 버전 "Update…", 그 밖 "Open Agents settings…". 메뉴 맨 아래에 "Manage agents…"를 둔다. 연결되지 않은 공급자는 선택기에 나오지 않으므로 이 항목이 새 에이전트를 추가하는 길이다. 실행 가능한 에이전트가 없으면 "No agent is ready to run." 아래 "Sign in to an agent…"가 유일한 포커스 대상이다. 누르면 메뉴를 닫고 `openSettings({ section: "agents", provider })`로 간다.

### Notifications

- 소개문: "macOS notifications for when an agent needs you while you work in another app."
- **Desktop notifications** 스위치(기본 켬). 설명 "Only while Doan isn’t the active window. Clicking one opens the conversation." 켰을 때만 **Notify me about** 섹션의 Approval requests · Finished · Couldn’t finish 스위치(기본 모두 켬)가 동작한다. 끄면 이벤트 스위치는 선택을 유지한 채 비활성이 된다.
- **결정은 main이 한다.** 이벤트 대응: Approval requests ← `permission.request`, Finished ← `turn.done`, Couldn’t finish ← `turn.failed`. 사용자가 멈춘 경우는 별도 `interrupted` 이벤트라 알리지 않는다.
- **띄우는 조건**: 메인 창이 포커스됨 → 띄우지 않음. 창은 보이지만 다른 앱이 앞 → 띄움. 창 숨김·최소화·앱 숨김(Hide) → 띄움. Desktop notifications가 꺼져 있으면 이벤트 스위치와 관계없이 띄우지 않음. 같은 대화의 승인 요청 알림은 `permission.resolved`가 오면 닫는다. Notification 객체는 click·close가 동작하도록 대화별로 참조를 붙잡아 둔다.
- **문구**는 공급자와 프로젝트만 쓴다: "<Provider> needs your approval" / "<Provider> finished" / "<Provider> couldn’t finish", 본문 "<project> · <branch>". 권한 요약은 넣지 않는다(PRODUCT §6의 요약 형식 미해결).
- **클릭 해석**(순수 함수, buzz-conversation이 대화 패널로 바꿀 때 이 함수만 바꾼다): main이 창을 보이고 `{ conversationId, root }`를 보낸다. renderer는
  - 대화를 알면 권한 토스트의 Open과 같은 곳으로 간다(`homeRun.ts`).
  - 대화를 모르면(재시작·reload 뒤 알림 센터에 남은 알림) root가 등록돼 있을 때 그 프로젝트 Overview로 가고, 등록돼 있지 않으면 창만 보인다.
  - 페이지 잠금·모달 중이면 창만 보이고 이동하지 않는다. 남은 권한 토스트의 Open이 나중에 같은 곳으로 데려간다.
  - 테스트 알림은 창만 보이고 Notifications에 머문다.
- **Send test notification**은 지금 설정과 관계없이 알림 하나를 띄운다. 띄우면 안내가 "Test notification sent. If you didn’t see it, allow Doan in System Settings › Notifications."로 바뀐다. **Open System Settings ↗**는 main이 고정한 macOS 알림 설정 URL만 연다(renderer가 URL을 정하지 않는다, `INSTALL_URLS`와 같은 방식).
- **첫 권한 요청**: PoC에서 허용 요청은 첫 알림 전 실행 직후에 떴고 첫 알림은 버려지지 않았다('PoC 의존'). 범위는 그대로 둔다.

### Connections

- 소개문: "Your agents reach Doan through these three. Each row says whether that works right now. Signing in for conversations on Home is in Agents."
- 지금 `SettingsConnections`와 `ConnectionRows`(doan command, Claude Code, Codex), Check Again, PATH 줄 복사, 확인 대화상자, 설치 페이지를 옮긴다. 상태 규칙·문구는 PRODUCT §5 항목 0 그대로다.
- 예외 둘:
  - "Another window is running a setup step"은 지운다. `setup:run`을 부르는 곳은 Settings뿐이고 첫 실행 온보딩 서비스는 setupBroker·machine을 쓰지 않으므로, 창이 하나가 되면 다른 주체가 락을 쥘 수 없다. 락의 operation token·confirmation ID·오래된 완료 무시 규칙은 같은 소유자의 늦은 완료를 막으므로 남긴다.
  - Settings 창 focus 때의 60초 스로틀 재읽기는 메인 창 focus 재읽기(Git 새로 고침과 공유하는 60초 스로틀)와 합친다. 페이지 진입과 Check Again은 그대로 읽는다.

### About

- 소개문: "Versions on this Mac, for checking an update or reporting a problem."
- 행: Version(`app.getVersion()`), doan command(경로와 버전), 공급자별 도구(설치 여부, 설치 버전, 지원 상태, Doan이 확인한 최소 버전).
- 읽기: CLI 버전은 새 파서 없이 `runDesignSkill` + `interpretList`(`designSkills.ts`)의 `version`을 재사용한다. dev 빌드는 `dev`, 경로는 bare `doan`일 수 있다. 공급자 도구 정보는 AuthIpc의 `facts` 캐시에서 읽고 CLI를 다시 실행하지 않는다. Antigravity는 CLI·설치 버전이 없으므로 "Downloaded by Doan"으로 보인다. 페이지 진입과 설치 페이지에서 돌아올 때 Agents와 같이 다시 읽는다. 읽는 동안 각 행은 "Checking…", 실패한 행은 "Couldn’t read …" + Retry다.
- **Copy details**: renderer는 클립보드에 쓸 수 없으므로 main 전용 `about:copy`가 main의 About 읽기 결과로 텍스트를 만들어 `clipboard.writeText`로 쓴다(ARCHITECTURE의 "main builds … clipboard strings"). 성공하면 버튼이 잠시 Copied가 된다.

## Project Settings 다이얼로그

- LNB 프로젝트 메뉴의 Project Settings가 그 프로젝트에서 지금 선택된 워크트리(메뉴의 `menuEntry.path`)의 다이얼로그를 연다. 공용 `.doan-dialog` standard 크기(창 위 128px). 제목은 프로젝트 이름과 브랜치, 설명은 저장 위치(`.doan/config.json`)와 커밋 안내다. 액션은 Done 하나다.
- 정상 워크트리: Root, Token CSS(Change…/Clear), Serve(목록·Remove·Add…, 추가 전 확인)는 지금 `ProjectDetail`의 동작·문구·오류 처리·포커스 복귀를 그대로 옮긴다. 쓰기는 지금처럼 main의 `configBridge`가 `doan config --json --repo <root>`로 한다.
- 문제 워크트리: 문제를 설명에 한 번 말하고, 상태 칩과 `cardRow`의 복구 동작(Set Up…, Locate…, Remove from Doan, Show in Finder, Retry, Details)을 보인다. 같은 창이므로 `projects:forward-action` 없이 그 자리에서 기존 동작을 부른다.
- **대상이 바뀌거나 사라질 때**:
  1. 워크트리가 목록에서 사라지면(Remove, 외부 제거) 다이얼로그를 닫는다. 포커스는 프로젝트 메뉴 버튼 → 그 행 → Search 순서로 돌아가고, 알림은 기존 Undo 토스트가 맡는다.
  2. 정상 워크트리가 문제 상태로 바뀌면 같은 다이얼로그가 문제 보기로 바뀐다.
  3. Locate…로 root가 바뀌면 `onFolders`의 reroot(`{from, root}`)를 따라가 새 root로 다시 읽는다.
  4. Set Up…은 다이얼로그를 닫고 기존 `ProjectSetupDialog`를 연다. 모달을 겹치지 않는다.
- 선택·확인·쓰기 중에는 Escape·Done이 다이얼로그를 닫지 않는다(이전 창의 닫기 거부를 대신한다).
- `configBridge` 세션: main 전용 `config:session-start`·`config:session-end`로 다이얼로그를 열 때 새 세션을 받고, 닫을 때 캐시를 비우고 세션을 올려 늦게 온 읽기·선택 답을 무효로 한다. 메인 창 renderer가 바뀌면(`render-process-gone`, `did-navigate`) 같은 정리를 한다. 파일 선택 시트는 메인 창에 붙는다.
- 지금 Settings Projects에서 하던 프로젝트 제거는 사이드바 Remove from Doan이 맡는다(PRODUCT §5 항목 1).

## 창 제거와 IPC

- `senderAllowed.ts`: 창 종류는 main 하나다.
  - main 전용으로 옮김: `settingsOnly`의 `config:read`·`config:write`·`config:choose`·`setup:copy-path-line`, `shared`의 `setup:*`·`agent-auth:*`·`projects:reveal`.
  - 없앰: `projects:get`, `projects` push, `projects:forward-action`, `projects:action` push(`onProjectAction`), `settings:open`, `settings:take-target`, `settings:target`, `settings:tab-get`, `settings:tab-save`.
  - 새로(main 전용): 환경설정 읽기·쓰기, 테스트 알림, 알림 설정 열기, About 읽기, `about:copy`, `config:session-start/end`, 알림 클릭 이벤트, Settings 열기 명령(main → renderer, `openSettings` 대상).
- `setupBroker.ts`: 읽기 토큰과 락 소유자는 main webContents 하나다. 메인 창 renderer가 바뀌면 `broker.drop(owner)`로 대기 중 확인을 취소한다(지금은 `render-process-gone`만 일부 정리한다).
- agent-auth의 `prompt`는 소유 창으로만 간다. 소유 창이 하나라 Settings 페이지와 홈은 같은 소유자이고, App 수준 컨트롤러가 받는다.
- `index.ts`: 메뉴의 `focusedWindow === "settings"` 분기와 Settings 창 close 거부를 지운다.
- **잃는 보장**: "Settings는 대화를 시작·전송하지 않는다"는 지금 Settings 창에 `conversation:*` 채널이 없어서 IPC가 강제한다. 같은 창이 되면 이 보장은 renderer 관례로만 남는다. Settings 컴포넌트가 `startConversation`·`sendConversation`을 쓰지 않음을 테스트로 고정하고, ARCHITECTURE 변경으로 기록한다.

## 순수 함수 (`/tdd` 대상)

1. 페이지 출발점·복귀 규칙(`addProjectsNav.ts` 확장): 페이지 간 이동이 출발점을 지키는지, Projects 탭·Back·Escape 결과, 제거된 프로젝트의 출발점은 Home, 잠금 중 무시, 진입이 대기 중인 시작 복원·workspace 열기를 취소.
2. 카테고리·대상 파싱: `parseSettingsSection`(옛 `settingsTab` 값 `connections`는 유지, `projects`는 Agents로), `openSettings` 대상 파싱(카테고리 + 선택적 공급자), 잠금 중 들어오는 대상의 큐.
3. `menuState`: `screen: "settings"`, 페이지 잠금, Add Projects 잠금 중 Settings… 꺼짐, 첫 실행 중 Settings… 꺼짐, `focusedWindow` 없는 표.
4. 환경설정 파싱·병합: `parsePreferences`(v 1, 기본값, 모르는 필드 무시, 깨진 파일 → 기본값 + 읽기 notice, 더 새 `v` → 기본값 + 저장 막음), 부분 갱신, 깨진 파일을 옮기고 새로 쓰는 결정.
5. 알림 결정 `notificationFor(event, prefs, visibility, names)` → 제목·본문·대상 또는 null, 그리고 클릭 해석 `notificationTarget(click, known, registered, locked)`. 위 '띄우는 조건' 표와 '클릭 해석' 네 경우.
6. 새 대화 기본값: `defaultProvider`·`defaultModel`·`defaultEffort`가 고정 선호를 먼저 쓰고, 연결 끊김은 지금 규칙, 목록에 없는 모델은 공급자 기본으로.
7. Agents Settings 맥락: 섹션 분류(Connected / Not connected, 빈 섹션 숨김)·`providerView`의 늘 보이는 Sign out·Check 문구·Settings용 `autoCheck`·`not_owner` 문구, 홈 선택기의 그룹별 동작과 "Manage agents…"·"Sign in to an agent…", 진입 도착 대상 = 행 그룹.
8. About view-model과 main 쪽 복사 텍스트(`about.ts`): 버전·경로·지원 상태 문구, Antigravity, dev 빌드, 읽는 중·실패 행.
9. Project Settings 다이얼로그: 닫기 가능 여부(선택·확인·쓰기 중 false), 대상 변화 4규칙, `configBridge` 세션 무효화(기존 테스트를 다이얼로그 세션으로 옮김).

## 포맷 변경

- 공유 JSON Schema(ARCHITECTURE §11) 변경 없음. CLI 응답·`runtime.json`·소켓·comment 이벤트·`.doan/config.json` 그대로다.
- 새 앱 전용 파일 `<userData>/preferences.json` `{ "v": 1, "notifications": { "enabled", "approval", "finished", "failed" }, "newConversation": { "provider", "model"?, "effort"? } | null }`. TS만 쓰고 읽으므로 ui-state처럼 스키마 없이 파서 테스트로 지킨다. 정확한 필드 이름은 `/tdd`에서 고정한다.
  - 없으면 기본값이다.
  - 깨진 파일: 기본값으로 동작하고, Notifications·New conversations 위에 "Doan couldn’t read its saved settings, so defaults apply."를 보인다. 사람이 값을 바꿀 때 `preferences.json.broken-<시각>`으로 옮기고 새로 쓴다.
  - 더 새 `v`: 옮기지 않고 기본값으로 동작하며, "These settings were saved by a newer version of Doan." 안내와 함께 저장을 막는다(온보딩 완료 기록과 같은 규칙).
  - 쓰기는 uiState의 직렬화 + 배타 temp + rename 방식을 재사용한다.
  - 저장 실패(파일이 정상일 때): 그 행 아래 "Couldn’t save your notification choices. Your last saved choices still apply." + Retry. New conversations도 같은 형식이다.
- `ui-state.json`: main의 `settingsTab` 합성을 없애고 renderer `UiState`에 `settingsSection`을 둔다. 옛 `settingsTab` 값은 위 순수 함수 2번 규칙으로 한 번 읽는다.

## 컨벤션 영향

없음. ARCHITECTURE §1 캔버스 컨벤션과 `doan check` 규칙을 바꾸지 않는다.

## 결정 영향

- **Settings는 별도 단일 창**(PRODUCT §5 항목 0, ARCHITECTURE §7 'Settings, setup status and first-prompt IPC')을 대체한다. 부모 spec 공통 결정 6에서 승인됐다. 구현 완료 때 본문을 현재 규칙으로 고친다.
- **Settings에는 계정 UI가 없다**(PRODUCT §3)와 "첫 실행이 로그인 UI다"를 대체한다. 부모 C6 계획이다. agent-auth의 백엔드·IPC 계약은 바꾸지 않는다.
- **Settings는 대화를 시작·전송하지 않는다**: IPC 강제에서 테스트로 지키는 관례로 바뀐다('창 제거와 IPC'). ARCHITECTURE §7 'Agent authentication' IPC 문장을 고친다.
- **창 경계**: 모든 invoke는 등록된 메인 창의 main frame만 허용한다. preload 노출이 권한이 아니라는 원칙, renderer가 URL·config 경로·클립보드 문자열을 정하지 못한다는 원칙(설치 URL, 알림 설정 URL, 선택 ID, `about:copy`)은 유지한다.
- **샌드박스 iframe·append-only 이벤트·토큰 처리 없음·git 작업 없음·서빙 범위**: 건드리지 않는다. 알림은 이벤트를 읽기만 하고 저장하지 않는다.
- **사용자 권한 물려받기**(PRODUCT §3): 권한·샌드박스 설정 화면을 만들지 않으므로 유지된다.
- **Project Settings 위치**: 저장소 설정(Token CSS·Serve)이 앱 Settings에서 프로젝트 메뉴 다이얼로그로 옮겨진다. `doan config` 계약과 사람의 승인으로만 MCP가 바꾼다는 규칙은 그대로다.

## PoC 의존

- **macOS 알림 PoC 결과**(P1, 2026-10-30, 사용자와 함께 확인. 스크립트 `.scratch/buzz-settings/notify/main.cjs`, 로그 `poc-dev.log`·`poc-pkg.log`). Electron 45.0.0.
  - **dev 빌드에서는 알림이 뜨지 않는다.** `Electron.app`(`com.github.Electron`, ad-hoc 서명)의 `new Notification().show()`는 `failed` 이벤트로 "UNErrorDomain 오류 1"(알림 허용 안 됨)을 내고, 허용 요청도 시스템 설정 알림 목록 항목도 생기지 않았다. 원인이 ad-hoc 서명인지는 확정하지 못했다(같은 ad-hoc 서명인 패키지 복사본은 동작했다). 그래서 알림의 실제 앱 확인은 패키지 빌드에서만 한다.
  - **패키지 빌드에서는 뜬다.** 패키지 `Doan.app` 복사본(`design.doan.app`, ad-hoc 서명, `app.asar` 대신 PoC 폴더)을 `open`으로 실행했다. 허용 요청은 첫 알림을 보내기 전, 실행 직후에 떴다. PoC는 시작 때 `Notification.isSupported()`만 불렀다. 사용자가 허용한 뒤 `show` 이벤트와 배너가 정상이었다. 실행 직후에 요청이 뜨므로 "첫 알림이 버려지는가" 문제는 생기지 않았다. 다만 요청 시점이 실제 Doan 첫 실행과 겹치는지는 구현 때 확인한다.
  - **클릭**: 참조를 붙잡은 알림은 모든 경우 `click`이 왔다. 창 포커스, 다른 앱이 앞, 앱 숨김(`app.isHidden()` true), 최소화가 모두 해당한다. 클릭 순간 창은 포커스가 없고 숨김·최소화 상태 그대로다. 앱이 직접 `show()`·`focus()`해야 앞으로 온다.
  - **참조를 붙잡지 않은 알림**(`gc()` 실행 뒤): 배너는 남았지만 `click` 이벤트가 기록되지 않았다. 알림 클릭으로 앱만 활성화된 것으로 보인다. 그래서 대화별로 참조를 붙잡는다는 설계를 유지한다.
  - **`close()`**: 알림 센터에서 항목이 지워진다(사용자 확인). `close` 이벤트는 아직 떠 있는 알림에서만 온다.
  - **권한 상태**: 읽는 API는 없다. 허용되지 않으면 `failed` 이벤트가 온다. 그래서 테스트 알림의 `failed`로 상태를 안다.
  - **설정 URL**: `x-apple.systempreferences:com.apple.Notifications-Settings.extension`이 시스템 설정의 알림 화면을 연다(`openExternal` resolve, 사용자 확인).
- PoC가 바꾼 실제 상태: 시스템 설정 알림 목록에 `design.doan.app`(Doan) 항목이 생겼고 사용자가 허용했다. 실제 Doan 앱도 같은 번들 id라서 이 허용을 그대로 쓴다.
- 설계 반영:
  - `Notification`의 `failed`를 받는다. 테스트 알림이 실패하면 안내를 "Doan isn’t allowed to show notifications. Allow it in System Settings › Notifications."(error)로 바꾼다. 실제 알림이 실패하면 기록만 남기고 사람에게 다시 묻지 않는다.
  - 클릭 처리에서 main이 창을 `show()`·`focus()`한다. 최소화 상태면 `restore()`도 부른다.
  - dev 빌드에서 Notifications를 열면 테스트 알림이 실패 안내를 보인다. 이는 정상 동작이다.
- 나머지는 이미 있는 기반(agent-auth IPC, setupBroker, configBridge, ShellSidebar, Add Projects 페이지 내비게이션) 위에서 동작한다.

## POSTMORTEM 함정

- **2026-10-25 — A forwarded Settings target discarded a pending setup confirmation**: 탭 클릭만 막고 외부에서 오는 대상을 놓쳐 확인 대화상자가 사라졌다. 이제는 헤더 탭·사이드바·Quick Open·메뉴·알림 클릭 등 같은 창의 이동이 모두 같은 위험이다. 잠금은 App의 모든 이동 함수에 걸고(Add Projects의 `leaveLocked`와 같은 방식) 카테고리 전환과 들어오는 대상도 큐에 둔다. 같은 구조(컴포넌트 수명과 main 작업 수명이 갈라짐)가 로그인 상태에도 있어 App 수준 컨트롤러로 옮긴다. 예방 검색: `rg -n 'setTarget|queuedTarget|onTarget|onBusy|returnFocus|installRequests'`.
- **2026-10-25 — An older install failure replaced newer feedback**: Agents·Connections의 설치 페이지와 로그인 링크 피드백은 최신 요청에만 묶는다(`installRequests` 카운터 유지).
- **2026-10-25 — Production CSS extraction concealed missing development styles**: `settings.css`를 없애고 새 스타일은 `styles.css`의 CSS `@import`로 싣는다. dev와 production 모두에서 대표 자식 요소의 computed style을 확인한다.
- **2026-10-25 — A static draft's overflow match hid an unusable checklist**: 본문 패널 스크롤을 넘칠 만큼의 데이터(공급자 다섯 개 + 펼친 notice, 좁은 창)로 실제로 끝까지 내려 확인한다.
- **2026-10-25 — A TS helper hid its TSX component on case-insensitive macOS**: `SettingsPage.tsx`와 `settingsPage.ts`처럼 대소문자만 다른 이름을 만들지 않는다(순수 모듈은 `settingsSections.ts` 등 다른 이름).
- **모달 뒤 포커스**(부모 공통 함정): Project Settings 다이얼로그와 확인 대화상자는 `showModal`·포커스 복귀 순서를 지금 `SettingsDialog`대로 둔다.
- **2026-10-27 — Shell navigation shortcuts lost destination ownership and recovery access**: Settings 페이지 진입이 대기 중인 시작 복원·workspace 열기를 취소하고, 진행 중인 이동보다 앞서는지 확인한다(Add Projects 페이지 진입과 같은 규칙).

## DESIGN.md 절

- 'Settings' 절을 Settings 페이지와 Project Settings 다이얼로그의 측정값으로 다시 쓰고 "buzz-ds 이전" 표시를 지운다(부모 'DESIGN.md 절과 담당').
- 'App shell'의 헤더 캡슐 설명에 Settings 탭의 선택 상태를 더한다. 'Home'에 공급자 선택기 동작을, 'Terms shared with onboarding'에 Settings 줄(Check, Copilot 비용 문구, Sign in again을 Home이 제공함)을, 'Dialogs'에 Done 하나 예외를, 공용 요소에 스위치와 설정 그룹·행을 더한다.
- 다이얼로그 액션 버튼 크기: DESIGN은 기본 크기라고 하지만 온보딩 Stop·Paste 다이얼로그 코드는 sm이다. 이 feature는 기본 크기를 쓰고, 온보딩 쪽 불일치는 DESIGN에 미해결로 적는다.
