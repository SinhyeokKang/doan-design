# app-update — design

결정: 부모 [design.md](../release-0-1-0/design.md)의 D9(방식: `electron-updater`), D10(확인·다운로드·설치 정책), D11(켜는 사본), D12(rc 검증), D23(진행 중인 턴). 모두 결론이다(사용자, 2026-11-07). 근거 문서는 부모 '조사'의 electron-builder 26.18.0 auto-update 문서다.

## 영향 범위

- **앱 main**: 새 `app/src/main/update/`(서비스, 자격 판정, 상태 기계), `index.ts` 연결(시작 시 확인, 종료 흐름), 앱 메뉴 항목, Settings IPC에 업데이트 채널.
- **앱 renderer**: Settings > About의 업데이트 행, 설치 준비 알림(D10, 초안이 표면을 정한다), 앱 메뉴 명령.
- **의존성**: `electron-updater`를 정확한 버전으로 `dependencies`에(AGENTS.md 'Commands'의 `--save-exact`). electron-builder 26.18.0과 맞는 판(npm `latest` 6.8.11 또는 `v26` 6.8.12)을 고른다. main은 의존성을 번들하므로(`externalizeDeps: false`, ARCHITECTURE §7 'Setup') 번들된 채로 동작하는지 PoC에서 본다.
- **설정 저장**: D10의 자동 확인 끄기는 기존 `<userData>/preferences.json`(새 대화 기본값과 같은 파일, `app/src/main/preferences.ts`)에 키 하나를 더한다. 읽기·쓰기 규칙은 ARCHITECTURE §7 'Settings IPC'의 'Preferences'를 따른다.
- **CLI·공유 형식(§11)·app-socket·`doan check`**: 영향 없음.
- **ARCHITECTURE 결정과의 관계**: "Doan never commits"·sandbox iframe·토큰 비취급과 무관하다. "the web only serves as the download path"(PRODUCT §3 Out of scope 5)의 연장으로 GitHub Releases만 묻는다(D10에서 PRODUCT 문장을 정한다).

## 순수 함수 (`/tdd` 대상)

- `updateEligibility({ isPackaged, hasFeedConfig, install: installEligibility 결과, settingOn })` → `enabled | disabled(reason)`. D11대로 agent setup의 `installEligibility`(ARCHITECTURE §7 'Agent setup' 'Eligibility')를 재사용한다.
- `updateState(prev, event)` — `idle → checking → (upToDate | available → downloading(percent) → ready) | failed(code)` 상태 기계. 같은 버전의 재확인, 받는 중 재확인, 실패 뒤 재시도, 수동 확인과 자동 확인의 겹침을 다룬다. electron-updater 이벤트(`checking-for-update`, `update-available`, `update-not-available`, `download-progress`, `update-downloaded`, `error`)를 입력으로 받는다.
- `installGate({ liveTurns, pendingQuestions })` → `allowed | blocked(reason)` (D23).
- `shouldCheck(lastCheckedAt, now, interval)` — 자동 확인 간격.
- `updateView(state)` → About 행과 알림의 문구 키·동작(renderer가 import하는 순수 모듈, 지금 `aboutView.ts` 방식).

## 구조

- `UpdateService`(Electron 의존 부분만): 자격이 `enabled`일 때만 `autoUpdater`를 만든다. D10대로 `autoDownload`와 `autoInstallOnAppQuit`를 켠다(뒤에서 받고, 누르지 않으면 다음 종료 때 설치). 로그는 main 로그로만, 렌더러에는 상태와 고정 오류 코드만 보낸다(지금 onboarding이 git stderr를 내보내지 않는 원칙과 같다).
- 설치: 사용자가 동작을 누르면 `installGate`를 다시 보고, 허락되면 `quitAndInstall`을 부른다. 이 호출이 기존 `before-quit` 처리와 flush 순서를 그대로 거치는지 PoC에서 확인한다(POSTMORTEM 2026-10-25 quit teardown). 대화 저장이 종료를 취소하면 앱은 계속 돌고, 받은 업데이트는 다음 종료 때 설치된다.
- 피드 계약(release-ci): `Contents/Resources/app-update.yml`이 없으면 `hasFeedConfig = false`. 테스트 빌드와 로컬 패키지에는 없다.
- rc 허용(D12): 현재 버전이 prerelease일 때만 prerelease를 받는다. electron-updater의 `allowPrerelease` 기본값이 이 조건을 이미 따르는지 PoC에서 확인하고, 아니면 명시한다.

## PoC (첫 task, release-ci 병합 뒤)

1. 서명된 두 빌드(버전만 다른)를 release-ci의 test-build 방식으로 만들되 피드를 켠 채로, 공개 저장소의 draft가 아닌 prerelease 또는 로컬 generic 피드(`dev-app-update.yml`)로 업데이트가 일어나는지. 어느 쪽으로 할지는 PoC 시작 때 정한다(R1이 실제 피드로 다시 확인한다).
2. `/Applications`에서 업데이트 뒤 `~/.local/share/doan/current`가 같은 경로를 가리키고 다음 실행의 agent setup이 아무것도 바꾸지 않는지(격리된 HOME, AGENTS.md 'Commands'의 `<tmp HOME>/Applications/Doan.app` 규칙).
3. translocation된 사본과 Downloads의 사본에서 Squirrel.Mac이 어떻게 실패하는지(D11 근거 확인).
4. 번들된 `electron-updater`가 main 번들에서 동작하는지.

## UI

- `/design-draft`로 `.doan/canvases/app-update.html`을 그린다: About의 업데이트 행(상태 다섯 개), 설치 준비 알림, 막힌 동작의 이유 줄, 메뉴 항목. 기존 공용 프리미티브를 쓴다(토스트는 DESIGN.md 'Toast': 오른쪽 아래, 동작 하나). 영구 표시(헤더 배지 등)가 필요한지는 초안에서 사용자가 고른다.
- 문구는 clarify 프리셋을 먼저 읽고 쓴다. 디자인 프리셋은 `doan design-skill --json`으로 목록을 보고 필요한 것만 읽는다(AGENTS.md 'Design presets in development skills').

## 공통 함정

- POSTMORTEM 2026-10-30(서명 정체성): 업데이트 probe는 같은 Team ID로 서명한 두 빌드로 하고, probe 전후에 `lsregister -dump`로 `design.doan.app` 등록을 확인한다.
- POSTMORTEM 2026-10-25 'Calling the Quit menu item's JS click did not quit macOS Electron': 종료와 재실행은 사건(새 프로세스의 버전)으로 확인한다.
- POSTMORTEM 2026-10-25 'A toast's Open was dropped while its project was still loading': 알림의 동작은 누를 때 상태를 다시 본다(`installGate`를 클릭 시점에).
