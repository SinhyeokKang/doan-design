# release-skill — tasks

하네스 변경이라 대화 중에 `develop`에 커밋한다. 스킬 링크는 기존 스킬과 같은 형태로 만든다(`ls -la .claude/skills`의 `agent-eval -> ../../.agents/skills/agent-eval`).

- [ ] T0. release-ci가 `develop`에 병합됐고 PoC 결과(태그 생성 시점, 워크플로·검증 스크립트 이름)가 확정됐는지, 부모 P1에서 D1·D7·D12·D13이 닫혔는지 확인한다.
  - 검증: 부모 tasks.md의 C6이 체크돼 있다.
- [ ] T1. `.agents/skills/release/SKILL.md`를 design.md '절차'·'hotfix 모드'·'One-time setup'·'금지'대로 쓰고 `.claude/skills/release` 링크를 만든다.
  - 검증: `readlink .claude/skills/release`가 `../../.agents/skills/release`. `head -4 .agents/skills/release/SKILL.md`에 `name: release`와 description이 있다.

── commit: `docs(skills): add the release skill` ──

- [ ] T2. AGENTS.md 'Workflow'에 `/release`(사용자만 부른다, `main`을 바꾸는 유일한 길), 'Commands'에 스킬이 쓰는 `gh` 명령, 'Documents' 표의 OPERATIONS 행 수정(D22).
  - 검증: `grep -n '/release' AGENTS.md`가 'Workflow'와 'Commit conventions' 두 곳에서 나온다.

── commit: `docs(agents): add /release to the workflow` ──

- [ ] T3. 실행 검증은 부모 R1(rc 두 번)이 한다. R1에서 스킬 문서가 실제와 다르면 이 자식이 끝난 뒤라도 하네스 변경으로 고친다.
  - 검증: 부모 R1의 보고에 스킬 단계 1–8이 모두 있다. hotfix 모드는 0.1.0 전에 실제로 돌리지 않는다(첫 hotfix 때 확인, 그 전까지 BACKLOG의 '실제로 확인하지 못한 것'에 남긴다).
- [ ] T4. 결론 승격: 스킬은 작업 방식이라 AGENTS.md와 스킬이 정본이다. ARCHITECTURE §9에 "릴리스는 `/release`가 release-ci 워크플로로 만든다"는 한 줄만 둔다. 부모 tasks.md의 C8을 체크하고 이 디렉터리를 지운다.
  - 검증: `ls docs/features/release-skill` 결과 없음.

── commit: `docs(architecture): note how releases are cut` / `docs(feature): remove release-skill` ──
