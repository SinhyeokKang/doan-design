# tester-notarization — spec

사람의 요청: "Apple Developer ID 승인됨. feature로 시작하자. 자격증명 보관 및 tester-build에 공증하기"(2026-11-06). 보관 위치는 "정식 릴리스 때 CI로 하고 지금은 머신 키체인으로 서명하는게 낫겠다"로 정했다(2026-11-06).

## 범위 확인(scope gate)

- PRODUCT §3 Out of scope 1–7에 걸리지 않는다. 제품 동작은 바뀌지 않고, 개발자가 tester dmg를 만드는 절차만 바뀐다.
- Out of scope 5('Doan uploads and serves nothing')와 충돌하지 않는다. 공증은 빌드하는 머신이 Apple notary service에 빌드를 제출하는 개발 단계이고, 앱과 CLI는 아무것도 올리지 않는다.
- BACKLOG 'Release packaging'은 Developer ID 서명과 공증을 "whole-app cycle quality work 뒤로 미룬다"고 적고 있다. 이번 feature는 사람의 요청에 따라 그중 tester dmg 서명·공증만 앞당긴다. 나머지(CI, updater, brew, x64, 다운로드, OPERATIONS)는 그대로 미룬다.
- PRODUCT는 바뀌지 않는다. 결과는 ARCHITECTURE §9 'Distribution'·§7 'CLI lookup and local package', BACKLOG 'Release packaging', AGENTS.md 'Commands', DIRECTORY.md `app/resources/`에 반영한다. README의 "no signed build or installer yet"은 공개 배포 기준 문장이므로 Z1에서 고칠지 판단한다(tasks Z1).

## 사용자

- **사람(저장소 주인)**:
  - Developer ID 인증서와 공증 자격증명을 서명할 머신의 로그인 키체인에 한 번 넣고, 개인키를 `.p12`로 백업한다.
  - `/tester-build`가 도는 동안 자리에 있어야 한다. 처음 서명할 때 키체인의 "codesign wants to sign using key …"에서 Always Allow를 누르고, Codex에서는 sandbox 밖 실행을 승인한다.
  - 다른 머신에서 tester build를 만들 때는 그 머신에도 같은 자격증명을 넣는다.
- **에이전트(Claude Code·Codex)**: `/tester-build`를 실행해 Developer ID로 서명하고 공증한 dmg를 만든다. 비밀값은 읽지도, 출력하지도, 파일로 쓰지도 않는다. 키체인 프로필 이름과 identity 이름만 쓴다.
- **테스터**: 받은 dmg를 Gatekeeper 우회 없이 연다.
- Doan 앱 사용자와 CLI·skill 사용자에게는 바뀌는 것이 없다.

## 문제(지금 관찰된 사실)

1. tester dmg는 ad-hoc 서명이고 공증되지 않았다(`.agents/skills/tester-build/SKILL.md`). 그래서 테스터는 처음 열 때 System Settings > Privacy & Security > Open Anyway를 누르거나 `xattr -dr com.apple.quarantine`을 실행해야 한다. macOS 15부터는 우클릭 Open으로 Gatekeeper를 우회할 수 없다.
2. ad-hoc 서명은 빌드마다 서명 identity가 바뀐다. macOS는 identity가 다른 복사본의 알림을 프롬프트 없이 거부했다(POSTMORTEM 2026-10-30 (2), BACKLOG 'Release packaging').
3. 이 머신의 자격증명은 준비되었다(2026-11-06, tasks U1–U3).
   - 로그인 키체인에 유효한 identity `Developer ID Application: Sinhyeok Kang (7H4HNHTB45)`가 하나 있다.
   - 키체인 프로필 `doan-notary`로 `xcrun notarytool history`가 exit 0으로 끝난다.
   - `xcrun notarytool` 1.0.0 (38)과 Xcode가 있고, macOS 26.6.2다.
4. 지금 쓰는 electron-builder 26.18.0으로 서명과 공증을 할 수 있다(`app/node_modules/app-builder-lib`, 2026-11-06 확인).
   - `mac.notarize`는 `APPLE_KEYCHAIN_PROFILE` 환경 변수로 키체인 프로필을 쓴다(`out/mac/MacTargetHelper.js` 245–248행).
   - `hardenedRuntime`의 기본값은 true다.
   - `mac.entitlements`가 없으면 템플릿 `templates/entitlements.mac.plist`를 쓴다. 템플릿에는 `allow-jit`, `allow-unsigned-executable-memory`, `disable-library-validation`이 들어 있다.
   - `dmg.sign: true`이면 dmg를 Developer ID로 서명한다(`dmg-builder/out/dmg.js`).
5. 저장소는 PRIVATE이고 `.github/workflows/`가 없다(2026-11-06 `gh repo view`). 공개는 예정되어 있다(ARCHITECTURE §9).

## 완료 조건

### 자격증명 보관

