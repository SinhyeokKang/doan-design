# release-ci — design

결정: 부모 [design.md](../release-0-1-0/design.md)의 '사용자 결정' 1·2, D5(러너), D6(비밀·권한, 배포 ref `v*` 태그·`develop`), D7(태그 push로 시작, 게시는 `/release`), D8(테스트 빌드, 입력 없음), D13(버전 검사), D14(아키텍처), D15(고지 파일), D18(저장소 위치). 근거는 부모 '조사'의 electron-builder 26.18.0 문서와 코드, Orca 워크플로다.

## 영향 범위

- `app/package.json` `build`: `mac.target`에 dmg와 zip(arm64), `publish: { provider: "github", owner: "SinhyeokKang", repo: "doan-design", releaseType: "draft" }`(D18), dmg `artifactName`을 버전 없는 `Doan-macos-arm64.dmg`로(README의 `releases/latest/download/…` 링크용, Orca의 `orca-macos-${arch}.${ext}` 방식), `extraResources`에 `{ from: "../LICENSE", to: "LICENSE" }`와 `{ from: "../cli/internal/designskill/notices", to: "notices" }`(D15). `mac.identity: null`은 그대로 두고 CI가 명령줄로 덮는다(docs/ARCHITECTURE.md:720).
- `app/scripts/package.mjs`: 바꾸지 않는다. 로컬 패키지는 `--mac dir`이고, electron-builder는 darwin에서 dmg나 zip 타깃이 있을 때만 `app-update.yml`을 쓴다(`app-builder-lib/out/publish/PublishManager.js:75–90`). T4에서 `publish`를 더한 뒤 `npm --prefix app run package`의 앱에 파일이 없음을 확인했다.
- 새 `.github/workflows/test-build.yml`, `.github/workflows/release.yml`. 게이트는 ci-gate의 `ci.yml`을 `workflow_call`로 부른다.
- 새 검사 스크립트(서명 검증, 버전 검사)와 그 테스트. 위치는 `app/scripts/`(패키징 스크립트 옆).
- `.agents/skills/tester-build/SKILL.md` 재작성, AGENTS.md 'Commands'(75행)와 'Workflow', [release-skill design](../release-skill/design.md) 'One-time setup'.
- 형식(§11)·app-socket·`doan check`: 영향 없음. ARCHITECTURE 결정 중 "Doan never commits"는 앱의 동작이라 CI와 무관하다.

## 순수 함수 (`/tdd` 대상)

- `checkReleaseVersion({ version, packageVersion, tags, releases })` — `x.y.z` 또는 `x.y.z-rc.N` 형식인지, `packageVersion`을 주면 그것과 같은지, 최신 정식 게시본보다 큰지(rc는 같은 base의 이전 rc 태그보다 큰지), 같은 버전의 draft·게시본이 이미 있는지. 같은 버전의 태그만 있는 것은 통과한다(태그 push 뒤 실패한 실행의 재실행). 실패 이유를 코드로 돌려준다(`bad_semver`, `tag_mismatch`, `published_exists`, `draft_exists`, `not_newer`). `releases`는 `gh release list --json tagName,isDraft,isPrerelease` 꼴이다. draft는 쓰기 권한이 있는 토큰에만 보이므로 CI에서 이 검사를 부르는 작업의 권한을 PoC(T6)에서 확인한다.
- `parseCodesignDetails(text)` → authority 목록, `runtime` 플래그, `Timestamp` 유무, Team ID. `/tester-build` 6단계의 "Developer ID Application authority, runtime flag, Timestamp" 검사를 데이터로 바꾼다.
- `compareEntitlements(committedPlist, signedXml)` → 커밋된 `app/resources/entitlements.mac.plist`에 없는 키(특히 `disable-library-validation`)를 찾는다.
- `parseSpctl(text)` → `accepted`와 `source=Notarized Developer ID` 여부.
- `checkLatestMacYml(ymlText, { version, zipName, zipSha512 })` — 피드의 `version`과 zip 항목의 sha512가 맞는지(`yml_version_mismatch`, `yml_missing_zip`, `yml_sha512_mismatch`). dmg 항목은 보지 않는다(피드의 dmg 해시는 스테이플 전 값이고, 맥 업데이트는 zip만 쓴다).
- 다섯 함수는 `app/scripts/releaseChecks.mjs`에 있고 테스트는 `app/scripts/releaseChecks.test.mjs`(Vitest)다.
- 셸 부분(실행, 마운트, zip 풀기, 파일 찾기)은 이 함수들을 부르는 얇은 스크립트로 둔다.

