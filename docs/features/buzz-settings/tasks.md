# buzz-settings — tasks

순서: PoC → 순수 함수(새 함수와 하위 호환만) → shell 추가(새 IPC·알림·환경설정, 창과 나란히 동작) → UI 전환(페이지·다이얼로그, Settings…가 페이지를 연다) → 제거(창·preload·옛 파일과 시그니처 정리) → 문서 승격. 매 commit은 typecheck·빌드가 되고 사람이 설정에 닿는다.

각 commit 경계 직전에 `node .agents/skills/verify/scripts/verify.mjs`를 통과시킨다. 문서만 바뀌는 commit은 대상 문서 확인으로 대신한다. 앱 동작이 바뀐 commit 뒤에는 `/runtime-test`로 바뀐 동작만 격리 실행에서 짧게 확인한다.

**검증 필터 규칙**: `npm --prefix app test -- <이름>`의 이름은 그 task가 **새로 만드는** 테스트 파일이다. 함께 `ls`로 그 파일이 있는지 확인한다. vitest는 필터 중 하나만 맞아도 맞은 파일만 실행하므로, 기존 파일 이름만으로는 새 테스트가 없어도 통과하기 때문이다.

**실제 상태 규칙**: macOS 알림 권한(번들 id 기준으로 시스템에 등록), 알림 배너 클릭, Codex 계정 로그인은 사용자와 함께 한다. 시작 전에 무엇이 바뀌는지 알리고 허락을 받는다. 실행할 때는 userData·HOME·SHELL·`CLAUDE_CONFIG_DIR`·`CODEX_HOME`·`DOAN_RUNTIME`을 격리한다(AGENTS.md 'Commands').

## P. PoC

- [ ] P1. macOS 알림 PoC(`.scratch/buzz-settings/notify/`). 위 격리로 dev 빌드와 `npm --prefix app run package`로 만든 로컬 앱에서 Electron `Notification`을 띄운다. 확인할 것: 표시 여부, 첫 권한 요청 모양과 그때 띄운 첫 알림이 버려지는지, 클릭 이벤트와 창 재활성화, 객체 참조를 붙잡지 않으면 click·close가 사라지는지, 시스템 권한 상태를 읽을 방법, macOS 알림 설정 URL 열기. 결과(관찰·날짜)를 design.md 'PoC 의존'에 적는다.
  - 검증: 두 빌드에서 알림 표시·클릭 이벤트 관찰 기록이 design.md에 있다. 실패하거나 첫 알림이 버려지면 알림 범위를 사용자에게 다시 묻고 이후 task를 고친다.

── commit: `docs(feature): record buzz-settings notification PoC` ──

## T. 순수 함수 (`/tdd` → `/implement`, 새 함수와 하위 호환만)

- [ ] T1. 페이지 출발점·복귀 규칙을 Settings 페이지까지 넓힌다(`app/src/renderer/addProjectsNav.ts`, 파일 이름 유지). 페이지 간 이동, Projects 탭·Back·Escape, 제거된 출발점은 Home, 잠금 중 무시, 진입이 대기 중인 시작 복원·workspace 열기를 취소.
  - 검증: `npm --prefix app test -- addProjectsNav` green, Settings 케이스가 `-t "settings page"`로 1개 이상 실행된다.
- [ ] T2. 카테고리·대상 파싱(`parseSettingsSection`, `openSettings` 대상), 잠금 중 들어오는 대상 큐, renderer `UiState`의 `settingsSection` 필드와 옛 `settingsTab` 읽기(`connections` 유지, `projects` → Agents).
  - 검증: 새 `app/src/renderer/settingsSections.test.ts` green, `npm --prefix app test -- settingsSections restore/uiState` green.
- [ ] T3. `menuState`에 `screen: "settings"`, 페이지 잠금, Add Projects 잠금 중 Settings… 꺼짐을 **더한다**. `focusedWindow`는 R1에서 지운다. 첫 실행 중 Settings… 꺼짐 케이스는 유지한다.
  - 검증: `npm --prefix app test -- menuState` green, 새 케이스가 `-t "settings page"`로 실행된다.
- [ ] T4. 환경설정 파서·병합·쓰기 결정(`app/src/main/preferences.ts`): v 1, 기본값, 모르는 필드, 깨진 파일(기본값 + 읽기 notice, 값을 바꿀 때 `preferences.json.broken-<시각>`으로 옮기고 새로 씀), 더 새 `v`(옮기지 않음, 저장 막음).
  - 검증: 새 `app/src/main/preferences.test.ts` green.
