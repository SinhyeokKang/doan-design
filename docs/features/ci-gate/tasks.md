# ci-gate — tasks

`/ship`으로 진행한다. 분기는 `develop`에서 `chore/ci-gate`(git-flow 규칙).

- [ ] T0. 부모 G2(공개)가 끝났고 D4·D5가 닫혔는지 확인한다.
  - 검증: 부모 tasks.md의 G2가 체크돼 있다.
- [ ] T1. PoC: design.md의 골격으로 워크플로를 만들고 PR 브랜치에서 한 번 돌려 통과 여부와 시간을 기록한다.
  - 검증: 명령 미정 — 사용자 확인 필요(`gh run watch`·`gh run view` 계열은 AGENTS.md 'Commands'에 없다). 결과를 이 문서에 적는다.
- [ ] T2. Node 버전 고정 파일을 더하고, 로컬 `/verify`가 같은 버전에서 통과하는지 확인한다.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs` 통과(고정한 버전의 Node로).

── commit: `chore: pin the Node version` ──

- [ ] T3. 워크플로를 확정한다(액션 SHA 고정, 실패 로그 산출물, `permissions`, `concurrency`).
  - 검증: PR의 게이트 작업이 통과한다(T1과 같은 명령 미정). 일부러 깨뜨린 커밋(예: 타입 오류)에서 실패하고 산출물이 남는 것을 한 번 확인한 뒤 그 커밋을 되돌린다.

── commit: `ci: run the shared gate on pull requests and pushes` ──

- [ ] T4. AGENTS.md 'Commands'에 CI가 같은 게이트를 돈다는 줄과 실패 로그 위치를 더한다. `/verify` 스킬이 CI를 언급해야 하는지 확인한다(하네스 변경, 같은 PR).
  - 검증: `grep -n 'CI' AGENTS.md`가 'Commands'에서 나온다.

── commit: `docs(agents): note the CI gate` ──

- [ ] T5. 결론 승격: ARCHITECTURE §9(또는 새 하위 절)에 CI의 범위(게이트만, 러너, 트리거, 비밀 없음)를 현재 규칙으로 적고, DIRECTORY.md에 `.github/workflows`를 적는다. G3에 넘길 필수 검사 이름을 부모 tasks.md G3에 적는다. 이 디렉터리를 지운다.
  - 검증: `grep -n 'workflows' docs/ARCHITECTURE.md docs/DIRECTORY.md`가 두 파일에서 줄을 낸다. `ls docs/features/ci-gate` 결과 없음.

── commit: `docs(architecture): describe the CI gate` / `docs(feature): remove ci-gate` ──
