# release-0-1-0 — tasks (부모)

부모의 task는 결정을 모으고, 자식 feature를 순서대로 끝내고, 사용자가 하는 GitHub 조작과 0.1.0 출시를 거쳐, 마지막에 정리하는 것이다. 각 자식의 구현 task는 그 자식의 `tasks.md`에 있다. 부모는 `/ship`이나 `/orchestrate`로 진행하지 않는다. 이 문서의 수정은 하네스·문서 변경 경로로 대화 중에 커밋한다. git-flow 전에는 지금 규칙(AGENTS.md 'Commit conventions', `main`), 뒤에는 `develop`이다([design.md](./design.md) '사용자 결정' 1).

자식 하나를 시작하고 끝내는 절차는 [design.md](./design.md)의 '자식 진행 규칙'을 따른다. 부모의 체크박스는 다음 자식을 시작할 때 그 규칙 1로만 체크한다.

## 실행 순서

첫 전제는 problem-project-overlay의 병합이다('사용자 결정' 3). 다만 community-docs(C3)와 readme-features(C4)는 브랜치 규칙을 바꾸지 않는 문서 작업이라 P0과 나란히 지금 진행한다(사용자, 2026-11-07). C4는 README가 `docs/CONTRIBUTING.md`를 링크하므로 C3 뒤에 한다. 공개 위치는 D21 결론(공개를 CI·릴리스 작업 앞에 둔다)이다. 공개 뒤 설정은 D25대로 G3a·G3b·G3c로 나눈다.

```
P0 problem-project-overlay PR이 main에 병합 (지금의 main 기준 절차)
C3 community-docs ─ C4 readme-features   (P0과 병렬, main에 커밋)
  └─ (P0, C4 뒤) C1 git-flow (G1: develop 생성)
        └─ C2 public-cleanup ─ G2 공개 ─ G3a 신고·환경·비밀
              └─ C5 ci-gate ─ G3b develop 보호 ─ C6 release-ci ─┬─ C7 app-update ───┐
                                                              └─ C8 release-skill ─ G3c main 보호 ┴─ R1 rc 검증(/release) ─ R2 0.1.0(/release) ─ Z1
```

의존을 한 줄로: `{P0 ∥ (C3 → C4)} → C1(+G1) → C2 → G2 → G3a → C5 → G3b → C6 → {C7 ∥ (C8 → G3c)} → R1 → R2 → Z1`.

- **C3·C4를 git-flow 앞에**: 둘 다 `main`에 지금 규칙으로 커밋한다(`develop`이 아직 없다). 내용은 `develop` 기준 흐름을 설명하고, C1이 그 흐름을 실제로 만든다. C1의 검증이 CONTRIBUTING의 브랜치 문장과 C1이 내놓는 규칙이 같은지 본다.
- **C2는 C1 뒤**: C2는 `/orchestrate`로 `develop`에 병합한다(D27).
- **직렬 C5 → C6**: C6은 C5의 워크플로(`workflow_call`)와 Node 고정을 재사용한다. C6의 서명 작업은 G3a의 환경·비밀이 있어야 돈다.
- **C6 → C7**: C7은 C6이 바꾸는 `app/package.json`(`build.mac.target`, `publish`)에 런타임 의존성을 더하므로 같은 파일이 겹친다(`/chain`의 겹침 기준). C7의 `/feature-review`·`/design-draft`는 C6과 함께 진행해도 되고, 구현만 C6 병합 뒤에 시작한다.
- **C6 → C8, C7 ∥ C8**: C8의 스킬은 C6의 릴리스 워크플로와 검증 스크립트 이름을 부른다(release-ci design '/release와의 계약'). C8은 `.agents/skills/release/`·`.claude/skills/release`·`.agents/skills/ship/`·AGENTS.md만 바꾸므로 C7과 겹치지 않는다(공유 문서는 겹침으로 세지 않는다).
- C1 뒤의 자식은 모두 `develop`에 병합한다. `main`은 R1·R2의 `/release`만 바꾼다.

## P. 전제와 결정

- [ ] P0. 진행 중인 problem-project-overlay `/orchestrate` 실행이 지금의 main 기준 절차로 PR을 `main`에 병합할 때까지 기다린다. C1과 그 뒤의 자식은 그 전에 브랜치 규칙을 바꾸지 않는다.
  - 검증: `git fetch origin` 뒤 `git ls-tree origin/main docs/features/problem-project-overlay` 결과 없음, 그리고 `gh pr list --state merged --head feat/problem-project-overlay`에 병합된 PR이 하나 있다(`gh pr list`는 AGENTS.md 'Commands'에 없다 — 확인 명령 미정, 사용자 확인 필요).
