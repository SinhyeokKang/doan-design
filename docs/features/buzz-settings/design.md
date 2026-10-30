# buzz-settings — design

[부모 design](../buzz-restyle/design.md)의 공통 결정·Buzz clone 참조 규칙·CSS 싣는 방법·드래그 영역·금지 표현을 따른다. 이 문서는 이 자식 범위의 세부만 적는다.

## 결정 기록 (2026-10-30 user)

- Settings는 별도 창이 아니라 AppShell 페이지다. AppShell 스타일과 LNB를 그대로 재사용한다. Buzz Settings와 같은 모달·통합 사이드바는 쓰지 않는다.
- Buzz에서 참고하는 것은 본문 패널의 카테고리별 구성 방법뿐이다.
- 지금 구현된 항목만 옮기지 않고, 앱에 필요한 설정을 더한다. 더하는 것: 알림, 새 대화 기본 에이전트·모델, 앱 정보(About). Agents(계정)는 부모 C6 계획대로 넣는다.
- 저장소별 Token CSS·Serve는 앱 Settings에서 빼고 프로젝트 아래, 곧 LNB 프로젝트 메뉴의 Project Settings가 여는 다이얼로그로 옮긴다.

## 초안 요청 (`/design-draft`)

- 캔버스 `.doan/canvases/buzz-settings.html`, id `buzz-settings`, 폭 2560. Add Projects 초안과 같은 1238 × 780 전체 창 틀(셸 헤더, LNB, 흰 본문 패널)이다.
- 1차(2026-10-30 user: 창만 먼저 그려 구성을 승인받고, 상태 타일은 `--revise`에서 더한다). 창 10개이며 모두 `/design-sync` 비교 대상이다.
  - `agents` — Agents: Accounts(연결됨, 만료, 미설치, 미연결, Copilot 확인) + New conversations
  - `agents-signing-in` — Agents: Codex 로그인 대기, 다른 행의 busy 문구
  - `notifications` — Notifications: 켬
  - `notifications-off` — Notifications: Desktop notifications 꺼짐
  - `connections` — Connections: 지금 행을 설정 그룹으로 옮김, doan command Details 펼침
  - `connections-locked` — Connections: Fix the Doan link? 확인 대화상자와 이동 잠금
  - `about` — About
  - `project-settings` — Project Settings 다이얼로그: 정상 워크트리
  - `project-problem` — Project Settings 다이얼로그: Missing 워크트리
  - `home-agent-picker` — 홈 공급자 선택기의 Settings 동작
- 2차(`--revise`) 상태 타일 후보: 공급자 행 상태(업데이트, 로그아웃 실패, stop 확인, 주소 붙여넣기, 읽기 오류), New conversations 상태, 알림 저장 실패·테스트 보냄, About 읽기 실패, Project Settings 저장 중·저장됨·오류·Serve 확인·읽기 오류, 홈 "No agent is ready".

## Buzz 레퍼런스

기준 커밋 `c40dfdf4c81aabe759f3a4329c3e77f854746a59`(로컬 HEAD `ec1b9acc`, 2026-10-30 확인, 기준 커밋 파일을 `git show`로 읽었다). 값은 구현할 때 원본에서 다시 읽는다(부모 규칙 4).

| 가져오는 것 | 원본 | 내용 |
|---|---|---|
| 카테고리 본문 구성 | `src/app/NotificationSettings.tsx` | 카테고리 제목(`Header`) → 섹션마다 섹션 제목(`InlineHeader`) + `SettingsGroup` → 행. 섹션 사이 `gap-section-gap` |
| 읽기 열 | `src/app/Settings.module.css` `.detail` | 본문 패딩 `space-8 / space-6 / space-6`, 자식 `max-inline-size: 48rem` 가운데 정렬, 좁은 폭 `@container (max-width: 36rem)` |
| 그룹 | `src/shared/design-system/ui/SettingsGroup.tsx`, `styles/settings-group.css` | `layout` rows(구분선) · form · cards, `--settings-group-inset: var(--space-4)` |
| 행 | `src/shared/design-system/ui/PreferenceRow.tsx`, `SwitchPreferenceRow.tsx`, `styles/components.css` 2207–2295행 | 제목·설명 + 오른쪽 컨트롤 grid, 행 패딩 `space-3 0`, gap `space-4`, 설명 `text-subtle`, disabled는 `text-unavailable`, 24rem 이하에서 버튼 컨트롤이 아래 줄로 |
| 스위치 | `styles/components.css` `.buzz-switch*` 2152–2205행 | 36 × 20 트랙, 14px 썸, 켬은 `affordance-prominent` |
| 권한 상태 줄 | `NotificationSettings.tsx` `permissionStatus` | 꺼진 시스템 권한을 행 아래 상태 문장 + link 버튼(Check permission)으로 보인다 |

