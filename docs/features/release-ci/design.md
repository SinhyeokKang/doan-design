# release-ci — design

결정: 부모 [design.md](../release-0-1-0/design.md)의 '사용자 결정' 1·2(테스트 빌드 원천 `develop`, 릴리스는 `/release`가 시작), D5(러너), D6(비밀·권한), D7(게시 방식), D8(테스트 빌드 형태), D13(버전 검사), D14(아키텍처), D15(고지 파일), D18(저장소 위치). 모두 결론이다(사용자, 2026-11-07). 근거 문서는 부모 '조사'의 electron-builder 26.18.0 문서와 Orca 워크플로다.

## 영향 범위

- `app/package.json` `build`: `mac.target`에 dmg와 zip(arm64), `publish: { provider: "github", owner: "SinhyeokKang", repo: "doan-design", releaseType: "draft" }`(D18), dmg `artifactName`을 버전 없는 이름으로(README의 `releases/latest/download/…` 링크용, Orca의 `orca-macos-${arch}.${ext}` 방식), `extraResources`에 `../LICENSE`와 `../cli/internal/designskill/notices`(D15). `mac.identity: null`은 그대로 두고 CI가 명령줄로 덮는다(docs/ARCHITECTURE.md:720).
- `app/scripts/package.mjs`: 로컬 패키지가 `--mac dir`로 남는지 확인만 한다(바꾸지 않는 것이 목표).
- 새 `.github/workflows/test-build.yml`, `.github/workflows/release.yml`. ci-gate의 Node 고정과 설치 단계를 재사용한다.
- 새 검사 스크립트(서명 검증, 버전 검사)와 그 테스트. 위치는 `app/scripts/`(패키징 스크립트 옆).
- `.agents/skills/tester-build/SKILL.md` 재작성, AGENTS.md 'Commands'(75행)와 'Workflow'.
- 형식(§11)·app-socket·`doan check`: 영향 없음. ARCHITECTURE 결정 중 "Doan never commits"는 앱의 동작이라 CI의 태그 생성과 무관하다.

## 순수 함수 (`/tdd` 대상)

- `checkReleaseVersion(packageVersion, existingTags, latestPublished)` — 태그 중복, SemVer 형식, 최신 게시본보다 큰지(rc는 같은 base의 이전 rc보다 큰지). 실패 이유를 코드로 돌려준다.
- `parseCodesignDetails(text)` → authority 목록, `runtime` 플래그, `Timestamp` 유무, Team ID. `/tester-build` 6단계의 "Developer ID Application authority, runtime flag, Timestamp" 검사를 데이터로 바꾼다.
- `compareEntitlements(committedPlist, signedXml)` → 커밋된 `app/resources/entitlements.mac.plist`에 없는 키(특히 `disable-library-validation`)를 찾는다.
- `parseSpctl(text)` → `accepted`와 `source=Notarized Developer ID` 여부.
- 셸 부분(실행, 마운트, 파일 찾기)은 이 함수들을 부르는 얇은 스크립트로 둔다.

## 비밀과 권한 (D6)