- [x] P1. [design.md](./design.md) '결정'의 D1–D30을 사용자가 정했다(2026-11-07, `/feature-review` 포함). 자식 문서를 결론에 맞췄다.
  - 검증: `grep -c '^### D.*결론(사용자' docs/features/release-0-1-0/design.md`가 30.

── commit: `docs(feature): release-0-1-0 apply review feedback` ──

## C. 자식 feature (실행 순서)

- [x] C3. `community-docs`(d9d909ae에서 지움) — 하네스·문서, 대화 중, `main`에 커밋. 선행: 없음(P0과 병렬). 후행: C4.
  - 검증: `git fetch origin` 뒤 `git ls-tree origin/main docs/features/community-docs` 결과 없음, `ls docs/CONTRIBUTING.md docs/CODE_OF_CONDUCT.md docs/SECURITY.md`가 세 파일을 낸다.
- [x] C4. `readme-features`(bf670e2e에서 지움) — 하네스·문서, 대화 중, `main`에 커밋. 선행: C3. 다운로드 링크와 릴리스 배지는 R2에서 채운다.
  - 검증: `git fetch origin` 뒤 `git ls-tree origin/main docs/features/readme-features` 결과 없음, `find docs/assets/readme -type f -size +500k` 결과 없음.
- [x] C1. `git-flow`(913bb2eb에서 지움) — 하네스·문서, 대화 중. 선행: P0, C4. 후행: 나머지 전부.
  - 검증: `git fetch origin` 뒤 `git ls-tree origin/develop docs/features/git-flow` 결과 없음, `git ls-remote --heads origin develop`이 한 줄.
- [x] G1. `develop`을 `main`(1d09a76a)에서 만들어 push했다. 기본 브랜치는 D2대로 `main`을 유지한다.
  - 검증: `git ls-remote --heads origin develop`이 한 줄을 낸다.
- [ ] C2. [`public-cleanup`](../public-cleanup/tasks.md) — `/orchestrate`(D27). 선행: C1.
  - 검증: `develop`을 향한 `feat/public-cleanup` PR이 병합됐고(확인 명령 미정 — 사용자 확인 필요), `git ls-tree origin/develop docs/features/public-cleanup` 결과 없음.

## G. 공개 (사용자만 한다)

- [ ] G2. (사용자) 저장소를 공개한다. 선행: C2가 `develop`에 병합, C3·C4가 `main`과 `develop`에 있음, D18(위치)·D19(이력·브랜치) 적용 완료. 이때 `main`은 P0 병합 뒤 C3·C4까지의 상태다(D21에 적은 노출).
  - 공개 직전: public-cleanup T1과 같은 명령으로 모든 ref(`refs/pull/*` 포함)를 다시 스캔하고 결과를 이 줄 아래에 적는다(C2 PR 본문의 결과와 함께). D19대로 병합된 원격 브랜치와 worker 브랜치를 지운다(사용자 승인 아래 에이전트가 목록을 만들어 지울 수 있다). `git rev-list --count origin/develop..origin/main`이 0인지 본다(C1 뒤 `main`에 직접 들어간 커밋이 없다).
  - 검증: `gh repo view --json visibility`가 `PUBLIC`(확인 명령 미정 — 사용자 확인 필요).
- [ ] G3a. (사용자, G2 직후 같은 자리) D25: 비공개 취약점 신고를 켜고, D6의 환경 `release`(필수 검토자 = 사용자, 배포 ref `v*` 태그·`develop`)와 비밀을 등록한다. 비밀 이름과 등록 절차는 release-ci design '비밀과 권한'에 있다.
  - 검증: 확인 명령 미정 — 사용자 확인 필요(`gh api repos/SinhyeokKang/doan-design/environments/release`가 환경을 돌려주는지 본다).
- [ ] G3b. (사용자, C5 뒤) D25: `develop` 보호. 필수 검사 = ci-gate의 작업 id `gate`, 관리자 우회 허용.
  - 검증: 확인 명령 미정 — 사용자 확인 필요(`gh api repos/SinhyeokKang/doan-design/branches/develop/protection`).
- [ ] G3c. (사용자, C8 뒤, R1 전) D25: `main` 보호. PR 필수, 승인 0, 필수 검사 `gate`, 최신화 요구 끔, force push·삭제 금지.
  - 검증: 확인 명령 미정 — 사용자 확인 필요(`gh api repos/SinhyeokKang/doan-design/branches/main/protection`).

## C (계속)

