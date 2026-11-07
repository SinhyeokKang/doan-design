# community-docs — design

결정: 부모 [design.md](../release-0-1-0/design.md)의 D17(문서 세트, CoC 판과 연락처, 신고 경로)과 D30(훅 안내), '사용자 결정' 1·2·5와 D2(기본 브랜치)의 결론을 CONTRIBUTING에 옮겨 적는다. CI(D4)는 아직 없으므로 지금은 적지 않는다.

## 영향 범위

- 문서만: `docs/CONTRIBUTING.md`, `docs/CODE_OF_CONDUCT.md`, `docs/SECURITY.md`, `.github/ISSUE_TEMPLATE/`, `.github/pull_request_template.md`, AGENTS.md 'Documents' 표, `docs/DIRECTORY.md`.
- 앱·CLI·형식·`doan check`: 영향 없음. 순수 함수 대상 없음(문서만). PoC 의존 없음.
- 위치: GitHub는 세 문서를 `.github/` → 루트 → `docs/` 순으로 찾는다(부모 design.md '조사' GitHub). AGENTS.md:126이 정한 `docs/`를 쓴다. 이슈 템플릿은 `.github/ISSUE_TEMPLATE/`에만 둘 수 있다.
- 브랜치: `develop`이 없으므로 `main`에 커밋한다(부모 '사용자 결정' 5). 문서가 설명하는 흐름은 git-flow 뒤의 것이다.

## 문서별 내용

- **CONTRIBUTING** (참고: https://github.com/stablyai/orca/blob/main/.github/CONTRIBUTING.md, https://github.com/nexu-io/open-design/blob/main/CONTRIBUTING.md — 구성만 참고하고 규칙은 이 저장소 것을 쓴다)
  1. Before you start — 결정 원천은 `docs/PRODUCT.md`·`docs/ARCHITECTURE.md`, 범위 밖 요청은 이슈로 먼저 묻는다(PRODUCT §3 'Out of scope').
  2. Setup — README 'Build from source'와 AGENTS.md 'Commands'를 가리킨다.
  3. Branches — `develop`에서 `<type>/<slug>`, PR은 `develop`으로. `main`은 출시 기록이고 메인테이너가 출시할 때만 바뀐다(부모 '사용자 결정' 2). 이 문장은 git-flow T5가 AGENTS.md와 대조한다.
  4. Checks — `node .agents/skills/verify/scripts/verify.mjs`. CI는 아직 없다는 한 줄. CI와 "포크 PR은 첫 실행에 메인테이너 승인이 필요할 수 있다"는 ci-gate가 승격 때 더한다.
  5. Commits — Conventional Commits, 영어, 주석은 "why"만이고 `docs/features/` 문서를 인용하지 않는다(D26).
  6. Working with agents — AGENTS.md가 Claude Code와 Codex의 공통 규칙이며 응답 언어 같은 메인테이너 선호가 들어 있다. `.claude/settings.json`의 `UserPromptSubmit` 훅이 그 선호(한국어 응답)를 매 턴 주입하므로, 끄려면 `.claude/settings.local.json`에 `"disableAllHooks": true`를 둔다(D30). `docs/features/<slug>/`는 메인테이너의 진행 중 계획이라 한국어이고, 끝나면 영어 PRODUCT·ARCHITECTURE로 승격된 뒤 지워진다. 외부 기여자가 돌릴 수 없는 스킬: `/tester-build`(Developer ID 필요), `/release`(메인테이너 전용), `/agent-eval`(실제 에이전트 상태를 건드린다), Orca를 전제하는 `/orchestrate`·`/chain`.
- **CODE_OF_CONDUCT**: Contributor Covenant 3.0 원문(https://www.contributor-covenant.org/version/3/0/, 원문 md는 EthicalSource/contributor_covenant `content/version/3/0/code_of_conduct.md`)을 옮긴다.
  - 원문의 `[NOTE: describe your means of reporting here.]`는 연락처로, `[NOTE: The remedies and repairs …]`는 실제 정책으로 바꾼다.
  - 집행 절의 "Community Moderators"·"Community Managers"를 "the maintainer"로 고친다(메인테이너 한 명).
  - 연락처는 메인테이너의 개인 이메일(커밋 작성자 이메일)이고 공개한다(D17). T0에서 그 주소를 사용자에게 확인받는다. 신고 대상이 메인테이너 본인일 수 있으므로 GitHub의 report abuse 경로를 한 줄 더한다.
  - CC BY-SA 귀속 문단은 남긴다.
- **SECURITY**: 지원 버전(최신 출시본만. 0.1.0 전에는 `develop`을 대상으로 신고한다는 한 줄), 신고 방법(GitHub Security 탭의 'Report a vulnerability'), 응답 기대치. 앱이 에이전트 자격 증명을 다룬다는 점(ARCHITECTURE §7 'Agent authentication')을 범위 설명에 넣는다. 공개(G2)부터 신고 켜기(G3a)까지의 틈은 부모 D25가 G3a를 G2 직후 같은 자리에 두어 없앤다.
- **이슈 템플릿**: 버그(Doan 버전 — Settings > About의 Copy details 붙여 넣기, macOS 버전, 에이전트와 버전, 재현 절차), 기능 요청(문제, 제안, PRODUCT 범위와의 관계). Copy details에는 `doan` 명령 경로와 setup 경로(사용자 이름이 든 홈 경로)가 들어 있으므로(`app/src/main/about.ts:26`, `:28–33`) 필드 설명에 "paths may include your username; redact if you like"를 적는다. `config.yml`은 `blank_issues_enabled: false`이고 보안 신고를 SECURITY로 보낸다.
- **PR 템플릿**: 무엇을 왜, 대상 브랜치 `develop` 확인, verify 결과, 앱 동작 변경이면 확인한 내용.

## UI 문구

이 자식은 앱 UI를 바꾸지 않는다. 이슈 템플릿이 가리키는 'Copy details'는 이미 있는 About 기능이다(PRODUCT §5 항목 0 'About').
