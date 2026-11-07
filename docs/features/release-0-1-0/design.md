# release-0-1-0 — design (부모)

자식 feature가 함께 따르는 제약, 공용 조사, 공개 전 위험 점검, 결정 목록을 담는다. 자식 문서는 결정을 다시 적지 않고 여기의 id(D1…)로 가리킨다. 결정은 모두 '결정' 절에 있고, 자식이 끝날 때 PRODUCT·ARCHITECTURE로 승격한다.

## 영향 범위 (자식 전체)

- **하네스**: AGENTS.md('Commands', 'Workflow', 'Documents', 'Commit conventions'), `.agents/skills/` 중 기준 브랜치를 가정하는 스킬(아래 '하네스 영향'), 새 `/release` 스킬과 `.claude/skills/release` 링크(사용자 결정 2).
- **CI**: 새 `.github/workflows/`(게이트, 테스트 빌드, 릴리스). 지금은 `.github/`가 없다.
- **패키징**: `app/package.json` `build`(mac 타깃에 zip, `publish`, 산출물 이름, 고지 파일 `extraResources`), `app/scripts/package.mjs`.
- **앱(main + renderer)**: 업데이트 서비스, IPC, 알림 표면(앱 메뉴, Settings > About, D24의 두 시안 중 하나). 새 런타임 의존성 `electron-updater`(D9).
- **CLI(Go)**: 코드 변경 없음을 기본으로 한다. 버전은 지금처럼 패키징이 찍는다. 공개 정리(D20)가 주석을 바꿀 수 있다.
- **형식**: 공유 JSON Schema(ARCHITECTURE §11)는 바뀌지 않는다. app-socket 버전도 그대로다. 업데이트 상태는 main과 renderer 사이 IPC로만 오간다.
- **문서**: README와 그 이미지를 그리는 캔버스(D29), 새 `docs/CONTRIBUTING.md`·`docs/CODE_OF_CONDUCT.md`·`docs/SECURITY.md`(AGENTS.md:126이 정한 위치), PRODUCT §1(Malmoi 근거, D28)·§3·§5 항목 0(About), ARCHITECTURE §7·§9, BACKLOG, DIRECTORY(`.github/`, `docs/assets/readme/` 추가).

## 조사

### Git flow

