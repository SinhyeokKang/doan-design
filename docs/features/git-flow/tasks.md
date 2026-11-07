# git-flow — tasks

하네스·문서 변경이라 `/ship`이 아니라 대화 중에 커밋한다. 커밋은 문서마다 나눈다(AGENTS.md 'Commit conventions'). T1 뒤의 커밋은 모두 `develop`에 간다.

- [ ] T0. 부모 P0(problem-project-overlay PR이 `main`에 병합)이 끝났고, 다른 `/orchestrate`·체인이 진행 중이지 않은지 확인한다.
  - 검증: `ls docs/features/problem-project-overlay` 결과 없음, `ls docs/features | grep '^chain-'` 결과 없음.
- [ ] T1. (부모 G1) `git pull`로 `main`을 최신으로 하고 `develop`을 만들어 push한다(사용자 승인). 이 체크아웃을 `develop`으로 옮긴다.
  - 검증: `git ls-remote --heads origin develop`이 한 줄을 내고, 그 SHA가 `git rev-parse origin/main`과 같다.
- [ ] T2. AGENTS.md 'Commit conventions'·'Workflow'(75, 109–111, 131–134행, 스킬 목록)를 design.md '바꿀 줄'대로 고친다.
  - 검증: `grep -n -E 'from main|--base main|origin/main|straight to main' AGENTS.md` 결과가 `/release` 설명 줄뿐이다. `grep -n 'hotfix/' AGENTS.md`가 브랜치 목록에서 나온다.

── commit: `docs(agents): integrate on develop and release main only through /release` ──

- [ ] T3. 스킬 아홉 개(ship, orchestrate, chain, feature, code-review, audit, design-draft, design-sync, tester-build)를 design.md '바꿀 줄'대로 고친다.
  - 검증: `grep -rn -E 'from main|--base main|origin/main|main\.\.\.HEAD|on main|to main|since main' .agents/skills` 결과가 `/ship`의 hotfix 예외 줄뿐이다.
- [ ] T4. `/verify`(`.agents/skills/verify/`)에 기준 브랜치 가정이 없는지 다시 확인한다.
  - 검증: `grep -rn -w main .agents/skills/verify` 결과에 브랜치를 뜻하는 줄이 없다.

── commit: `docs(skills): branch, merge and build from develop` ──

- [ ] T5. (사용자, 부모 G1) 기본 브랜치를 `develop`으로 바꾸고 열린 PR의 대상을 옮긴다. 이후 Orca `--worktree new-child`의 기본 원천을 확인해 AGENTS.md:111를 필요하면 고친다.
  - 검증: 명령 미정 — 사용자 확인 필요(`gh repo view --json defaultBranchRef`는 AGENTS.md 'Commands'에 없다).
- [ ] T6. 결론 승격: 브랜치 구조는 작업 방식이라 AGENTS.md가 정본이고, PRODUCT·ARCHITECTURE에는 적지 않는다. 부모 tasks.md의 C1·G1을 체크하고 이 디렉터리를 지운다.
  - 검증: `ls docs/features/git-flow` 결과 없음.

── commit: `docs(feature): remove git-flow after the branch switch` ──
