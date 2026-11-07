# community-docs — tasks

하네스·문서 변경이라 대화 중에 커밋한다. `develop`이 아직 없으므로 지금 규칙대로 `main`에 커밋하고 push한다(부모 '사용자 결정' 5). 문서마다 커밋을 나눈다. 부모 tasks.md는 체크하지 않는다(부모 '자식 진행 규칙' 1).

- [ ] T0. CoC 연락처로 공개할 개인 이메일(커밋 작성자 이메일)을 사용자에게 확인받는다(D17). 지금 체크아웃이 `main`이고 최신인지 확인한다.
  - 검증: `git rev-parse --abbrev-ref HEAD`가 `main`, `git fetch origin` 뒤 `git status -sb`가 behind가 아니다. 이메일은 사용자 답으로 확인한다.
- [ ] T1. `docs/CONTRIBUTING.md`를 design.md '문서별 내용'대로 쓴다.
  - 검증: `grep -n -E 'PRODUCT.md|ARCHITECTURE.md|develop|verify.mjs|Conventional Commits|AGENTS.md|docs/features|settings.local.json' docs/CONTRIBUTING.md`가 일곱 주제 모두에서 줄을 낸다.
- [ ] T2. `docs/CODE_OF_CONDUCT.md`(Contributor Covenant 3.0 + 연락처 + 메인테이너 한 명의 집행).
  - 검증: `grep -n '\[NOTE' docs/CODE_OF_CONDUCT.md` 결과 없음, `grep -n -E 'Community (Moderators|Managers)' docs/CODE_OF_CONDUCT.md` 결과 없음, `grep -n 'Contributor Covenant' docs/CODE_OF_CONDUCT.md`가 귀속 문단에서 나온다.
- [ ] T3. `docs/SECURITY.md`.
  - 검증: `grep -n -E 'Report a vulnerability|Supported versions|develop' docs/SECURITY.md`가 세 줄 이상을 낸다.
- [ ] T4. `.github/ISSUE_TEMPLATE/{bug_report.yml,feature_request.yml,config.yml}`, `.github/pull_request_template.md`.
  - 검증: `grep -n 'blank_issues_enabled: false' .github/ISSUE_TEMPLATE/config.yml`이 한 줄. push 뒤 github.com의 `/issues/new/choose`에 두 양식이 보이고 템플릿 오류가 없다(비공개 저장소에서도 양식을 검사한다, G2 전에 확인, 확인 명령 미정 — 사용자 확인 필요).

── commit: `docs(contributing): add contribution guide` / `docs(conduct): adopt Contributor Covenant 3.0` / `docs(security): add security policy` / `docs(github): add issue and PR templates` ──

- [ ] T5. AGENTS.md 'Documents' 표를 고친다.
  - 검증: `grep -n 'CONTRIBUTING' AGENTS.md`가 '나중에 만들 문서' 행이 아닌 자기 행에서 나온다.

── commit: `docs(agents): list the community documents` ──

- [ ] T6. `docs/DIRECTORY.md`에 `.github/`를 더한다.
  - 검증: `grep -n '\.github' docs/DIRECTORY.md`가 한 줄을 낸다.

── commit: `docs(directory): add .github` ──

- [ ] T7. 이 디렉터리를 지운다. PRODUCT·ARCHITECTURE 변경 없음.
  - 검증: `git fetch origin` 뒤 `git ls-tree origin/main docs/features/community-docs` 결과 없음.

── commit: `docs(feature): remove community-docs` ──
