# release-0-1-0 — spec (부모)

저장소를 공개하고 Doan 0.1.0을 GitHub Releases로 내보내기 위한 부모 feature다. 공통 결정(D 목록은 [design.md](./design.md) '결정'), 공용 조사, 자식 feature 정의를 담는다. 구현 task는 각 자식 feature 문서에 있고, 자식 순서와 의존은 [tasks.md](./tasks.md)에 있다.

부모는 `/ship`이나 `/orchestrate`로 진행하지 않는다. 이 디렉터리의 수정은 하네스·문서 변경 경로(AGENTS.md 'Commit conventions')로 대화 중에 커밋하고, [tasks.md](./tasks.md)의 마지막 task만 이 디렉터리를 지운다.

## 사용자

- **사람(앱 사용자)**: GitHub Releases에서 공증된 dmg를 받아 설치하고, 앱 안에서 새 버전 알림을 보고, 확인하고, 클릭 한 번으로 업데이트한다.
- **외부 기여자**: 공개 저장소에서 README로 기능을 파악하고, CONTRIBUTING·CODE_OF_CONDUCT·SECURITY를 읽고, `develop`을 향한 PR에서 CI 결과를 받는다.
- **에이전트(이 저장소의 하네스)**: `/ship`·`/orchestrate`·`/chain`·`/feature`·`/tester-build`가 `main` 대신 `develop`을 기준으로 동작하고, 사용자가 부를 때만 `/release`로 `main`을 바꾼다.
- **메인테이너(사용자 본인)**: 저장소 공개, 기본 브랜치·보호 규칙·비밀 등록, `/release` 호출처럼 에이전트가 스스로 하지 않는 조작을 한다. 서명 자격 증명은 사람만 다룬다(`.agents/skills/tester-build/SKILL.md` 'Prohibited').

## 문제 (2026-11-07 관찰)

- 저장소는 비공개다(`gh repo view`: `visibility: PRIVATE`, `licenseInfo: apache-2.0`). 태그와 GitHub Release가 하나도 없다(`git tag`, `gh release list` 결과 없음).
- 통합 브랜치는 `main` 하나다. `/ship`·`/orchestrate`는 main에서 분기해 `--base main` PR을 연다(`.agents/skills/ship/SKILL.md:18`, `:35`, `.agents/skills/orchestrate/SKILL.md:6`, `:76`). 하네스·문서 변경은 main에 바로 push한다(AGENTS.md:134). 체인 파일도 main에 커밋한다(`.agents/skills/chain/SKILL.md:8`, `:33`).
- CI가 없다(`.github/` 없음). 게이트는 로컬의 `node .agents/skills/verify/scripts/verify.mjs`뿐이다(AGENTS.md 'Commands').
- 서명·공증은 로컬 `/tester-build`만 한다. 빌드하는 기계의 login keychain에 있는 Developer ID 정체성과 notarytool 프로필 `doan-notary`를 쓰고, 항상 `origin/main`에서 빌드한다(`.agents/skills/tester-build/SKILL.md:8`, `:48`, `:52`). ARCHITECTURE §9는 "CI and its secrets come with release packaging"이라고 미뤄 뒀다(docs/ARCHITECTURE.md:718–719).
- 앱에는 업데이트 경로가 없다. `app/package.json`에 `electron-updater`도 `publish` 설정도 없고(`app/package.json:48–89`), 로컬 패키지는 `--mac dir`만 만든다(`app/scripts/package.mjs:20`). README는 "in development, not released"다(README.md:9).
- BACKLOG의 'Release packaging (#9 `dist`)'은 착수 전이고(docs/BACKLOG.md:7), 디자인 프리셋 고지 파일을 앱 패키지에 어떻게 싣는지도 열려 있다(docs/BACKLOG.md:17).
- 공개 전 문서(CONTRIBUTING, CODE_OF_CONDUCT, SECURITY)가 없다. AGENTS.md의 문서 표는 이것들을 "공개 직전에 만든다"고 적어 뒀다(AGENTS.md:126).
- 비공개 + 무료 계정이라 브랜치 보호를 켤 수 없다(`gh api …/branches/main/protection` → 403 "Upgrade to GitHub Pro or make this repository public").
- 이미 정해진 것: 라이선스는 Apache-2.0이다(docs/ARCHITECTURE.md:724, 루트 `LICENSE`). 버전은 `app/package.json`의 `"version": "0.1.0"`(`app/package.json:46`)이고, 패키징이 같은 값을 Go CLI의 `cli.Version`에 찍는다(`app/scripts/package.mjs:7`, `:18`, `cli/internal/cli/run.go:71`).