가져오지 않는 것: `Settings.tsx`의 Dialog 표시와 `navigation` 슬롯, `SettingsSidebar.tsx`의 `SidebarNavigation`·`NavigationSection`(doan LNB를 재사용한다), 섹션 그룹 정책(`settings-sections.ts`), 플러그인 목록, 소리 선택, `ToastNotice`(doan은 공용 토스트·notice를 쓴다).

## 영향 컴포넌트

- **앱 main** (`app/src/main/`): Settings 창 제거(`index.ts`의 `settingsWin`·`createSettingsWindow`·`openSettings`·`sendSettings`, `settings.ts`의 `SETTINGS_WINDOW`·`SETTINGS_TITLES`·`ProjectRow`·`projectRows`·`parseForwardedAction`), `senderAllowed.ts`의 `WindowKind`를 main 하나로, `setupBroker.ts`의 창별 읽기 토큰과 락 소유자를 main 창의 페이지·다이얼로그 세션으로, `configBridge.ts`의 Settings 세션을 Project Settings 다이얼로그 세션으로, `menuState.ts`의 `focusedWindow` 제거와 `screen: "settings"` 추가, `uiState.ts`의 `settingsTab` → `settingsSection`. 새로: 환경설정 저장(`preferences.ts`), 알림(`notifications.ts`), About 읽기.
- **preload**: `app/src/preload/settings.ts` 삭제. 남는 메서드를 `app/src/preload/index.ts`(`window.doan`)로 옮기고 중복(agent-auth)은 하나로.
- **앱 renderer**: 삭제 `settings.html`, `settings.ts`, `settingsWindow.tsx`, `settingsProjects.tsx`, `settings.css`. 새로 `SettingsPage.tsx`와 카테고리 컴포넌트, `ProjectSettingsDialog.tsx`(지금 `ProjectDetail`을 옮김). 바뀜: `App.tsx`(화면 `settings`, `TopBar`의 Settings 탭), `ShellSidebar.tsx`(Settings 페이지의 카테고리 목록, Project Settings가 다이얼로그를 염), `HomeComposerView.tsx`(공급자 선택기 동작), `homeComposer.ts`(기본값), `agentAuthView.ts`(Settings 맥락의 Sign out·Check), `addProjectsNav.ts`(페이지 출발점 규칙을 두 페이지가 공유), `SettingsDialog.tsx`(확인 대화상자, 이름 유지 또는 공용으로 이동), `styles.css`·`ds/`(설정 그룹·행·스위치).
- **CLI·MCP·스킬·공유 포맷**: 변경 없음. `doan config` 호출 경로도 그대로다.
- **빌드**: `electron.vite.config`의 renderer·preload 진입점에서 settings 제거(빌드 설정 변경이지만 이 feature가 요청한 범위다).

## 화면과 내비게이션

