# buzz-settings — tasks

순서: PoC → 순수 함수 → shell(I/O, main·preload) → UI → 문서 승격. `/feature-review` → `/design-draft`(사용자 승인) 뒤에 `/tdd`를 시작한다. 각 commit 경계 직전에 `node .agents/skills/verify/scripts/verify.mjs`를 통과시킨다. 앱 동작이 바뀐 commit 뒤에는 `/runtime-test`로 바뀐 동작만 격리 실행에서 짧게 확인한다.

## P. PoC

- [ ] P1. macOS 알림 PoC(`.scratch/buzz-settings/notify/`). 격리한 userData·HOME으로 dev 빌드와 `npm --prefix app run package`로 만든 로컬 앱에서 Electron `Notification`을 띄우고 확인한다: 표시 여부, 첫 권한 요청 모양, 클릭 이벤트와 창 재활성화, 시스템 권한 상태를 읽을 방법, macOS 알림 설정 URL 열기. 결과(관찰·날짜)를 design.md 'PoC 의존'에 적는다.
  - 검증: 두 빌드에서 알림 표시·클릭 이벤트 관찰 기록이 design.md에 있다. 실패하면 알림 범위를 사용자에게 다시 묻고 이후 task를 고친다.

── commit: `docs(feature): record buzz-settings notification PoC` ──

## T. 순수 함수 (`/tdd` → `/implement`)

- [ ] T1. 페이지 출발점·복귀 규칙을 Settings 페이지까지 넓힌다(`app/src/renderer/addProjectsNav.ts`). 페이지 간 이동, Projects 탭·Back·Escape, 제거된 출발점, 잠금 중 무시.
  - 검증: `npm --prefix app test -- addProjectsNav` green.
- [ ] T2. 카테고리 파싱과 들어가는 대상(카테고리 + 선택적 공급자), `ui-state`의 `settingsTab` → `settingsSection` 읽기 호환(`app/src/main/settings.ts`, `uiState.ts`).
  - 검증: `npm --prefix app test -- settings uiState` green.
- [ ] T3. `menuState`: `screen: "settings"`, 페이지 잠금, `focusedWindow` 제거.
  - 검증: `npm --prefix app test -- menuState` green.
- [ ] T4. 환경설정 파서·병합(`app/src/main/preferences.ts`): v 1, 기본값, 모르는 필드, 깨진 파일 보존.
  - 검증: `npm --prefix app test -- preferences` green.
- [ ] T5. 알림 결정 `notificationFor`(`app/src/main/notifications.ts`): 이벤트 종류, interruption 제외, 포커스·숨김, 끈 이벤트, 승인 해결 시 닫기, 문구.
  - 검증: `npm --prefix app test -- notifications` green.
- [ ] T6. 새 대화 기본값(`homeComposer.ts`의 `defaultProvider`·`defaultModel`·`defaultEffort`)이 고정 선호를 먼저 쓰고 지금 규칙으로 돌아간다.
  - 검증: `npm --prefix app test -- homeComposer` green.
- [ ] T7. Agents Settings 맥락(`agentAuthView.ts`): 늘 보이는 Sign out, Copilot Check 문구, 홈 선택기 동작 view-model.
  - 검증: `npm --prefix app test -- agentAuthView` green.
- [ ] T8. About view-model과 복사 텍스트(`app/src/renderer/aboutView.ts`).
  - 검증: `npm --prefix app test -- aboutView` green.

── commit: `feat(app): add settings page navigation, preferences and notification rules` ──

## S. Shell (main · preload)

- [ ] S1. Settings 창 제거와 IPC 통합: `index.ts`의 창 생성·대상 전달·메뉴 분기, `senderAllowed.ts` 단일 창, `preload/settings.ts` 삭제와 `preload/index.ts` 통합, `electron.vite.config.ts` 진입점, `setupBroker.ts` 소유자, `projects:*` 투영·전달 채널 삭제.
  - 검증: `npm --prefix app run typecheck`, `npm --prefix app test -- senderAllowed setupBroker index` green, `ls app/src/preload/settings.ts app/src/renderer/settings.html` 결과 없음.
- [ ] S2. `configBridge`의 세션을 Project Settings 다이얼로그 세션으로 바꾸고 파일 선택 시트를 메인 창에 붙인다.
  - 검증: `npm --prefix app test -- configBridge` green.