## 비밀과 권한 (D6)

- 환경 `release`: 필수 검토자 = 사용자, 배포 ref = 태그 `v*`(릴리스)·`tester-*`(테스트 빌드)·`release-dryrun-*`(릴리스 dry run). 공개 저장소에서만 쓸 수 있다(부모 '조사' GitHub). 등록은 부모 G3a, 태그 규칙 둘은 T1. 세 워크플로 모두 태그 push로 시작하므로 G3a의 `develop` 규칙은 쓰이지 않는다.
- 태그 push로 시작하는 이유: `workflow_dispatch`는 워크플로 파일이 기본 브랜치(`main`, D2)에 있어야 시작되고, `main`은 첫 릴리스 전까지 바뀌지 않는다. 태그 push는 그 태그 커밋의 워크플로 파일로 돈다. 태그는 아무 커밋에나 달 수 있으므로 `tester-*`·`release-dryrun-*` 실행은 `sign` 전에 태그 커밋이 `origin/develop`의 조상인지 검사한다(D8의 '임의 커밋을 서명하지 않는다'). 검토를 기다리는 동안 `develop`이 앞서 나갈 수 있어 HEAD와 같은지가 아니라 조상인지를 본다.
- 비밀 이름(값은 사용자가 넣는다): `MAC_CERT_P12_BASE64`(→ `CSC_LINK`), `MAC_CERT_PASSWORD`(→ `CSC_KEY_PASSWORD`), `APPLE_API_KEY_P8`(내용), `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`. 환경 변수(비밀 아님): `MAC_IDENTITY_NAME`(`<Name> (<Team ID>)`, `-c.mac.identity`에 넘긴다, `vars`로 둬서 로그에서 읽을 수 있게 한다).
- `APPLE_API_KEY`는 파일 경로다(부모 '조사'). 서명 작업이 `APPLE_API_KEY_P8`를 `$RUNNER_TEMP/AuthKey_<id>.p8`에 쓰고 그 경로를 `APPLE_API_KEY`로 넘긴다. dmg 공증도 `notarytool submit --key <경로> --key-id … --issuer …`로 한다(`--keychain-profile`이 아니다).
- 작업과 권한:
  - `gate`: ci-gate의 `ci.yml`을 `workflow_call`로. 비밀 없음, `contents: read`.
  - `sign`(`needs: gate`): 환경 `release`, `contents: read`. 첫 단계에서 다섯 비밀이 비었는지 이름만 검사한다. `timeout-minutes`를 둔다(앱 공증에는 시간 제한이 없다).
  - `publish`(release만, `needs: sign`): 환경 없음, 비밀 없음, `contents: write`. 산출물을 받아 `gh release create`로 올린다.
- `/tester-build`의 'Prohibited'(비밀을 읽거나 출력하지 않는다)를 워크플로 로그에도 적용한다: `set -x`를 쓰지 않고, 비밀을 파일로 쓸 때는 `$RUNNER_TEMP`에 쓰고 작업 끝에 지운다. 임시 keychain도 작업 끝에 지운다.

## 워크플로

### test-build (D8)

1. `on: push: tags: tester-*`. `/tester-build`가 `origin/develop` HEAD에 `tester-<date>-<sha>` 태그를 push한다. 첫 단계에서 태그 커밋이 `origin/develop`의 조상인지 확인하고, 아니면 실패한다. PoC 동안만 `origin/chore/release-ci`의 조상도 받고, T6 커밋에서 그 예외를 지운다. `/tester-build`는 산출물을 받은 뒤 태그를 지운다.
2. `gate`(workflow_call).
3. `sign`: `npm --prefix app run package`로 CLI와 `out/`을 만들고(`.agents/skills/tester-build/SKILL.md` 3단계와 같다), `app/package.json`의 `build`에 `publish: null`만 바꾼 설정 파일을 `$RUNNER_TEMP`에 만들어 `--config <파일>`로 넘기고(업데이트 피드 없음), `--mac dmg --arm64 --publish never`, `-c.mac.identity=$MAC_IDENTITY_NAME`, `-c.dmg.sign=true`로 서명·공증한다.
4. dmg를 `notarytool submit --wait --timeout 30m`으로 공증하고 스테이플한다(`/tester-build` 5단계). 시간 초과면 제출 id를 출력하고 실패한다(dmg 공증은 `notarytool wait`로 이어 갈 수 있다).
5. 서명 검증 스크립트로 dmg와 앱을 검사한다.
6. 산출물 `Doan-tester-<date>-<sha>.dmg`, 보존 7일.

