# tester-notarization — spec

사람의 요청: "Apple Developer ID 승인됨. feature로 시작하자. 자격증명 보관 및 tester-build에 공증하기"(2026-11-06). 보관 위치는 "정식 릴리스 때 CI로 하고 지금은 머신 키체인으로 서명하는게 낫겠다"로 정했다(2026-11-06).

## 범위 확인(scope gate)

- PRODUCT §3 Out of scope 1–7에 걸리지 않는다. 제품 동작은 바뀌지 않고, 개발자가 tester dmg를 만드는 절차만 바뀐다.
- Out of scope 5('Doan uploads and serves nothing')와 충돌하지 않는다. 공증은 빌드하는 머신이 Apple notary service에 빌드를 제출하는 개발 단계이고, 앱과 CLI는 아무것도 올리지 않는다.
- PRODUCT는 바뀌지 않는다. 결과는 ARCHITECTURE §9 'Distribution'과 BACKLOG 'Release packaging'에 반영한다(tasks Z1).

## 사용자

- **사람(저장소 주인)**: Developer ID 인증서와 공증 자격증명을 자기 머신의 로그인 키체인에 한 번 넣고, 개인키를 `.p12`로 백업한다. 다른 머신에서 tester build를 만들 때는 그 머신에도 같은 자격증명을 넣는다.
- **에이전트(Claude Code·Codex)**: `/tester-build`를 실행해 Developer ID로 서명하고 공증한 dmg를 만든다. 비밀값은 읽지도, 출력하지도, 파일로 쓰지도 않는다. 키체인 프로필 이름과 인증서 이름만 쓴다.
- **테스터**: 받은 dmg를 Gatekeeper 우회 없이 연다.
- Doan 앱 사용자와 CLI·skill 사용자에게는 바뀌는 것이 없다.

## 문제(지금 관찰된 사실)

1. tester dmg는 ad-hoc 서명이고 공증되지 않았다(`.agents/skills/tester-build/SKILL.md`). 그래서 테스터는 처음 열 때 System Settings > Privacy & Security > Open Anyway를 누르거나 `xattr -dr com.apple.quarantine`을 실행해야 한다. macOS 15부터는 우클릭 Open으로 Gatekeeper를 우회할 수 없다.
2. ad-hoc 서명은 빌드마다 서명 identity가 바뀐다. macOS는 identity가 다른 복사본의 알림을 프롬프트 없이 거부했다(POSTMORTEM 2026-10-30 (2), BACKLOG 'Release packaging').
3. 이 머신에는 서명 identity가 없다(2026-11-06 `security find-identity -v -p codesigning`: "0 valid identities found"). Developer Program 가입은 승인되었다(사람). `xcrun notarytool` 1.0.0 (38)과 Xcode가 있고, macOS 26.6.2다.
4. 지금 쓰는 electron-builder 26.18.0으로 서명과 공증을 할 수 있다(`app/node_modules/app-builder-lib`, 2026-11-06 확인).
   - `mac.notarize`는 `APPLE_KEYCHAIN_PROFILE` 환경 변수로 키체인 프로필을 쓴다(`out/mac/MacTargetHelper.js` 245–248행).
   - `hardenedRuntime`의 기본값은 true다.
   - `mac.entitlements`가 없으면 템플릿 `templates/entitlements.mac.plist`를 쓴다. 템플릿에는 `allow-jit`, `allow-unsigned-executable-memory`, `disable-library-validation`이 들어 있다.
   - `dmg.sign: true`이면 dmg를 Developer ID로 서명한다(`dmg-builder/out/dmg.js`).
5. 저장소는 PRIVATE이고 `.github/workflows/`가 없다(2026-11-06 `gh repo view`). 공개는 예정되어 있다(ARCHITECTURE §9).

## 완료 조건

### 자격증명 보관

- 서명할 머신의 로그인 키체인에 `Developer ID Application: … (<Team ID>)` identity가 정확히 하나 있다(`security find-identity -v -p codesigning`).
- 공증 자격증명은 키체인 프로필 `doan-notary`에 있고, `xcrun notarytool history --keychain-profile doan-notary`가 exit 0으로 끝난다.
- 공증 자격증명은 App Store Connect API 키(`.p8`)다.
- 사람은 인증서와 개인키를 `.p12`로 내보내, `.p8`과 함께 자기 비밀번호 관리자에 둔다. `.p12`와 그 비밀번호, `.p8`은 repo, `.scratch/`, Desktop, Downloads, 대화, 로그 어디에도 남지 않는다.
- 다른 머신을 추가할 때는 `.p12`를 가져오고, `.p8`로 `store-credentials`를 다시 실행한다. 그 머신에서 위 두 확인이 통과해야 한다. Apple ID에 로그인되어 있어도 개인키와 키체인 프로필은 저절로 옮겨지지 않는다(design §2).

### `/tester-build` 결과

- 자격증명이 없거나 둘 이상이면 빌드하기 전에 멈추고 무엇이 없는지 알린다. ad-hoc 서명으로 대신 만들지 않는다.
- Desktop의 `Doan-tester-<date>-<sha>.dmg`가 다음을 모두 통과한다.
  - 앱: `codesign --verify --deep --strict`가 통과한다. `codesign -dv`에 Developer ID Application authority, `runtime` flag, Timestamp가 있다. 안에 든 Mach-O(`Contents/Resources/bin/doan`, node-pty의 `spawn-helper`와 `pty.node`, Electron framework와 helper)도 같다.
  - `xcrun stapler validate`가 앱과 dmg 모두에서 통과한다.
  - quarantine 속성을 붙인 복사본에서 `spctl -a -t exec -vv <app>`이 `accepted`, `source=Notarized Developer ID`를 보인다. dmg는 `spctl -a -t open --context context:primary-signature -v`가 같은 결과를 보인다.
- 서명한 앱을 Applications 밖에서 격리된 HOME으로 실행하면 메인 창이 뜨고 node-pty 터미널 하나가 열린다. 번들 CLI `Contents/Resources/bin/doan --version`이 버전을 출력한다.
- 보고서의 테스터 설치 안내는 "Applications로 끌어 놓고 연다. 인터넷에서 받은 앱이라는 확인을 한 번 누른다"이고, Open Anyway나 `xattr` 안내가 없다.
- `npm --prefix app run package`는 지금처럼 서명하지 않은 `app/dist/mac-arm64/Doan.app`을 만든다. `/agent-eval`, `/runtime-test`, 개발 실행은 인증서 없이 돌아간다.

## 비목표

- CI 서명과 GitHub Actions Secrets. 정식 릴리스(BACKLOG 'Release packaging', #9)에서 다룬다.
- `electron-updater`, Homebrew cask, x64·universal 빌드, doan.design 다운로드, `docs/OPERATIONS.md`, 프리셋 notice를 앱에 넣는 일.
- `npm --prefix app run package`와 개발용 Electron에 서명하는 일.
- 다른 Mac에서 테스터가 설치하는 흐름을 에이전트가 확인하는 일. 사람이나 테스터가 확인하고, 보고서에는 미확인으로 남긴다.
- 이전 ad-hoc 빌드에서 Developer ID 빌드로 넘어간 테스터의 키체인 접근 프롬프트(`doan Safe Storage`)와 알림 권한 재요청을 없애는 일. 이번에는 관찰해서 안내에 적기만 한다.