## 범위 게이트

- PRODUCT §2는 설치·온보딩·문서를 제품 범위에 넣는다(docs/PRODUCT.md:21). 배포와 업데이트는 범위 안이다.
- PRODUCT §3 Out of scope 5는 "the web only serves as the download path"라고 한다(docs/PRODUCT.md:57). GitHub Releases를 다운로드 경로로 쓰는 것은 이와 맞는다. 다만 앱이 스스로 GitHub에 업데이트를 묻는 요청은 PRODUCT가 정하지 않은 새 네트워크 동작이다. D10이 자동 확인과 끄는 설정을 정했고, app-update가 PRODUCT §3에 그 문장을 더한다.
- 웹사이트(doan.design)는 PRODUCT §5 'Deferred'다(docs/PRODUCT.md:346). Homebrew 설치는 BACKLOG가 "wanted at commercial launch, not before"로 적었다(docs/BACKLOG.md:7). 둘 다 이번 비목표다.
- BACKLOG는 release packaging을 "deferred until after the whole-app cycle quality work"로 적었다(docs/BACKLOG.md:7). 이번 요청은 사용자가 그 순서를 바꾼 것으로 보고, 승격 task에서 BACKLOG 항목을 지운다.
- 결과: 통과. 단, D10(업데이트 확인의 네트워크 동작)은 PRODUCT 갱신이 필요하다(app-update T8).

## 자식 feature

실행 순서와 병렬 가능 여부는 [tasks.md](./tasks.md)가 정본이다. 결정 id는 [design.md](./design.md) '결정'을, '사용자 결정'은 같은 문서의 '사용자 결정 (2026-11-07)'을 가리킨다. 첫 전제: 진행 중인 problem-project-overlay `/orchestrate` 실행은 지금의 main 기준 절차로 끝내고, git-flow는 그 PR이 `main`에 병합된 뒤에 시작한다.

| # | slug | 범위 | 진행 경로 | 선행 | 관련 결정 |
|---|---|---|---|---|---|
| 1 | [git-flow](../git-flow/spec.md) | `develop` 만들기, AGENTS.md·스킬의 기준 브랜치를 `develop`으로, 브랜치 목록(`hotfix/*` 포함)과 "`main`은 `/release`로만" 규칙 | 하네스·문서(대화 중) + 사용자의 GitHub 설정 | problem-project-overlay 병합 | 사용자 결정 1·2, D1 D2 D3 |
| 2 | [public-cleanup](../public-cleanup/spec.md) | 공개 전 정리: 코드 주석의 한국어와 지운 feature 문서 참조, 초안의 개인 경로, 이력 비밀 스캔 | `/ship` | git-flow | D19 D20 |
| 3 | [community-docs](../community-docs/spec.md) | CONTRIBUTING, CODE_OF_CONDUCT, SECURITY, 이슈·PR 템플릿 | 하네스·문서(대화 중) | git-flow | D17 |
| 4 | [readme-features](../readme-features/spec.md) | 기능 중심 README 재작성 | 하네스·문서(대화 중) | git-flow | D16 |
| 5 | [ci-gate](../ci-gate/spec.md) | GitHub Actions에서 공유 게이트(`verify.mjs`) 실행, 필수 상태 검사 | `/ship` | git-flow, 공개(D21) | D4 D5 |
| 6 | [release-ci](../release-ci/spec.md) | CI 서명·공증, 테스트 빌드 워크플로와 릴리스 빌드 워크플로, 고지 파일 동봉, `/tester-build` 교체 | `/ship` | ci-gate | D5 D6 D7 D8 D13 D14 D15 D18 |
| 7 | [app-update](../app-update/spec.md) | 앱 안 업데이트 알림·확인·설치 | `/orchestrate`(UI 포함, `/design-draft` 필요) | release-ci | D9 D10 D11 D12 D23 |
| 8 | [release-skill](../release-skill/spec.md) | 새 `/release` 스킬: 버전 올림, `develop`→`main`, `main`의 태그, 릴리스 노트, 릴리스 워크플로 시작, GitHub Release 게시, hotfix 모드(D1) | 하네스·문서(대화 중) | release-ci (app-update와 병렬) | 사용자 결정 2, D1 D7 D12 D13 D22 |