- [ ] T5. 알림 결정 `notificationFor`와 클릭 해석 `notificationTarget`(`app/src/main/notifications.ts`). 띄우는 조건 표(포커스 → 없음, 다른 앱이 앞 → 띄움, 창 숨김·최소화·앱 숨김 → 띄움, 마스터 꺼짐 → 없음, 이벤트 꺼짐 → 없음, `interrupted` → 없음), 승인 해결 시 닫을 알림, 클릭 해석 네 경우(아는 대화, 모르는 대화 + 등록된 root, 등록되지 않은 root, 잠금·모달), 테스트 알림.
  - 검증: 새 `app/src/main/notifications.test.ts` green.
- [ ] T6. 새 대화 기본값(`homeComposer.ts`의 `defaultProvider`·`defaultModel`·`defaultEffort`): 고정 선호 우선, 사람이 고른 값은 보낼 때까지 유지, 보낸 뒤 기본값, 연결 끊김은 지금 규칙, 목록에 없는 모델은 공급자 기본.
  - 검증: `npm --prefix app test -- homeComposer` green, 새 케이스가 `-t "new conversation default"`로 실행된다.
- [ ] T7. Agents Settings 맥락(`agentAuthView.ts`): Connected / Not connected 섹션 분류와 빈 섹션 숨김, 늘 보이는 Sign out, Check 문구, Settings용 `autoCheck`·`not_owner` 문구, 홈 선택기 그룹별 동작과 "Manage agents…"·"Sign in to an agent…", 진입 도착 대상 = 행 그룹, 로그인 완료 토스트 문구.
  - 검증: `npm --prefix app test -- agentAuthView` green, 새 케이스가 `-t "settings context"`로 실행된다.
- [ ] T8. About view-model과 main 쪽 복사 텍스트(`app/src/main/about.ts`): 버전·경로·지원 상태, Antigravity, dev 빌드(`dev`, bare `doan`), 읽는 중·실패 행.
  - 검증: 새 `app/src/main/about.test.ts` green.
- [ ] T9. Project Settings 다이얼로그 규칙(`app/src/renderer/projectSettingsDialog.ts`): 닫기 가능 여부(선택·확인·쓰기 중 false), 대상 변화 4규칙(사라짐 → 닫고 포커스 복귀 순서, 문제 상태 → 문제 보기, reroot → 새 root, Set Up… → 닫고 Project Setup).
  - 검증: 새 `app/src/renderer/projectSettingsDialog.test.ts` green.

── commit: `feat(app): add settings page, preferences and notification rules` ──

## S. Shell 추가 (main · preload, 창과 나란히 동작)

- [ ] S1. App 수준 로그인 컨트롤러: `agentStep.ts`에서 prompt 구독·받아 둔 prompt·소유 표시·준비 알림을 renderer당 하나인 컨트롤러로 분리하고, 첫 실행 Agent 단계가 그것을 읽게 한다.
  - 검증: 새 `app/src/renderer/agentSignIn.test.ts` green. 케이스: 페이지가 없는 동안 prompt 도착 → 다시 그리면 Open again·붙여넣기 가능, 준비 알림 정확히 한 번, Agents가 안 보일 때 끝나면 토스트 한 번. `npm --prefix app test -- agentStep Onboarding` green.
- [ ] S2. 새 main 전용 IPC를 더한다: 환경설정 읽기·쓰기, 테스트 알림, 알림 설정 열기, About 읽기, `about:copy`, `config:session-start/end`, 알림 클릭 이벤트, Settings 열기 명령(창이 숨겨져 있으면 먼저 보임). preload `window.doan`에 같은 메서드와 setup·config·agent-auth 메서드를 더한다(Settings preload는 R1까지 남는다).
  - 검증: `npm --prefix app test -- senderAllowed` green, 새 채널이 main 전용인 케이스가 `-t "settings page channels"`로 실행된다. `npm --prefix app run typecheck` 통과.
- [ ] S3. 알림 발송: 대화 이벤트 구독, 창 가시성, Notification 참조 보관, 클릭 → 창 표시 + `{conversationId, root}`, 승인 해결 시 닫기.
  - 검증: 새 `app/src/main/notifyService.test.ts` green.
- [ ] S4. `configBridge` 다이얼로그 세션과 메인 창 시트, 메인 창 renderer 교체 시 정리(`render-process-gone`·`did-navigate`에서 `broker.drop(owner)`, `configBridge.clear()`).
  - 검증: `npm --prefix app test -- configBridge setupBroker` green, 새 케이스 "다이얼로그를 닫은 뒤 늦게 온 읽기·선택 답은 버려진다", "reload 뒤 대기 중 확인이 취소된다"가 `-t "dialog session"`으로 실행된다.

── commit: `feat(app): settings IPC, notifications and sign-in controller in the main window` ──

## U. UI 전환