- 메인 창의 화면은 Home, `workspace(root)`, `addProjects`, `settings`다. Settings와 Add Projects를 **페이지**라 부른다. 두 페이지는 같은 출발점 규칙을 쓴다: 페이지에 들어갈 때 Projects 쪽 마지막 화면(Home 또는 workspace)을 출발점으로 두고, 페이지끼리 옮겨도 출발점은 바뀌지 않는다. Projects 탭·Back·Escape(입력 중·IME 조합 중 제외)가 출발점으로 돌아간다. Forward는 꺼진다. 페이지는 Back/Forward 방문이 아니고, 재시작 때 복원하지 않는다(ui-state에는 출발점만 남긴다). 순수 규칙은 `addProjectsNav.ts`를 두 페이지용으로 넓힌다(이름은 구현 때 정한다).
- 들어가는 길: 헤더 Settings 탭, Settings…(Cmd+,), 홈 공급자 선택기 동작(Agents와 공급자 지정). 탭과 메뉴는 마지막 카테고리(`settingsSection`, 기본 Agents)를 연다. 들어가면 카테고리 제목에 포커스를 둔다(`useProjectFocus`처럼).
- 메뉴: Settings…는 첫 실행 중, 모달이 열린 동안, 페이지 잠금 중에 꺼진다. Close Window(Cmd+W)는 늘 메인 창을 숨긴다. Settings 페이지에서 Add Project…는 Add Projects 페이지로 옮긴다. Quick Open은 Add Projects 페이지와 같은 규칙이다.
- 열린 상태에서 다른 대상이 오면(예: Settings 페이지에서 홈 동작은 없지만 메뉴 Cmd+,) 같은 페이지 안에서 카테고리만 바꾼다. 카테고리가 확인 대화상자나 쓰기를 소유하는 동안 오는 대상은 지금처럼 큐에 두고 끝난 뒤 적용한다(POSTMORTEM 2026-10-25 'A forwarded Settings target discarded a pending setup confirmation').

### LNB

- 기존 `ShellSidebar` 틀(폭 260, Search, 섹션 제목, 32px 행, 무채색 hover·선택)을 그대로 쓴다. Settings 페이지에서는 'Projects' 섹션 자리에 'Settings' 섹션 제목과 카테고리 행 네 개(Agents, Notifications, Connections, About, 각 lucide 아이콘)를 보인다. 선택 행은 `aria-current="page"`.
- Search 행은 남는다. 프로젝트 행·프로젝트 메뉴·캔버스 행은 Settings 페이지에서 보이지 않는다. 세부 배치는 `/design-draft`가 정하고 사용자가 승인한다.
- 키보드: 카테고리 행은 일반 버튼 목록이다(Buzz와 같이 Tab/Enter). 프로젝트 트리의 roving tabindex·typeahead는 쓰지 않는다.

### 본문

- 기존 흰 본문 패널(`.home-panel`과 같은 패널)이 스크롤 컨테이너다(`.doan-scroll`). 그 안에 48rem 가운데 열, 카테고리 제목 → 섹션(제목 + 그룹 + 행)을 둔다. 값은 Buzz 레퍼런스 표를 따르되 doan 토큰 이름으로 새로 쓴다.
- 새 공용 스타일 `doan-settings-group`, `doan-preference-row`, `doan-switch`를 `app/src/renderer/ds/`에 둔다. 스위치는 `button[role="switch"][aria-checked]`에 건다. 지금 `components/ui/`에는 tooltip뿐이라 shadcn Switch를 들이면 새 의존성이 생기므로 들이지 않는다(공통 결정 4의 Radix 스택과 충돌하지 않는다). 같은 대상을 겨누는 `settings.css`의 옛 규칙은 지운다.

### 잠금

- Connections의 설정 쓰기·확인 대기, Agents의 `stop_required` 확인 대화상자가 열려 있는 동안은 페이지를 떠나는 모든 이동을 무시하고 꺼진 것으로 보인다. 대상은 Add Projects 잠금과 같다(헤더 탭, Back, Search, 사이드바 이동, Home, Quick Open, Add Project…, Undo Remove). 이전 Settings 창의 '쓰기 중 닫기 거부'를 대신한다.
- 로그인 대기는 잠그지 않는다. 시도의 소유자는 메인 창이므로 다른 화면으로 가도 계속되고, 돌아오면 그 행이 Cancel·Open again을 보인다. 끝나면 지금 규칙대로 한 번 알린다. (이전 창에서는 창을 닫으면 시도가 취소됐다. 창이 사라지지 않으므로 그 규칙은 없어진다.)
- Add Projects 잠금(설정 쓰기·clone) 중에는 Settings 탭과 Settings…도 잠긴다. 지금은 Settings…가 별도 창이라 잠금 중에도 열렸지만 이제는 페이지 이동이기 때문이다. Project Settings 다이얼로그는 이동이 아니므로 잠금 중에도 열린다.

