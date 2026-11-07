# release-ci — tasks

`/ship`으로 진행한다. 분기는 `develop`에서 `chore/release-ci`(git-flow 규칙). 커밋 타입은 브랜치 타입과 같은 `chore`다(테스트 커밋은 `/ship`대로 `test:`). 워크플로 실행 확인 명령(`gh workflow run`, `gh run watch`, `gh run download`, `gh run list`)은 T7이 AGENTS.md 'Commands'에 더하기 전까지 "확인 명령 미정 — 사용자 확인 필요"다. 부모 tasks.md는 체크하지 않는다(부모 '자식 진행 규칙' 1).

- [ ] T0. 부모 G3a에서 환경 `release`와 design.md '비밀과 권한'의 비밀·변수가 등록됐는지 사용자에게 확인받는다(값은 보지 않는다).
  - 검증: 사용자 답으로 확인한다.
- [ ] T1. 서명 없는 골격 워크플로(design.md 'PoC' 1)를 작은 PR로 `develop`에 넣는다(사용자 승인 아래 PR을 먼저 연다).
  - 검증: 확인 명령 미정 — 사용자 확인 필요(`gh workflow run test-build.yml --ref develop`이 시작되고 `gate`가 통과한다).

── commit(골격 PR): `chore(ci): add dispatch skeletons for test and release builds` ──

- [ ] T2. `/tdd`: `checkReleaseVersion`, `parseCodesignDetails`, `compareEntitlements`, `parseSpctl`의 테스트를 먼저 쓴다(`/tester-build`에서 관찰한 실제 출력 예를 픽스처로, `draft_exists`와 rc 순서 사례 포함). 스크립트 이름을 정하고 design.md '/release와의 계약'과 release-skill design을 같이 고친다.
  - 검증: `npm --prefix app test`에서 새 테스트가 실패한다(red).

── commit: `test(release): pin version and signature checks` ──

- [ ] T3. 순수 함수와 얇은 검증 스크립트를 구현한다.
  - 검증: `npm --prefix app test` 통과, `node .agents/skills/verify/scripts/verify.mjs` 통과.

── commit: `chore(release): check versions and signatures in scripts` ──

- [ ] T4. `app/package.json` `build`: zip 타깃, `publish`, dmg 이름, 고지 `extraResources`. 로컬 패키지가 바뀌지 않았는지 확인하고, `app-update.yml`이 생기면 `app/scripts/package.mjs`에 `-c.publish=null`을 더한다.
  - 검증: `npm --prefix app run package` 뒤
    - `test -e app/dist/mac-arm64/Doan.app/Contents/Resources/LICENSE`, `test -d app/dist/mac-arm64/Doan.app/Contents/Resources/notices`
    - `test ! -e app/dist/mac-arm64/Doan.app/Contents/Resources/app-update.yml`
    - 앱이 서명되지 않은 채다(`codesign -dv`가 ad-hoc 또는 서명 없음, 확인 명령 미정 — T7에서 Commands에 더한다).

── commit: `chore(app): add zip, GitHub publish and notices to the package` ──

- [ ] T5. `test-build.yml`을 완성하고 design.md 'PoC' 2·3대로 이 브랜치에서 한 번 돌린다.
  - 검증: 확인 명령 미정 — 사용자 확인 필요. 실행 로그에 서명 검증 스크립트의 통과 줄이 있고, 산출물 dmg가 보존 7일로 남는다. 비밀 하나를 빈 이름으로 바꾼 실행이 첫 단계에서 실패하는 것도 한 번 본다(값은 출력되지 않는다).
- [ ] T6. `release.yml`을 완성하고 `dry_run`으로 이 브랜치에서 한 번 돌린다(실제 draft는 부모 R1에서).
  - 검증: 확인 명령 미정 — 사용자 확인 필요. 산출물에 dmg·zip·zip.blockmap·`latest-mac.yml`이 있고, 산출물 dmg가 `xcrun stapler validate`를 통과하며, zip을 푼 앱이 서명 검증 스크립트를 통과한다. 공증 시간 초과 경로의 로그 문구(제출 id 출력)를 코드에서 확인한다. 끝나면 사용자가 환경 배포 ref에서 `chore/release-ci`를 지우고, test-build의 PoC 예외(design.md test-build 1단계)를 지운다.

── commit: `chore(ci): build signed tester and release packages` ──

- [ ] T7. `/tester-build`를 D8대로 다시 쓴다(워크플로 시작 → 받기 → Desktop). AGENTS.md 'Commands'의 75행과 워크플로 실행·관찰 명령(`gh workflow run`, `gh run list`, `gh run watch`, `gh run download`, `codesign -dv`)을 더한다. 비밀을 처음 넣고 갱신하는 절차(인증서 `.p12` 내보내기, API 키, 환경과 비밀·변수 이름)를 [release-skill design](../release-skill/design.md) 'One-time setup'에 직접 쓴다.
  - 검증: `grep -n 'login keychain' .agents/skills/tester-build/SKILL.md` 결과 없음(D8). `grep -n 'gh workflow run' AGENTS.md`가 한 줄을 낸다. `grep -n 'MAC_CERT_P12_BASE64' docs/features/release-skill/design.md`가 한 줄 이상.

── commit: `docs(skills): build tester packages in CI` / `docs(agents): add workflow commands` / `docs(feature): release-skill one-time setup` ──

- [ ] T8. 결론 승격:
  - ARCHITECTURE §9 'Tester dmg'·'Local package'를 새 규칙으로(CI 서명, 환경 비밀, 테스트·릴리스 산출물, 업데이트 피드 계약, 고지 위치 `Contents/Resources/LICENSE`·`notices/`, PoC 답과 부모 '조사'의 확인한 electron-builder 동작: 태그를 만들지 않음, rc도 `latest-mac.yml`, zip 안 앱은 스테이플됨, `APPLE_API_KEY`는 경로). §7 'CLI lookup and local package'의 "Release distribution is #9"를 바꾼다.
  - PRODUCT에 Doan을 어떻게 받는지 한 줄(GitHub Releases의 공증된 arm64 dmg)을 §2 설치 문장 옆에 더한다.
  - BACKLOG:7 'Release packaging'을 지우고 남는 것(Homebrew cask, x64·universal 빌드)을 'Release packaging'이 없는 새 항목 "Homebrew cask and x64/universal builds"로 다시 쓴다. BACKLOG:9 'Not verified for tester dmgs'에서 CI 서명으로 뜻이 없어진 항목(둘째 기계의 인증서 설치, Codex에서 `/tester-build`)을 정리한다. BACKLOG:17을 지운다.
  - DIRECTORY.md를 고친다. 이 디렉터리를 지운다.
  - 검증:
    - `grep -n 'come with release packaging' docs/ARCHITECTURE.md` 결과 없음
    - `grep -n -E 'Release packaging|preset notices in a readable form' docs/BACKLOG.md` 결과 없음
    - `grep -n 'GitHub Releases' docs/PRODUCT.md`가 한 줄 이상
    - `ls docs/features/release-ci` 결과 없음

── commit: `docs(ARCHITECTURE): describe CI signing and release packages` / `docs(PRODUCT): say where Doan is downloaded` / `docs(BACKLOG): close release packaging items` / `docs(directory): note release workflows` / `docs(feature): remove release-ci` ──
