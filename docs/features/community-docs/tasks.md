# community-docs — tasks

하네스·문서 변경이라 대화 중에 지금 브랜치(git-flow 뒤에는 `develop`)에 커밋한다. 문서마다 커밋을 나눈다.

- [ ] T0. git-flow가 끝났는지 확인하고, CoC 연락처로 공개할 개인 이메일(커밋 작성자 이메일)을 사용자에게 확인받는다(D17).
  - 검증: 부모 tasks.md의 C1이 체크돼 있다.
- [ ] T1. `docs/CONTRIBUTING.md`를 design.md '문서별 내용'대로 쓴다.
  - 검증: `grep -n -E 'develop|verify.mjs|AGENTS.md|docs/features' docs/CONTRIBUTING.md`가 네 주제 모두에서 줄을 낸다.
- [ ] T2. `docs/CODE_OF_CONDUCT.md`(Contributor Covenant 3.0 + 연락처).
  - 검증: 연락처 자리표시자가 남지 않았다(`grep -n -i 'insert\|\[contact' docs/CODE_OF_CONDUCT.md` 결과 없음).
- [ ] T3. `docs/SECURITY.md`.
  - 검증: 'Report a vulnerability' 안내와 지원 버전 줄이 있다.
- [ ] T4. `.github/ISSUE_TEMPLATE/{bug_report.yml,feature_request.yml,config.yml}`, `.github/pull_request_template.md`.
  - 검증: 명령 미정 — 사용자 확인 필요(YAML 이슈 양식 검사 명령이 AGENTS.md 'Commands'에 없다). 공개 뒤 G3에서 새 이슈 화면에 두 양식이 보이는지 사람이 확인한다.

── commit: `docs(contributing): add contribution guide` / `docs(conduct): adopt Contributor Covenant 3.0` / `docs(security): add security policy` / `docs(github): add issue and PR templates` ──

- [ ] T5. AGENTS.md 'Documents' 표와 `docs/DIRECTORY.md`(`.github/`)를 고친다.
  - 검증: `grep -n 'CONTRIBUTING' AGENTS.md`가 '나중에 만들 문서' 행이 아닌 자기 행에서 나온다. `grep -n '.github' docs/DIRECTORY.md`가 한 줄을 낸다.
- [ ] T6. 부모 tasks.md의 C3을 체크하고 이 디렉터리를 지운다. PRODUCT·ARCHITECTURE 변경 없음.
  - 검증: `ls docs/features/community-docs` 결과 없음.

── commit: `docs(agents): list the community documents` / `docs(feature): remove community-docs` ──