## 카테고리

### Agents

- **Accounts** 섹션: 다섯 공급자 행. 행 문구·버튼·notice·aria는 `agentAuthView.ts`의 `providerView`·`authListView`·`stopDialog`·`pasteDialog`·`replyEffect`·`readyAnnouncements`를 재사용한다. 첫 실행 Agent 단계와 다른 점만 Settings 맥락 인자로 더한다.
  - 연결된 공급자에 늘 Sign out이 있다(첫 실행은 실패한 로그아웃·재인증 때만).
  - 자동 확인: 페이지에 들어갈 때 Copilot을 뺀 공급자를 확인한다(첫 실행과 같은 규칙, 설치 페이지에서 돌아올 때 포함). Copilot은 Check 버튼으로만 확인하며 요청 1회를 쓴다고 말한다.
  - `stop_required`는 확인 대화상자 뒤 `stop: true`로 다시 보낸다. `sign_out_failed`는 지금 문구를 쓴다.
  - Settings는 대화를 시작·전송하지 않는다(ARCHITECTURE §7 'Agent authentication' IPC).
- **New conversations** 섹션: Agent(Last used · 연결된 공급자), Model(Default · 목록), Effort(Default · 목록). 모델 목록은 공급자·root별로만 읽히므로(`listConversationModels`), 홈이 기본으로 고를 프로젝트(`defaultProject`)의 root로 읽는다. 정상 프로젝트가 없으면 Model·Effort를 끄고 이유를 말한다. 저장값은 선호일 뿐이다: 홈은 이 run에서 받은 목록에 있을 때만 그 모델을 쓰고, 없거나 연결이 끊겼으면 지금 규칙(마지막 사용값 → 첫 ready)으로 돌아간다. Last used는 지금 동작 그대로다.
- 홈 공급자 선택기: 실행할 수 없는 그룹의 짧은 상태 문구 옆과 "No agent is ready to run." 아래에 동작(문구는 초안에서 정한다, 예 "Sign in…" / "Open Agents settings")을 둔다. 누르면 메뉴를 닫고 Settings > Agents로 가서 그 공급자 행을 강조·포커스한다. `providerShortStatus`의 주석이 이 자리를 예고했다.

### Notifications

- **Desktop notifications** 스위치(기본 켬). 켰을 때만 **Notify me about** 섹션의 Approval requests · Finished · Couldn't finish 스위치(기본 모두 켬)가 동작한다.
- 결정은 main이 한다. main은 대화 이벤트를 이미 저장·전달한다. `permission.request`, `turn.done`, `turn.failed`(사용자가 멈춘 interruption은 제외) 이벤트가 오고, 메인 창이 포커스되지 않았거나 숨겨졌거나 앱이 숨겨졌을 때 Electron `Notification`을 띄운다. 같은 대화의 승인 요청 알림은 해결되면 닫는다.
- 문구는 공급자와 프로젝트만 쓴다: "<Provider> needs your approval" / "<Provider> finished" / "<Provider> couldn't finish", 본문 "<project> · <branch>". 권한 요약은 넣지 않는다(PRODUCT §6의 요약 형식 미해결).
- 알림을 누르면 main이 창을 보이고 renderer에 그 대화 id를 보낸다. renderer는 권한 토스트의 Open과 같은 처리(`homeRun.ts`)를 한다.
- Send test notification은 지금 설정과 관계없이 알림 하나를 띄운다. Open Notification Settings는 main이 고정한 macOS 알림 설정 URL만 연다(renderer가 URL을 정하지 않는다, `INSTALL_URLS`와 같은 방식). 시스템 권한 상태를 읽을 수 있는지는 PoC가 정한다. 읽을 수 없으면 "If no notification appears, allow Doan in System Settings." 같은 고정 안내를 둔다.

### Connections

