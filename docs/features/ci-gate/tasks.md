# ci-gate — tasks

`/ship`으로 진행한다. 분기는 `develop`에서 `chore/ci-gate`(git-flow 규칙). 커밋 타입은 브랜치 타입과 같은 `chore`다(AGENTS.md 'Branch names'). 부모 tasks.md는 체크하지 않는다(부모 '자식 진행 규칙' 1).

- [ ] T0. 부모 G2(공개)와 G3a가 끝났는지 확인한다.
  - 검증: 부모 tasks.md의 G2·G3a가 체크돼 있다.
- [ ] T1. 루트 `.node-version`(26.4.0)을 더하고 로컬 `/verify`가 같은 버전에서 통과하는지 확인한다.
  - 검증: `test "$(node --version)" = "v$(cat .node-version)"`, `node .agents/skills/verify/scripts/verify.mjs` 통과.

── commit: `chore: pin the Node version` ──

- [ ] T2. PoC: design.md의 골격으로 워크플로를 만들고, 사용자 승인 아래 `develop`을 향한 draft PR을 열어 한 번 돌린다. 통과 여부와 시간을 기록한다. 실패하면 design.md 'PoC'대로 멈춘다.
  - 검증: `gh pr checks <PR 번호>`에서 `gate`가 pass(T4에서 이 명령을 AGENTS.md 'Commands'에 더하기 전까지는 확인 명령 미정 — 사용자 확인 필요). 시간은 실행 로그에서 읽는다.
- [ ] T3. 워크플로를 확정한다(액션 SHA 고정, `permissions`, `concurrency`, `timeout-minutes`, `workflow_call`). 실패 확인은 별도 임시 브랜치에서 `develop`을 향한 draft PR을 열어 일부러 깨뜨린 커밋(예: 타입 오류)으로 한 번 보고, 그 PR은 병합하지 않고 닫는다.
  - 검증:
    - `gh pr checks`에서 이 PR의 `gate`가 pass, 임시 PR의 `gate`가 fail이고 실행 로그에 실패한 단계의 출력이 있다.
    - `grep -n -E 'secrets\.|pull_request_target' .github/workflows/ci.yml` 결과 없음.
    - `grep -n 'contents: read' .github/workflows/ci.yml`이 한 줄.
    - `grep -n 'name:' .github/workflows/ci.yml`이 워크플로 이름 줄과 단계 이름 줄뿐이고 `gate` 작업에는 없다.

── commit: `chore(ci): run the shared gate on pull requests and pushes` (메시지에 T2에서 잰 시간을 적는다) ──

- [ ] T4. AGENTS.md 'Commands'에 CI가 같은 게이트를 돈다는 줄과 `gh pr checks <n>`을 더한다. `/verify` 스킬이 CI를 언급해야 하는지 확인한다(하네스 변경, 같은 PR).
  - 검증: `grep -n 'gh pr checks' AGENTS.md`가 'Commands'에서 나온다.

── commit: `docs(agents): note the CI gate` ──

- [ ] T5. CONTRIBUTING의 Checks 절에 CI와 "포크 PR은 첫 실행에 메인테이너 승인이 필요할 수 있다"를 더한다.
  - 검증: `grep -n -E 'CI|approve' docs/CONTRIBUTING.md`가 Checks 절에서 나온다.

── commit: `docs(contributing): describe the CI gate` ──

- [ ] T6. 결론 승격: ARCHITECTURE §9(또는 새 하위 절)에 CI의 범위(게이트만, 러너, 트리거, 비밀 없음, 필수 검사 `gate`, 잰 시간)와 Node 버전의 위치(`.node-version`)를 현재 규칙으로 적는다. DIRECTORY.md의 `.github/` 줄에 `workflows/`를 더한다. G3b에 넘길 값(필수 검사 `gate`)은 부모 D25에 이미 있다. 이 디렉터리를 지운다.
  - 검증: `grep -n -E 'workflows|\.node-version' docs/ARCHITECTURE.md`가 줄을 내고, `grep -n 'workflows' docs/DIRECTORY.md`가 한 줄. `ls docs/features/ci-gate` 결과 없음.

── commit: `docs(ARCHITECTURE): describe the CI gate` / `docs(directory): note .github/workflows` / `docs(feature): remove ci-gate` ──