- [ ] U1. 공용 스타일 `doan-settings-group`·`doan-preference-row`·`doan-switch`(`app/src/renderer/ds/`).
  - 검증: `npm --prefix app test -- src/renderer/ds/` green(변수 검사 포함), `grep -n 'doan-switch\|doan-settings-group\|doan-preference-row' app/src/renderer/ds/*.css`에 세 클래스가 있다.
- [ ] U2. Settings 페이지 틀: App 화면 `settings`, 헤더 Settings 탭, LNB 카테고리 목록, 본문 열, 잠금, 들어오는 대상 큐, 포커스 규칙(진입·Cmd+, → 제목, 공급자 지정 → 행 그룹, LNB 클릭 → 행에 남음), 알림 클릭 처리. Settings…·헤더 탭이 페이지를 연다.
  - 검증: 새 `app/src/renderer/SettingsPage.test.tsx`와 `App.settings.test.tsx` green. `App.settings.test.tsx` 케이스: Connections 확인 대기나 `stop_required` 대화상자가 열린 동안 Cmd+, 대상이나 홈 선택기 대상이 오면 대화상자를 유지하고 끝난 뒤 적용, Add Projects 잠금 중 Settings 탭·Settings… 무시, 진입이 대기 중인 시작 복원·workspace 열기를 취소, 알림 클릭 네 경우. Settings 컴포넌트가 `startConversation`·`sendConversation`을 쓰지 않는 케이스.
- [ ] U3. Agents(Accounts, New conversations)와 홈 공급자 선택기 동작.
  - 검증: 새 `app/src/renderer/SettingsAgents.test.tsx` green. 케이스: 저장된 기본 공급자의 연결이 끊김, 정상 프로젝트 없음 → Model 꺼짐과 이유, Last used → Model·Effort 숨김, 페이지를 떠났다 돌아오면 진행 중인 로그인 행이 Cancel·Open again, Agent·Model·Effort가 `role="menu"`. `npm --prefix app test -- HomeComposerView` green이고 새 케이스가 `-t "settings action"`으로 실행된다.
- [ ] U4. Notifications, Connections(옮김, busy 안내 삭제, focus 재읽기 통합), About, 읽기 단계 `preferences.json` notice.
  - 검증: 새 `app/src/renderer/SettingsNotifications.test.tsx`, `SettingsConnections.test.tsx`, `SettingsAbout.test.tsx` green. `grep -rn 'Another window is running a setup step' app/src` 결과 없음.
- [ ] U5. Project Settings 다이얼로그(`ProjectSettingsDialog.tsx`, 지금 `ProjectDetail`을 옮김)와 프로젝트 메뉴 연결.
  - 검증: 새 `app/src/renderer/ProjectSettingsDialog.test.tsx` green. 케이스: 열린 동안 root 제거 → 닫고 포커스 복귀, 문제 상태로 바뀜 → 문제 보기, reroot → 새 root 읽기, Set Up… → 닫고 Project Setup.

── commit: `feat(app): settings page, project settings dialog and home agent picker actions` ──

## R. 제거와 정리

- [ ] R1. Settings 창과 옛 경로를 지우고 시그니처를 정리한다.
  - 지움: `app/src/preload/settings.ts`, `app/src/preload/settings.test.ts`, `app/src/renderer/settings.html`, `settings.ts`, `settings.css`, `settings.css.d.ts`, `settingsWindow.tsx`, `settingsWindow.test.tsx`, `settingsProjects.tsx`.
  - `index.ts`의 창 생성·대상 전달·`sendSettings`·close 거부·`focusedWindow === "settings"` 분기, `menuState`의 `focusedWindow`, main `uiState.ts`의 `settingsTab` 합성과 `settings:tab-get/save`, `senderAllowed.ts`의 `WindowKind`·`settingsOnly`, `projects:get`·`projects` push·`projects:forward-action`·`projects:action`·`settings:open`·`settings:take-target`·`settings:target` 채널, `electron.vite.config.ts`의 settings 진입점과 CSP 분기. `settings.ts`는 `INSTALL_URLS`·`parseExternalTarget`·알림 설정 URL·카테고리 파싱을 남긴다.
  - 검증: 위 파일의 `ls` 결과 없음. `grep -rn 'settingsWin\|createSettingsWindow\|SETTINGS_WINDOW\|settings\.cjs\|doanSettings\|kind === "settings"\|focusedWindow' app/src electron.vite.config.ts 2>/dev/null; grep -n 'settings' app/electron.vite.config.ts` 결과 없음. `npm --prefix app run typecheck`·`npm --prefix app test`·`npm --prefix app run build` 통과.