### release (`/release`의 태그 push로 시작한다)

1. `on: push: tags: v*`(dry run은 아래 `release-dryrun-*`). 첫 단계에서 태그 커밋이 `origin/main`의 조상인지 확인한다(`git merge-base --is-ancestor`). 아니면 실패한다.
2. `checkReleaseVersion`으로 버전을 검사한다(기존 태그·게시본·draft는 `gh release list`로 모은다).
3. `gate` → `sign`: 패키징 → `--mac dmg zip --arm64 --publish never` → dmg 공증·스테이플 → 서명 검증(dmg, 그리고 zip을 `ditto -x -k`로 푼 앱에 `codesign --verify --deep --strict`·`stapler validate`·`spctl -a -t exec`) → `latest-mac.yml`의 sha512가 zip과 맞는지 → 산출물로 넘긴다. dmg는 스테이플 뒤에 바이트가 바뀌므로 업로드는 스테이플 뒤에 한 번만 한다.
4. `publish`: `gh release create v<version> --draft --verify-tag [--prerelease] <dmg> <zip> <zip.blockmap> latest-mac.yml`. rc(`-rc.N`)면 `--prerelease`를 붙인다(README의 `releases/latest` 링크가 rc를 가리키지 않게). 노트는 비워 둔다.
5. 게시는 워크플로가 하지 않는다. `/release`가 draft를 검사해 보고하고, 노트를 넣고, 사용자가 승인하면 게시한다(D7).

### dry run

`release.yml`은 `release-dryrun-*` 태그 push로도 돈다. 이때 1단계는 `origin/main` 대신 `origin/develop`의 조상인지 확인하고(PoC 동안은 `origin/chore/release-ci`도, T6에서 지운다), 2단계 버전 검사와 4단계 게시를 건너뛰고 산출물만 남긴다. PoC와 이후 점검에 쓰고, 끝나면 태그를 지운다.

## /release와의 계약

release-skill은 이 절의 이름만 쓴다. 바뀌면 두 문서를 같이 고친다.

| 항목 | 값 |
|---|---|
| 릴리스 워크플로 | `.github/workflows/release.yml`, 트리거 `push: tags: v*`. `/release`는 태그를 push하고 `gh run list --workflow release.yml --branch v<version>`으로 실행을 찾는다 |
| 테스트 빌드 워크플로 | `.github/workflows/test-build.yml`, 트리거 `push: tags: tester-*`. `/tester-build`가 `origin/develop` HEAD에 `tester-<date>-<sha>`를 push하고 `gh run list --workflow test-build.yml --branch <tag>`로 실행을 찾는다 |
| 버전 검사 | `/release`: `node app/scripts/checkReleaseVersion.mjs <version>`. 릴리스 워크플로: `node app/scripts/checkReleaseVersion.mjs --tag v<version>`(`app/package.json` 버전과 같은지도 본다). 종료 코드 0이면 통과, 아니면 표준 오류에 실패 코드(위 '순수 함수') |
| 서명 검증 | `node app/scripts/verifySignedPackage.mjs <dmg> [<zip>]` — zip을 주면 같은 디렉터리의 `latest-mac.yml`도 검사한다. 0이면 통과, 아니면 표준 오류에 실패한 검사 이름 |
| 자산 | `Doan-macos-arm64.dmg`, `Doan-<version>-arm64-mac.zip`, 그 `.blockmap`, `latest-mac.yml` |
| 노트 | draft는 노트 없이 만든다. `/release`가 `gh release edit v<version> --notes-file …`로 넣는다 |
| 재실행 | 실패한 실행은 `gh run rerun`. 게시 전 draft가 있으면 `draft_exists`로 실패하므로 `/release`가 그 draft를 지운 뒤 재실행한다 |

스크립트 이름은 T2에서 확정했다. release-skill design은 이 절을 이름 없이 가리킨다.

## app-update와의 계약

