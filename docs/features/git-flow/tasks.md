# git-flow — tasks

하네스·문서 변경이라 `/ship`이 아니라 대화 중에 커밋한다. 커밋은 문서마다 나눈다(AGENTS.md 'Commit conventions'). T1 뒤의 커밋은 모두 `develop`에 간다. 부모 tasks.md는 체크하지 않는다(부모 '자식 진행 규칙' 1).

- [ ] T0. 부모 P0(problem-project-overlay PR이 `main`에 병합)과 C4(readme-features)가 끝났고, 다른 `/orchestrate`·체인이 진행 중이지 않은지 확인한다.
  - 검증: `git fetch origin` 뒤 `git ls-tree origin/main docs/features/problem-project-overlay docs/features/readme-features` 결과 없음, `git ls-tree origin/main docs/features | grep chain-` 결과 없음, `git worktree list`에 이 저장소의 진행 중 worktree가 없음. `gh pr list --state open --base main` 결과 없음(확인 명령 미정 — 사용자 확인 필요).
- [ ] T1. (부모 G1) `main`을 최신으로 하고 `develop`을 만들어 push한다(사용자 승인). 바로 이어 사용자가 기본 브랜치를 `develop`으로 바꾸고 열린 PR의 대상을 옮긴다. 이 체크아웃에서 `git remote set-head origin --auto`를 하고 `develop`으로 옮긴다.
  - 검증: `git ls-remote --heads origin develop`이 한 줄을 내고 그 SHA가 `git rev-parse origin/main`과 같다. `git symbolic-ref refs/remotes/origin/HEAD`가 `refs/remotes/origin/develop`. 기본 브랜치는 확인 명령 미정 — 사용자 확인 필요(`gh repo view --json defaultBranchRef`).
- [ ] T2. AGENTS.md(75, 105, 106, 109–111, 131–134행)를 design.md '바꿀 줄'대로 고친다.
  - 검증: `git grep -n -w main AGENTS.md`의 결과가 design.md '허용 목록'의 AGENTS.md 줄뿐이다. `grep -n 'hotfix/' AGENTS.md`가 브랜치 목록에서 나온다. 현재 규칙 문서에 옛 기준이 없다: `git grep -n -E '\b(on|to|from|into) main\b' -- README.md docs ':!docs/features' ':!docs/POSTMORTEM.md' ':!docs/USABILITY-EVAL.md'` 결과 없음.

── commit: `docs(agents): integrate on develop and release main only through releases` ──

- [ ] T3. 스킬 아홉 개(ship, orchestrate, chain, feature, code-review, audit, design-draft, design-sync, tester-build)를 design.md '바꿀 줄'대로 고친다.
  - 검증: `git grep -n -w main .agents/skills`의 결과가 design.md '허용 목록'의 스킬 줄뿐이다. `grep -n 'base-branch' .agents/skills/chain/SKILL.md`가 `origin/develop`을 명시한 두 줄을 낸다.
- [ ] T4. `/verify`(`.agents/skills/verify/`)에 기준 브랜치 가정이 없는지 다시 확인한다.
  - 검증: `git grep -n -w main .agents/skills/verify`의 결과가 `verify.mjs`의 `main()` 함수 줄뿐이다.

── commit: `docs(skills): branch, merge and build from develop` ──

- [ ] T5. `docs/CONTRIBUTING.md`(community-docs가 먼저 `main`에 쓴 것)의 브랜치 문장이 T2에서 AGENTS.md에 쓴 규칙과 같은지 대조하고, 다르면 CONTRIBUTING을 고친다.
  - 검증: `grep -n -E 'develop|hotfix|release' docs/CONTRIBUTING.md`의 줄을 AGENTS.md 'Commit conventions'의 'Branches'와 나란히 놓고 사람이 확인한다(확인 명령 미정 — 사용자 확인 필요).

── commit(고칠 때만): `docs(contributing): match the develop branch rules` ──

- [ ] T6. 결론 승격: 브랜치 구조는 작업 방식이라 AGENTS.md가 정본이고, PRODUCT·ARCHITECTURE에는 적지 않는다. 이 디렉터리를 지운다.
  - 검증: `ls docs/features/git-flow` 결과 없음.

── commit: `docs(feature): remove git-flow after the branch switch` ──