- [ ] R2. `/runtime-test`(사용자와 함께, 위 '실제 상태 규칙'):
  - Cmd+,·헤더 탭·홈 선택기 진입과 복귀, 공급자 행 포커스·강조
  - Connections 쓰기 중 잠금과 들어오는 대상 큐
  - Codex 로그인·로그아웃 1회(사용자 계정), 로그인 도중 페이지를 떠났다 돌아오기와 완료 토스트
  - 알림 표시·클릭 1회(사용자 클릭)
  - Project Settings Token CSS 변경·Clear 1회
  - dev와 production 빌드 모두에서 설정 그룹·행·스위치의 computed style(CSS extraction 함정)
  - 공급자 다섯 개와 펼친 notice로 960 × 600 창에서 본문 끝까지 스크롤(overflow 함정)
  - 검증: `/runtime-test` 보고에서 각 항목이 통과다. 사람만 할 수 있는 항목(알림 클릭, Codex 계정)을 사용자가 하지 못한 경우에만 미확인으로 남기고 이유를 적는다.
- [ ] R3. `/design-sync`: Settings 페이지 창 10개를 승인된 초안과 computed style로 맞추고 DESIGN.md 'Settings' 절을 다시 쓴다("buzz-ds 이전" 표시 삭제). 'App shell'의 Settings 탭, 'Home'의 선택기 동작, 'Terms shared with onboarding'의 Settings 줄, 'Dialogs'의 Done 하나 예외와 온보딩 다이얼로그 버튼 크기 불일치, 공용 요소의 스위치(썸 14px·트랙 36px 상수)와 설정 그룹·행도 고친다.
  - 검증: `sed -n '/^## Settings$/,/^## /p' docs/DESIGN.md | grep 'buzz-ds 이전'` 결과 없음. `grep -n 'Sign in again' docs/DESIGN.md`에 Home이 제공한다는 줄이 있다.

── commit: `refactor(app): remove the separate settings window` / `docs(design): measure the settings page` ──

## Z. 승격과 정리

- [ ] Z1. `docs/PRODUCT.md`를 현재 규칙으로 고친다.
  - §3 'Agent conversation foundation contract': "First run … is the sign-in UI", "Settings and the conversation have no account UI…", "their only UI is Home's composer, the temporary conversation strip, the sidebar status slots and the permission toast"(macOS 알림이 생긴다).
  - §5 항목 0: Settings 창·탭·Projects·닫기 규칙, 알림, 새 대화 기본값, About, Project Settings 다이얼로그.
  - §5 항목 1: Add Projects 잠금 중 Settings…·Project Settings 문장, 홈 공급자 선택기 동작.
  - §6: 이 feature로 풀린 항목을 지우고, 새로 생긴 미확인 표면(실제 앱에서 확인하지 못한 주소 붙여넣기·`stop_required`·`sign_out_failed` 등)을 남긴다.
  - 검증: `grep -n 'separate single-instance window\|no account UI\|Settings Projects\|is the sign-in UI' docs/PRODUCT.md` 결과 없음.
- [ ] Z2. `docs/ARCHITECTURE.md`를 고친다.
  - §7 'Settings, setup status and first-prompt IPC'를 페이지·다이얼로그 구조로 다시 쓴다. preload 설명, Settings focus 재읽기, Settings Projects, 두 HTML 진입점·두 preload 서술, Settings 시트, 'Agent authentication' IPC의 Settings 창 문장("Settings gets no `conversation:*` channel")을 테스트로 지키는 관례로 바꾼다.
  - 알림 결정·클릭 해석, 환경설정, About 읽기·`about:copy`, App 수준 로그인 컨트롤러를 설명하는 절을 더한다.
  - `preferences.json`을 §7·§10·§11의 userData·로컬 파일 목록에 더한다.
  - 새 문장에 "no separate Settings window" 같은 옛 구조를 가리키는 표현을 쓰지 않는다.
  - 검증: `grep -n 'Settings window\|doanSettings\|settings\.cjs\|Settings Projects\|settingsTab\|Settings focus\|both HTML entries\|both preloads\|Settings-only' docs/ARCHITECTURE.md` 결과 없음.
- [ ] Z3. `docs/DIRECTORY.md`에서 settings 진입점과 preload 설명을 지우고 새 파일을 더한다.
  - 검증: `grep -n 'settings\.html\|preload/settings\|settingsWindow\|settingsProjects' docs/DIRECTORY.md` 결과 없음.
- [ ] Z4. 이 디렉터리를 지운다. 부모 tasks C6 체크는 다음 자식 시작 때 부모 규칙대로 한다.
  - 검증: `ls docs/features/buzz-settings` 결과 없음.

── commit: `docs(product): promote buzz-settings` / `docs(architecture): promote buzz-settings` / `docs(directory): promote buzz-settings` / `docs(feature): complete buzz-settings` ──
