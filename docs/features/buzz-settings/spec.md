# buzz-settings — spec

`buzz-restyle`의 자식 feature 6이다([부모 spec](../buzz-restyle/spec.md) 표 6번, [부모 tasks](../buzz-restyle/tasks.md) C6). 별도 Settings 창을 AppShell 안의 Settings 페이지로 바꾸고, 지금 구현된 항목만 옮기는 데 그치지 않고 이 앱에 필요한 설정을 더한다(2026-10-30 user).

## 사용자

- **사람(앱 사용자)**: 메인 창 안에서 Settings 페이지를 연다. LNB에는 설정 카테고리가, 흰 본문 패널에는 카테고리별 설정이 보인다. 첫 실행이 끝난 뒤에도 에이전트에 로그인·재로그인·로그아웃할 수 있고, 홈의 공급자 선택기에서 그 자리로 바로 간다. 다른 앱을 보고 있어도 에이전트의 승인 요청과 턴 종료를 macOS 알림으로 받는다. 새 대화의 기본 에이전트·모델·effort를 정하고, 앱·CLI·에이전트 CLI 버전을 한곳에서 보고 복사한다. 저장소별 Token CSS·Serve는 앱 Settings가 아니라 프로젝트 메뉴의 Project Settings에서 바꾼다.
- **에이전트**: 바뀌는 것이 없다. CLI·MCP·스킬 출력과 `doan config` 계약은 그대로다. 온보딩 스킬(`app/src/main/onboarding/SKILL.md`)의 `Settings… > Connections`와 대화 프롬프트(`PRESET_GUIDANCE`, `app/src/main/conversation/prompt.ts`)의 `Settings > Connections`는 Settings… 메뉴와 Connections 카테고리가 남으므로 그대로 맞다. 그래서 `/agent-eval` 대상이 아니다.

## 문제 (관찰된 사실)

1. Settings…(Cmd+,)와 헤더 Settings는 640 × 560 고정 크기 별도 창을 연다(`app/src/main/settings.ts` `SETTINGS_WINDOW`). Add Projects / Projects는 페이지 탭이 됐는데 Settings만 탭이 아니다(PRODUCT §5 항목 0).
2. 첫 실행이 끝나면 에이전트에 로그인할 길이 없다. Settings와 대화에는 계정 UI가 없고 첫 실행은 다시 열 수 없다(PRODUCT §3 'Agent conversation foundation contract'). 홈 공급자 선택기는 `Sign-in expired`, `Needs an update`, `Not available right now`처럼 동작 없는 문구만 보인다(`providerShortStatus`). 연결된 공급자가 없으면 "No agent is ready to run."뿐이다.
3. 에이전트가 승인을 기다리거나 턴을 끝내도 앱 안 토스트·사이드바 상태 슬롯으로만 알린다. 앱이 가려져 있으면 승인 요청을 놓치고, 그동안 에이전트는 멈춰 있다. OS 알림 코드는 없다.
4. 홈 입력창의 공급자·모델·effort는 마지막 사용값을 따른다(`defaultProvider`, `defaultModel`). 고정 기본값을 정할 곳이 없다.
5. 앱 버전, 앱이 쓰는 `doan` CLI의 버전·경로, 각 에이전트 CLI의 설치 버전을 한곳에서 볼 수 없다.
6. Settings > Projects는 저장소에 커밋되는 `.doan/config.json`(Token CSS·Serve)을 앱 전역 설정 창에서 편집한다.

## 완료 조건