- [ ] C5. [`ci-gate`](../ci-gate/tasks.md) — `/ship`. 선행: G2(D21). 후행: G3b, C6.
  - 검증: `develop`을 향한 `chore/ci-gate` PR이 병합됐고(확인 명령 미정 — 사용자 확인 필요), `git ls-tree origin/develop docs/features/ci-gate` 결과 없음.
- [ ] C6. [`release-ci`](../release-ci/tasks.md) — `/ship`. 선행: C5, G3a(환경·비밀).
  - 검증: `develop`을 향한 `chore/release-ci` PR이 병합됐고(확인 명령 미정 — 사용자 확인 필요), `git ls-tree origin/develop docs/features/release-ci` 결과 없음.
- [ ] C7. [`app-update`](../app-update/tasks.md) — `/orchestrate`. 선행: C6(구현). 문서·초안 단계는 C6과 병렬. C8과 병렬.
  - 검증: `develop`을 향한 `feat/app-update` PR이 병합됐고(확인 명령 미정 — 사용자 확인 필요), `git ls-tree origin/develop docs/features/app-update` 결과 없음.
- [ ] C8. [`release-skill`](../release-skill/tasks.md) — 하네스·문서, 대화 중. 선행: C6. C7과 병렬. 후행: G3c.
  - 검증: `git ls-tree origin/develop docs/features/release-skill` 결과 없음, `ls -l .claude/skills/release`가 `../../.agents/skills/release`를 가리킨다.

## R. 0.1.0 출시 (사용자가 `/release`를 부른다)

- [ ] R1. D12대로 업데이트 경로를 확인한다. 이것이 app-update의 실제 업데이트 PoC다. 선행: C7, C8, G3c.
  - 사용자가 `/release`를 `0.1.0-rc.1`, `0.1.0-rc.2`로 차례로 부르고, 설치한 rc.1이 rc.2를 알리고 설치하는지 본다.
  - 실패하면 `develop`에서 고친 뒤 rc.3으로 다시 본다(태그는 옮기거나 지우지 않는다).
  - 결과(성공 조건, 실패와 고친 것)를 DESIGN.md(업데이트 표면 측정값 옆)와 BACKLOG.md(남은 미확인)에 적는다. app-update와 release-skill 문서는 이미 지워진 뒤다. hotfix 모드는 여기서 돌려 보지 않으므로 BACKLOG의 미확인 항목으로 남는다(release-skill T4).
  - 검증: 확인 명령 미정 — 사용자 확인 필요. 실제 앱에서 설치한 rc.1의 Settings > About 버전이 업데이트 뒤 rc.2(또는 rc.3)로 바뀌고, `readlink ~/.local/share/doan/current`가 새 번들의 `Resources`를 가리킨다.
- [ ] R2. 사용자가 `/release`를 `0.1.0`으로 부른다. 스킬이 끝나면 `develop`에서 README의 상태 줄을 "pre-release"에서 출시 상태로 바꾸고, 다운로드 링크(`releases/latest/download/…`)와 릴리스 배지를 넣고, 업데이트 문단(app-update가 정한 문장)을 Install 절에 넣는다. 이 커밋은 다음 `/release` 때 `main`에 들어간다.
  - 검증: release-ci의 검증 스크립트가 Release에서 받은 dmg와 zip을 통과시킨다(`source=Notarized Developer ID`). `git ls-remote --tags origin v0.1.0`이 한 줄을 낸다. `grep -n -i 'pre-release' README.md` 결과 없음.

── commit: `docs(readme): link the 0.1.0 download` ──

## Z. 부모 정리

- [ ] Z1. 모든 자식이 끝났는지, 자식 결론이 PRODUCT·ARCHITECTURE·BACKLOG에 현재 규칙으로 있는지, BACKLOG의 'Release packaging'(docs/BACKLOG.md:7)과 고지 파일 항목(docs/BACKLOG.md:17)이 지워졌는지, ARCHITECTURE §9의 "CI and its secrets come with release packaging" 문장이 현재 규칙으로 바뀌었는지 확인하고 이 디렉터리를 지운다.
  - 검증:
    - `grep -n 'Release packaging' docs/BACKLOG.md` 결과 없음
    - `grep -n 'preset notices in a readable form' docs/BACKLOG.md` 결과 없음
    - `grep -n 'come with release packaging' docs/ARCHITECTURE.md` 결과 없음
    - `ls docs/features/`에 `git-flow`·`public-cleanup`·`community-docs`·`readme-features`·`ci-gate`·`release-ci`·`app-update`·`release-skill`·`release-0-1-0`이 없음

── commit: `docs(feature): remove release-0-1-0 after 0.1.0` ──
