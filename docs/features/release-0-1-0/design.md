# release-0-1-0 — design (부모)

자식 feature가 함께 따르는 제약, 공용 조사, 공개 전 위험 점검, 결정 목록을 담는다. 자식 문서는 결정을 다시 적지 않고 여기의 id(D1…)로 가리킨다. 결정은 모두 '결정' 절에 있고, 자식이 끝날 때 PRODUCT·ARCHITECTURE로 승격한다.

## 영향 범위 (자식 전체)

- **하네스**: AGENTS.md('Commands', 'Workflow', 'Documents', 'Commit conventions'), `.agents/skills/` 중 기준 브랜치를 가정하는 스킬(아래 '하네스 영향'), 새 `/release` 스킬과 `.claude/skills/release` 링크(사용자 결정 2).
- **CI**: 새 `.github/workflows/`(게이트, 테스트 빌드, 릴리스). 지금은 `.github/`가 없다.
- **패키징**: `app/package.json` `build`(mac 타깃에 zip, `publish`, 산출물 이름, 고지 파일 `extraResources`), `app/scripts/package.mjs`.
- **앱(main + renderer)**: 업데이트 서비스, IPC, 알림 표면(Settings > About 등). 새 런타임 의존성 `electron-updater`(D9).
- **CLI(Go)**: 코드 변경 없음을 기본으로 한다. 버전은 지금처럼 패키징이 찍는다. 공개 정리(D20)가 주석을 바꿀 수 있다.
- **형식**: 공유 JSON Schema(ARCHITECTURE §11)는 바뀌지 않는다. app-socket 버전도 그대로다. 업데이트 상태는 main과 renderer 사이 IPC로만 오간다.
- **문서**: README, 새 `docs/CONTRIBUTING.md`·`docs/CODE_OF_CONDUCT.md`·`docs/SECURITY.md`(AGENTS.md:126이 정한 위치), PRODUCT §5 항목 0(About)·§3, ARCHITECTURE §7·§9, BACKLOG, DIRECTORY(`.github/` 추가).

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
- 게시(https://github.com/electron-userland/electron-builder/blob/electron-builder%4026.18.0/website/docs/publish.md): `--publish onTag | onTagOrDraft | always | never`. 태그 버전은 `package.json`의 `version`에 `v`를 붙인 값이다. draft Release에 올리고 사람이 게시하는 흐름을 문서가 권한다. `GH_TOKEN`/`GITHUB_TOKEN`이 있으면 기본 공급자는 github다.
- 공증(https://github.com/electron-userland/electron-builder/blob/electron-builder%4026.18.0/website/docs/features/code-signing/notarization.md): 자격 증명은 세 방식이다. Apple ID + 앱 전용 암호 + Team ID, App Store Connect API 키(`APPLE_API_KEY`, `APPLE_API_KEY_ID`, `APPLE_API_ISSUER`), keychain 프로필(`APPLE_KEYCHAIN_PROFILE`). GitHub Actions 예시는 `CSC_LINK`(base64 `.p12`)와 `CSC_KEY_PASSWORD`로 서명한다. 지금 `/tester-build`는 세 번째(keychain 프로필 `doan-notary`, API Team 키)를 쓴다.
- macOS 서명(https://github.com/electron-userland/electron-builder/blob/electron-builder%4026.18.0/website/docs/features/code-signing/code-signing-mac.md): CI에서는 `CSC_LINK`의 `.p12`를 임시 keychain에 넣는다.

### GitHub

- 요금: 공개 저장소의 표준 GitHub 호스팅 러너는 무료다. 비공개에서는 포함 사용량에서 차감되고 macOS 3·4코어는 분당 $0.062다(https://docs.github.com/en/billing/managing-billing-for-your-products/managing-billing-for-github-actions/about-billing-for-github-actions).
- macOS 러너(https://github.com/actions/runner-images): `macos-latest`·`macos-26`이 arm64, `macos-15`가 arm64, `macos-15-intel`·`macos-26-intel`이 x64다. macOS 14 이미지는 2026-11-02에 GitHub Actions에서 내려갔다.
- 환경(environment): "Users with GitHub Free plans can only configure environments for public repositories." 환경 비밀은 그 환경을 쓰는 작업이 보호 규칙(필수 검토자 등)을 통과한 뒤에만 읽는다(https://docs.github.com/en/actions/managing-workflow-runs-and-deployments/managing-deployments/managing-environments-for-deployment).
- 이벤트(https://docs.github.com/en/actions/reference/workflows-and-actions/events-that-trigger-workflows): 포크에서 온 `pull_request`에는 비밀이 전달되지 않고 `GITHUB_TOKEN`은 읽기 전용이다. 처음 기여하는 사람의 PR은 쓰기 권한자가 실행을 승인해야 할 수 있다. `pull_request_target`은 신뢰하지 않는 코드를 실행하면 위험하다고 경고한다. `pull_request`는 `branches` 필터로 대상 브랜치를 고를 수 있다. **예약(`schedule`) 실행은 기본 브랜치에서만 돈다** — 야간 e2e를 나중에 `main`에서 돌리려면 기본 브랜치가 `develop`일 때 체크아웃 ref를 따로 줘야 한다.
- 브랜치 보호: 지금 비공개 무료 저장소라 API가 403을 준다(위 spec). 문서는 필수 상태 검사와 "Do not allow bypassing the above settings"(관리자에게도 적용)를 설명한다(https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches). 규칙 집합(rulesets)의 개인 계정 공개 저장소 지원은 문서에서 확인하지 못했다.
- 비공개 취약점 신고: 공개 저장소의 소유자·관리자가 Settings에서 켠다(https://docs.github.com/en/code-security/security-advisories/working-with-repository-security-advisories/configuring-private-vulnerability-reporting-for-a-repository).
- 공동체 파일 위치: CODE_OF_CONDUCT·CONTRIBUTING·SECURITY는 `.github/`, 루트, `docs/` 중 어디든 되고 GitHub는 `.github/` → 루트 → `docs/` 순으로 찾는다. 이슈 템플릿은 `.github/ISSUE_TEMPLATE/`에만 둔다(https://docs.github.com/en/communities/setting-up-your-project-for-healthy-contributions/creating-a-default-community-health-file). AGENTS.md:126의 `docs/` 위치는 그대로 쓸 수 있다.
- Contributor Covenant 최신판은 3.0이다(https://www.contributor-covenant.org/version/3/0/).

## 공통 제약 (모든 자식)

1. **버전의 원천은 `app/package.json`의 `version` 하나다.** 패키징이 같은 값을 Go CLI에 찍는다(`app/scripts/package.mjs:18`). 태그는 `v<version>`이다(electron-builder 게시 규칙). 버전을 올리는 시점은 D13.
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
| AGENTS.md | 109 | `/ship`·`/orchestrate`가 main에서 분기 |
| AGENTS.md | 110–111 | 체인 링크가 main에 병합, Orca worker 기본 분기가 main |
| AGENTS.md | 131–134 | 브랜치 두 경로, 하네스 변경은 main에 바로 push |
| `.agents/skills/ship/SKILL.md` | 18, 35 | main에서 분기, `gh pr create --base main` |
| `.agents/skills/orchestrate/SKILL.md` | 6, 31, 69, 76 | main에서 분기, `--base main` |
| `.agents/skills/chain/SKILL.md` | 6, 8, 19, 20, 33, 49, 52, 53, 55 | 링크가 main에 병합, 체인 파일을 main에 커밋, `origin/main`에서 새 worktree |
| `.agents/skills/feature/SKILL.md` | 52 | 문서 커밋을 main이면 바로 push |
| `.agents/skills/code-review/SKILL.md` | 14 | `git diff main...HEAD` |
| `.agents/skills/design-sync/SKILL.md` | 8, 10, 23, 25, 27, 110 | "첫 구현이 main에 들어가기 전까지 초안이 정본" |
| `.agents/skills/design-draft/SKILL.md` | 18, 19, 21, 55, 83, 103 | "main에 이미 있는 화면" |
| `.agents/skills/tester-build/SKILL.md` | 3, 8, 48, 52 | `origin/main`에서 빌드 (git-flow가 `origin/develop`으로, release-ci가 D8에 따라 CI로) |
| `.agents/skills/audit/SKILL.md` | 12 | "changes since main" |
| `.agents/skills/verify/SKILL.md` | — | 기준 브랜치 가정 없음(2026-11-07 grep). `verify.mjs`는 `HEAD`만 기록한다 |

design-draft·design-sync의 "on main"은 "출시됐다"가 아니라 "통합됐다"는 뜻이므로 통합 브랜치 이름으로 바꾼다. 결정 문서의 "on main" 표현(PRODUCT·ARCHITECTURE·DESIGN)은 git-flow가 같은 기준으로 훑는다.

## 공개 전 위험 점검 (2026-11-07, 읽기 전용)

비밀로 보이는 값은 찾지 못했다. 공개되면 드러나는 것과 외부인이 읽기 어려운 것은 아래와 같다.

- **개인 절대 경로(초안 canvas)**: `.doan/canvases/buzz-conversation.html:260`, `:261`(`/Users/sinhyeok/code/doan-design`), `.doan/canvases/buzz-onboarding.html:223`(`/Users/sinhyeok/code/studio`), `:224`(`/Users/sinhyeok/code/.studio.doan-clone-k2Qx7a`), `.doan/canvases/buzz-project.html:407`(`/Users/sinhyeok/code/acme-web`). 이미 main에 구현된 화면의 초안이라 design-draft 스킬은 고치지 못하게 한다(`.agents/skills/design-draft/SKILL.md:103`). → D20.
- **커밋 작성자 이메일**: 5,625개 커밋 중 5,506개가 개인 Gmail 주소, 119개가 GitHub noreply 주소다(`git log --format=%ae | sort | uniq -c`). 공개하면 이력에서 보인다. → D19.
- **원격 브랜치 74개**: worker 브랜치(`SinhyeokKang/pm-a-main` 등)와 병합된 구현 브랜치가 남아 있다. AGENTS.md:140은 사용자가 말하기 전까지 지우지 않는다고 정했다. → D19.
- **코드 주석의 한국어**: `app/src`·`cli`·`eval`에서 한국어가 있는 `//` 주석이 131개 파일에 있다(`git grep -c -P '//.*[\x{AC00}-\x{D7A3}]'`). 예: `app/src/main/addPage.ts:8`, `app/src/main/agentAuth/manager.ts:31–32`, `app/src/main/agentSetup/notice.ts:30`, `app/src/main/agentSetup/plan.ts:5`. AGENTS.md 언어 정책(코드 주석은 영어) 위반이다. → D20.
- **지운 feature 문서 참조**: 코드에 `design §…`, `design '…'`, `tasks.md`, `docs/features/` 꼴의 참조가 736줄 있다(예: `app/src/main/about.ts:9` "buzz-settings design 'About'"). 그 문서는 승격 뒤 지워져 외부인이 따라갈 수 없다(이력에는 있다). → D20.
- **로컬 참조 경로**: AGENTS.md 'References'의 `~/code/malmoi`. malmoi는 같은 소유자의 공개 MIT 저장소다(`gh repo view SinhyeokKang/malmoi`). 경로가 개인 기기를 가정할 뿐 비밀은 아니다. `~/code/buzz-app` 명령은 3337dc3d가 AGENTS.md에서 지웠다.
- **malmoi에서 옮긴 코드**: `app/src/renderer/dotField.ts:1` 등. 같은 저작권자의 MIT 코드라 고지 문제는 없다고 본다(법적 판단이 아니다).
- **비밀 스캔**: 이력에 `.p12`·`.p8`·`.pem`·`.env`·credentials 파일이 추가된 적이 없다(`git log --all --diff-filter=A --name-only`). 키 모양 패턴은 테스트 자리표시자뿐이다(예: `app/src/main/agentAuth/environment.test.ts:10`의 `sk-ant-x`). gitleaks·trufflehog가 설치돼 있지 않아 전체 이력 스캔은 하지 못했다 → public-cleanup의 task.
- `.scratch/`는 무시되고 추적 파일이 없다(`git ls-files .scratch` 결과 없음). 5 MB가 넘는 blob은 없다.

## 사용자 결정 (2026-11-07)

부모를 쓰는 중에 사용자가 정했다. 나머지 결정은 아래 '결정' 절에 있다.

1. **모든 작업의 대상은 `develop`이다.** `/ship`·`/orchestrate`의 분기와 PR, `/chain` 링크의 병합(링크 순서대로 `develop`에), 대화 중 하네스·문서 커밋, 테스트 빌드의 원천이 모두 `develop`이다. AGENTS.md:134의 "on main, push straight to main"도 `develop`으로 바뀐다.
2. **`main`은 사용자가 `/release`를 부를 때만 바뀐다.** 기능·하네스·문서 커밋 어느 것도 그 전에는 `main`에 들어가지 않는다. `develop`에서 `main`으로 가는 길은 새 스킬 `.agents/skills/release/SKILL.md`(+ `.claude/skills/release` 링크) 하나다. 이 스킬이 버전 올림, `main`의 태그, 릴리스 노트, 배포에 필요한 나머지(릴리스 빌드, GitHub Release)를 한다. 스킬은 새 자식 [release-skill](../release-skill/spec.md)이 만든다.
3. **순서의 첫 전제**: 진행 중인 problem-project-overlay `/orchestrate` 실행(`docs/features/problem-project-overlay/`)은 지금의 main 기준 절차로 끝낸다. git-flow(`develop` 만들기, AGENTS.md·스킬 교체)는 그 실행의 PR이 `main`에 병합된 뒤에 시작한다.

## 결정 (사용자, 2026-11-07)

모든 D 항목이 정해졌다. id는 자식 문서가 가리키므로 그대로 둔다. 이유는 뒤집히기 쉬운 제약일 때만 적는다.

### D1. 출시본의 급한 수정 — 결론(사용자, 2026-11-07)
- release 브랜치는 두지 않는다. `/release`에 hotfix 모드를 둔다: 마지막 태그에서 `hotfix/<slug>`를 만들어 고치고, 그 수정만 `main`에 태그한 뒤 `develop`에 병합해 되돌린다. 브랜치는 `main`, `develop`, `feat/*`, `fix/*`(와 다른 `<type>/*`), `hotfix/*`다. hotfix도 `/release`를 거치므로 '사용자 결정' 2("`main`은 `/release`로만")를 지킨다.

### D2. GitHub 기본 브랜치 — 결론(사용자, 2026-11-07)
- `develop`. 설정은 사용자가 한다(G1).
- 제약: 예약(`schedule`) 실행은 기본 브랜치에서만 돈다. 나중에 `main`에서 야간 실행을 하려면 체크아웃 ref를 따로 준다. 첫 화면 README가 출시 전 내용일 수 있어 다운로드 링크는 `releases/latest`를 가리킨다.

### D3. 하네스·문서 변경이 들어가는 브랜치 — 결론(사용자, 2026-11-07)
- 지금 브랜치에 커밋하고, `develop`이면 바로 push한다. `main`에는 직접 push하지 않는다. 공개 뒤 `main` 보호 규칙(G3)이 이것을 강제한다.

### D4. CI 트리거 — 결론(사용자, 2026-11-07)
- `develop`·`main`을 향한 `pull_request`와 `develop`·`main`으로의 `push`.

### D5. CI 러너 — 결론(사용자, 2026-11-07)
- `macos-26`(arm64)으로 고정한다.
- 제약: `-latest` 라벨은 1–2개월에 걸쳐 조용히 바뀐다(runner-images README). 앱 테스트 일부가 darwin을 가정한다.

### D6. 서명 비밀의 보관과 실행 권한 — 결론(사용자, 2026-11-07)
- 환경 `release`(필수 검토자 = 사용자, 배포 ref = 릴리스 워크플로가 도는 `main`과 테스트 빌드의 `develop`)에 비밀을 두고, 서명 작업만 그 환경을 쓴다. 공증은 기존 App Store Connect API Team 키(지금 `doan-notary`와 같은 키)로 한다.
- 제약: 무료 계정은 공개 저장소에서만 환경을 쓸 수 있다(D21의 순서가 이것에 기댄다).

### D7. 릴리스 Release의 게시 방식 — 결론(사용자, 2026-11-07)
- 사용자가 부른 `/release`가 CI의 릴리스 워크플로(`main`에서만 실행)를 시작한다. 워크플로는 draft Release를 만든다. `/release`가 받은 자산을 `spctl` 등으로 검사해 보고하고, 사용자가 승인하면 스킬이 게시한다.

### D8. 테스트 빌드 — 결론(사용자, 2026-11-07)
- CI의 `workflow_dispatch`(기본 ref `develop`)가 서명·공증한 dmg를 Actions 산출물로 남긴다. `/tester-build`는 그 워크플로를 시작해 받은 dmg를 Desktop에 두는 스킬로 바뀐다. 테스트 빌드는 업데이트 확인을 끈다.

### D9. 업데이트 방식 — 결론(사용자, 2026-11-07)
- `electron-updater` + GitHub 공급자.
- 제약: macOS 자동 업데이트는 서명된 앱과 zip 타깃이 있어야 한다(electron-builder 26.18.0 auto-update 문서).

### D10. 확인·다운로드·설치 정책 — 결론(사용자, 2026-11-07)
- 실행할 때와 몇 시간마다 자동으로 확인하고, 새 버전은 뒤에서 받는다. 다 받으면 알림을 띄우고 "다시 시작해 업데이트"를 누르면 설치한다. 누르지 않으면 다음 종료 때 설치된다. Settings에 자동 확인을 끄는 설정을 둔다.
- 승격 때 PRODUCT §3에 앱이 GitHub Releases에 업데이트를 묻는다는 문장을 Out of scope 5("the web only serves as the download path")와 맞춰 적는다.

### D11. 업데이트를 켜는 사본 — 결론(사용자, 2026-11-07)
- 피드 설정(`app-update.yml`)이 실린 서명 빌드이고, agent setup과 같은 자격(`installEligibility`: `/Applications` 또는 `~/Applications`에 바로 있음, translocation 아님)인 사본에서만.

### D12. 0.1.0 전에 업데이트 경로를 확인하는 방법 — 결론(사용자, 2026-11-07)
- 사용자가 `/release`를 `0.1.0-rc.1`, `0.1.0-rc.2`로 차례로 불러 prerelease 두 개를 만들고, 설치한 rc.1이 rc.2로 업데이트되는지 본다(부모 R1).

### D13. 버전과 태그 — 결론(사용자, 2026-11-07)
- `/release`가 `chore(release): <version>` 올림 커밋을 `develop`에 push하고, `develop`→`main` 병합 커밋에 `v<version>` 태그를 단다. rc 식별자는 `x.y.z-rc.N`. 릴리스 노트는 지난 태그 이후 병합된 PR 제목으로 초안을 만들고 사용자가 고친다.
- 제약: 0.1.0은 이미 `app/package.json:46`에 있어 첫 릴리스에는 올림 커밋이 없다. 지금까지 나간 테스터 dmg도 0.1.0으로 찍혀 있다.

### D14. 아키텍처 — 결론(사용자, 2026-11-07)
- arm64만.

### D15. 고지 파일 동봉 — 결론(사용자, 2026-11-07)
- 패키징할 때 `extraResources`로 루트 `LICENSE`와 `cli/internal/designskill/notices/`를 앱의 `Resources/`에 복사하고, 위치를 ARCHITECTURE §9에 적는다.

### D16. README의 범위 — 결론(사용자, 2026-11-07)
- 기능별 구성, 기능마다 스크린샷 한 장(데모 프로젝트, 실제 계정·경로 없음). 번역은 하지 않는다. 참고 저장소는 stablyai/orca와 nexu-io/open-design(Open Design은 추정한 저장소이고 사용자가 이의를 달지 않았다).

### D17. 공개 전 문서 세트 — 결론(사용자, 2026-11-07)
- `docs/CONTRIBUTING.md`, `docs/CODE_OF_CONDUCT.md`(Contributor Covenant 3.0), `docs/SECURITY.md`(GitHub 비공개 취약점 신고), `.github/ISSUE_TEMPLATE/`의 버그·기능 요청 양식, `.github/pull_request_template.md`. CODEOWNERS는 두지 않는다.
- CODE_OF_CONDUCT의 신고 연락처는 메인테이너의 개인 이메일(커밋 작성자 이메일)이고, 공개한다.

### D18. 저장소의 위치와 이름 — 결론(사용자, 2026-11-07)
- `SinhyeokKang/doan-design`에 그대로 둔다.

### D19. 이력과 원격 브랜치 정리 — 결론(사용자, 2026-11-07)
- 이력은 그대로 둔다. 공개 전에 전체 이력 비밀 스캔을 하고, 병합된 원격 브랜치와 worker 브랜치를 지운다(AGENTS.md:140의 "사용자가 말할 때까지 보존"에 대한 사용자 지시).

### D20. 공개 정리의 범위 — 결론(사용자, 2026-11-07)
- 한국어 주석을 영어로 옮긴다. 지운 feature 문서 참조는 이유가 코드에 없을 때만 문장으로 풀고 나머지는 지운다. 이미 구현된 화면의 초안 다섯 줄의 개인 경로를 `/Users/you/…`로 바꾼다(design-draft 스킬의 금지에 대한 사용자 예외).

### D21. 공개 시점 — 결론(사용자, 2026-11-07)
- git-flow, public-cleanup, community-docs, readme-features 뒤에 공개하고, ci-gate·release-ci·app-update·release-skill은 공개 뒤에 진행한다. 그동안 README는 "pre-release"라고 적는다.
- 제약: 공개 시점의 `main`은 problem-project-overlay 병합 때의 커밋이고 정리는 `develop`에만 있다(사용자 결정 2). 첫 화면은 기본 브랜치 `develop`이지만 `main`의 옛 상태(개인 경로, 한국어 주석)와 전체 이력도 공개된다.

### D22. 릴리스 절차를 어디에 적을까 — 결론(사용자, 2026-11-07)
- 절차는 `/release` 스킬에 있다. 사람이 처음 한 번 하는 일(인증서 `.p12`와 API 키를 GitHub 환경 비밀로 넣기, 갱신)도 그 스킬의 'One-time setup'에 둔다. 이 부모에서는 `docs/OPERATIONS.md`를 만들지 않고, release-skill이 AGENTS.md 'Documents' 표의 OPERATIONS 행에서 릴리스 패키징 역할을 지운다.

### D23. 대화가 진행 중일 때의 업데이트 설치 — 결론(사용자, 2026-11-07)
- 턴이 돌거나 답을 기다리는 대화가 있으면 "다시 시작해 업데이트"를 막고 이유를 한 줄로 보인다. 받은 업데이트는 다음 종료 때 설치된다.

## 자식 진행 규칙

1. **시작**: 선행 자식이 통합 브랜치에 들어갔는지 확인하고 부모 [tasks.md](./tasks.md)의 그 줄을 체크해 `docs(feature): release-0-1-0 check <slug>`로 따로 커밋한다. 그 자식이 막혀 있는 D가 모두 결론으로 바뀌었는지 확인한 뒤 자식의 `/feature`(이미 문서가 있으면 `/feature-review`)로 들어간다.
2. **결정**: 자식 문서는 이 문서의 D id만 가리킨다(모두 결론). 자식 진행 중 새로 생긴 공통 결정은 이 문서에 D를 더하고, 그 자식에만 해당하는 결정은 자식 design.md에 둔다.
3. **경로**: git-flow 뒤의 자식은 '사용자 결정' 1대로 `develop`에서 분기하고 `develop`으로 PR을 열거나, 하네스·문서면 `develop`에 커밋한다. `main`은 `/release`만 바꾼다.
4. **끝**: 자식은 자기 결론을 PRODUCT·ARCHITECTURE(필요하면 DESIGN·BACKLOG·DIRECTORY)에 승격하고 자기 디렉터리만 지운다. 부모 디렉터리는 건드리지 않는다.
5. **사용자만 하는 조작**: 저장소 공개, 기본 브랜치 변경, 보호 규칙, 환경과 비밀 등록은 에이전트가 하지 않는다. `/release` 호출도 사용자만 한다. 에이전트는 무엇을 어떤 값으로 설정할지 적어 사용자에게 넘긴다.

## 공통 함정 (POSTMORTEM)

- **2026-10-30 — Packaged-app probes failed for reasons of their own: keychain, signature identity and focus**: 다른 서명의 사본은 알림 권한을 조용히 잃었고, 같은 `design.doan.app`으로 등록된 여러 사본 중 아무 것이나 열렸다. 업데이트 probe는 서명이 같은 두 빌드로 하고, probe 전에 `lsregister -dump`로 다른 등록을 확인한다.
- **2026-10-25 — A crash during quit teardown lost the debounced ui-state**: 업데이트 설치를 위한 종료도 teardown 전에 상태를 flush해야 한다.
- **2026-10-25 — Calling the Quit menu item's JS click did not quit macOS Electron**: 종료 경로 확인은 실제 종료 이벤트로 한다. `quitAndInstall` 뒤 앱이 정말 끝나고 새 버전으로 다시 열렸는지를 사건으로 확인한다.
