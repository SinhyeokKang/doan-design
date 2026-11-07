# release-ci — tasks

`/ship`으로 진행한다. 분기는 `develop`에서 `feat/release-ci`(git-flow 규칙). 워크플로 실행 확인은 AGENTS.md 'Commands'에 명령이 없으므로 "명령 미정 — 사용자 확인 필요"로 적는다(T7이 명령을 더한다).

- [ ] T0. 부모 G3에서 환경 `release`와 design.md '비밀과 권한'의 비밀이 등록됐는지 사용자에게 확인받는다(값은 보지 않는다).
  - 검증: 사용자 확인.
- [ ] T1. PoC: design.md 'PoC' 세 항목. 결과를 design.md에 적는다.
  - 검증: 명령 미정 — 사용자 확인 필요.
- [ ] T2. `/tdd`: `checkReleaseVersion`, `parseCodesignDetails`, `compareEntitlements`, `parseSpctl`의 테스트를 먼저 쓴다(`/tester-build`에서 관찰한 실제 출력 예를 픽스처로).
  - 검증: 테스트 실행 명령은 스크립트 위치에 따라 `npm --prefix app test` 또는 `node --test`로 정한다. 처음에는 실패해야 한다.
- [ ] T3. 순수 함수와 얇은 검증 스크립트를 구현한다.
  - 검증: `npm --prefix app test` 통과, `node .agents/skills/verify/scripts/verify.mjs` 통과.

── commit: `feat(release): check versions and signatures in scripts` ──

- [ ] T4. `app/package.json` `build`: zip 타깃, `publish`, dmg 이름, 고지 `extraResources`. 로컬 패키지가 바뀌지 않았는지 확인한다.
  - 검증: `npm --prefix app run package` 후 `app/dist/mac-arm64/Doan.app/Contents/Resources/LICENSE`와 `notices/`가 있고, 앱이 서명되지 않은 채다(`codesign -dv`가 ad-hoc 또는 서명 없음).

── commit: `build(app): add zip, GitHub publish and notices to the package` ──

- [ ] T5. `test-build.yml`을 만들고 한 번 돌린다.
  - 검증: 명령 미정 — 사용자 확인 필요. 산출물 dmg에 검증 스크립트가 통과했다는 로그가 있다.
- [ ] T6. `release.yml`을 만들고 `--publish never` 모드로 한 번 돌린다(실제 draft는 부모 R1에서).
  - 검증: 명령 미정 — 사용자 확인 필요. dmg·zip·`latest-mac.yml`이 작업 산출물에 있다.

── commit: `ci: build signed tester and release packages` ──

- [ ] T7. `/tester-build`를 D8대로 다시 쓰고(워크플로 시작 → 받기 → Desktop), AGENTS.md 'Commands'의 75행과 워크플로 실행·관찰 명령(`gh workflow run`, `gh run watch`, `gh run download`)을 더한다. `/tester-build`의 'One-time setup'(인증서·API 키 만들기)은 GitHub 환경 비밀을 넣는 절차로 바꿔 design.md '비밀과 권한'에 두고, release-skill이 `/release`로 옮긴다.
  - 검증: `grep -n 'login keychain' .agents/skills/tester-build/SKILL.md` 결과 없음(D8). `grep -n 'gh workflow run' AGENTS.md`가 한 줄을 낸다.

── commit: `docs(skills): build tester packages in CI` / `docs(agents): add workflow commands` ──

- [ ] T8. 결론 승격: ARCHITECTURE §9 'Tester dmg'·'Local package'를 새 규칙으로(CI 서명, 환경 비밀, 테스트·릴리스 산출물, 업데이트 피드 계약, 고지 위치), §7 'CLI lookup and local package'의 "Release distribution is #9"를 바꾼다. BACKLOG:7에서 이번에 한 것을 지우고 남는 것(Homebrew, x64)만 남긴다. BACKLOG:17을 지운다. DIRECTORY.md를 고친다. 부모 tasks.md의 C6을 체크하고 이 디렉터리를 지운다.
  - 검증: `grep -n 'come with release packaging\|readable form' docs/ARCHITECTURE.md docs/BACKLOG.md` 결과 없음. `ls docs/features/release-ci` 결과 없음.

── commit: `docs(architecture): describe CI signing and release packages` / `docs(backlog): close release packaging items` / `docs(feature): remove release-ci` ──