- 원전: nvie, "A successful Git branching model" (https://nvie.com/posts/a-successful-git-branching-model/). `master`(여기서는 `main`)는 늘 출시 가능한 상태이고 거기로의 병합 하나가 출시 하나다. `develop`은 다음 출시를 위한 통합 브랜치다. feature 브랜치는 `develop`에서 나와 `develop`으로 들어간다. release 브랜치는 `develop`에서 나와 버전 올림과 버그 수정만 받고 `main`과 `develop` 양쪽으로 들어간다. hotfix는 `main`에서 나와 양쪽으로 들어간다. 출시 커밋에 버전 태그를 단다.
- 같은 글의 2020년 덧붙임: 지속 배포하는 웹 앱에는 GitHub flow 같은 단순한 흐름을 권하고, Git flow는 "explicitly versioned" 소프트웨어에 맞는다고 한다. Doan은 버전을 붙여 배포하는 데스크톱 앱이라 후자에 해당한다.
- 참고 저장소 둘 다 기본 브랜치가 `main`이고 `develop`이 없다(아래). 사용자가 요청한 흐름은 두 저장소와 다르므로 그대로 베끼지 않는다.

### 참고 저장소

- **Orca**: https://github.com/stablyai/orca (MIT, 기본 브랜치 `main`). 이 기기의 `/Applications/Orca.app` 1.4.250의 `Contents/Resources/app-update.yml`이 `owner: stablyai`, `repo: orca`, `provider: github`, `releaseType: draft`여서 같은 저장소임을 확인했다.
  - 릴리스: `.github/workflows/release-cut.yml`은 `workflow_dispatch`로 종류(rc/patch/minor/major)와 ref를 받아 태그를 만들고 그 태그에서 빌드한다. `.github/workflows/release-mac-build.yml`은 태그를 받아 macOS 러너에서 `CSC_LINK`(인증서), `CSC_KEY_PASSWORD`, `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` 비밀로 서명·공증하고 draft Release에 올린 뒤 `*-mac.yml`을 따로 올린다(https://github.com/stablyai/orca/blob/main/.github/workflows/release-mac-build.yml).
  - 패키징: `config/electron-builder.config.cjs`는 mac 타깃을 dmg와 zip 둘로 두고, dmg 이름을 버전 없는 `orca-macos-${arch}.${ext}`로 고정하며, `publish`는 `provider: 'github'`, `releaseType: 'draft'`다. README의 다운로드 링크가 `releases/latest/download/orca-macos-arm64.dmg`라서 버전이 바뀌어도 링크가 그대로다.
  - README(https://github.com/stablyai/orca#readme): 로고·배지·한 줄 소개·Download 링크·대표 이미지 → 'Features'(기능마다 짧은 설명 + 문서 링크 + 이미지를 두 칸 표로) → 'Supported Agents' → 'Install' → 'Community & Support' → 'Developing'(CONTRIBUTING 링크) → 'License'.
  - 공동체 파일: `.github/CONTRIBUTING.md`, `.github/SECURITY.md`, `.github/CODEOWNERS`, `.github/ISSUE_TEMPLATE/`, `.github/pull_request_template.md`.
- **Open Design**: https://github.com/nexu-io/open-design (Apache-2.0, 기본 브랜치 `main`). 사용자가 말한 "Open Design"은 GitHub에서 같은 이름을 찾아 가장 맞는 저장소로 고른 것이다. 디자인 에이전트 작업 공간이고 데스크톱 앱과 코딩 에이전트 연동이 있어 Doan과 가장 가깝다. 사용자에게 이 저장소가 맞는지 확인해야 한다(추정).
  - README: 제목·대표 이미지·링크 줄·배지 → 'What is OpenDesign' → 'Product tour' → 'Platform Compatibility' → 'Demo' → 'Why OpenDesign'(굵은 한 줄 + 설명의 목록) → 'Quick start'(데스크톱 앱 다운로드, 코딩 에이전트에 설치, 소스에서 실행) → 'Use OpenDesign from your coding agent' → 'Architecture' → 'Roadmap' → 'Community' → 'Contributing'.
  - 루트에 `CONTRIBUTING.md`, `PRIVACY.md`, `QUICKSTART.md`, `CHANGELOG.md`가 있고, `.github/`에 `CODEOWNERS`, `ISSUE_TEMPLATE/`, `pull_request_template.md`가 있다.
- 두 README 모두 "기능 → 설치 → 기여 → 라이선스" 순서이고, 기능마다 이미지 한 장과 두세 문장을 붙인다. 지금 Doan README는 'What works today'의 긴 문단 세 개로 기능을 나열한다(README.md:20–24).

### electron-builder와 electron-updater

앱이 쓰는 electron-builder는 26.18.0이다(`app/package.json:35`, npm `latest` 태그도 26.18.0). 저장소 master의 문서는 v27 알파(서명된 업데이트 매니페스트 등)를 설명하므로, 아래는 태그 `electron-builder@26.18.0`의 문서에서 읽었다.

- 자동 업데이트(https://github.com/electron-userland/electron-builder/blob/electron-builder%4026.18.0/website/docs/features/auto-update.md):
  - "macOS application must be signed in order for auto updating to work." → 서명하지 않는 로컬 패키지(`mac.identity: null`)에서는 업데이트가 동작하지 않는다.
  - "`zip` target for macOS is **required** for Squirrel.Mac, otherwise `latest-mac.yml` cannot be created". 지금 `/tester-build`는 dmg만 만든다(`--mac dmg`).
  - 비공개 저장소는 사용자 기기에 `GH_TOKEN`이 있어야 하고 "not intended and not suitable for all users"다. → 공개 전에는 실제 피드로 업데이트를 확인할 수 없다(D21).
  - 이벤트: `checking-for-update`, `update-available`(`autoDownload`가 참이면 바로 받는다), `update-not-available`, `download-progress`, `update-downloaded`, `update-cancelled`, `error`.
  - 패키징하지 않은 개발 실행에서 확인하려면 `dev-app-update.yml`과 `autoUpdater.forceDevUpdateConfig = true`가 필요하다.
  - GitHub API 한도: 사용자당 시간당 5000회, 확인 한 번에 최대 3회.
- 코드로 확인한 사실(`app/node_modules`, electron-builder 26.18.0, 2026-11-07 `/feature-review`):
  - electron-builder는 git 태그를 만들지 않는다. `electron-publish/out/gitHubPublisher.js:63`의 주석이 "we draft release and don't create git tag"이고, `createRelease`(:174–181)는 `target_commitish`를 보내지 않는다. 그래서 태그가 없는 draft를 게시하면 GitHub가 기본 브랜치(D2: `develop`)에 태그를 단다. → D7·D13은 `/release`가 태그를 먼저 만든다.
  - GitHub 공급자는 prerelease 버전에도 채널 파일을 따로 쓰지 않고 `latest-mac.yml`을 쓴다(`app-builder-lib/out/options/PlatformSpecificBuildOptions.d.ts:161`).
  - zip 안의 앱은 스테이플된 앱이다. `macPackager.js:344–347`이 서명 직후 공증·스테이플을 하고 그 앱으로 dmg·zip 타깃을 만든다. dmg는 따로 공증·스테이플해야 한다.
  - `APPLE_API_KEY`는 `.p8` 파일 경로다. `MacTargetHelper.js:236–243`이 env 값을 그대로 넘기고 `@electron/notarize/lib/notarytool.js:64–65`가 `notarytool --key <값>`으로 쓴다.
  - electron-builder 안의 앱 공증에는 시간 제한이 없다(`.agents/skills/tester-build/SKILL.md:64`).
- 게시(https://github.com/electron-userland/electron-builder/blob/electron-builder%4026.18.0/website/docs/publish.md): `--publish onTag | onTagOrDraft | always | never`. 태그 버전은 `package.json`의 `version`에 `v`를 붙인 값이다. draft Release에 올리고 사람이 게시하는 흐름을 문서가 권한다. `GH_TOKEN`/`GITHUB_TOKEN`이 있으면 기본 공급자는 github다.
- 공증(https://github.com/electron-userland/electron-builder/blob/electron-builder%4026.18.0/website/docs/features/code-signing/notarization.md): 자격 증명은 세 방식이다. Apple ID + 앱 전용 암호 + Team ID, App Store Connect API 키(`APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`), keychain 프로필(`APPLE_KEYCHAIN_PROFILE`). GitHub Actions 예시는 `CSC_LINK`(base64 `.p12`)와 `CSC_KEY_PASSWORD`로 서명한다. 지금 `/tester-build`는 세 번째(keychain 프로필 `doan-notary`, API Team 키)를 쓴다.
- macOS 서명(https://github.com/electron-userland/electron-builder/blob/electron-builder%4026.18.0/website/docs/features/code-signing/code-signing-mac.md): CI에서는 `CSC_LINK`의 `.p12`를 임시 keychain에 넣는다.

### GitHub

- 요금: 공개 저장소의 표준 GitHub 호스팅 러너는 무료다. 비공개에서는 포함 사용량에서 차감되고 macOS 3·4코어는 분당 $0.062다(https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions).
- macOS 러너(https://github.com/actions/runner-images): `macos-latest`·`macos-26`이 arm64, `macos-15`가 arm64, `macos-15-intel`·`macos-26-intel`이 x64다. macOS 14 이미지는 2026-11-02에 GitHub Actions에서 내려갔다.
- 환경(environment): "Users with GitHub Free plans can only configure environments for public repositories." 환경 비밀은 그 환경을 쓰는 작업이 보호 규칙(필수 검토자 등)을 통과한 뒤에만 읽는다(https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-deployments/managing-environments-for-deployment).
- 이벤트(https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows): 포크에서 온 `pull_request`에는 비밀이 전달되지 않고 `GITHUB_TOKEN`은 읽기 전용이다. 처음 기여하는 사람의 PR은 쓰기 권한자가 실행을 승인해야 할 수 있다. `pull_request_target`은 신뢰하지 않는 코드를 실행하면 위험하다고 경고한다. `pull_request`는 `branches` 필터로 대상 브랜치를 고를 수 있다. `workflow_dispatch`는 워크플로 파일이 기본 브랜치에 있을 때만 시작된다(같은 문서 'workflow_dispatch'). **예약(`schedule`) 실행은 기본 브랜치에서만 돈다** — 야간 e2e를 나중에 `main`에서 돌리려면 기본 브랜치가 `develop`일 때 체크아웃 ref를 따로 줘야 한다.
- 브랜치 보호: 지금 비공개 무료 저장소라 API가 403을 준다(위 spec). 문서는 필수 상태 검사와 "Do not allow bypassing the above settings"(관리자에게도 적용)를 설명한다(https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches). 규칙 집합(rulesets)의 개인 계정 공개 저장소 지원은 문서에서 확인하지 못했다.
- 비공개 취약점 신고: 공개 저장소의 소유자·관리자가 Settings에서 켠다(https://docs.github.com/en/code-security/security-advisories/working-with-repository-security-advisories/configuring-private-vulnerability-reporting-for-a-repository).
- 공동체 파일 위치: CODE_OF_CONDUCT·CONTRIBUTING·SECURITY는 `.github/`, 루트, `docs/` 중 어디든 되고 GitHub는 `.github/` → 루트 → `docs/` 순으로 찾는다. 이슈 템플릿은 `.github/ISSUE_TEMPLATE/`에만 둔다(https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/creating-a-default-community-health-file). AGENTS.md:126의 `docs/` 위치는 그대로 쓸 수 있다.
- Contributor Covenant 최신판은 3.0이다(https://www.contributor-covenant.org/version/3/0/).

## 공통 제약 (모든 자식)

1. **버전의 원천은 `app/package.json`의 `version` 하나다.** `app/package-lock.json`의 같은 값은 함께 바뀐다(`npm --prefix app version <v> --no-git-tag-version`). 패키징이 같은 값을 Go CLI에 찍는다(`app/scripts/package.mjs:17`). 태그는 `v<version>`이다(electron-builder 게시 규칙). 버전을 올리는 시점은 D13.
2. **비밀은 커밋하지 않고 에이전트가 읽지 않는다.** ARCHITECTURE §9(docs/ARCHITECTURE.md:719)와 `/tester-build` 'Prohibited'를 CI에도 적용한다. 워크플로는 비밀을 `secrets.*`로만 받고, 포크 PR이나 `pull_request_target`에서 서명 작업을 돌리지 않는다.
3. **서명 정체성을 바꾸지 않는다.** 지정 요구사항이 Team ID에 묶여 있어서(docs/ARCHITECTURE.md:720) 같은 팀의 새 빌드는 keychain·알림 권한을 이어받는다. POSTMORTEM 2026-10-30 'Packaged-app probes failed … signature identity'는 다른 서명의 사본이 알림 권한을 조용히 잃은 사례다. 업데이트도 같은 Developer ID로만 서명한다.
4. **로컬 패키지는 서명하지 않은 채로 둔다.** `npm --prefix app run package`는 eval·runtime probe·Codex 세션이 인증서 없이 쓰므로(docs/ARCHITECTURE.md:717) 업데이트 확인을 하면 안 된다. 업데이트는 서명된 배포 빌드에서만 켠다(app-update 설계).
5. **CLI와 링크는 번들을 따라간다.** agent setup은 `~/.local/share/doan/current → realpath(process.resourcesPath)`만 바꾸고 나머지 링크는 `current`를 거친다(ARCHITECTURE §7 'Agent setup'). 번들이 같은 경로에서 바뀌면 `~/.local/bin/doan`은 고칠 필요 없이 새 CLI를 가리키고, 다음 실행에서 setup이 다시 돈다. 확인은 app-update의 실제 앱 검증에서 한다.
6. **종료 순서를 지킨다.** 업데이트 설치는 앱 종료를 거친다. `before-quit` 처리(`app/src/main/index.ts:1215`)와 대화 저장이 종료를 취소하는 경우(ARCHITECTURE §7 'First-run onboarding' 'Quit and reload')를 그대로 따르고, POSTMORTEM 2026-10-25 'A crash during quit teardown lost the debounced ui-state'의 예방(teardown 전에 상태 flush)을 깨지 않는다.
7. **e2e는 만들지 않는다.** 검증은 AGENTS.md 'Verification policy'를 따른다: static/unit/build 게이트와 변경 범위의 짧은 실제 앱 probe.

## 하네스 영향 (git-flow가 바꿀 곳)

'사용자 결정' 1·2에 따라 아래 줄이 바뀐다. 목록은 2026-11-07 main 기준이다.

| 파일 | 줄 | 지금 가정 |
|---|---|---|
| AGENTS.md | 75 | `/tester-build`가 원격 main에서 빌드 |
| AGENTS.md | 105, 106 | `/design-draft`·`/design-sync`의 "already on main", "is on main" |
| AGENTS.md | 109 | `/ship`·`/orchestrate`가 main에서 분기 |
| AGENTS.md | 110–111 | 체인 링크가 "latest main"에서 시작하고 main에 병합, Orca worker가 `--base-branch` 없이 "branches from main" |
| AGENTS.md | 131–134 | 브랜치 두 경로, 하네스 변경은 main에 바로 push, "they reach main with its PR" |
| `.agents/skills/ship/SKILL.md` | 18, 35 | main에서 분기, `gh pr create --base main` |
| `.agents/skills/orchestrate/SKILL.md` | 6, 31, 69, 76 | main에서 분기, `--base main` |
| `.agents/skills/chain/SKILL.md` | 6, 8, 19, 20, 33, 40, 49, 52, 53, 55 | 링크가 main에 병합, 체인 파일을 main에 커밋, 첫 conductor와 새 worktree를 `--base-branch` 없이 만듦, "keeping main's text", "local main pulled" |
| `.agents/skills/feature/SKILL.md` | 52 | 문서 커밋을 main이면 바로 push |
| `.agents/skills/code-review/SKILL.md` | 14 | `git diff main...HEAD` (PR 대상과 비교로: `develop`, `hotfix/*`면 `main`) |
| `.agents/skills/design-sync/SKILL.md` | 8, 10, 23, 25, 27, 32, 110 | "첫 구현이 main에 들어가기 전까지 초안이 정본", "not main" |
| `.agents/skills/design-draft/SKILL.md` | 18, 19, 21, 55, 83, 103 | "main에 이미 있는 화면" |
| `.agents/skills/tester-build/SKILL.md` | 3, 8, 48, 52 | `origin/main`에서 빌드 (git-flow가 `origin/develop`으로, release-ci가 D8에 따라 CI로) |
| `.agents/skills/audit/SKILL.md` | 12 | "changes since main" |
| `.agents/skills/verify/SKILL.md` | — | 기준 브랜치 가정 없음(2026-11-07 grep). `verify.mjs`는 `HEAD`만 기록한다 |

design-draft·design-sync의 "on main"은 "출시됐다"가 아니라 "통합됐다"는 뜻이므로 통합 브랜치 이름으로 바꾼다. `main`이 브랜치가 아닌 뜻으로 쓰인 줄("main checkout", "main process", "app main", "main commit", "non-main binaries")은 그대로 둔다. 검증은 `-w main` grep을 이 허용 목록과 대조한다(git-flow). 결정 문서의 "on main" 표현(PRODUCT·ARCHITECTURE·DESIGN)은 git-flow가 같은 기준으로 훑는다.

## 공개 전 위험 점검 (2026-11-07, 읽기 전용)

비밀로 보이는 값은 찾지 못했다. 공개되면 드러나는 것과 외부인이 읽기 어려운 것은 아래와 같다.

- **개인 절대 경로(초안 canvas)**: `.doan/canvases/buzz-conversation.html:260`, `:261`, `.doan/canvases/buzz-onboarding.html:223`, `:224`, `.doan/canvases/buzz-project.html:407`에 메인테이너 홈 아래 절대 경로가 있다. 이미 main에 구현된 화면의 초안이라 design-draft 스킬은 고치지 못하게 한다(`.agents/skills/design-draft/SKILL.md:103`). → D20.
- **커밋 작성자 이메일**: 5,625개 커밋 중 5,506개가 개인 Gmail 주소, 119개가 GitHub noreply 주소다(`git log --format=%ae | sort | uniq -c`). 공개하면 이력에서 보인다. → D19.
- **원격 브랜치 74개**: worker 브랜치(`SinhyeokKang/pm-a-main` 등)와 병합된 구현 브랜치가 남아 있다. AGENTS.md:140은 사용자가 말하기 전까지 지우지 않는다고 정했다. → D19.
- **코드 주석의 한국어**: `app/src`·`cli`·`eval`에서 한국어가 있는 `//` 주석이 131개 파일(266줄)에 있다(`git grep -c -P '//.*[\x{AC00}-\x{D7A3}]'`). CSS 주석과 JSX `{/* */}` 주석에도 약 12줄 더 있고, 테스트 제목 문자열에도 있다. 예: `app/src/main/addPage.ts:8`, `app/src/main/agentAuth/manager.ts:31–32`, `app/src/main/agentSetup/notice.ts:30`, `app/src/main/agentSetup/plan.ts:5`. AGENTS.md 언어 정책(코드 주석은 영어) 위반이다. → D20.
- **지운 feature 문서 참조**: 코드에 `design §…`, `design '…'`, `tasks.md`, `docs/features/` 꼴의 참조가 720줄 있다(app/src 718, cli 2; 예: `app/src/main/about.ts:9` "buzz-settings design 'About'"). 지운 slug나 결정·task id만 남은 참조(`mcp-connectors B2`, `(D5)` 등)도 수백 줄 더 있다. 고정한 패턴과 기준 수치는 public-cleanup design에 있다. 그 문서는 승격 뒤 지워져 외부인이 따라갈 수 없다(이력에는 있다). → D20.
- **로컬 참조 경로**: AGENTS.md 'References'의 `~/code/malmoi`. malmoi는 같은 소유자의 공개 MIT 저장소다(`gh repo view SinhyeokKang/malmoi`). 경로가 개인 기기를 가정할 뿐 비밀은 아니다. `~/code/buzz-app` 명령은 3337dc3d가 AGENTS.md에서 지웠다.
- **malmoi에서 옮긴 코드**: `app/src/renderer/dotField.ts:1` 등. 같은 저작권자의 MIT 코드라 고지 문제는 없다고 본다(법적 판단이 아니다).
- **비밀 스캔**: 이력에 `.p12`·`.p8`·`.pem`·`.env`·credentials 파일이 추가된 적이 없다(`git log --all --diff-filter=A --name-only`). 키 모양 패턴은 테스트 자리표시자뿐이다(예: `app/src/main/agentAuth/environment.test.ts:10`의 `sk-ant-x`). gitleaks·trufflehog가 설치돼 있지 않아 전체 이력 스캔은 하지 못했다 → public-cleanup T1(`go run`, 전역 설치 없음). 원격에는 `refs/pull/*/head` 120개가 있고, 브랜치를 지워도 남아 공개 뒤 누구나 받을 수 있으므로 스캔 범위에 넣는다.
- `.scratch/`는 무시되고 추적 파일이 없다(`git ls-files .scratch` 결과 없음). 5 MB가 넘는 blob은 없다.

## 사용자 결정 (2026-11-07)

부모를 쓰는 중에 사용자가 정했다. 나머지 결정은 아래 '결정' 절에 있다.

1. **모든 작업의 대상은 `develop`이다.** `/ship`·`/orchestrate`의 분기와 PR, `/chain` 링크의 병합(링크 순서대로 `develop`에), 대화 중 하네스·문서 커밋, 테스트 빌드의 원천이 모두 `develop`이다. AGENTS.md:134의 "on main, push straight to main"도 `develop`으로 바뀐다.
2. **`main`은 사용자가 `/release`를 부를 때만 바뀐다.** 기능·하네스·문서 커밋 어느 것도 그 전에는 `main`에 들어가지 않는다. `develop`에서 `main`으로 가는 길은 새 스킬 `.agents/skills/release/SKILL.md`(+ `.claude/skills/release` 링크) 하나다. 이 스킬이 버전 올림, `main`의 태그, 릴리스 노트, 배포에 필요한 나머지(릴리스 빌드, GitHub Release)를 한다. 스킬은 새 자식 [release-skill](../release-skill/spec.md)이 만든다.
3. **순서의 첫 전제**: 진행 중인 problem-project-overlay `/orchestrate` 실행(`docs/features/problem-project-overlay/`)은 지금의 main 기준 절차로 끝낸다. git-flow(`develop` 만들기, AGENTS.md·스킬 교체)는 그 실행의 PR이 `main`에 병합된 뒤에 시작한다.
4. **미룸 해제**: BACKLOG의 'Release packaging'은 "deferred until after the whole-app cycle quality work"였다(docs/BACKLOG.md:7). 사용자가 이 미룸을 풀고 지금 0.1.0을 준비하기로 했다(2026-11-07 `/feature-review`).
5. **C3·C4를 먼저**: community-docs와 readme-features는 브랜치 규칙을 바꾸지 않는 문서 작업이라 P0과 나란히 지금 진행하고, 지금 규칙대로 `main`에 커밋한다. C4는 C3 뒤다(README가 CONTRIBUTING을 링크한다). git-flow는 P0과 C4 뒤다(2026-11-07).

## 결정 (사용자, 2026-11-07)

모든 D 항목이 정해졌다. id는 자식 문서가 가리키므로 그대로 둔다. 이유는 뒤집히기 쉬운 제약일 때만 적는다. 2026-11-07 `/feature-review`에서 사용자가 D1·D6·D7·D8·D10·D12·D13·D16·D20·D23을 고치고 D24–D30을 더했다.

### D1. 출시본의 급한 수정 — 결론(사용자, 2026-11-07)
- release 브랜치는 두지 않는다. `/release`에 hotfix 모드를 두고, 사용자가 두 번 부른다(2026-11-07 `/feature-review`).
  1. `/release hotfix <slug>`: 마지막 정식(rc가 아닌) 태그에서 `hotfix/<slug>`를 만들어 push하고 멈춘다.
  2. 사용자가 그 브랜치에서 `/ship`으로 고친다.
  3. `hotfix/<slug>` 체크아웃에서 `/release <version>`: `main`으로 병합, 태그, 빌드, 게시, `develop`으로 되돌림 PR.
- 브랜치는 `main`, `develop`, `feat/*`, `fix/*`(와 다른 `<type>/*`), `hotfix/*`다. hotfix도 `/release`를 거치므로 '사용자 결정' 2("`main`은 `/release`로만")를 지킨다.
- 제약: 마지막 정식 태그에서 나오므로 `main`에 나가 있는 rc 내용이 hotfix에 섞이지 않는다.

### D2. GitHub 기본 브랜치 — 결론(사용자, 2026-11-07)
- `main`을 유지한다(git-flow 시작 때 사용자가 다시 정했다). 방문자와 `git clone`은 `main`을 본다. 설정 변경은 없다.
- 제약:
  - 새 PR의 기본 대상이 `main`이다. CONTRIBUTING·PR 템플릿은 `develop`을 대상으로 적고, 스킬은 `gh pr create --base develop`을 늘 명시하며, 외부 PR이 `main`으로 오면 메인테이너가 대상을 `develop`으로 바꾼다.
  - Orca의 `worktree create`는 `--base-branch`가 없으면 저장소 기본 브랜치(`main`)에서 나온다. 스킬은 `--base-branch`를 늘 명시한다.
  - `workflow_dispatch`와 예약(`schedule`) 실행은 워크플로 파일이 기본 브랜치(`main`)에 있어야 돈다. 그래서 첫 `/release`가 워크플로를 `main`에 넣기 전에는 dispatch로 테스트 빌드를 시작할 수 없다. 태그 push 트리거는 이 제약을 받지 않으므로 D8의 테스트 빌드는 `tester-*` 태그 push로 시작한다(사용자, 2026-11-08, release-ci).

### D3. 하네스·문서 변경이 들어가는 브랜치 — 결론(사용자, 2026-11-07)
- 지금 브랜치에 커밋하고, `develop`이면 바로 push한다. `main`에는 커밋하지 않는다(`main` 체크아웃이면 `develop`으로 바꾼 뒤 커밋한다). `hotfix/*` 체크아웃에는 그 수정만 커밋한다. 공개 뒤 `main` 보호 규칙(G3c)이 이것을 강제한다.

### D4. CI 트리거 — 결론(사용자, 2026-11-07)
- `develop`·`main`을 향한 `pull_request`와 `develop`·`main`으로의 `push`.

### D5. CI 러너 — 결론(사용자, 2026-11-07)
- `macos-26`(arm64)으로 고정한다.
- 제약: `-latest` 라벨은 1–2개월에 걸쳐 조용히 바뀐다(runner-images README). 앱 테스트 일부가 darwin을 가정한다.

### D6. 서명 비밀의 보관과 실행 권한 — 결론(사용자, 2026-11-07)
- 환경 `release`(필수 검토자 = 사용자, 배포 ref = 릴리스 워크플로를 시작하는 `v*` 태그와 테스트 빌드의 `develop`)에 비밀을 두고, 서명 작업만 그 환경을 쓴다. 공증은 기존 App Store Connect API Team 키(지금 `doan-notary`와 같은 키)로 한다. `APPLE_API_KEY`는 `.p8` 파일 경로라서 워크플로가 비밀 내용을 `$RUNNER_TEMP`의 파일로 쓰고 그 경로를 넘긴다('조사').
- 제약: 무료 계정은 공개 저장소에서만 환경을 쓸 수 있다(D21의 순서가 이것에 기댄다).

### D7. 릴리스 Release의 게시 방식 — 결론(사용자, 2026-11-07)
- 사용자가 부른 `/release`가 `main`의 병합 커밋에 `v<version>` 태그를 만들어 push하고, 그 태그 push가 CI의 릴리스 워크플로(`on: push: tags: v*`)를 시작한다(2026-11-07 `/feature-review`). 워크플로는 태그 커밋이 `origin/main`의 조상인지 확인한 뒤 빌드하고, 비밀이 없는 게시 작업이 그 태그의 draft Release를 만든다(rc는 prerelease). `/release`가 draft의 자산을 `spctl` 등으로 검사하고, 통과하면 스킬이 게시한다. `/release` 호출이 환경 `release` 승인과 게시를 함께 허락하므로 스킬이 둘 다 직접 한다(사용자, 2026-11-08).
- 제약: electron-builder는 태그를 만들지 않으므로('조사') 태그는 스킬이 먼저 만든다.

### D8. 테스트 빌드 — 결론(사용자, 2026-11-07)
- `/tester-build`가 `origin/develop` HEAD에 `tester-*` 태그를 push하면 CI가 그 커밋을 서명·공증한 dmg를 Actions 산출물로 남긴다. 워크플로는 태그 커밋이 `develop`에 있는지 검사한다(2026-11-07 `/feature-review`: 환경 규칙은 ref 이름만 보므로 검사가 없으면 임의 커밋을 서명할 수 있다). `workflow_dispatch`는 기본 브랜치 `main`에 파일이 있어야 돌아 쓰지 않는다(D2, 사용자 2026-11-08). `/tester-build`는 태그를 push해 받은 dmg를 Desktop에 두는 스킬로 바뀐다. 테스트 빌드는 업데이트 확인을 끈다.

### D9. 업데이트 방식 — 결론(사용자, 2026-11-07)
- `electron-updater` + GitHub 공급자.
- 제약: macOS 자동 업데이트는 서명된 앱과 zip 타깃이 있어야 한다(electron-builder 26.18.0 auto-update 문서).

### D10. 확인·다운로드·설치 정책 — 결론(사용자, 2026-11-07)
- 실행할 때와 6시간마다 자동으로 확인하고, 새 버전은 뒤에서 받는다. 마지막 확인 시각은 메모리에만 둔다. 다 받으면 알리고(D24) "Restart to Update"를 누르면 설치한다. 누르지 않으면 다음 종료 때 설치된다.
- Settings > About의 업데이트 그룹에 "Check for updates automatically" 행을 둔다. 끄면 자동 확인만 멈춘다. 수동 확인은 그대로 되고, 이미 받은 업데이트는 다음 종료 때 설치된다(2026-11-07 `/feature-review`).
- 승격 때 PRODUCT §3에 앱이 GitHub Releases에 업데이트를 묻는다는 문장을 Out of scope 5("the web only serves as the download path")와 맞춰 적는다.

### D11. 업데이트를 켜는 사본 — 결론(사용자, 2026-11-07)
- 피드 설정(`app-update.yml`)이 실린 서명 빌드이고, agent setup과 같은 자격(`installEligibility`: `/Applications` 또는 `~/Applications`에 바로 있음, translocation 아님)인 사본에서만.

### D12. 0.1.0 전에 업데이트 경로를 확인하는 방법 — 결론(사용자, 2026-11-07)
- 사용자가 `/release`를 `0.1.0-rc.1`, `0.1.0-rc.2`로 차례로 불러 prerelease 두 개를 만들고, 설치한 rc.1이 rc.2로 업데이트되는지 본다(부모 R1).
- R1이 app-update의 실제 업데이트 PoC다. 서명되고 피드가 켜진 PoC 빌드를 따로 만들지 않는다. 실패하면 `develop`에서 고친 뒤 rc.3으로 다시 본다(태그는 옮기거나 지우지 않는다). 코드로 답이 나온 가정은 '조사'에 적었다(2026-11-07 `/feature-review`).

### D13. 버전과 태그 — 결론(사용자, 2026-11-07)
- `/release`가 `chore(release): <version>` 올림 커밋(`npm --prefix app version <v> --no-git-tag-version`, lock 포함)을 `develop`에 push하고, `develop`→`main` 병합 커밋에 `v<version>` 태그를 만들어 push한다(D7). rc 식별자는 `x.y.z-rc.N`. 릴리스 노트 초안은 정식 버전이면 마지막 정식 태그 이후, rc면 마지막 태그 이후 병합된 PR 제목으로 만들고, 사용자 승인 없이 스킬이 확정한다(사용자, 2026-11-08). PR 없이 `develop`에 들어간 커밋(D3)은 노트 초안에 빠진다.
- 제약: R1이 먼저이므로 올림 커밋은 0.1.0 → 0.1.0-rc.1 → 0.1.0-rc.2 → 0.1.0으로 세 번 생긴다. SemVer로 rc.1은 0.1.0보다 낮으므로 버전 검사는 지금 `package.json` 값이 아니라 기존 태그·게시본과 비교한다. 지금까지 나간 테스터 dmg도 0.1.0으로 찍혀 있지만 피드가 없어(D8) 업데이트에는 영향이 없다.

### D14. 아키텍처 — 결론(사용자, 2026-11-07)
- arm64만.

### D15. 고지 파일 동봉 — 결론(사용자, 2026-11-07)
- 패키징할 때 `extraResources`로 루트 `LICENSE`와 `cli/internal/designskill/notices/`를 앱의 `Resources/`에 복사하고, 위치를 ARCHITECTURE §9에 적는다.

### D16. README의 범위 — 결론(사용자, 2026-11-07)
- 기능별 구성, 기능마다 이미지 한 장. 이미지는 D29대로 캔버스에 그린다. 번역은 하지 않는다. 참고 저장소는 stablyai/orca와 nexu-io/open-design(Open Design은 추정한 저장소이고 사용자가 이의를 달지 않았다).

### D17. 공개 전 문서 세트 — 결론(사용자, 2026-11-07)
- `docs/CONTRIBUTING.md`, `docs/CODE_OF_CONDUCT.md`(Contributor Covenant 3.0), `docs/SECURITY.md`(GitHub 비공개 취약점 신고), `.github/ISSUE_TEMPLATE/`의 버그·기능 요청 양식, `.github/pull_request_template.md`. CODEOWNERS는 두지 않는다.
- CODE_OF_CONDUCT의 신고 연락처는 메인테이너의 개인 이메일(커밋 작성자 이메일)이고, 공개한다.

### D18. 저장소의 위치와 이름 — 결론(사용자, 2026-11-07)
- `SinhyeokKang/doan-design`에 그대로 둔다.

### D19. 이력과 원격 브랜치 정리 — 결론(사용자, 2026-11-07)
- 이력은 그대로 둔다. 공개 전에 전체 이력 비밀 스캔을 하고, 병합된 원격 브랜치와 worker 브랜치를 지운다(AGENTS.md:140의 "사용자가 말할 때까지 보존"에 대한 사용자 지시).

### D20. 공개 정리의 범위 — 결론(사용자, 2026-11-07)
- 한국어 주석을 영어로 옮긴다. 지운 feature 문서 참조는 이유가 코드에 없을 때만 문장으로 풀고 나머지는 지운다. 이미 구현된 화면의 초안 다섯 줄의 개인 경로를 `/Users/you/…`로 바꾼다(design-draft 스킬의 금지에 대한 사용자 예외).
- 테스트 제목 문자열(`describe`·`test`)의 한국어와 지운 문서 참조도 고친다. 문자열 리터럴은 바꾸지 않는다는 규칙의 예외다(동작을 바꾸지 않고, 밖에서는 주석처럼 읽힌다). 초안(개인 경로 다섯 줄 밖), DESIGN.md, POSTMORTEM.md의 한국어와 참조는 이번 범위가 아니다(2026-11-07 `/feature-review`).

### D21. 공개 시점 — 결론(사용자, 2026-11-07)
- git-flow, public-cleanup, community-docs, readme-features 뒤에 공개하고, ci-gate·release-ci·app-update·release-skill은 공개 뒤에 진행한다. 그동안 README는 "pre-release"라고 적는다.
- 제약: 공개 시점의 `main`은 problem-project-overlay 병합과 C3·C4 커밋까지의 상태이고 정리(C2)는 `develop`에만 있다(사용자 결정 2). 첫 화면은 기본 브랜치 `main`이라, 첫 `/release`까지 `main`의 정리 전 상태(개인 경로, 한국어 주석)가 보인다. README와 공동체 문서는 C3·C4로 이미 `main`에 있다.

### D22. 릴리스 절차를 어디에 적을까 — 결론(사용자, 2026-11-07)
- 절차는 `/release` 스킬에 있다. 사람이 처음 한 번 하는 일(인증서 `.p12`와 API 키를 GitHub 환경 비밀로 넣기, 갱신)도 그 스킬의 'One-time setup'에 둔다. 이 부모에서는 `docs/OPERATIONS.md`를 만들지 않고, release-skill이 AGENTS.md 'Documents' 표의 OPERATIONS 행에서 릴리스 패키징 역할을 지운다.

### D23. 대화가 진행 중일 때의 업데이트 설치 — 결론(사용자, 2026-11-07)
- 턴이 돌거나 답(권한 요청, 질문)을 기다리는 대화가 있으면 "Restart to Update"를 막고 이유를 한 줄로 보인다. 받은 업데이트는 다음 종료 때 설치된다.
- 막는 대상은 대화뿐이다. 진행 중인 clone, 에이전트 로그인, MCP 연결은 지금 종료처럼 취소된다(`app/src/main/index.ts` `before-quit`). 이 사실을 app-update design에 적는다(2026-11-07 `/feature-review`).

### D24. 업데이트 알림 표면 — 결론(사용자, 2026-11-07 `/feature-review`)
- app-update의 `/design-draft`가 두 시안을 그리고, 사용자가 초안에서 하나를 고른다: (a) 앱 헤더 오른쪽 끝, 에이전트 사용량 표시보다 오른쪽의 표시, (b) 사이드바 하단의 오버레이.
- 어느 쪽이든 Doan 메뉴의 "Check for Updates…"(준비되면 "Restart to Update")와 Settings > About의 업데이트 행을 둔다. macOS 데스크톱 알림은 쓰지 않는다.

### D25. 공개 뒤 GitHub 설정의 나눔 — 결론(사용자, 2026-11-07 `/feature-review`)
- G3a(G2 직후 같은 자리): 비공개 취약점 신고 켜기, 환경 `release`(D6)와 비밀 등록.
- G3b(C5 뒤): `develop` 보호. 필수 검사는 ci-gate의 작업 id(`gate`). 관리자 우회를 허용한다.
- G3c(R1 전): `main` 보호. PR 필수, 승인 0, 필수 검사, "Require branches to be up to date" 끔, force push·삭제 금지, 관리자 우회 금지(`enforce_admins`). `/release`는 PR로 병합하므로 우회가 필요 없다.
- 제약: `develop`에서 우회를 막으면 D3의 직접 push와 D13의 올림 커밋이 거부된다. `main`에 승인 1을 두면 메인테이너 혼자서는 병합할 수 없다. `main`의 병합 커밋은 `develop`에 들어가지 않으므로 최신화를 요구하면 매 릴리스 PR이 "behind"가 된다.

### D26. 코드 주석의 문서 인용 금지 — 결론(사용자, 2026-11-07 `/feature-review`)
- 코드 주석은 `docs/features/` 문서(절, 결정·task id, slug)를 인용하지 않는다. 이유를 직접 쓰거나 PRODUCT·ARCHITECTURE를 가리킨다. AGENTS.md 'Commit conventions'의 주석 규칙과 `/code-review` 점검 항목에 더한다. public-cleanup의 마지막 task다.
- 제약: feature 문서는 승격 뒤 지워지므로 그 인용은 외부인에게 끊긴 링크가 된다.

### D27. public-cleanup의 진행 경로 — 결론(사용자, 2026-11-07 `/feature-review`)
- `/orchestrate`로 디렉터리별 batch로 나눈다(main / renderer 묶음 여럿 / restore·preload·cli·나머지). batch 안의 커밋은 처리 규칙별로 나눈다.

### D28. README Background와 PRODUCT §1 — 결론(사용자, 2026-11-07 `/feature-review`)
- README의 Background를 줄인다. Malmoi 사례의 근거 항목(256 KiB 한도, 29곳 등)은 PRODUCT §1로 옮기고, PRODUCT §1의 "Source: the Malmoi case in the README background." 줄을 고친다. readme-features의 task다.

### D29. README 이미지 — 결론(사용자, 2026-11-07 `/feature-review`)
- 앱 화면을 찍지 않는다. 기능마다 프레임 하나를 둔 Doan 캔버스(`.doan/canvases/readme-features.html`, 더미 데이터, `tokens.css`)에 그리고, 각 프레임을 PNG로 내보내 `docs/assets/readme/`에 둔다(장당 500 KB 이하). 계정, 사용량, keychain이 끼어들지 않고 화면이 바뀌어도 캔버스만 고치면 된다.

### D30. CONTRIBUTING의 훅 안내 — 결론(사용자, 2026-11-07 `/feature-review`)
- CONTRIBUTING에 `.claude/settings.json`의 `UserPromptSubmit` 훅이 메인테이너 선호(한국어 응답)를 매 턴 주입한다는 한 문장과, `.claude/settings.local.json`으로 끄는 방법을 적는다. AGENTS.md는 그대로다.

## 자식 진행 규칙

1. **시작**: 선행 자식이 통합 브랜치에 들어갔는지 확인하고 부모 [tasks.md](./tasks.md)의 그 줄을 체크해 `docs(feature): release-0-1-0 check <slug>`로 따로 커밋한다. 부모의 체크는 이 규칙 하나로만 한다. 자식의 마지막 task는 부모를 체크하지 않는다. 그 자식이 막혀 있는 D가 모두 결론으로 바뀌었는지 확인한 뒤 자식의 `/feature`(이미 문서가 있으면 `/feature-review`)로 들어간다.
2. **결정**: 자식 문서는 이 문서의 D id만 가리킨다(모두 결론). 자식 진행 중 새로 생긴 공통 결정은 이 문서에 D를 더하고, 그 자식에만 해당하는 결정은 자식 design.md에 둔다.
3. **경로**: git-flow 뒤의 자식은 '사용자 결정' 1대로 `develop`에서 분기하고 `develop`으로 PR을 열거나, 하네스·문서면 `develop`에 커밋한다. `main`은 `/release`만 바꾼다.
4. **끝**: 자식은 자기 결론을 PRODUCT·ARCHITECTURE(필요하면 DESIGN·BACKLOG·DIRECTORY)에 승격하고 자기 디렉터리만 지운다. 부모 디렉터리는 건드리지 않는다.
5. **사용자만 하는 조작**: 저장소 공개, 기본 브랜치 변경, 보호 규칙, 환경과 비밀 등록은 에이전트가 하지 않는다. `/release` 호출도 사용자만 한다. 에이전트는 무엇을 어떤 값으로 설정할지 적어 사용자에게 넘긴다.

## 공통 함정 (POSTMORTEM)

- **2026-10-30 — Packaged-app probes failed for reasons of their own: keychain, signature identity and focus**: 다른 서명의 사본은 알림 권한을 조용히 잃었고, 같은 `design.doan.app`으로 등록된 여러 사본 중 아무 것이나 열렸다. 업데이트 probe는 서명이 같은 두 빌드로 하고, probe 전에 `lsregister -dump`로 다른 등록을 확인한다.
- **2026-10-25 — A crash during quit teardown lost the debounced ui-state**: 업데이트 설치를 위한 종료도 teardown 전에 상태를 flush해야 한다.
- **2026-10-25 — Calling the Quit menu item's JS click did not quit macOS Electron**: 종료 경로 확인은 실제 종료 이벤트로 한다. `quitAndInstall` 뒤 앱이 정말 끝나고 새 버전으로 다시 열렸는지를 사건으로 확인한다.