- **창 제거**: Settings…(Cmd+,), 헤더 Settings 탭, 홈 공급자 선택기의 동작이 메인 창 안 Settings 페이지를 연다. 별도 Settings 창, 그 HTML 진입점·preload·Settings 전용 IPC 허용 목록이 없다. 확인: `ls app/src/renderer/settings.html app/src/preload/settings.ts` 결과 없음, `grep -n 'settingsWin\|createSettingsWindow\|SETTINGS_WINDOW\|settings\.cjs\|kind === "settings"' app/src/main/index.ts app/src/main/senderAllowed.ts app/src/main/settings.ts` 결과 없음, `npm --prefix app test` green.
- **페이지 탭과 출발점**: 헤더 캡슐 Add Projects / Projects / Settings가 세 페이지를 오가는 탭이다. Settings 페이지에서는 Settings 탭이 `aria-current="page"`다. Projects 탭·Back·Escape가 Settings에 들어가기 전 마지막 Home 또는 workspace로 돌아간다(페이지 사이 이동은 출발점을 바꾸지 않는다). Settings 페이지는 Back/Forward 방문이 아니며 재시작 때 복원하지 않는다. 확인: 출발점 순수 함수·`restorePlan` 테스트, 짧은 실제 앱 probe.
- **잠금**: Settings에서 설정 쓰기나 확인 대기(Connections 쓰기·확인, Agents의 `stop_required` 확인)가 진행 중이면 페이지를 떠나는 모든 이동이 막힌다. 로그인 대기는 이동을 막지 않고, 다른 화면에 있는 동안에도 같은 시도로 계속된다. Add Projects 잠금(설정 쓰기·clone) 중에는 Settings 탭과 Settings…가 꺼진다. 확인: 순수 함수·`menuState` 테스트, 짧은 실제 앱 probe.
- **LNB와 본문**: Settings 페이지의 LNB는 기존 ShellSidebar 구조와 행 스타일을 그대로 쓰고, 프로젝트 목록 자리에 카테고리 Agents · Notifications · Connections · About을 보인다. 본문은 기존 흰 본문 패널 안에서 Buzz 설정 본문 구성(제목 → 섹션 제목 + 그룹 + 행)을 따른다. 확인: 확정 초안 `.doan/canvases/buzz-settings.html`과 `/design-sync` 측정.
- **Agents**: 다섯 공급자(Claude Code, Codex, Cursor, Antigravity, GitHub Copilot)에 Install/Update/Sign in, 연결된 공급자의 Sign out, 재인증, 취소, Antigravity 주소 붙여넣기, `stop_required` 확인 뒤 `stop: true` 재요청, `sign_out_failed` 문구가 동작한다. 공급자 행의 문구·버튼·aria는 `agentAuthView.ts`를 재사용한다. Copilot은 자동 확인하지 않고, Check가 요청 1회를 쓴다고 말한다. Agents가 보이지 않는 동안 끝난 로그인은 토스트로 한 번 알린다. 확인: `agentAuthView`·로그인 컨트롤러 테스트 green. 실제 앱에서는 사용자와 함께 Codex 로그인·로그아웃을 1회 한다. 주소 붙여넣기, `stop_required`, `sign_out_failed`는 테스트로만 확인하고 실제 앱에서는 미확인으로 남긴다.
- **New conversations**: 기본 공급자는 Last used(지금 동작) 또는 연결된 공급자 하나다. 공급자를 고르면 모델(Default 또는 목록)과 effort를 고를 수 있다. 홈 입력창은 처음 열 때와 보낸 뒤에 이 값으로 시작하고, 사람이 고른 값은 보낼 때까지 유지한다. 연결이 끊긴 공급자는 지금 규칙으로, 프로젝트에 없는 모델은 공급자 기본 모델로 돌아간다. 확인: `homeComposer` 기본값 테스트 green.
- **홈 공급자 선택기**: 실행할 수 없는 공급자 그룹에 동작(Sign in again…, Update…, Open Agents settings…)이, 메뉴 맨 아래에 Manage agents…가, 실행 가능한 에이전트가 없을 때 Sign in to an agent…가 있다. 모두 메뉴 항목으로 키보드에서 닿는다. 누르면 Settings > Agents로 가서 그 공급자 행 그룹에 포커스를 두고 2.4초 강조한다. 확인: 컴포넌트 테스트, 짧은 실제 앱 probe.
- **Notifications**: Desktop notifications(기본 켬)와 이벤트별 스위치 Approval requests · Finished · Couldn’t finish(기본 모두 켬)가 있다. Couldn’t finish는 오류로 끝난 턴이며 사람이 멈춘 턴은 알리지 않는다. 메인 창이 포커스를 갖지 않을 때만 macOS 알림을 띄운다. 알림을 누르면 창을 보이고 그 대화로 간다. 대화를 모르면 프로젝트 Overview로 가고, 잠금·모달 중이면 창만 보인다. Send test notification과 macOS 알림 설정을 여는 버튼이 있다. 설정은 재시작 뒤에도 남는다. 확인: 알림 결정·클릭 해석 순수 함수 테스트, `preferences` 테스트 green, 사용자와 함께 하는 PoC와 실제 앱 probe에서 알림 표시·클릭 1회씩.
- **Connections**: 지금 Settings > Connections의 행·상태·동작·확인 대화상자·문구가 그대로 동작한다. 예외: 다른 창 busy 안내는 지우고, Settings 창 focus 재읽기는 메인 창 focus 재읽기와 합친다(design 'Connections'). 확인: 기존 `connectionRows` 테스트 green, 실제 앱에서 Check Again과 Details.
- **About**: 앱 버전, 앱이 쓰는 `doan` CLI의 경로와 버전, 다섯 공급자 도구의 설치 여부·버전·지원 상태를 보인다. 읽는 중과 읽기 실패는 그 행에만 표시한다. Copy details가 이 정보를 텍스트 한 덩어리로 복사한다. 확인: About 순수 함수 테스트, 짧은 실제 앱 probe.
- **Project Settings**: LNB 프로젝트 메뉴의 Project Settings가 그 프로젝트에서 지금 선택된 워크트리의 다이얼로그를 연다. 정상 워크트리는 Root, Token CSS(Change…/Clear), Serve(Add…/Remove)를 지금과 같은 `doan config` 경로로 바꾼다. 문제 워크트리는 상태와 기존 복구 동작을 보인다. 열린 동안 대상이 사라지거나 바뀌면 design의 네 규칙을 따른다. 선택·확인·쓰기 중에는 다이얼로그가 닫히지 않는다. 확인: `configBridge`·다이얼로그 테스트 green, 사용자와 함께 실제 앱에서 Token CSS 변경·Clear 1회.
- **문서**: PRODUCT·ARCHITECTURE·DESIGN·DIRECTORY가 새 현재 상태를 말하고, DESIGN 'Settings' 절의 "buzz-ds 이전" 표시가 없다. 이 디렉터리를 지웠다. 확인: `grep -n 'separate single-instance window\|no account UI\|Settings Projects' docs/PRODUCT.md` 결과 없음, `sed -n '/^## Settings$/,/^## /p' docs/DESIGN.md | grep 'buzz-ds 이전'` 결과 없음.