- **업데이트 피드는 릴리스 빌드에만 있다.** 테스트 빌드와 로컬 패키지에는 `Contents/Resources/app-update.yml`이 없고, app-update는 파일이 없으면 업데이트를 끈다. 2026-11-08 서명 없는 로컬 빌드(electron-builder 26.18.0)로 확인한 동작:
  - darwin에서 dmg나 zip 타깃이 있으면 `--publish never`여도 `app-update.yml`을 쓴다(`--mac dmg zip`에서 `owner`·`repo`·`provider: github`·`releaseType: draft`·`updaterCacheDirName: doan-app-updater`). `--mac dir`(로컬 패키지)은 쓰지 않는다.
  - `publish` 설정이 없어도 저장소 정보로 GitHub 피드를 만든다(`PublishManager.js` `getPublishConfigsForUpdateInfo`). 명시한 `publish: null`만 파일을 막는다.
  - `-c.publish=null`은 문자열 `"null"`로 들어가 `Cannot find module for publisher "null"`로 실패한다. CLI가 `null`로 바꾸는 값은 `mac.identity`뿐이다(`electron-builder/out/builder.js:127–130`). 그래서 테스트 빌드는 `publish: null`을 넣은 설정 파일을 `--config`로 넘긴다. 이 방식으로 `app-update.yml`이 빠지고 LICENSE·notices·`bin/doan`·skills·아이콘은 그대로 들어감을 확인했다.
  - 자산 이름은 `Doan-macos-arm64.dmg`, `Doan-0.1.0-arm64-mac.zip`, `.zip.blockmap`, `latest-mac.yml`이다(`Doan-macos-arm64.dmg.blockmap`도 생기지만 올리지 않는다). `latest-mac.yml`의 `files`에는 zip과 dmg가 모두 있다.
- zip 안의 앱은 스테이플된 앱이다(부모 '조사', 코드로 확인). PoC에서는 `stapler validate` 한 줄로 확인만 한다.
- rc도 `latest-mac.yml`을 쓴다(부모 '조사').

## PoC (T1·T5·T6)

태그 push는 태그 커밋의 워크플로 파일로 돌므로 골격을 먼저 `develop`에 넣을 필요가 없다. 환경 `release`는 배포 ref에서만 비밀을 연다. 그래서:

1. T1: 사용자가 환경 `release`의 배포 ref에 태그 규칙 `tester-*`와 `release-dryrun-*`를 더한다.
2. 워크플로의 조상 검사는 PoC 동안 `origin/chore/release-ci`도 받는다(T6에서 지운다).
3. 이 브랜치의 커밋에 `tester-poc-<n>`과 `release-dryrun-poc-<n>` 태그를 push해 test-build와 release dry run을 한 번씩 돌려 확인하고, 끝나면 태그를 지운다:
   - 서명·공증·검사가 통과하는지, 시간이 얼마인지
   - dmg·zip·`latest-mac.yml`이 만들어지는지, `app-update.yml` 유무(릴리스 빌드에는 있고 테스트 빌드에는 없는지)
   - CI 서명의 Team ID가 지금 로컬 서명과 같은지(`codesign -d -r-`)
   - 러너의 임시 keychain에서 서명이 되는지
4. 답을 이 문서에 적고, T8에서 ARCHITECTURE §9로 올린다.

## 공통 함정

- `/tester-build`가 이미 찾은 함정을 그대로 옮긴다: `CSC_KEYCHAIN`·`APPLE_ID…` 변수가 섞이면 엉뚱한 자격 증명을 쓴다, `--prepackaged`는 서명을 건너뛴다, `mac.entitlementsInherit`가 없으면 `disable-library-validation`이 붙는다, dmg 서명이 조용히 빠질 수 있어 `spctl -t open` 검사를 건너뛰지 않는다(`.agents/skills/tester-build/SKILL.md` 4·6단계).
- POSTMORTEM 2026-10-30(서명 정체성): CI 서명과 지금 로컬 서명이 같은 Team ID인지 PoC에서 `codesign -d -r-`로 확인한다. 다르면 기존 테스터의 알림·keychain 권한이 이어지지 않는다.
- 패키징이 두 번 돈다(`package.mjs:19`의 `--mac dir`와 서명 단계). 지금 `/tester-build`와 같은 방식이라 바꾸지 않고, 시간을 잴 때 감안한다.
