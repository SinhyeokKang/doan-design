# community-docs — spec

> 부모: [release-0-1-0](../release-0-1-0/tasks.md) (C3) · 선행: 없음(부모 P0과 병렬, 부모 '사용자 결정' 5) · 후행: [readme-features](../readme-features/spec.md)(C4, README가 CONTRIBUTING을 링크) → [git-flow](../git-flow/spec.md)(C1, CONTRIBUTING의 브랜치 문장을 대조) → 부모 G2(공개), G3a(비공개 취약점 신고 켜기)

공개 전에 필요한 공동체 문서를 만든다. 하네스·문서 변경이라 대화 중에 커밋한다. `develop`이 아직 없으므로 지금 규칙대로 `main`에 커밋한다. 내용은 git-flow 뒤의 `develop` 기준 흐름을 설명하고, git-flow가 그 흐름을 실제로 만들며 CONTRIBUTING과 대조한다(git-flow T5).

## 사용자

- **외부 기여자**: 어떻게 기여하는지(브랜치, 검사, 커밋 규칙, 에이전트 규칙), 행동 강령, 취약점 신고 방법을 읽는다. 이슈와 PR을 정해진 형식으로 연다.
- **메인테이너**: 신고를 비공개로 받고, PR이 `develop`을 향하는지 템플릿으로 확인한다.

## 문제

- `CONTRIBUTING`, `CODE_OF_CONDUCT`, `SECURITY`, 이슈·PR 템플릿이 없다(`.github/` 없음, `docs/`에 없음). AGENTS.md:126은 셋을 `docs/`에 "공개 직전에" 만든다고 정했다.
- 기여 규칙은 지금 AGENTS.md에만 있고, AGENTS.md는 에이전트를 위한 문서다(한국어 응답 규칙 등 이 저장소 메인테이너의 선호가 섞여 있다). `.claude/settings.json`의 `UserPromptSubmit` 훅은 clone한 사람의 Claude Code에도 한국어 응답 규칙을 매 턴 주입한다.
- `docs/features/`의 feature 문서는 정책상 한국어다(AGENTS.md 'Response style' 언어 정책). 외부 기여자는 진행 중인 계획을 읽기 어렵다.

## 완료 조건

- `docs/CONTRIBUTING.md`, `docs/CODE_OF_CONDUCT.md`, `docs/SECURITY.md`가 영어로 있고, GitHub 저장소 Insights > Community Standards가 셋을 인식한다(공개 뒤 G3a에서 확인).
- D17이 정한 템플릿 `.github/ISSUE_TEMPLATE/bug_report.yml`, `feature_request.yml`, `config.yml`(`blank_issues_enabled: false`), `.github/pull_request_template.md`가 있다.
- CONTRIBUTING이 다음 일곱 주제를 설명한다: 결정 원천(PRODUCT·ARCHITECTURE), `develop` 기준 브랜치 규칙, `node .agents/skills/verify/scripts/verify.mjs`, Conventional Commits, AGENTS.md의 위치와 역할, `docs/features/`가 한국어인 이유, `UserPromptSubmit` 훅과 끄는 방법(D30). 외부 기여자가 돌릴 수 없는 스킬(`/tester-build`, `/release`, `/agent-eval`, Orca 전제 스킬)을 밝힌다. CI는 아직 없다고 사실대로 적는다(CI 문장은 ci-gate가, `/release` 문장은 release-skill이 승격 때 더한다).
- CODE_OF_CONDUCT는 Contributor Covenant 3.0이고, 원문의 `[NOTE: …]` 자리표시자가 남지 않았으며, 집행 주체를 메인테이너 한 명으로 고쳤다. 신고 연락처는 메인테이너의 개인 이메일이다(D17).
- SECURITY가 GitHub 비공개 취약점 신고를 안내하고(D17), 지원 버전(최신 출시본만, 출시 전에는 `develop`)을 적는다.
- AGENTS.md 'Documents' 표에서 세 문서가 '나중에 만들 문서'에서 빠지고 행이 생겼다. DIRECTORY.md에 `.github/`가 있다.

## 비목표

- CODEOWNERS(D17), FUNDING, Discussions.
- AGENTS.md의 작업 방식 변경(git-flow가 한다). 훅 자체도 그대로 둔다(D30).
- 번역본.