- 지금 `SettingsConnections`와 `ConnectionRows`(doan command, Claude Code, Codex), Check Again, PATH 줄 복사, 확인 대화상자, 설치 페이지, 다른 창 busy 안내를 옮긴다. 상태 규칙·문구·새로 고침 시점은 PRODUCT §5 항목 0 그대로다. "Another window is running a setup step" 문구는 창이 하나가 되므로 실제로 생길 수 있는 경우(CLI·MCP 온보딩 세션과의 경합)가 있는지 확인하고, 없으면 지운다.
- Settings 창 focus 때 60초 스로틀 재읽기는 메인 창 focus 재읽기와 합친다.

### About

- Doan 버전(`app.getVersion()`), `doan` CLI: 경로(번들 또는 `DOAN_CLI`)와 버전, 다섯 공급자 CLI: 설치 여부, 설치 버전(`ToolFacts.installed`), 지원 상태(`ToolFacts.version`), Doan이 확인한 최소 버전.
- CLI 버전은 새 CLI 명령 없이 기존 출력의 `version`(`doan design-skill --json` result)으로 읽는다. 읽기 실패는 그 행에 "Couldn't read" + Retry. Copy 버튼이 전체를 한 덩어리 텍스트로 복사한다(문의용).

## Project Settings 다이얼로그

- LNB 프로젝트 메뉴의 Project Settings가 그 프로젝트에서 지금 선택된 워크트리(메뉴의 `menuEntry.path`)의 다이얼로그를 연다. 공용 `.doan-dialog` standard 크기. 제목은 프로젝트 이름과 브랜치.
- 정상 워크트리: Root, Token CSS(Change…/Clear), Serve(목록·Remove·Add…, 추가 전 확인)는 지금 `ProjectDetail`의 동작·문구·오류 처리·포커스 복귀를 그대로 옮긴다. 쓰기는 지금처럼 main의 `configBridge`가 `doan config --json --repo <root>`로 한다.
- 문제 워크트리: 상태 칩과 `cardRow`의 복구 동작(Set Up…, Locate…, Remove, Show in Finder, Retry, Details)을 보인다. 이제 같은 창이므로 `projects:forward-action` 없이 그 자리에서 기존 동작을 부른다.
- 선택·확인·쓰기 중에는 Escape·Close가 다이얼로그를 닫지 않는다(이전 창의 닫기 거부를 대신한다).
- `configBridge`의 Settings 세션은 다이얼로그 세션이 된다: 열 때 새 세션, 닫으면 캐시를 비우고 세션을 올려 늦게 온 읽기·선택 답을 무효로 한다. 파일 선택 시트는 메인 창에 붙는다.
- 지금 Settings Projects에서 하던 프로젝트 제거는 사이드바 Remove from Doan이 맡는다(PRODUCT §5 항목 1).

## 창 제거와 IPC

- `senderAllowed.ts`: `settingsOnly`의 채널(`config:*`, `setup:copy-path-line`, `settings:tab-*`, `settings:take-target`)과 `shared`의 Settings용 채널을 main 전용으로 합친다. `projects:get`·`projects` push·`projects:forward-action`·`settings:open`·`settings:take-target`·`settings:target`은 없앤다. 새 채널(환경설정 읽기·쓰기, 테스트 알림, 알림 설정 열기, About 읽기, 알림 클릭 이벤트)은 main 전용이다.
- `setupBroker.ts`: 창이 하나라 창별 읽기 토큰·락 소유자는 main webContents 하나다. 락의 operation token·confirmation ID와 오래된 완료 무시 규칙은 유지한다. 실제 경합 상대는 CLI·MCP 온보딩 세션이므로 그 경로의 `busy`는 남는다. 렌더러가 사라지면(`render-process-gone`) 대기 중 확인을 취소하는 규칙도 남는다.
- agent-auth의 `prompt`는 소유 창으로만 간다. 소유 창이 하나라 Settings 페이지와 홈은 같은 소유자다. 첫 실행이 아닌 동안 홈에는 로그인 UI가 없으므로 충돌이 없다.
- `index.ts` 메뉴의 `focusedWindow === "settings"` 분기, Dock 활성화의 창 선택, Cmd+Q의 두 창 닫기 순서를 정리한다.