자식이 아닌 부모 task: 저장소 공개와 공개 뒤 설정(사용자만 한다), 0.1.0 릴리스, 부모 정리. [tasks.md](./tasks.md)의 G·R·Z다.

## 완료 조건

- 사용자가 부른 `/release`가 `main`에 `v0.1.0` 태그를 달고 그 GitHub Release를 게시했다. 자산은 공증·스테이플된 arm64 dmg, zip, `latest-mac.yml`이다(D14).
- Release에서 받은 dmg를 격리 속성과 함께 열 때 `spctl`이 `source=Notarized Developer ID`로 받아들인다(`/tester-build` 6단계의 검사 목록과 같다).
- 설치한 앱이 D12에서 정한 방법으로 다음 버전을 알리고, 클릭 한 번으로 바꿔 설치한 뒤 다시 열린다. 다시 열린 뒤 `~/.local/bin/doan`이 새 번들의 CLI를 가리킨다.
- 저장소가 공개돼 있고, `develop`이 D2대로 설정돼 있으며, CI의 게이트 작업이 D4의 이벤트에서 돌고 필수 검사로 걸려 있다.
- `docs/CONTRIBUTING.md`, `docs/CODE_OF_CONDUCT.md`, `docs/SECURITY.md`와 D17에서 정한 템플릿이 있고, README가 기능 중심으로 바뀌었다.
- AGENTS.md와 스킬에서 "main에서 분기", "`--base main`", "`origin/main`에서 빌드", "main에 바로 push" 같은 옛 기준이 `develop`으로 바뀌었고, `main`을 바꾸는 길은 `/release` 하나다(출시와 hotfix 모드, D1). `.agents/skills/release/SKILL.md`와 `.claude/skills/release` 링크가 있다.
- 각 자식의 결론이 PRODUCT·ARCHITECTURE(필요하면 DESIGN·BACKLOG·DIRECTORY)에 현재 규칙으로 승격됐고, BACKLOG 'Release packaging' 항목과 고지 파일 항목이 지워졌다.

## 비목표

- e2e CI와 야간 e2e. AGENTS.md 'Verification policy'가 앱이 안정되기 전에는 전체 흐름 suite를 만들지 않는다고 정했다. 야간 실행을 나중에 넣을 때의 제약(예약 실행은 기본 브랜치에서만 돈다)은 [design.md](./design.md) '조사'에 남긴다.
- Homebrew cask, doan.design 웹사이트(범위 게이트 참고).
- Windows·Linux 빌드, x64·universal 빌드(D14).
- 단계적 배포(`stagingPercentage`), 텔레메트리, electron-builder v27의 서명된 업데이트 매니페스트(지금 쓰는 26.18.0에는 없다).
- 저장소 이력 재작성(D19: 이력은 그대로 둔다).
