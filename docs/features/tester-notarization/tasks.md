# tester-notarization — tasks

시작 전: design §0 결정을 따른다.

순서: 사람의 자격증명 준비 → PoC → skill·문서 → 문서 승격. 앱·CLI 코드와 JSON Schema는 바뀌지 않아 `/tdd`·`/implement` 단계가 없다(design §5). codesign·spctl·stapler·notarytool·security 명령은 AGENTS.md 'Commands'에 없다. S2에서 그 줄이 tester-build skill을 가리키게 될 때까지 이 명령들의 검증은 "명령 미정 — 사람 확인 필요"로 본다.

## U. 사람의 자격증명 준비(이 머신)

- [ ] U1. Developer ID Application 인증서를 만들어 로그인 키체인에 넣는다(design §2).
  - 검증: 명령 미정 — 사람 확인 필요. `security find-identity -v -p codesigning`에 `Developer ID Application:` 줄이 정확히 하나 있다.
- [ ] U2. 인증서와 개인키를 `.p12`로 내보내 비밀번호 관리자에 둔다. repo, `.scratch/`, Desktop에는 두지 않는다.
  - 검증: 사람 확인.
- [ ] U3. App Store Connect에서 Team API 키를 만들고, `! xcrun notarytool store-credentials doan-notary --key … --key-id … --issuer …`로 저장한다. 그런 다음 `.p8`을 비밀번호 관리자로 옮기고 내려받은 곳에서는 지운다(design §2).
  - 검증: 명령 미정 — 사람 확인 필요. `.p8`을 지운 뒤에도 `xcrun notarytool history --keychain-profile doan-notary`가 exit 0이다.

## P. PoC(skill을 고치기 전)

- [ ] P1. design §8 P1: origin/main을 design §3대로 서명·공증한다. entitlements는 design §4의 처음 내용으로 만든 `.scratch/` 파일을 `-c.mac.entitlements`·`-c.mac.entitlementsInherit`로 넘긴다. 산출물은 `.scratch/tester-notarization/`에만 두고 Desktop에 복사하지 않는다.
  - 검증: 명령 미정 — 사람 확인 필요. spec '`/tester-build` 결과'의 codesign·stapler·spctl 항목이 모두 통과한다. 관찰(identity 형식, 서명되지 않은 Mach-O 유무, submission 결과와 걸린 시간, 날짜)을 design §8에 적고, §3을 확정 절차로 고친다.
- [ ] P2. design §8 P2: P1의 앱을 격리 실행한다. (c)는 시작 전에 사람에게 묻는다.
  - 검증: 명령 미정 — 사람 확인 필요. 메인 창 로드와 터미널 프로세스 생성 이벤트를 프로브가 기록하고, `Contents/Resources/bin/doan --version`이 `app/package.json` 버전을 출력한다. 끝나면 staging 복사본을 `lsregister -u`하고, 실제 `~/Library/Application Support/doan*`이 바뀌지 않았음을 확인한다. 결과로 design §0 3(entitlements)을 확정한다.

커밋 경계: P1·P2 관찰과 design 수정(`docs/features/tester-notarization/`만). `docs(feature): tester-notarization PoC results`.

## S. skill·설정

- [ ] S0. `/ship`으로 P2에서 확정한 `app/resources/entitlements.mac.plist`와 `app/package.json`의 `mac.entitlements`·`mac.entitlementsInherit`를 넣는다(design §4). S1의 skill 단계가 이 설정에 기대므로, S1의 `/tester-build` 확인은 S0가 main에 merge된 뒤에 한다.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs`가 통과한다. `npm --prefix app run package` 결과가 여전히 서명되지 않았다(`codesign -dv`에 Developer ID authority가 없다). S1 확인 실행에서 앱 본체와 helper·`spawn-helper`·`Resources/bin/doan`의 `codesign -d --entitlements -`가 그 파일의 항목만 보이고 `disable-library-validation`이 없다.
- [ ] S1. `.agents/skills/tester-build/SKILL.md`를 design §3대로 고친다. description, 소개, 일회성 준비(이 머신과 다른 머신 추가, design §2), preflight, 단계, 확인, 보고서, 금지 사항을 고친다. harness 변경이므로 대화 중에 직접 고친다.
  - 검증: `/tester-build`를 한 번 끝까지 실행한다. Desktop에 `Doan-tester-<date>-<sha>.dmg`가 생기고, 보고서가 spec 완료 조건의 항목을 모두 통과로 보인다. 자격증명 preflight 실패 경로는 `--keychain-profile`에 없는 프로필 이름을 넣은 preflight 명령이 0이 아닌 값으로 끝나는지만 확인한다.
- [ ] S2. AGENTS.md 'Commands'의 tester build 줄을 고친다("ad-hoc signed" → Developer ID signed and notarized with the building machine's keychain credentials).
  - 검증: `grep -n "ad-hoc" AGENTS.md`에 tester build 줄이 없다.

커밋 경계: S1(`docs(skill): notarize tester builds`)과 S2(`docs: tester build is notarized`)를 문서별로 나눈다.

## Z. 문서 승격

- [ ] Z1. 결론을 현재 규칙으로 올리고 이 디렉터리를 지운다.
  - ARCHITECTURE §9 'Distribution': 로컬 package는 서명하지 않는다. tester dmg는 빌드한 머신의 로그인 키체인(identity, 프로필 `doan-notary`)으로 hardened runtime 서명과 앱·dmg 공증을 하고, 그 이유와 entitlements를 적는다.
  - ARCHITECTURE §7 'CLI lookup and local package'의 Packaging 줄을 고친다.
  - BACKLOG 'Release packaging'에서 tester dmg 서명·공증과 "tester dmgs are re-signed by hand"를 빼고, CI(GitHub Actions Secrets), updater, brew, x64, 다운로드, OPERATIONS를 남긴다. 알림 문장은 P2 관찰에 맞춘다.
  - PRODUCT는 바뀌지 않는다.
  - 검증: `grep -rn "ad-hoc\|unsigned" AGENTS.md docs/ARCHITECTURE.md docs/BACKLOG.md .agents/skills/tester-build`에 tester dmg를 ad-hoc이나 unsigned로 설명하는 문장이 없다. `docs/features/tester-notarization/`이 없다.

커밋 경계: ARCHITECTURE, BACKLOG, 디렉터리 삭제를 문서별로 나눈다.