## 순수 함수 (`/tdd` 대상)

1. 페이지 출발점·복귀 규칙(`addProjectsNav.ts` 확장): 페이지 간 이동이 출발점을 지키는지, Projects 탭·Back·Escape 결과, 제거된 프로젝트의 출발점은 Home, 잠금 중 무시.
2. 카테고리 파싱·기본값: `parseSettingsSection`(옛 `settingsTab` 값 `connections`는 유지, `projects`는 기본 Agents로), 들어가는 대상 파싱(카테고리 + 선택적 공급자).
3. `menuState`: `screen: "settings"`, 페이지 잠금, `focusedWindow` 제거 후 표.
4. 환경설정 파싱·병합: `parsePreferences`(v 1, 모르는 필드 무시, 깨진 파일은 기본값 + 덮어쓰지 않음), 부분 갱신.
5. 알림 결정: `notificationFor(event, prefs, visibility, names)` → 제목·본문·대상 대화 또는 null. interruption 제외, 포커스 중 null, 끈 이벤트 null, 승인 해결 시 닫을 알림.
6. 새 대화 기본값: `defaultProvider`·`defaultModel`·`defaultEffort`가 고정 선호를 먼저 쓰고, 연결 끊김·목록 없음에서 지금 규칙으로 돌아가는지.
7. Agents 행 Settings 맥락: `providerView`의 늘 보이는 Sign out, Copilot Check 문구, 홈 선택기의 동작 대상(`providerShortStatus` 옆 동작 view-model).
8. About view-model: 버전·경로·지원 상태 문구, 읽기 실패 행, 복사 텍스트.
9. Project Settings 다이얼로그 닫기 가능 여부(선택·확인·쓰기 중 false)와 `configBridge` 세션 무효화(기존 테스트를 다이얼로그 세션으로 옮김).

## 포맷 변경

- 공유 JSON Schema(ARCHITECTURE §11) 변경 없음. CLI 응답·`runtime.json`·소켓·comment 이벤트·`.doan/config.json` 그대로다.
- 새 앱 전용 파일 `<userData>/preferences.json` `{ "v": 1, "notifications": { "enabled", "approval", "finished", "failed" }, "newConversation": { "provider", "model"?, "effort"? } | null }`. TS만 쓰고 읽으므로 ui-state처럼 스키마 없이 파서 테스트로 지킨다. 없으면 기본값이고, 깨진 파일은 덮어쓰지 않고 기본값으로 동작하며 저장 실패를 그 카테고리에 표시한다. 정확한 필드 이름은 `/tdd`에서 고정한다.
- `ui-state.json`의 `settingsTab`은 `settingsSection`으로 바꾼다. 옛 값은 위 2번 규칙으로 읽는다.

## 컨벤션 영향

없음. ARCHITECTURE §1 캔버스 컨벤션과 `doan check` 규칙을 바꾸지 않는다.

## 결정 영향

- **Settings는 별도 단일 창**(PRODUCT §5 항목 0, ARCHITECTURE §7 'Settings, setup status and first-prompt IPC')을 대체한다. 부모 spec 공통 결정 6에서 승인됐다. 구현 완료 때 본문을 현재 규칙으로 고친다.
- **Settings에는 계정 UI가 없다**(PRODUCT §3)를 대체한다. 부모 C6 계획이다. agent-auth의 백엔드·IPC 계약은 바꾸지 않는다. Settings는 여전히 대화를 시작·전송하지 않는다.
- **창 경계**: 모든 invoke는 등록된 메인 창의 main frame만 허용한다는 규칙이 오히려 단순해진다. preload 노출이 권한이 아니라는 원칙, renderer가 URL·config 경로를 정하지 못한다는 원칙(설치 URL, 알림 설정 URL, 선택 ID)은 유지한다.
- **샌드박스 iframe·append-only 이벤트·토큰 처리 없음·git 작업 없음·서빙 범위**: 건드리지 않는다. 알림은 이벤트를 읽기만 하고 저장하지 않는다.
- **사용자 권한 물려받기**(PRODUCT §3): 권한·샌드박스 설정 화면을 만들지 않으므로 유지된다.
- **Project Settings 위치**: 저장소 설정(Token CSS·Serve)이 앱 Settings에서 프로젝트 메뉴 다이얼로그로 옮겨진다. `doan config` 계약과 사람의 승인으로만 MCP가 바꾼다는 규칙은 그대로다.