- 서명할 머신의 로그인 키체인에 유효한 `Developer ID Application: … (<Team ID>)` identity가 정확히 하나 있다(`security find-identity -v -p codesigning`).
- 키체인 프로필 `doan-notary`로 `xcrun notarytool history --keychain-profile doan-notary`가 exit 0으로 끝난다. 프로필의 자격증명이 App Store Connect API 키(`.p8`)인지는 사람이 확인한다.
- 사람이 인증서와 개인키를 `.p12`로 내보내 백업하고, `.p12` 비밀번호와 `.p8` 내용을 비밀번호 관리자에 둔다(사람 확인).
- repo, `.scratch/`, `~/Desktop`, `~/Downloads`에 `.p12`·`.p8` 파일이 없다(`find <각 위치> -name '*.p12' -o -name '*.p8'`). 대화와 `/tester-build` 보고서에 비밀값이 없는지는 사람이 확인한다.
- 다른 머신을 추가하는 절차(`.p12` 가져오기, `.p8`로 `store-credentials` 다시 실행)가 `/tester-build` skill에 있다. Apple ID 로그인만으로 개인키와 키체인 프로필이 옮겨지지 않는다는 것은 미확인이다. 사람이 다른 머신을 준비할 때 선택 task U4로 확인한다.

### `/tester-build` 결과

- 빌드하기 전 preflight가 다음 경우에 멈추고, 찾은 내용과 사람이 할 일을 알린다. ad-hoc 서명으로 대신 만들지 않는다.
  - 유효한 Developer ID Application identity가 없거나 둘 이상이다(둘 이상이면 이름, SHA-1, 만료일 목록을 보인다).
  - 프로필 확인이 실패한다(Xcode 라이선스 미동의는 출력으로 구분한다).
  - Desktop에 같은 이름의 dmg가 이미 있다.
- Desktop의 `Doan-tester-<date>-<sha>.dmg`가 다음을 모두 통과한다.
  - 앱: `codesign --verify --deep --strict`가 통과한다. 앱 안의 모든 Mach-O(예: `Contents/Resources/bin/doan`, node-pty의 `spawn-helper`와 `pty.node`, Electron framework와 helper)가 `codesign -dv`에서 Developer ID Application authority, `runtime` flag, Timestamp를 보인다.
  - 앱 본체, helper, `spawn-helper`, `Resources/bin/doan`의 `codesign -d --entitlements -`가 커밋한 entitlements 파일의 항목만 보이고, `disable-library-validation`이 없다.
  - 앱의 designated requirement(`codesign -d -r-`)가 cdhash가 아니라 Team ID `7H4HNHTB45`의 Developer ID에 묶인다.
  - dmg: `codesign -dv`에 Developer ID Application authority와 Timestamp가 있다.
  - `xcrun stapler validate`가 앱과 dmg 모두에서 통과한다.
  - quarantine 속성을 붙인 복사본에서 `spctl -a -t exec -vv <app>`이 `accepted`, `source=Notarized Developer ID`를 보인다. dmg는 `spctl -a -t open --context context:primary-signature -v`가 같은 결과를 보인다.
- 서명한 앱의 격리 실행(PoC P2)에서 다음을 이벤트로 확인한다.
  - 메인 창이 로드된다.
  - main 프로세스가 node-pty(`pty.node`, `spawn-helper`)를 로드하고 pty 프로세스 하나를 spawn한다.
  - 번들 CLI `Contents/Resources/bin/doan design-skill --json`의 `version`이 `app/package.json` 버전과 같다.
  - `<tmp HOME>/Applications`에서 실행한 복사본의 Agent setup이 관리자 대화 상자(`osascriptAdmin`)를 거쳐 `/usr/local/bin/doan`을 만든다.
- 보고서의 테스터 설치 안내는 "Applications로 끌어 놓고 연다. 인터넷에서 받은 앱이라는 확인을 한 번 누른다"이고, Open Anyway나 `xattr` 안내가 없다. 이전 ad-hoc 빌드를 쓰던 테스터에게 `doan Safe Storage` 키체인 접근을 다시 물을 수 있다는 점은 미확인으로 적는다.
- `app/package.json`의 `mac.identity: null`과 `app/scripts/package.mjs`는 바뀌지 않는다. `npm --prefix app run package` 결과의 `codesign -dv`에 Developer ID authority가 없다.

## 비목표

- CI 서명과 GitHub Actions Secrets. 정식 릴리스(BACKLOG 'Release packaging', #9)에서 다룬다.
- `electron-updater`, Homebrew cask, x64·universal 빌드, doan.design 다운로드, `docs/OPERATIONS.md`, 프리셋 notice를 앱에 넣는 일.
- `npm --prefix app run package`와 개발용 Electron에 서명하는 일.
- 인증서를 갱신한 뒤 identity 두 개 가운데 하나를 자동으로 고르는 일. 사람이 옛 identity를 지운다(design §0 6).
- 다른 Mac에서 테스터가 설치하는 흐름을 에이전트가 확인하는 일. 사람이나 테스터가 확인하고, 보고서에는 미확인으로 남긴다.
- 이전 ad-hoc 빌드에서 Developer ID 빌드로 넘어간 테스터의 키체인 접근 프롬프트(`doan Safe Storage`)와 알림 문제를 다루는 일. 이전 서명의 기록이 있는 머신에서 Developer ID 빌드의 알림이 묻지 않고 거부되었다(design §8 P2(d)). 사람의 결정으로 기록만 하고 안내에는 넣지 않는다.
- Codex sandbox에서 `/tester-build`가 끝까지 도는지 확인하는 일. skill과 보고서에 미확인으로 남긴다.
