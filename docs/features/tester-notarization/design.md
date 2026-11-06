# tester-notarization — design

## 0. 결정

1. 자격증명은 서명하는 머신의 로그인 키체인에 둔다. CI와 GitHub Actions Secrets는 정식 릴리스(#9)에서 다룬다(사람, 2026-11-06). git-secret은 쓰지 않는다. 공개할 repo의 history에 암호화된 서명 키가 영구히 남기 때문이다.
2. 공증 자격증명은 App Store Connect API 키(Team 키, `.p8`)로 한다(사람, 2026-11-06). Apple ID 암호를 바꿔도 유지되고, 정식 릴리스 CI에서도 같은 종류를 쓰기 때문이다.
3. entitlements는 최소 파일을 커밋해서 쓴다(사람, 2026-11-06; §4). Doan은 에이전트 자격증명(vault, `safeStorage`)을 다루므로 hardened runtime의 library validation을 끄지 않는다.
4. `npm --prefix app run package`는 서명하지 않은 채로 둔다. `/agent-eval`, `/runtime-test`, Codex 세션이 인증서 없이 돌아가야 하고, 서명 identity가 바뀌면 그 실행들의 알림·키체인 상태도 같이 바뀌기 때문이다. 서명은 `/tester-build` 안에서만 한다.
5. 자격증명이 없으면 `/tester-build`는 멈춘다. ad-hoc으로 대신 만들면, 테스터가 받은 dmg가 공증된 것인지 보고서만으로는 알 수 없게 된다.

## 1. 영향 요소

| 요소 | 바뀌는 것 |
|---|---|
| skill | `.agents/skills/tester-build/SKILL.md`: 일회성 준비, preflight, 서명·공증 단계, 확인, 보고서, 금지 사항 |
| AGENTS.md | 'Commands'의 tester build 줄("ad-hoc signed" → Developer ID로 서명하고 공증) |
| ARCHITECTURE | §9 'Distribution', §7 'CLI lookup and local package'의 Packaging 줄 |
| BACKLOG | 'Release packaging'에서 tester dmg 서명·공증을 빼고 CI·updater·brew·x64·다운로드·OPERATIONS가 남는다 |
| 앱(Electron + TS)·CLI(Go)·형식 | 없음 |
| `app/package.json` `build` | `mac.entitlements`와 `mac.entitlementsInherit` 두 줄, 새 파일 `app/resources/entitlements.mac.plist`(§4). `identity: null`은 그대로라 `npm run package` 결과는 바뀌지 않는다 |

## 2. 자격증명 보관

- **Developer ID Application 인증서**
  - Account Holder가 Xcode > Settings > Accounts > Manage Certificates의 `+`에서 만들거나, developer.apple.com에서 Keychain Access로 만든 CSR을 올려 만든다. 개인키는 그 머신의 로그인 키체인에 생긴다.
  - 사람이 인증서와 개인키를 함께 `.p12`로 내보내 강한 비밀번호를 걸고, 자기 비밀번호 관리자에 둔다. 이 백업이 다른 머신으로 옮기는 수단도 된다.
  - 인증서는 5년간 유효하다. 갱신하면 이름이 같고 해시가 다른 identity가 생긴다. skill은 이름이나 해시를 박아 두지 않고 실행할 때 찾는다(§3 0단계).
- **공증 자격증명(App Store Connect API 키)**:
  - 사람이 App Store Connect > Users and Access > Integrations > App Store Connect API에서 Team 키를 만든다. 키를 만드는 사람은 Account Holder나 Admin이어야 하고, 키 역할은 Developer로 둔다(공증에 충분한지 P1에서 확인). `.p8`은 만들 때 한 번만 내려받을 수 있다.
  - 사람이 `! xcrun notarytool store-credentials doan-notary --key <.p8 경로> --key-id <Key ID> --issuer <Issuer ID>`로 저장한다. `!`로 실행하므로 명령과 출력이 대화에 남는다. 이 출력에는 키 경로와 ID만 있고 키 내용은 없다.
  - 저장한 뒤 `.p8`은 비밀번호 관리자로 옮기고, 내려받은 위치(Downloads 등)에서는 지운다. 키체인 프로필은 저장할 때 키 내용을 담으므로, 이후 `.p8` 파일이 없어도 공증할 수 있다(2026-11-06 확인).
- **다른 머신**: Apple ID 로그인만으로는 개인키와 키체인 프로필이 옮겨지지 않는다. 로그인 키체인의 인증서 개인키와 notarytool 프로필은 iCloud 키체인으로 동기화되지 않는다고 이해하고 있다(미확인, 다른 머신에서 확인 명령으로 검증). 그래서 `.p12`를 가져오고, 비밀번호 관리자의 `.p8`로 `store-credentials`를 다시 실행한다. 머신마다 키를 따로 만들 수도 있다. 그러면 한 대만 폐기할 수 있지만, 키가 늘어날 때마다 보관할 `.p8`도 늘어난다.
- **에이전트의 경계**: 비밀값(`.p12`와 그 비밀번호, `.p8`)을 읽거나 출력하거나 파일로 쓰지 않는다. 쓰는 것은 프로필 이름 `doan-notary`와 키체인이 보여 주는 identity 이름뿐이다. identity 이름과 Team ID는 모든 서명에 들어가는 값이라 비밀이 아니다.
- **준비 중 관찰(2026-11-06, 이 머신)**:
  - 웹에서 받은 `.cer`만으로는 identity가 유효하지 않았다. `security find-identity -p codesigning`이 짝은 찾았지만 "0 valid identities"였다. Apple 중간 인증서 `DeveloperIDG2CA.cer`(https://www.apple.com/certificateauthority/)를 로그인 키체인에 넣은 뒤에 유효해졌다.
  - Xcode 라이선스에 동의하지 않은 머신에서는 `xcrun notarytool`이 exit 69로 끝난다. `sudo xcodebuild -license accept`는 비밀번호를 물으므로 사람이 터미널에서 실행한다. preflight는 exit 69를 "프로필 없음"으로 읽지 말고 출력을 함께 보고한다.
  - App Store Connect API는 처음 쓸 때 Account Holder가 Integrations에서 Request Access를 눌러야 Team 키를 만들 수 있었다.
  - `store-credentials`는 `.p8`, Key ID, Issuer ID로 "Credentials validated", "saved to Keychain"을 출력했고, 이어서 `notarytool history`가 exit 0으로 끝났다. `.p8`을 지운 뒤에도 exit 0이었다. 프로필이 키 내용을 키체인에 담는다.
- **키체인 프롬프트**: codesign이 개인키를 처음 쓸 때 "codesign wants to sign using key …" 대화 상자가 뜬다. 사람이 Always Allow를 누른다. Codex에서는 키체인과 네트워크가 sandbox 밖에 있으므로, 서명·공증 명령에 sandbox 밖 실행을 요청한다.

## 3. `/tester-build` 서명·공증 흐름

지금 단계 4(ad-hoc 재서명)와 단계 5의 `--prepackaged`를 다음으로 바꾼다. 단계 1–3(origin/main worktree, setup, `npm --prefix app run package`)은 그대로다. 단계 3이 CLI(`app/build/bin/doan`, 버전 stamp)와 `app/out/`을 만든다.

0. **preflight**(worktree를 만들기 전):
   - `security find-identity -v -p codesigning`에서 `Developer ID Application:` 줄이 정확히 하나여야 한다. 그 줄의 이름을 이번 실행의 identity로 쓴다.
   - `xcrun notarytool history --keychain-profile doan-notary`가 exit 0이어야 한다.
   - 하나라도 실패하면 멈추고, 실패한 항목과 §2의 준비 절차를 보고한다.
1. **서명한 빌드와 앱 공증**: `<worktree>/app`에서 `APPLE_KEYCHAIN_PROFILE=doan-notary npx electron-builder --mac dmg --arm64 -c.mac.identity=<identity> -c.mac.notarize=true -c.dmg.sign=true -c.directories.output=<stage>/out`을 실행한다(`CSC_IDENTITY_AUTO_DISCOVERY=false` 없이). entitlements는 `app/package.json`에서 온다(§4).
   - electron-builder가 `out/`과 `build/bin/doan`으로 다시 묶는다. hardened runtime과 §4의 entitlements로 안쪽부터 서명한다.
   - 앱을 notarytool로 공증하고 staple한 뒤 dmg를 만들고 서명한다.
   - identity에 `Developer ID Application:` 접두어를 붙일지는 P1에서 정한다.
2. **dmg 공증**: `xcrun notarytool submit <dmg> --keychain-profile doan-notary --wait`, 이어서 `xcrun stapler staple <dmg>`.
   - 결과가 `Accepted`가 아니면 `xcrun notarytool log <id> --keychain-profile doan-notary`의 issues를 보고하고 멈춘다.
   - 앱과 dmg를 둘 다 staple한다. 테스터가 앱을 Applications로 옮긴 뒤 dmg를 지우거나 오프라인이어도, 앱 자체의 ticket으로 Gatekeeper를 통과하게 하기 위해서다.
3. **확인**(모두 통과해야 Desktop에 복사한다): spec '`/tester-build` 결과'의 codesign·stapler·spctl 항목. quarantine 확인은 staging 안의 dmg 복사본에 `xattr -w com.apple.quarantine "0081;<hex time>;Safari;" <copy>`를 붙인 뒤, 그 복사본과 마운트한 앱으로 한다.
4. Desktop 복사, 정리(staging, worktree)는 지금과 같다.

보고서: dmg 경로, sha와 커밋 제목, identity 이름(Team ID 포함), notarization submission id 두 개와 결과, 확인 결과, 테스터 설치 안내. 바뀐 설치 안내는 spec과 같다. 이전 ad-hoc 빌드를 쓰던 테스터는 Doan이 `doan Safe Storage` 키체인 항목 접근을 다시 묻거나 알림 권한을 다시 요청할 수 있다고 적는다(P2 관찰 결과로 고친다). Agent setup 경고(실제 HOME의 `~/.local/bin/doan` 등)는 그대로 둔다.

금지 사항에 추가: 비밀값을 읽거나 출력하거나 파일로 쓰지 않는다. 자격증명이 없을 때 ad-hoc으로 대신 만들지 않는다. 키체인에 identity나 프로필을 추가하거나 지우지 않는다(사람이 한다).

## 4. entitlements

결정: 아래 (b). 최소 파일 `app/resources/entitlements.mac.plist`를 커밋한다. 처음 내용은 `allow-jit`와 `allow-unsigned-executable-memory`이고, P2(c) 결과에 따라 `automation.apple-events`를 더한다. `app/build/`는 gitignore 대상이라 파일을 그곳에 둘 수 없다.

- `mac.entitlements`와 `mac.entitlementsInherit`가 둘 다 이 파일을 가리켜야 한다. electron-builder는 앱 본체가 아닌 파일(Electron helper, `spawn-helper`, `Resources/bin/doan`)에는 `entitlementsInherit`를 쓴다. 그 값이 없고 `build/entitlements.mac.inherit.plist`도 없으면 `disable-library-validation`이 든 템플릿으로 되돌아간다(`MacTargetHelper.js` `getOptionsForFile`, 2026-11-06 확인).
- P1·P2는 커밋 전에 같은 내용의 `.scratch/` 파일을 `-c.mac.entitlements=… -c.mac.entitlementsInherit=…`로 넘겨 확인한다. S0가 확인된 내용을 커밋한다.

배경:

- Doan은 Electron V8 때문에 `com.apple.security.cs.allow-jit`가 필요하다(electron-builder 문서 주석: Electron 20+ arm64는 이것 없이 crash할 수 있다).
- 네이티브 모듈은 node-pty(`pty.node`, `spawn-helper`) 하나다. 같은 Team ID로 서명되므로 library validation을 통과할 것으로 예상한다(P1·P2에서 확인).
- 앱은 `/usr/bin/osascript`로 관리자 권한 셸 명령을 실행한다(`app/src/main/agentSetup/runner.ts` `osascriptAdmin`). hardened runtime에서 이 경로에 `com.apple.security.automation.apple-events`가 필요한지는 확인하지 않았다(§8 P2(c)).
- 검토한 선택지:
  - (a) electron-builder 템플릿: `app/package.json`은 바뀌지 않지만 `disable-library-validation`이 들어 있어 library validation이 꺼진다. 고르지 않았다.
  - (b) 최소 파일 커밋: build 설정이 바뀌므로 S0가 `/ship`을 거친다. 참고: Orca 번들은 `disable-library-validation` 없이 `allow-jit`, `allow-unsigned-executable-memory`, `automation.apple-events`와 장치·개인정보 항목을 가진다(2026-11-06 `codesign -d --entitlements - /Applications/Orca.app`).

## 5. 순수 함수로 분리할 부분

없다. 앱·CLI 코드가 바뀌지 않고, 바뀌는 것은 skill 절차, electron-builder 인자, build 설정 두 줄과 plist 하나다. 그래서 `/tdd`·`/implement` 대상이 없다. 검증은 서명 결과물을 codesign·stapler·spctl로 검사하고, 서명한 앱을 격리해 짧게 실행해 보는 것이다(tasks P1·P2·S1).

## 6. 형식·컨벤션·결정 영향

- 형식: 없음. JSON Schema와 `v`가 바뀌지 않는다.
- 컨벤션: ARCHITECTURE §1과 `doan check` 규칙에 영향이 없다.
- 결정:
  - ARCHITECTURE §9 "The only package is the unsigned local arm64 `Doan.app`"이 바뀐다. 로컬 package는 서명하지 않고, tester dmg는 빌드한 머신의 키체인 자격증명으로 Developer ID 서명과 공증을 한다.
  - PRODUCT §3 Out of scope 5는 유지된다(범위 확인 참고).
  - ARCHITECTURE §9 'Doan does not handle GitHub tokens'와 §7 'Agent authentication'은 앱의 자격증명 규칙이라 이 feature와 관계없다. 서명 자격증명은 앱이 아니라 개발자 머신의 것이다.
  - `appId` `design.doan.app`과 `app.name` `doan`은 바뀌지 않는다. 그래서 userData와 Keychain 이름(`doan Safe Storage`)도 그대로다.

## 7. POSTMORTEM에서 가져온 함정

- 2026-10-30 'Packaged-app probes failed for reasons of their own':
  - 격리된 HOME에는 `~/Library/Keychains`가 없어 Electron `safeStorage`가 키체인을 찾지 못한다. P2 실행 smoke는 sign-in을 하지 않으므로 키체인을 연결하지 않는다. `safeStorage` 관련 로그는 실패로 보지 않는다.
  - `design.doan.app` 등록이 여러 개면 LaunchServices가 엉뚱한 복사본을 연다. P2는 실행 파일을 직접 띄우고(`open`을 쓰지 않음), 끝나면 staging 복사본을 `lsregister -u`한다.
  - 창이 보인다는 사실만으로 PASS를 주지 않는다. 메인 창 로드와 터미널 프로세스 생성을 이벤트로 확인한다.
- 같은 항목 (2): 알림 허용 기록은 서명 identity에 묶인다. Developer ID로 바뀌면 이전 ad-hoc 복사본의 허용은 이어지지 않는다(보고서 안내).

## 8. PoC

- **P1 서명·공증 한 번**: origin/main을 §3대로 `.scratch/tester-notarization/`에서 빌드해 다음을 확인한다.
  - (a) `-c.mac.identity`의 형식(접두어 유무).
  - (b) `Contents/Resources/bin/doan`을 포함해 모든 Mach-O가 Developer ID, `runtime`, Timestamp로 서명되는지. `@electron/osx-sign`이 `Resources/` 아래 실행 파일까지 서명하는지는 확인하지 않았다.
  - (c) 앱과 dmg 공증이 `Accepted`인지, 걸린 시간.
  - (d) quarantine을 붙인 복사본의 spctl 결과.
  - 결과가 다르면 §3을 먼저 고친다.
- **P2 서명한 앱 실행**: P1의 앱을 staging(Applications 밖)에서 `Contents/MacOS/Doan --user-data-dir=<tmp>`로 실행한다. HOME, SHELL, `CLAUDE_CONFIG_DIR`, `CODEX_HOME`은 AGENTS.md 'Commands'의 dev 실행처럼 격리한다.
  - (a) 메인 창이 로드되는지(hardened runtime + entitlements에서 crash하지 않는지).
  - (b) node-pty 터미널 하나가 열리는지(library validation).
  - (c) `osascriptAdmin` 경로가 apple-events entitlement 없이 동작하는지. 실제 관리자 대화 상자를 띄우므로 시작 전에 사람에게 묻는다. 거절하면 미확인으로 남기고, §4의 파일에 `automation.apple-events`를 넣을지 사람이 정한다.
  - 프로브는 `.scratch/tester-notarization/`에 둔다.
