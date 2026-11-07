# app-update — spec

> 부모: [release-0-1-0](../release-0-1-0/tasks.md) (C7) · 선행: [release-ci](../release-ci/spec.md) (구현만; 문서·초안은 병렬), 부모 D9 D10 D11 D12 D23 D24 · 병렬: [release-skill](../release-skill/spec.md) · 후행: 부모 R1(rc 업데이트 확인, 이 자식의 실제 업데이트 PoC), R2

앱 안에서 새 버전을 알리고, 사용자가 업데이트를 확인하고, 클릭 한 번으로 설치하게 한다. 피드는 release-ci가 GitHub Release에 올리는 `latest-mac.yml`과 zip이다. UI가 있으므로 `/feature-review` → `/design-draft` → `/tdd` 순서를 지키고 `/orchestrate`로 진행한다.

## 사용자

- **사람(앱 사용자)**: 새 버전이 준비되면 앱 안의 표시(D24)와 앱 메뉴로 알고, 업데이트를 직접 확인할 수 있고, 클릭 한 번으로 설치하고 다시 열린 앱을 쓴다. 업데이트가 꺼진 사본에서는 왜 꺼졌는지와 어떻게 켜는지 본다.
- **에이전트**: 업데이트 뒤 터미널의 `doan`이 새 번들의 CLI를 가리킨다(`~/.local/bin/doan → ~/.local/share/doan/current/bin/doan`, ARCHITECTURE §7 'Agent setup'). 앱이 다시 시작하는 동안 `doan work`·`doan open`은 `delivered: false`로 끝난다(ARCHITECTURE §4 'Best effort').

## 문제

- 앱에 업데이트 경로가 없다. 새 버전을 받으려면 사용자가 스스로 Release를 찾아 dmg로 다시 설치해야 한다.
- `app/package.json`에 `electron-updater`가 없다. 런타임 의존성은 지금 `node-pty` 하나만 예외로 외부화돼 있다(ARCHITECTURE §7 'Setup').
- Settings > About은 앱 버전과 도구 버전을 보이지만(PRODUCT §5 항목 0 'About') 새 버전 여부는 모른다.
- 토스트는 8초 뒤 사라지고 슬롯이 하나라 다른 토스트에 밀려난다(`app/src/renderer/toastState.ts` `TOAST_MS = 8000`). "준비됨"처럼 남아야 하는 상태에는 맞지 않는다.
- 창 `close`는 `quitting`이 아니면 숨기기로 바뀐다(`app/src/main/index.ts:495–497`). `autoUpdater.quitAndInstall()`은 창을 먼저 닫으므로 그대로 부르면 창만 숨고 앱이 끝나지 않는다.

## 완료 조건

- 업데이트는 release-ci의 릴리스 빌드(앱 안에 `app-update.yml`이 있다)이고 D11의 사본일 때만 켜진다. 로컬 패키지(`npm --prefix app run package`), 개발 실행, 테스트 빌드는 업데이트 네트워크 요청을 하지 않는다.
- D10대로 실행할 때와 6시간마다 자동으로 확인하고 뒤에서 받는다. Settings > About의 "Check for updates automatically"를 끄면 자동 확인만 멈춘다. 수동 확인(About의 버튼, 앱 메뉴 "Check for Updates…")은 설정과 상관없이 된다.
- design.md '상태'의 모든 상태가 About의 업데이트 행에 문구와 동작으로 보인다: 확인 전, 확인 중, 최신(마지막 확인 시각), 받는 중(진행률), 준비됨(버전, Release Notes 링크, Restart to Update), 다시 시작 중, 다시 시작 중단, 막힘(D23 이유 줄), 실패(종류별 문구와 Retry), 꺼진 사본(이유와 해결 문장), 피드 없는 빌드.
- 준비되면 D24에서 사용자가 고른 표시(헤더 오른쪽 끝 또는 사이드바 하단 오버레이)가 보이고, Doan 메뉴의 "Check for Updates…"가 "Restart to Update"로 바뀐다. macOS 데스크톱 알림은 쓰지 않는다.
- Restart to Update는 지금 종료 흐름(`before-quit`과 `quitInOrder`, `app/src/main/index.ts:1215–1262`)을 거쳐 상태를 flush한 뒤 설치하고, 새 버전으로 다시 열린다. D23대로 진행 중인 턴이나 답을 기다리는 대화가 있으면 누를 때 막히고 이유 줄이 보인다. clone, 에이전트 로그인, MCP 연결은 지금 종료처럼 취소된다.
- 자동 확인의 실패는 오류로 보이지 않고 "Last checked"만 남는다. 수동 확인과 받기의 실패는 행 안의 오류와 Retry로 보인다. 렌더러에는 고정 오류 코드만 간다.
- Copy details에 업데이트 상태 한 줄(상태, 마지막 확인 시각)이 있다.
- 다시 열린 앱에서 `~/.local/bin/doan`이 새 CLI를 가리키고 About이 새 버전을 보인다(부모 R1에서 실제로 확인).
- PRODUCT §5 항목 0(About, Settings, 앱 메뉴, D24 표시)과 §3(업데이트 확인의 네트워크 동작과 Release Notes 링크, Out of scope 5와 맞춘 문장)에 현재 규칙이 있고, ARCHITECTURE §7에 업데이트 서비스·IPC·자격·종료 순서, §9에 피드 계약이 있다.

## 비목표

- 업데이트 채널 선택 UI, 단계적 배포, 다운그레이드. rc 사본은 버전 문자열(`0.1.0-rc.1`)로만 드러난다.
- 에이전트 CLI(Claude Code 등)의 업데이트. 그것은 지금의 Install/Update 경로다(ARCHITECTURE §7 'Agent authentication').
- 앱 안에서 릴리스 노트 HTML을 렌더하기. Release Notes는 GitHub Release 페이지를 브라우저로 연다.
- Windows·Linux.
- README의 업데이트 문단(부모 R2가 이 자식의 문장으로 넣는다).
