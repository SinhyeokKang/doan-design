# tester-notarization — tasks

시작 전: design §0 결정을 따른다.

순서: 사람의 자격증명 준비 → PoC → 설정과 skill(한 PR) → 문서 승격. 앱·CLI 코드와 JSON Schema는 바뀌지 않아 `/tdd`·`/implement` 단계가 없다(design §5).

검증 명령: codesign·spctl·stapler·xattr·notarytool·security·lsregister는 AGENTS.md 'Commands'에 없다. S2에서 그 줄이 tester-build skill을 가리키게 될 때까지, 이 명령들을 쓰는 검증은 모두 "명령 미정 — 사람 확인 필요"로 본다(아래에서 "(명령 미정)"으로 표시).

## U. 사람의 자격증명 준비

- [x] U1. Developer ID Application 인증서를 만들어 이 머신의 로그인 키체인에 넣는다(design §2).
  - 검증(명령 미정): `security find-identity -v -p codesigning`에 `Developer ID Application:` 줄이 정확히 하나 있다.
- [x] U2. 인증서와 개인키를 `.p12`로 내보내 백업한다. 비밀번호는 비밀번호 관리자에 둔다.
  - 검증: 사람 확인.
- [x] U3. App Store Connect에서 Team API 키를 만들고, `! xcrun notarytool store-credentials doan-notary --key … --key-id … --issuer …`로 저장한다. 그런 다음 `.p8` 내용을 비밀번호 관리자로 옮기고 파일을 지운다(design §2).
  - 검증(명령 미정): `.p8`을 지운 뒤에도 `xcrun notarytool history --keychain-profile doan-notary`가 exit 0이다.
- [ ] U4. (선택, 사람이 다른 머신을 준비할 때) 그 머신에서 design §2 '다른 머신' 절차를 따른다. 이 task는 Z1을 막지 않는다.
  - 검증(명령 미정): 절차 전에는 그 머신에서 identity와 프로필이 보이지 않는다(iCloud로 옮겨지지 않음 확인). 절차 뒤에는 U1·U3의 확인이 통과한다. 결과를 skill의 '다른 머신' 절에 반영한다. Z1 뒤에 하면 ARCHITECTURE와 skill에 바로 반영한다.

## P. PoC(설정과 skill을 고치기 전)

- [x] P1. design §8 P1: origin/main을 design §3대로 서명·공증한다. 사람이 자리에 있는지 먼저 묻는다(키체인 Always Allow).
  - entitlements는 design §4의 처음 내용으로 만든 `.scratch/` 파일을 절대 경로로 `-c.mac.entitlements`·`-c.mac.entitlementsInherit`에 넘긴다.
  - 산출물은 `.scratch/tester-notarization/`에만 두고 Desktop에 복사하지 않는다.
  - 검증(명령 미정): spec '`/tester-build` 결과'의 codesign·entitlements·designated requirement·dmg Timestamp·stapler·spctl 항목이 모두 통과한다. design §8 P1 (a)–(e)의 관찰(날짜 포함)을 design §8에 적고, §3을 확정 절차로 고친다.
- [x] P2. design §8 P2: P1의 앱을 격리 실행한다. (c)와 (d)는 각각 시작 전에 사람에게 묻는다.
  - 검증(명령 미정):
    - (a) 메인 창 로드 이벤트가 기록된다.
    - (b) pty spawn의 출력과 exit 이벤트가 기록되고, `bin/doan design-skill --json`의 `version`이 `app/package.json` 버전과 같다.
    - (c) `/usr/local/bin/doan`이 생겼다가, 사람이 지운 뒤 없다.
    - (d) 알림 결과(`show`·권한 요청·조용한 거부)가 기록되고, 테스트한 복사본의 `lsregister -u`가 끝난다.
    - 실제 `~/Library/Application Support/doan*`이 실행 전과 같다.
    - (c) 결과로 design §4 entitlements 내용을 확정하고, (d) 결과로 테스터 안내의 알림 문장을 확정한다.
- [x] P3. P1·P2가 만든 worktree, staging, 임시 HOME을 지운다(2026-11-06). 두 번째 실행의 staging(`.scratch/tester-notarization/stage2`)은 테스터 dmg를 Desktop에 둔 뒤 지운다. worktree는 `git status`를 확인한 뒤 `git worktree remove`로 지운다.
  - 검증: `git worktree list`에 `.scratch/tester-notarization/` 아래 worktree가 없다.

PoC 완료(2026-11-06): P1(두 번), P2 (a)–(d), P3.

커밋 경계: P1·P2 관찰과 design 수정(`docs/features/tester-notarization/`만). `docs(feature): tester-notarization PoC results`.

## S. 설정과 skill(한 `/ship` PR, design §0 10)

- [x] S0. `/ship`의 `chore/tester-notarization` 브랜치에서 P2로 확정한 `app/resources/entitlements.mac.plist`를 만들고, `app/package.json`에 `mac.entitlements`·`mac.entitlementsInherit`를 넣는다(design §4).
  - 검증: `node .agents/skills/verify/scripts/verify.mjs`가 통과한다. `app/package.json`의 `mac.identity`가 `null`이고 `app/scripts/package.mjs`가 바뀌지 않는다. (명령 미정) `npm --prefix app run package` 결과의 `codesign -dv`에 Developer ID authority가 없다.