## PoC 의존

- **macOS 알림**: Electron 45 `Notification`이 (a) 서명하지 않은 로컬 패키지 앱(`npm --prefix app run package`)과 (b) dev 빌드에서 실제로 뜨는지, 처음 띄울 때 권한 요청이 어떻게 보이는지, 클릭 이벤트가 앱 재활성화와 함께 오는지, 시스템 권한 상태를 읽을 방법이 있는지, macOS 알림 설정을 여는 URL(`x-apple.systempreferences:com.apple.Notifications-Settings.extension` 후보)이 열리는지 모른다. 알림 구현 전에 `.scratch/`에서 확인한다. 실패하면 알림 카테고리 범위를 사용자와 다시 정한다.
- 나머지는 이미 있는 기반(agent-auth IPC, setupBroker, configBridge, ShellSidebar, Add Projects 페이지 내비게이션) 위에서 동작한다.

## POSTMORTEM 함정

- **2026-10-25 — A forwarded Settings target discarded a pending setup confirmation**: 탭 클릭만 막고 외부에서 오는 대상을 놓쳐 확인 대화상자가 사라졌다. 이제는 헤더 탭·사이드바·Quick Open·메뉴 등 같은 창의 이동이 모두 같은 위험이다. 잠금은 App의 모든 이동 함수에 걸고(Add Projects의 `leaveLocked`와 같은 방식) 카테고리 전환과 들어오는 대상도 큐에 둔다. 예방 검색: `rg -n 'setTarget|queuedTarget|onTarget|onBusy|returnFocus|installRequests'`.
- **2026-10-25 — An older install failure replaced newer feedback**: Agents·Connections의 설치 페이지와 로그인 링크 피드백은 최신 요청에만 묶는다(`installRequests` 카운터 유지).
- **2026-10-25 — Production CSS extraction concealed missing development styles**: `settings.css`를 없애고 새 스타일은 `styles.css`의 CSS `@import`로 싣는다. dev와 production 모두에서 대표 자식 요소의 computed style을 확인한다.
- **2026-10-25 — A static draft's overflow match hid an unusable checklist**: 본문 패널 스크롤을 넘칠 만큼의 데이터(공급자 다섯 개 + 펼친 notice, 좁은 창)로 실제로 끝까지 내려 확인한다.
- **2026-10-25 — A TS helper hid its TSX component on case-insensitive macOS**: `SettingsPage.tsx`와 `settingsPage.ts`처럼 대소문자만 다른 이름을 만들지 않는다(순수 모듈은 `settingsSections.ts` 등 다른 이름).
- **2026-10-24 — 모달 뒤 포커스**(부모 공통 함정): Project Settings 다이얼로그와 확인 대화상자는 `showModal`·포커스 복귀 순서를 지금 `SettingsDialog`대로 둔다.
- **2026-10-27 — Shell navigation shortcuts lost destination ownership and recovery access**: Settings 페이지 진입이 대기 중인 시작 복원·workspace 열기를 취소하고, 진행 중인 이동보다 앞서는지 확인한다(Add Projects 페이지 진입과 같은 규칙).

## DESIGN.md 절

- 'Settings' 절을 Settings 페이지와 Project Settings 다이얼로그의 측정값으로 다시 쓰고 "buzz-ds 이전" 표시를 지운다(부모 'DESIGN.md 절과 담당'). 'Settings and Home setup (2026-10-25)'의 Settings 부분과 표시 삭제도 이 자식 몫이다.
- 'App shell'의 헤더 캡슐 설명에 Settings 탭의 선택 상태를 더한다. 'Home'에 공급자 선택기 동작을 더한다.
