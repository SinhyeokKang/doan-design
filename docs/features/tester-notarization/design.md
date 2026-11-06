# tester-notarization — design

## 0. 결정

1. 자격증명은 서명하는 머신의 로그인 키체인에 둔다. CI와 GitHub Actions Secrets는 정식 릴리스(#9)에서 다룬다(사람, 2026-11-06). git-secret은 쓰지 않는다. 공개할 repo의 history에 암호화된 서명 키가 영구히 남기 때문이다.
2. 공증 자격증명은 App Store Connect API 키(Team 키, `.p8`)로 한다(사람, 2026-11-06). Apple ID 암호를 바꿔도 유지되고, 정식 릴리스 CI에서도 같은 종류를 쓰기 때문이다.
3. entitlements는 최소 파일을 커밋해서 쓴다(사람, 2026-11-06; §4). Doan은 에이전트 자격증명(vault, `safeStorage`)을 다루므로 hardened runtime의 library validation을 끄지 않는다.
4. `npm --prefix app run package`는 서명하지 않은 채로 둔다. `/agent-eval`, `/runtime-test`, Codex 세션이 인증서 없이 돌아가야 하고, 서명 identity가 바뀌면 그 실행들의 알림·키체인 상태도 같이 바뀌기 때문이다. 서명은 `/tester-build` 안에서만 한다.
5. 자격증명이 없으면 `/tester-build`는 멈춘다. ad-hoc으로 대신 만들면, 테스터가 받은 dmg가 공증된 것인지 보고서만으로는 알 수 없게 된다.
6. 유효한 Developer ID Application identity가 둘 이상이면 멈추고 목록(이름, SHA-1, 만료일)을 보고한다(사람, 2026-11-06). 사람이 옛 identity를 키체인에서 지우고 `.p12` 백업을 새 것으로 바꾼다. 하나를 골라 진행할 수 없는 이유가 있다. electron-builder는 앱 서명에 identity 이름만 넘기는데(`macPackager.js` `doSign`: `identity.name`), 갱신 직후 두 identity는 이름이 같아서 codesign이 ambiguous로 실패한다.
7. dmg 공증은 30분을 상한으로 기다린다. 넘으면 submission id를 보고하고 멈추며, 다음 실행에서 `notarytool wait <id>`로 이어 간다. Accepted 뒤 staple이 실패하면 30초 간격으로 세 번까지 다시 하고, 그래도 실패하면 멈추고 보고한다(사람, 2026-11-06). 앱 공증은 electron-builder 안에서 일어나므로 상한을 둘 수 없다.
8. hardened runtime에서 관리자 권한 실행(`osascriptAdmin`)이 되는지는 실제로 확인한다(사람, 2026-11-06; §8 P2(c)).
9. 알림은 프로브로 관찰한다(사람, 2026-11-06; §8 P2(d)). `doan Safe Storage` 키체인 프롬프트는 격리 HOME에서 관찰할 수 없으므로 테스터 안내에 미확인으로 적는다.
10. S1(skill 수정)은 S0(entitlements)와 같은 `/ship` PR로 merge한다(사람, 2026-11-06). skill만 먼저 main에 들어가면, `/tester-build`가 entitlements 설정이 없는 origin/main을 빌드해 템플릿(`disable-library-validation`)으로 조용히 서명하기 때문이다.
11. 다른 머신 추가 절차는 skill에 적고, 확인은 사람이 그 머신을 준비할 때 하는 선택 task U4로 한다(사람, 2026-11-06).

## 1. 영향 요소

| 요소 | 바뀌는 것 |
|---|---|
| skill | `.agents/skills/tester-build/SKILL.md`: 일회성 준비(이 머신, 다른 머신, 준비 중 관찰), preflight, 서명·공증 단계, 확인, 보고서, 금지 사항 |
| AGENTS.md | 'Commands'의 tester build 줄("ad-hoc signed" → Developer ID로 서명하고 공증) |
| ARCHITECTURE | §9 'Distribution', §7 'CLI lookup and local package'의 Packaging 줄 |
| BACKLOG | 'Release packaging'에서 tester dmg 서명·공증을 빼고 CI·updater·brew·x64·다운로드·OPERATIONS가 남는다 |
| DIRECTORY.md | `app/resources/`의 역할("the packaged app icon source")에 entitlements 파일을 더한다 |
| README.md | "there is no signed build or installer yet"은 공개 배포 기준이라 Z1에서 고칠지 판단한다 |
| 앱(Electron + TS)·CLI(Go)·형식 | 없음 |
| `app/package.json` `build` | `mac.entitlements`와 `mac.entitlementsInherit` 두 줄, 새 파일 `app/resources/entitlements.mac.plist`(§4). `identity: null`은 그대로라 `npm run package` 결과는 바뀌지 않는다 |

## 2. 자격증명 보관

- **Developer ID Application 인증서**
  - Account Holder가 Xcode > Settings > Accounts > Manage Certificates의 `+`에서 만들거나, developer.apple.com에서 Keychain Access로 만든 CSR을 올려 만든다. 개인키는 CSR을 만든 머신의 로그인 키체인에 생긴다.
  - 사람이 인증서와 개인키를 함께 `.p12`로 내보내 강한 비밀번호를 건다. 이 머신에서는 `.p12`를 iCloud Drive `Keys/`에, 비밀번호를 암호 앱에 두었다. 이 백업이 다른 머신으로 옮기는 수단도 된다.
  - 인증서는 5년간 유효하다. 갱신하면 이름이 같고 해시가 다른 identity가 생긴다. 그때 사람이 할 일은 §0 6과 같다.
- **공증 자격증명(App Store Connect API 키)**:
  - 처음 쓸 때 Account Holder가 App Store Connect > Users and Access > Integrations에서 Request Access를 누른다.
  - 사람이 같은 화면의 Team Keys에서 키를 만든다. 키를 만드는 사람은 Account Holder나 Admin이어야 하고, 키 역할은 Developer로 둔다(공증에 충분한지 P1에서 확인). `.p8`은 만들 때 한 번만 내려받을 수 있다.
  - 사람이 `! xcrun notarytool store-credentials doan-notary --key <.p8 경로> --key-id <Key ID> --issuer <Issuer ID>`로 저장한다. 출력에는 키 경로와 ID만 있고 키 내용은 없다.
  - 저장한 뒤 `.p8` 내용은 비밀번호 관리자로 옮기고 파일은 지운다. 키체인 프로필이 키 내용을 담으므로, `.p8` 파일이 없어도 공증할 수 있다.
- **다른 머신**: `.p12`를 가져오고(더블클릭, 비밀번호 입력), 중간 인증서가 없으면 넣는다. 비밀번호 관리자의 `.p8` 내용으로 임시 파일을 만들어 `store-credentials`를 실행한 뒤 그 파일을 지운다. Xcode 라이선스에 동의한다. 로그인 키체인의 개인키와 notarytool 프로필은 iCloud 키체인으로 동기화되지 않는다고 이해하고 있다. 이는 미확인이며, U4에서 확인한다.
- **에이전트의 경계**: 비밀값(`.p12`와 그 비밀번호, `.p8`)을 읽거나 출력하거나 파일로 쓰지 않는다. 쓰는 것은 프로필 이름 `doan-notary`와 키체인이 보여 주는 identity 이름·SHA-1뿐이다. identity 이름과 Team ID는 모든 서명에 들어가는 값이라 비밀이 아니다.
- **준비 중 관찰(2026-11-06, 이 머신)**: 아래 세 항목은 S1에서 skill의 일회성 준비와 preflight 실패 안내로 옮긴다.
  - 웹에서 받은 `.cer`만으로는 identity가 유효하지 않았다. `security find-identity -p codesigning`이 짝은 찾았지만 "0 valid identities"였다. Apple 중간 인증서 `DeveloperIDG2CA.cer`(https://www.apple.com/certificateauthority/)를 로그인 키체인에 넣은 뒤에 유효해졌다.
  - Xcode 라이선스에 동의하지 않은 머신에서는 `xcrun notarytool`이 exit 69로 끝나고, 출력이 라이선스를 말한다. 프로필이 없을 때도 exit 69지만, 출력은 "No Keychain password item found for profile"이다. preflight는 출력으로 둘을 구분한다. `sudo xcodebuild -license accept`는 비밀번호를 물으므로 사람이 터미널에서 실행한다.
  - App Store Connect API는 Request Access를 누르기 전에는 Team 키를 만들 수 없었다.
  - `store-credentials`는 "Credentials validated", "saved to Keychain"을 출력했다. 이어서 `notarytool history`가 exit 0으로 끝났고, `.p8`을 지운 뒤에도 exit 0이었다.
- **사람이 자리에 있어야 한다**: codesign이 개인키를 처음 쓸 때 "codesign wants to sign using key …" 대화 상자가 뜨고, 사람이 Always Allow를 누른다. 키체인이 잠긴 세션(SSH 등)에서는 codesign이 `errSecInternalComponent`로 실패한다. 그때는 멈추고 사람에게 키체인을 열어 달라고 보고한다. Codex에서는 키체인과 네트워크가 sandbox 밖에 있으므로, 서명·공증 명령에 sandbox 밖 실행을 요청한다. Codex 경로는 미확인이다.

## 3. `/tester-build` 서명·공증 흐름

지금 단계 4(ad-hoc 재서명)와 단계 5의 `--prepackaged`를 다음으로 바꾼다. 단계 1–3(origin/main worktree, setup, `npm --prefix app run package`)은 그대로다. 단계 3이 CLI(`app/build/bin/doan`, 버전 stamp)와 `app/out/`을 만든다. `--prepackaged`는 서명을 건너뛰므로(`macPackager.js` `packMacTargets`) 쓸 수 없고, electron-builder가 다시 묶는다. 단계 3이 만든 `app/dist` 결과물은 쓰지 않는다.

0. **preflight**(worktree를 만들기 전):
   - `security find-identity -v -p codesigning`에서 `Developer ID Application:` 줄이 정확히 하나여야 한다.
     - 없으면: 일회성 준비 절차를 보고한다. 짝은 있는데 유효하지 않으면(`-v` 없이는 보임) 중간 인증서 안내를 한다.
     - 둘 이상이면: 이름, SHA-1, 만료일(`security find-certificate -Z -p -c <name> -a | openssl x509 -enddate`)을 보고한다(§0 6).
     - 그 줄의 `Developer ID Application: ` 뒤 `<Name> (<Team ID>)`를 이번 실행의 identity로 쓴다. 접두어를 붙이면 electron-builder가 `InvalidConfigurationError`를 던진다(`codeSign/macCodeSign.js` `checkPrefix`).
   - `xcrun notarytool history --keychain-profile doan-notary`가 exit 0이어야 한다. 실패하면 출력으로 라이선스 미동의와 프로필 없음을 구분해 보고한다(§2).
   - `~/Desktop/Doan-tester-<YYYY-MM-DD>-<sha>.dmg`가 있으면 덮어쓰지 않고 묻는다.
1. **서명한 빌드와 앱 공증**: `<worktree>/app`에서 다음을 실행한다.
   ```
   env -u APPLE_ID -u APPLE_APP_SPECIFIC_PASSWORD -u APPLE_TEAM_ID -u APPLE_API_KEY -u APPLE_API_KEY_ID -u APPLE_API_ISSUER -u APPLE_KEYCHAIN -u CSC_LINK -u CSC_KEY_PASSWORD -u CSC_NAME -u CSC_IDENTITY_AUTO_DISCOVERY \
     APPLE_KEYCHAIN_PROFILE=doan-notary npx electron-builder --mac dmg --arm64 \
     -c.mac.identity="<Name> (<Team ID>)" -c.dmg.sign=true -c.directories.output=<stage>/out
   ```
   - 환경 변수를 지우는 이유가 있다. electron-builder는 `APPLE_ID…`와 `APPLE_API_KEY…`를 키체인 프로필보다 먼저 본다(`MacTargetHelper.js` `getNotarizeOptions`). `CSC_LINK`가 있으면 임시 키체인에서 서명한다(`macPackager.js`).
   - `notarize`는 지정하지 않는다. 기본값이면 `APPLE_KEYCHAIN_PROFILE`이 있을 때 공증하고, 프로필 변수가 비면 경고만 남기고 건너뛴다(`MacTargetHelper.js` `notarizeIfProvided`). 그래서 출력에 "notarization successful"이 없으면 빌드가 성공했어도 멈춘다.
   - electron-builder가 `out/`과 `build/bin/doan`으로 다시 묶고, hardened runtime과 §4의 entitlements로 `Contents/` 아래 모든 바이너리를 깊은 것부터 서명한다. 서명에는 `--timestamp`가 붙는다(`@electron/osx-sign` `sign.js`, `util.js` `walkAsync`). 그다음 앱을 공증하고 staple한 뒤(`@electron/notarize`) dmg를 만들고 서명한다.
   - 앱 submission id는 출력되지 않는다. 끝난 뒤 `xcrun notarytool history --keychain-profile doan-notary`의 가장 최근 항목에서 읽는다.
2. **dmg 공증**: `xcrun notarytool submit <dmg> --keychain-profile doan-notary --wait --timeout 30m`.
   - `Accepted`가 아니면 `xcrun notarytool log <id> --keychain-profile doan-notary`의 issues를 보고하고 멈춘다.
   - 30분이 지나면 id를 보고하고 멈춘다(§0 7).
   - `Accepted`이면 `xcrun stapler staple <dmg>`를 실행하고, 실패하면 30초 간격으로 세 번까지 다시 한다.
   - 앱과 dmg를 둘 다 staple한다. 앱의 ticket은 테스터가 오프라인으로 처음 실행할 때 필요하다. dmg의 ticket은 dmg를 열 때 쓴다.
3. **확인**(모두 통과해야 Desktop에 복사한다): spec '`/tester-build` 결과'의 codesign·entitlements·designated requirement·stapler·spctl 항목. quarantine 확인은 staging 안의 dmg 복사본에 `xattr -w com.apple.quarantine "0081;<hex time>;Safari;" <copy>`를 붙인 뒤, 그 복사본과 마운트한 앱으로 한다. dmg spctl 확인은 빼지 않는다. `dmg.js`는 identity를 찾지 못하면 오류 없이 서명을 건너뛰고, 그 경우를 이 확인이 잡는다.
4. Desktop 복사, 정리(staging, worktree)는 지금과 같다.

보고서:
- dmg 경로, sha와 커밋 제목, identity 이름(Team ID 포함), 앱과 dmg의 submission id와 결과, 확인 결과.
- 테스터 설치 안내(spec과 같다).
- 이전 ad-hoc 빌드를 쓰던 테스터: `doan Safe Storage` 키체인 접근을 다시 물을 수 있다(미확인). 알림은 P2(d) 관찰대로 적는다.
- Agent setup 경고(실제 HOME의 `~/.local/bin/doan` 등)는 그대로 둔다.
- Codex에서 실행했다면 sandbox 밖 실행 여부를 적는다.

금지 사항에 추가:
- 비밀값을 읽거나 출력하거나 파일로 쓰지 않는다.
- 자격증명이 없을 때 ad-hoc으로 대신 만들지 않는다.
- 키체인에 identity나 프로필을 추가하거나 지우지 않는다. 사람이 한다.

## 4. entitlements

결정: 최소 파일 `app/resources/entitlements.mac.plist`를 커밋한다. 처음 내용은 `com.apple.security.cs.allow-jit`와 `com.apple.security.cs.allow-unsigned-executable-memory`이고, P2(c) 결과에 따라 `com.apple.security.automation.apple-events`를 더한다. `app/build/`는 gitignore 대상이라 파일을 그곳에 둘 수 없다.

- `mac.entitlements`와 `mac.entitlementsInherit`가 둘 다 이 파일을 가리켜야 한다. electron-builder는 앱 본체가 아닌 파일(Electron helper, `spawn-helper`, `Resources/bin/doan`)에는 `entitlementsInherit`를 쓴다. 그 값이 없고 `build/entitlements.mac.inherit.plist`도 없으면 `disable-library-validation`이 든 템플릿으로 되돌아간다(`MacTargetHelper.js` `getOptionsForFile`, 2026-11-06 확인).
- 경로는 해석되지 않고 그대로 codesign에 넘어간다. 그래서 `app/` 기준 상대 경로(`resources/entitlements.mac.plist`)는 `app/`에서 실행할 때만 맞는다. P1·P2는 커밋 전에 같은 내용의 `.scratch/` 파일을 절대 경로로 `-c.mac.entitlements=… -c.mac.entitlementsInherit=…`에 넘긴다. S0가 확인된 내용을 커밋한다.

배경:

- Doan은 Electron V8 때문에 `allow-jit`가 필요하다(electron-builder `macOptions.d.ts` 주석: Electron 20+ arm64는 이것 없이 crash할 수 있다).
- 네이티브 모듈은 node-pty(`pty.node`, `spawn-helper`) 하나이고, Claude MCP sign-in에서 처음 쓸 때 로드된다(`app/src/main/mcpConnectors/pty.ts`). 같은 Team ID로 서명되므로 library validation을 통과할 것으로 예상한다(P2(b)).
- 앱은 `/usr/bin/osascript`를 별도 프로세스로 띄워 관리자 권한 셸 명령을 실행한다(`app/src/main/agentSetup/runner.ts` `osascriptAdmin`). Doan 프로세스가 직접 Apple event를 보내지 않으므로 `automation.apple-events`가 필요 없을 가능성이 높지만, 확인하지 않았다(P2(c)).
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
  - PRODUCT §3 Out of scope 5는 유지된다(spec 범위 확인).
  - ARCHITECTURE §9 'Doan does not handle GitHub tokens'와 §7 'Agent authentication'은 앱의 자격증명 규칙이라 이 feature와 관계없다. 서명 자격증명은 앱이 아니라 개발자 머신의 것이다.
  - `appId` `design.doan.app`과 `app.name` `doan`은 바뀌지 않는다. 그래서 userData와 Keychain 이름(`doan Safe Storage`)도 그대로다.

## 7. POSTMORTEM에서 가져온 함정

- 2026-10-30 'Packaged-app probes failed for reasons of their own':
  - 격리된 HOME에는 `~/Library/Keychains`가 없어 Electron `safeStorage`가 키체인을 찾지 못한다. P2는 sign-in을 하지 않으므로 키체인을 연결하지 않는다. `safeStorage` 관련 로그는 실패로 보지 않는다.
  - `design.doan.app` 등록이 여러 개면 LaunchServices가 엉뚱한 복사본을 연다. P2(a)–(c)는 실행 파일을 직접 띄운다. P2(d)는 LaunchServices를 거쳐야 하므로, 이 항목의 Prevention(다른 복사본 `lsregister -u`, 끝나면 테스트한 복사본 `lsregister -u`, 실제 `~/Library/Application Support/doan*` 확인)을 따른다.
  - 창이 보인다는 사실만으로 PASS를 주지 않는다. 메인 창 로드, pty spawn, 알림 `show`를 이벤트로 확인한다.
  - (2): 알림 허용 기록은 서명 identity에 묶인다. ad-hoc 복사본의 허용 기록이 있는 bundle id로 Developer ID 빌드가 알림을 보낼 때 무슨 일이 일어나는지 P2(d)에서 본다.

## 8. PoC

- **P1 서명·공증 한 번**: origin/main을 §3대로 `.scratch/tester-notarization/`에서 빌드해 다음을 확인한다. 사람이 자리에 있어야 한다(키체인 Always Allow).
  - (a) §3 1의 명령이 그대로 도는지. identity 이름 형식과 환경 변수 unset을 포함한다.
  - (b) spec의 codesign·entitlements·designated requirement 항목. 소스상으로는 osx-sign이 `Contents/` 아래 모든 바이너리를 서명한다. 관찰할 것은 `asarUnpack`에 함께 들어가는 node-pty `prebuilds/darwin-x64/*`와 win32 파일까지 서명되거나 공증에 걸리는지다.
  - (c) 앱과 dmg 공증이 `Accepted`인지, 걸린 시간, 앱 submission id를 `notarytool history`에서 읽을 수 있는지, API 키 역할 Developer로 충분한지.
  - (d) dmg 서명의 Timestamp. `dmg.js`는 `--timestamp` 없이 codesign을 부른다.
  - (e) quarantine을 붙인 복사본의 spctl 결과.
  - 결과가 다르면 §3을 먼저 고친다.
- **P1 결과(2026-11-06, origin/main `f5f250f`, electron-builder 26.18.0, macOS 26.6.2)**: 모두 통과했다. §3의 절차는 바꾸지 않는다.
  - (a) §3 1의 명령이 그대로 돌았다. identity는 `"Sinhyeok Kang (7H4HNHTB45)"`로 넘겼다. 처음 서명할 때 키체인 허용을 사람이 눌렀다.
  - (b) `codesign --verify --deep --strict`가 통과했다. `Contents/` 아래 Mach-O 21개가 모두 Developer ID authority, `runtime`, Timestamp를 가졌다. 여기에는 `Resources/bin/doan`, node-pty `darwin-arm64`와 `darwin-x64`의 `pty.node`·`spawn-helper`가 들어간다. win32 파일은 Mach-O가 아니라서 서명되지 않았고, 공증에도 걸리지 않았다. 앱 본체, `bin/doan`, `spawn-helper`, Renderer helper의 entitlements는 `allow-jit`와 `allow-unsigned-executable-memory` 둘뿐이었다. designated requirement는 `identifier "design.doan.app" and anchor apple generic and … certificate leaf[subject.OU] = "7H4HNHTB45"`였다.
  - (c) 앱 공증(id `79987874-6ea4-45a6-925e-b5a77251ad02`)은 `Accepted`, issues 없음이었다. 제출부터 결과까지 약 41분 걸렸고, 빌드 전체는 2,727초였다. 팀의 첫 제출이었다. 출력에 "notarization successful"이 나왔고, 앱 id는 `notarytool history`에서 읽혔다. dmg 공증(id `d64872c6-7a22-4c01-b6ff-86ead01af5e0`)은 72초 만에 `Accepted`, issues 없음이었다. API 키 역할 Developer로 충분했다.
  - (d) dmg는 Developer ID authority와 Timestamp(14:58:43)를 가졌다. `--timestamp` 없이도 Timestamp가 붙었다.
  - (e) `stapler staple`·`validate`가 dmg에서 처음 시도에 통과했다. 앱의 `stapler validate`도 통과했다. quarantine을 붙인 dmg 복사본은 `spctl -a -t open --context context:primary-signature`에서 `accepted`, `source=Notarized Developer ID`였다. 그 dmg에서 마운트한 앱은 `spctl -a -t exec`에서 같은 결과였고, `bin/doan design-skill --json`의 `version`은 `0.1.0`이었다.
  - 첫 제출의 앱 공증은 41분 걸려 dmg 상한(30분)을 넘었을 것이다. 앱 공증에는 상한이 없어서 이번에는 기다렸다. 다음 빌드들의 시간을 보고 상한을 다시 정할지 판단한다.
  - 이 결과물은 그대로 tester dmg로 `~/Desktop/Doan-tester-2026-11-06-f5f250f.dmg`에 두었다(사람 요청, 테스터 대기).
- **P2 서명한 앱 실행**: HOME, SHELL, `CLAUDE_CONFIG_DIR`, `CODEX_HOME`은 AGENTS.md 'Commands'의 dev 실행처럼 격리한다. 프로브는 `.scratch/tester-notarization/`에 둔다.
  - (a) P1의 앱을 staging(Applications 밖)에서 `Contents/MacOS/Doan --user-data-dir=<tmp> --inspect=<port>`로 실행하고 메인 창 로드 이벤트를 기록한다.
  - (b) 같은 실행에서 main inspector로 `require('node-pty')`를 불러 pty 하나(`/bin/echo`)를 spawn하고, 출력과 exit 이벤트를 기록한다. 번들 CLI `Contents/Resources/bin/doan design-skill --json`의 `version`을 `app/package.json` 버전과 비교한다.
  - (c) 시작 전에 사람에게 묻는다. 실제 `/usr/local/bin/doan`을 만들고 관리자 비밀번호를 입력하기 때문이다.
    - 실행 직전에 `/usr/local/bin/doan`이 없는지 확인한다. 있으면 멈춘다(2026-11-06에는 없었다).
    - 복사본을 `<tmp HOME>/Applications/Doan.app`에 두고, `PATH`에 `<tmp HOME>/.local/bin`이 없는 fake `SHELL`로 실행한다. Agent setup이 관리자 대화 상자를 띄우고, 사람이 비밀번호를 넣는다.
    - `/usr/local/bin/doan`이 `<tmp HOME>` 안을 가리키는 링크로 생겼는지 기록한다. 그 뒤 사람이 `sudo rm /usr/local/bin/doan`으로 지우고, 없는지 다시 확인한다.
    - 실패하면 `automation.apple-events`를 §4 파일에 넣고 (c)를 다시 한다.
  - (d) 시작 전에 사람에게 묻는다. 실제 LaunchServices 등록과 이 bundle id의 알림 권한 기록을 바꾸기 때문이다.
    - POSTMORTEM 2026-10-30 Prevention대로, 다른 `design.doan.app` 등록을 `lsregister -dump`로 기록하고 `lsregister -u`한다.
    - staging 복사본을 `open -n … --args --user-data-dir=<tmp> --inspect=<port>`로 띄우고, main에서 테스트 알림 하나를 보낸다.
    - `show` 이벤트, 권한 요청, 조용한 거부 중 무엇이 일어났는지 기록한다.
    - 끝나면 복사본을 `lsregister -u`하고, 실제 `~/Library/Application Support/doan*`이 바뀌지 않았음을 확인한다. 처음에 등록을 해제한 복사본은 다음 실행 때 다시 등록된다고 보고에 적는다.