## 비목표

- Buzz Settings의 모달 표시, 통합 사이드바, 섹션 그룹 체계, 다른 카테고리(Appearance, Shortcuts, Plugins 등). doan은 AppShell과 LNB를 그대로 재사용하고 Buzz에서는 본문 카테고리 구성만 참고한다(2026-10-30 user).
- 알림 소리 선택, Dock 배지, 알림을 보고 있는 화면별로 거르는 규칙, 알림 기록. 알림 본문에 권한 요약을 넣는 일(요약 형식은 PRODUCT §6 미해결).
- 대화 권한·샌드박스 모드 설정. 사용자의 에이전트 설정을 그대로 물려받는다는 계약(PRODUCT §3)을 바꾸지 않는다.
- 다크 모드·테마·액센트 선택(부모 비목표), 앱 업데이트 확인(#9 `dist`), 계정별 사용량 표시(PRODUCT §6).
- 첫 실행 다시 열기, 여러 계정, 공급자 CLI 자동 설치.
- 앱 메뉴 About Doan을 Settings > About으로 바꾸는 일. 기본 패널 그대로 둔다.
- Add Projects 페이지에서 Settings로 갔다 돌아올 때 입력을 되살리는 일.
- `doan config`·`doan init` 계약, CLI·MCP 출력 변경.
- Overview 본문(buzz-project), 대화 패널(buzz-conversation). 대화 패널이 생기면 알림 클릭 해석 함수는 그 자식이 바꾼다.