- [ ] S3. 환경설정 저장·읽기 IPC, 알림 발송(대화 이벤트 구독, 창 가시성, 클릭 → 창 표시 + 대화 id 전달, 승인 해결 시 닫기), 테스트 알림, 알림 설정 URL 열기.
  - 검증: `npm --prefix app test -- notifications preferences index` green.
- [ ] S4. About 읽기: 앱 버전, CLI 경로·버전(`doan design-skill --json`의 `version`), 공급자 `ToolFacts`.
  - 검증: `npm --prefix app test` green.

── commit: `feat(app): serve settings from the main window` ──

## U. UI

- [ ] U1. 공용 스타일 `doan-settings-group`·`doan-preference-row`·`doan-switch`(`app/src/renderer/ds/`)와 `settings.css` 삭제.
  - 검증: `npm --prefix app test -- ds` green(변수 검사 포함), `ls app/src/renderer/settings.css` 결과 없음.
- [ ] U2. Settings 페이지 틀: App 화면 `settings`, 헤더 Settings 탭, LNB 카테고리 목록, 본문 열, 잠금, 카테고리 포커스.
  - 검증: `npm --prefix app test -- App ShellSidebar` green.
- [ ] U3. Agents(Accounts, New conversations)와 홈 공급자 선택기 동작.
  - 검증: `npm --prefix app test -- SettingsAgents HomeComposerView` green.
- [ ] U4. Notifications, Connections(옮김), About.
  - 검증: `npm --prefix app test -- SettingsNotifications connectionRows SettingsAbout` green.
- [ ] U5. Project Settings 다이얼로그(`settingsProjects.tsx`의 `ProjectDetail`을 옮기고 파일 삭제), 프로젝트 메뉴 연결.
  - 검증: `npm --prefix app test -- ProjectSettingsDialog ShellSidebar` green, `ls app/src/renderer/settingsProjects.tsx app/src/renderer/settingsWindow.tsx` 결과 없음.
- [ ] U6. `/runtime-test`: 격리 실행에서 Cmd+,·헤더 탭·홈 선택기 진입과 복귀, Connections 쓰기 중 잠금, Codex 로그인·로그아웃 1회, 알림 표시·클릭 1회, Project Settings Token CSS 변경·Clear 1회.
  - 검증: `/runtime-test` 보고에 각 항목의 통과·미확인이 적혀 있다.
- [ ] U7. `/design-sync`: Settings 페이지 네 카테고리와 Project Settings 다이얼로그를 승인된 초안과 computed style로 맞추고 DESIGN.md 'Settings' 절을 다시 쓴다("buzz-ds 이전" 표시 삭제).
  - 검증: `grep -n 'buzz-ds 이전' docs/DESIGN.md`에 Settings 절이 없다.

── commit: `feat(app): settings page, project settings dialog and notifications` / `docs(design): measure the settings page` ──

## Z. 승격과 정리

- [ ] Z1. `docs/PRODUCT.md`를 현재 규칙으로 고친다: §3 'Agent conversation foundation contract'의 "Settings and the conversation have no account UI…", §5 항목 0의 Settings 창·탭·Projects·닫기 규칙, 항목 1의 Add Projects 잠금 중 Settings…·Project Settings 문장, 알림·기본 에이전트·About, §6에서 이 feature로 풀린 항목과 새로 생긴 미확인 표면.
  - 검증: `grep -n 'separate single-instance window\|no account UI\|Settings Projects' docs/PRODUCT.md` 결과 없음.
- [ ] Z2. `docs/ARCHITECTURE.md` §7 'Settings, setup status and first-prompt IPC'를 페이지·다이얼로그 구조로 다시 쓰고, 'Agent authentication' IPC의 Settings 창 언급, §4 userData 파일 목록의 `preferences.json`, preload 설명을 고친다.
  - 검증: `grep -n 'Settings window\|window.doanSettings\|settings.cjs' docs/ARCHITECTURE.md` 결과 없음.
- [ ] Z3. 이 디렉터리를 지운다. 부모 tasks C6 체크는 다음 자식 시작 때 부모 규칙대로 한다.
  - 검증: `ls docs/features/buzz-settings` 결과 없음.

── commit: `docs(product): promote buzz-settings` / `docs(architecture): promote buzz-settings` / `docs(feature): complete buzz-settings` ──