- [x] S1. 같은 브랜치에서 `.agents/skills/tester-build/SKILL.md`를 design §3대로 고친다. description, 소개, 일회성 준비(이 머신, 다른 머신, 준비 중 관찰 세 항목), preflight, 단계, 확인, 보고서, 금지 사항을 바꾼다.
  - 검증(문서): SKILL.md에 G2 중간 인증서, Xcode 라이선스(exit 69 구분), Request Access, identity가 둘 이상일 때의 목록 보고, `env -u` 줄, "notarization successful" 확인, `--timeout 30m`, staple 재시도, Desktop dmg preflight가 있다.
  - 검증(명령 미정, 실행): 사람이 PR을 merge한 뒤 `/tester-build`를 한 번 끝까지 실행한다. Desktop에 `Doan-tester-<date>-<sha>.dmg`가 생기고, 보고서가 spec '`/tester-build` 결과'의 codesign·entitlements·designated requirement·dmg Timestamp·stapler·spctl 항목과 설치 안내 문구를 통과로 보인다. preflight 실패 경로는 없는 프로필 이름으로 `notarytool history`를 실행해, 출력이 "No Keychain password item found"인지만 확인한다.
- [x] S2. 같은 브랜치에서 AGENTS.md 'Commands'의 tester build 줄을 고친다("ad-hoc signed" → Developer ID signed and notarized with the building machine's keychain credentials).
  - 검증: `grep -n "Tester build" AGENTS.md`의 줄에 "ad-hoc"이 없다.

커밋 경계: S0(`chore: add hardened runtime entitlements for signed builds`), S1(`docs(skill): notarize tester builds`), S2(`docs: tester build is notarized`)를 파일별로 나누어 한 PR에 담는다. `/ship`은 merge하지 않으므로 merge는 사람이 한다. S1 실행 검증은 그 뒤에 한다.

S0–S2는 PR #109로 merge되었다(`3a27e626`, orch.md). S1 실행 검증(2026-11-06): merge된 skill로 `/tester-build`를 origin/main `3a27e62`에서 끝까지 실행했다.
- preflight가 통과했다. identity 하나, 프로필 exit 0, Desktop에 같은 이름의 dmg 없음.
- 빌드는 353초 걸렸고, 출력에 "notarization successful"이 있었다. 앱 submission `85bf0a83-b442-459c-8e7f-2b5fb1f50fdb`는 `Accepted`였다. dmg submission `d9c7aa45-00da-42cf-8b70-23cfc1914a33`은 75초 만에 `Accepted`였고, staple은 처음 시도에 통과했다.
- skill 단계 6의 확인이 모두 통과했다.
  - `codesign --verify --deep --strict`가 통과했다. Mach-O 21개 모두 Developer ID, `runtime`, Timestamp를 가졌다.
  - 앱, helper 4개, `bin/doan`, `spawn-helper`의 entitlements가 커밋한 파일의 두 항목과 같았다.
  - designated requirement는 `leaf[subject.OU] = "7H4HNHTB45"`였고 cdhash가 아니었다.
  - dmg는 Developer ID authority와 Timestamp를 가졌다. `stapler validate`가 앱과 dmg 모두 통과했다.
  - quarantine을 붙인 dmg와 마운트한 앱의 `spctl`이 `accepted`, `source=Notarized Developer ID`였다.
- 결과물: `~/Desktop/Doan-tester-2026-11-06-3a27e62.dmg`.
- preflight 실패 경로(없는 프로필)의 출력은 P 단계에서 "No Keychain password item found for profile"로 확인했다.

## Z. 문서 승격

- [ ] Z1. 결론을 현재 규칙으로 올리고 이 디렉터리를 지운다. S1 실행 검증이 끝난 뒤에 한다.
  - ARCHITECTURE §9 'Distribution': 로컬 package는 서명하지 않는다. tester dmg는 빌드한 머신의 로그인 키체인(identity, 프로필 `doan-notary`)으로 hardened runtime 서명과 앱·dmg 공증을 한다. entitlements 파일과 `entitlementsInherit`가 필요한 이유를 적는다.
  - ARCHITECTURE §7 'CLI lookup and local package'의 Packaging 줄을 고친다.
  - BACKLOG 'Release packaging'에서 tester dmg 서명·공증과 "tester dmgs are re-signed by hand"를 빼고, CI(GitHub Actions Secrets), updater, brew, x64, 다운로드, OPERATIONS를 남긴다. 알림 문장은 P2(d) 관찰(이전 서명의 기록이 있으면 Developer ID 빌드의 알림이 묻지 않고 거부됨, 원인 미확정)로 바꾼다. U4를 하지 않았으면 "다른 머신에서 자격증명이 iCloud로 옮겨지지 않는다는 것은 미확인"을 남긴다. `doan Safe Storage` 프롬프트 미확인도 남긴다.
  - DIRECTORY.md의 `app/resources/` 역할에 entitlements 파일을 더한다.
  - README.md 'no signed build or installer yet'을 고칠지 판단한다. 공개 배포는 아직 없으므로 그대로 둘 가능성이 높다.
  - PRODUCT는 바뀌지 않는다.
  - 검증: `grep -rn "ad-hoc\|unsigned" AGENTS.md docs/ARCHITECTURE.md docs/BACKLOG.md .agents/skills/tester-build`의 결과를 문장별로 판정한다. 서명하지 않는 로컬 package를 설명하는 문장은 남고, tester dmg를 ad-hoc이나 unsigned로 설명하는 문장은 없다. `docs/features/tester-notarization/`이 없다.

커밋 경계: ARCHITECTURE, BACKLOG, DIRECTORY(, README), 디렉터리 삭제를 문서별로 나눈다.
