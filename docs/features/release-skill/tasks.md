# release-skill — tasks

하네스 변경이라 대화 중에 `develop`에 커밋한다. 스킬 링크는 기존 스킬과 같은 형태로 만든다(`ls -la .claude/skills`의 `agent-eval -> ../../.agents/skills/agent-eval`). 부모 tasks.md는 체크하지 않는다(부모 '자식 진행 규칙' 1).

- [ ] T0. release-ci가 `develop`에 병합됐고, release-ci design '/release와의 계약'의 이름(워크플로 파일, 스크립트 경로)이 실제로 있으며, 그 PoC 답이 ARCHITECTURE §9에 올라갔는지 확인한다. 'One-time setup' 절이 채워졌는지 본다.
  - 검증: `git fetch origin` 뒤 `git ls-tree origin/develop docs/features/release-ci` 결과 없음, `ls .github/workflows/release.yml .github/workflows/test-build.yml`과 계약 표의 스크립트 두 개가 있다, `grep -n 'MAC_CERT_P12_BASE64' docs/features/release-skill/design.md`가 한 줄 이상.
- [ ] T1. `.agents/skills/release/SKILL.md`를 design.md '출시 모드'·'hotfix 모드'·'재개와 중단'·'One-time setup'·'금지'대로 쓰고 `.claude/skills/release` 링크를 만든다. Claude Code 문서로 `disable-model-invocation`을 확인해 frontmatter에 넣는다.
  - 검증: `readlink .claude/skills/release`가 `../../.agents/skills/release`. `head -5 .agents/skills/release/SKILL.md`에 `name: release`, description, `disable-model-invocation: true`가 있다(문서로 확인한 경우). `grep -n -E '재개|Resume' .agents/skills/release/SKILL.md`가 표 머리에서 나온다.

── commit: `docs(skills): add the release skill` ──

- [ ] T2. AGENTS.md: 'Workflow'에 `/release` 줄, 'Commit conventions'에 병합 예외와 `/ship` hotfix 예외, 'Commands'에 `gh pr create`·`gh pr merge`·`gh release view`·`gh release download`·`gh release edit`·`gh release delete`, 'Documents' 표의 OPERATIONS 행 수정(D22). `.agents/skills/ship/SKILL.md`에 hotfix 예외.
  - 검증: `grep -n 'release packaging' AGENTS.md` 결과 없음, `grep -n 'gh release edit' AGENTS.md`가 한 줄, `grep -n 'hotfix/' .agents/skills/ship/SKILL.md`가 한 줄 이상, `grep -n '/release' AGENTS.md`가 'Workflow'와 'Commit conventions'에서 나온다.

── commit: `docs(agents): add /release to the workflow` / `docs(skills): let /ship open hotfix PRs against main` ──

- [ ] T3. CONTRIBUTING의 Branches 절에 출시는 메인테이너의 `/release`로만 간다는 문장을 맞춘다.
  - 검증: `grep -n '/release' docs/CONTRIBUTING.md`가 Branches 절에서 나온다.

── commit: `docs(contributing): describe releases` ──

- [ ] T4. 결론 승격: 스킬은 작업 방식이라 AGENTS.md와 스킬이 정본이다. ARCHITECTURE §9에 "릴리스는 `/release`가 `main`에 태그를 push하고 release-ci 워크플로가 만든다"는 한 줄을 둔다. BACKLOG 'Undecided'에 "hotfix 모드는 아직 실제로 돌려 보지 않았다(첫 hotfix 때 확인)"를 더한다. G3c에 넘길 값(부모 D25)이 스킬의 4단계와 맞는지 확인한다. 이 디렉터리를 지운다. 실제 실행 검증은 부모 R1이다.
  - 검증: `grep -n '/release' docs/ARCHITECTURE.md`가 §9에서 나온다. `grep -n -i 'hotfix' docs/BACKLOG.md`가 한 줄. `ls docs/features/release-skill` 결과 없음.

── commit: `docs(ARCHITECTURE): note how releases are cut` / `docs(BACKLOG): hotfix mode not yet run` / `docs(feature): remove release-skill` ──