- 환경 `release`: 필수 검토자 = 사용자, 배포 ref = `v*` 태그와 `develop`(테스트 빌드). 공개 저장소에서만 쓸 수 있다(부모 '조사' GitHub).
- 비밀 이름(값은 사용자가 넣는다): `MAC_CERT_P12_BASE64`(→ `CSC_LINK`), `MAC_CERT_PASSWORD`(→ `CSC_KEY_PASSWORD`), `MAC_IDENTITY_NAME`(`<Name> (<Team ID>)`, `-c.mac.identity`에 넘긴다), `APPLE_API_KEY_P8`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`. API 키가 경로인지 내용인지는 v26 문서가 "base64-encoded-p8-content"라고 적었지만 `@electron/notarize`의 실제 기대값을 PoC에서 확인한다.
- 워크플로 `permissions`는 기본 `contents: read`, 릴리스 게시 작업만 `contents: write`. 서명 작업은 `pull_request` 계열 이벤트에 걸지 않는다.
- `/tester-build`의 'Prohibited'(비밀을 읽거나 출력하지 않는다)를 워크플로 로그에도 적용한다: `set -x`를 쓰지 않고, 비밀을 파일로 쓸 때는 `$RUNNER_TEMP`에 쓰고 작업 끝에 지운다.

## 워크플로

### test-build (D8)

1. 입력: `ref`(기본 `develop`).
2. 게이트를 먼저 돌린다(ci-gate와 같은 단계).
3. `npm --prefix app run package`로 CLI와 `out/`을 만들고(`.agents/skills/tester-build/SKILL.md` 3단계와 같다), electron-builder로 `--mac dmg --arm64 --publish never`, `-c.mac.identity=$MAC_IDENTITY_NAME`, `-c.dmg.sign=true`, `-c.publish=null`(업데이트 피드 없음, 아래 계약)로 서명·공증한다.
4. dmg를 `notarytool submit --wait --timeout 30m`으로 공증하고 스테이플한다(`/tester-build` 5단계). 시간 초과면 제출 id를 출력하고 실패한다.
5. 서명 검증 스크립트(위 순수 함수)로 6단계 검사를 모두 돈다.
6. 산출물 `Doan-tester-<date>-<sha>.dmg`, 보존 기간은 짧게(값은 구현 때 정한다).

### release (`/release`가 시작한다)

1. `main`에서만 시작할 수 있다(`github.ref == refs/heads/main` 검사). 입력은 없고 버전은 `main`의 `app/package.json`에서 읽는다. 환경 `release`의 승인을 기다린다.
2. `checkReleaseVersion`으로 버전을 검사한다.
3. 게이트 → 패키징 → `--mac dmg zip --arm64 --publish always`(draft, `releaseType: draft`) → dmg 공증·스테이플 → 서명 검증 → `latest-mac.yml`이 올라갔는지 확인.
4. 태그 `v<version>`은 electron-builder가 draft를 만들 때 대상 커밋에 단다. 이 동작(draft Release가 태그를 언제 만드는지)은 PoC에서 확인하고, 다르면 워크플로가 태그를 먼저 만든다.
5. 게시는 워크플로가 하지 않는다. `/release`가 draft를 검사해 보고하고, 사용자가 승인하면 게시한다(D7). 릴리스 노트는 `/release`가 draft에 넣는다(D13).

## app-update와의 계약

- **업데이트 피드는 릴리스 빌드에만 있다.** electron-builder는 `publish` 설정이 있을 때 앱 안에 `app-update.yml`을 쓴다(Orca 번들의 `Contents/Resources/app-update.yml`에서 확인). 테스트 빌드와 로컬 패키지는 `publish`를 끄므로 그 파일이 없고, app-update는 파일이 없으면 업데이트를 끈다. `--publish never`만으로 파일이 빠지지 않는다는 점과 `-c.publish=null`이 파일을 빼는지는 PoC에서 확인한다.
- zip 안의 앱이 공증·스테이플된 상태인지 PoC에서 확인한다(Squirrel.Mac이 받는 것은 zip이다).

## PoC (첫 task)

비공개 상태로 먼저 할 수 없다(환경은 공개 뒤에만, 부모 D21). 공개 뒤 `develop`의 임시 브랜치에서:
1. test-build를 한 번 돌려 서명·공증·검사가 통과하는지, 시간이 얼마인지.
2. release 워크플로를 `--publish never`로 돌려 dmg·zip·`latest-mac.yml`이 만들어지는지, zip 안 앱의 스테이플, `app-update.yml` 유무.
3. 위 두 계약 질문의 답을 이 문서에 적는다.

## 공통 함정

- `/tester-build`가 이미 찾은 함정을 그대로 옮긴다: `CSC_KEYCHAIN`·`APPLE_ID…` 변수가 섞이면 엉뚱한 자격 증명을 쓴다, `--prepackaged`는 서명을 건너뛴다, `mac.entitlementsInherit`가 없으면 `disable-library-validation`이 붙는다, dmg 서명이 조용히 빠질 수 있어 `spctl -t open` 검사를 건너뛰지 않는다(`.agents/skills/tester-build/SKILL.md` 4·6단계).
- POSTMORTEM 2026-10-30(서명 정체성): CI 서명과 지금 로컬 서명이 같은 Team ID인지 PoC에서 `codesign -d -r-`로 확인한다. 다르면 기존 테스터의 알림·keychain 권한이 이어지지 않는다.
