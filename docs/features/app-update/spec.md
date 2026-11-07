# app-update — spec

> 부모: [release-0-1-0](../release-0-1-0/tasks.md) (C7) · 선행: [release-ci](../release-ci/spec.md) (구현만; 문서·초안은 병렬), 부모 P1(D9 D10 D11 D12 D23) · 병렬: [release-skill](../release-skill/spec.md) · 후행: 부모 R1(rc 업데이트 확인), R2

앱 안에서 새 버전을 알리고, 사용자가 업데이트를 확인하고, 클릭 한 번으로 설치하게 한다. 피드는 release-ci가 GitHub Release에 올리는 `latest-mac.yml`과 zip이다. UI가 있으므로 `/feature-review` → `/design-draft` → `/tdd` 순서를 지키고 `/orchestrate`로 진행한다.

## 사용자

- **사람(앱 사용자)**: 새 버전이 있으면 앱 안에서 알림을 보고, 업데이트를 직접 확인할 수 있고, 클릭 한 번으로 설치하고 다시 열린 앱을 쓴다.
- **에이전트**: 업데이트 뒤 터미널의 `doan`이 새 번들의 CLI를 가리킨다(`~/.local/bin/doan → ~/.local/share/doan/current/bin/doan`, ARCHITECTURE §7 'Agent setup'). 앱이 다시 시작하는 동안 `doan work`·`doan open`은 `delivered: false`로 끝난다(ARCHITECTURE §4 'Best effort').

## 문제

- 앱에 업데이트 경로가 없다. 새 버전을 받으려면 사용자가 스스로 Release를 찾아 dmg로 다시 설치해야 한다.
- `app/package.json`에 `electron-updater`가 없다. 런타임 의존성은 지금 `node-pty` 하나만 예외로 외부화돼 있다(ARCHITECTURE §7 'Setup').
- Settings > About은 앱 버전과 도구 버전을 보이지만(PRODUCT §5 항목 0 'About') 새 버전 여부는 모른다.

## 완료 조건

- 업데이트는 release-ci의 릴리스 빌드(앱 안에 `app-update.yml`이 있다)이고 D11의 사본일 때만 켜진다. 로컬 패키지(`npm --prefix app run package`), 개발 실행, 테스트 빌드는 네트워크 요청을 하지 않는다.
- D10의 정책대로 확인한다: 실행 때와 몇 시간마다 자동으로 확인하고 뒤에서 받는다. 사용자는 Settings > About과 앱 메뉴의 "Check for Updates…"로 직접 확인할 수 있고, Settings에서 자동 확인을 끌 수 있다.
- 상태(확인 중, 최신, 받는 중과 진행률, 설치 준비됨, 실패)가 About에 보이고, 설치 준비가 되면 D10이 정한 알림(초안이 정한 표면)이 "다시 시작해 업데이트" 동작을 준다.
- 동작을 누르면 앱이 지금 종료 흐름(`before-quit`, `app/src/main/index.ts:1215`)을 거쳐 끝나고, 새 버전으로 다시 열린다. D23대로 진행 중인 턴이 있으면 동작이 막히고 이유가 보인다.
- 다시 열린 앱에서 `~/.local/bin/doan`이 새 CLI를 가리키고 About이 새 버전을 보인다(부모 R1에서 실제로 확인).
- 문구는 Doan의 clarify 프리셋(`doan design-skill clarify --json`)을 읽고 쓴다. 초안은 `.doan/canvases/app-update.html`이다.
- PRODUCT §5 항목 0(About, Settings)과 §3(업데이트 확인의 네트워크 동작, D10)에 현재 규칙이 있고, ARCHITECTURE §7에 업데이트 서비스와 IPC, §9에 피드 계약이 있다.

## 비목표

- 업데이트 채널 선택 UI, 단계적 배포, 다운그레이드.
- 에이전트 CLI(Claude Code 등)의 업데이트. 그것은 지금의 Install/Update 경로다(ARCHITECTURE §7 'Agent authentication').
- Windows·Linux.
