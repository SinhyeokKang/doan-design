# release-0-1-0 — tasks (부모)

부모의 task는 결정을 모으고, 자식 feature를 순서대로 끝내고, 사용자가 하는 GitHub 조작과 0.1.0 출시를 거쳐, 마지막에 정리하는 것이다. 각 자식의 구현 task는 그 자식의 `tasks.md`에 있다. 부모는 `/ship`이나 `/orchestrate`로 진행하지 않는다. 이 문서의 수정은 하네스·문서 변경 경로로 대화 중에 커밋한다. git-flow 전에는 지금 규칙(AGENTS.md 'Commit conventions'), 뒤에는 `develop`이다([design.md](./design.md) '사용자 결정' 1).

자식 하나를 시작하고 끝내는 절차는 [design.md](./design.md)의 '자식 진행 규칙'을 따른다.

## 실행 순서

첫 전제는 problem-project-overlay의 병합이다('사용자 결정' 3). 공개 위치는 D21 결론(공개를 CI·릴리스 작업 앞에 둔다)이다.

```
P0 problem-project-overlay PR이 main에 병합 (지금의 main 기준 절차)
P1 D 결정
  └─ C1 git-flow  (G1: develop 생성, 기본 브랜치)
        ├─ C2 public-cleanup ─┐
        ├─ C3 community-docs ─┼─ G2 공개 ─ G3 보호·환경·비밀·신고
        └─ C4 readme-features ┘                 └─ C5 ci-gate ─ C6 release-ci ─┬─ C7 app-update ─┐
                                                                                └─ C8 release-skill ┴─ R1 rc 검증(/release) ─ R2 0.1.0(/release) ─ Z1
```

의존을 한 줄로: `P0 → P1 → C1(+G1) → {C2 ∥ C3 ∥ C4} → G2 → G3 → C5 → C6 → {C7 ∥ C8} → R1 → R2 → Z1`.

- **병렬 C2·C3·C4**: 겹치는 파일이 없다(C2는 `app/`·`cli/`·`eval/` 주석과 초안, C3은 `docs/`의 새 문서와 `.github/` 템플릿, C4는 README와 이미지 자산).
- **직렬 C5 → C6**: C6은 C5의 워크플로와 Node 고정을 재사용한다.
- **C6 → C7**: C7은 C6이 바꾸는 `app/package.json`(`build.mac.target`, `publish`)에 런타임 의존성을 더하므로 같은 파일이 겹친다(`/chain`의 겹침 기준). C7의 `/feature-review`·`/design-draft`는 C6과 함께 진행해도 되고, 구현만 C6 병합 뒤에 시작한다.
- **C6 → C8, C7 ∥ C8**: C8의 스킬은 C6의 릴리스 워크플로와 검증 스크립트 이름을 부른다. C8은 `.agents/skills/release/`·`.claude/skills/release`·AGENTS.md만 바꾸므로 C7과 겹치지 않는다(공유 문서는 겹침으로 세지 않는다).
- 모든 자식의 병합 대상은 `develop`이다. `main`은 R1·R2의 `/release`만 바꾼다.

## P. 전제와 결정

- [ ] P0. 진행 중인 problem-project-overlay `/orchestrate` 실행이 지금의 main 기준 절차로 PR을 `main`에 병합할 때까지 기다린다. 이 부모의 어떤 자식도 그 전에 브랜치 규칙을 바꾸지 않는다.
  - 검증: `ls docs/features/problem-project-overlay` 결과 없음, 그리고 `gh pr list --state merged --search problem-project-overlay`에 병합된 PR이 있다(`gh pr list`는 AGENTS.md 'Commands'에 없다 — 사용자 확인 필요).
- [x] P1. [design.md](./design.md) '결정'의 D1–D23을 사용자가 정했다(2026-11-07). 자식 문서를 결론에 맞췄다.
  - 검증: `grep -c '^### D.*결론(사용자' docs/features/release-0-1-0/design.md`가 23.

── commit: `docs(feature): release-0-1-0 settle decisions` ──

## C. 자식 feature (실행 순서)

- [ ] C1. [`git-flow`](../git-flow/tasks.md) — 하네스·문서, 대화 중. 선행: P0(D1 D2 D3은 결론). 후행: 나머지 전부.
- [ ] G1. (사용자) `develop`을 `main`에서 만드는 것(C1 T1, 에이전트가 사용자 승인 아래 push할 수 있다)과 D2대로 기본 브랜치를 바꾸는 것(사용자가 GitHub 설정에서).
  - 검증: `git ls-remote --heads origin develop`이 한 줄을 낸다. 기본 브랜치는 `gh repo view --json defaultBranchRef`(AGENTS.md 'Commands'에 없다 — 사용자 확인 필요).
- [ ] C2. [`public-cleanup`](../public-cleanup/tasks.md) — `/ship`. 선행: C1, P1(D19 D20). C3·C4와 병렬.
- [ ] C3. [`community-docs`](../community-docs/tasks.md) — 하네스·문서, 대화 중. 선행: C1, P1(D17). C2·C4와 병렬.
- [ ] C4. [`readme-features`](../readme-features/tasks.md) — 하네스·문서, 대화 중. 선행: C1, P1(D16). C2·C3과 병렬. 다운로드 링크는 R2에서 채운다.

## G. 공개 (사용자만 한다)

- [ ] G2. (사용자) 저장소를 공개한다. 선행: C2·C3·C4가 `develop`에 병합, D18(위치)·D19(이력·브랜치) 적용 완료. 이때 `main`은 P0 병합 때의 상태 그대로다(D21에 적은 노출).
  - 공개 직전: C2의 비밀 스캔 결과가 깨끗한지 확인하고, D19대로 병합된 원격 브랜치와 worker 브랜치를 지운다(사용자 승인 아래 에이전트가 목록을 만들어 지울 수 있다).
  - 검증: `gh repo view --json visibility`가 `PUBLIC`(명령 확인 필요, 위와 같음).
- [ ] G3. (사용자) 공개 뒤 설정: `main` 보호(직접 push 금지, `/release`가 여는 `develop`·`hotfix/<slug>` PR의 병합만 — 방식은 C8이 정한다), `develop` 보호(필수 검사는 C5가 정한 작업 이름), D6의 환경 `release`와 비밀, 비공개 취약점 신고 켜기. 에이전트는 설정 목록을 [design.md](./design.md)의 D2·D3·D6·D17 결론과 C5·C8의 결과에서 만들어 넘긴다.
  - 검증: `gh api repos/<owner>/<repo>/branches/main/protection`이 403이 아닌 보호 설정을 돌려준다(명령 확인 필요).

## C (계속)

- [ ] C5. [`ci-gate`](../ci-gate/tasks.md) — `/ship`. 선행: G2(D21), P1(D4 D5). 필수 검사 등록은 G3과 맞춘다.
- [ ] C6. [`release-ci`](../release-ci/tasks.md) — `/ship`. 선행: C5, G3(환경·비밀), P1(D5–D8 D13–D15 D18).
- [ ] C7. [`app-update`](../app-update/tasks.md) — `/orchestrate`. 선행: C6(구현), P1(D9–D12, D23). 문서·초안 단계는 C6과 병렬. C8과 병렬.
- [ ] C8. [`release-skill`](../release-skill/tasks.md) — 하네스·문서, 대화 중. 선행: C6, P1(D1 D7 D12 D13). C7과 병렬.

## R. 0.1.0 출시 (사용자가 `/release`를 부른다)

- [ ] R1. D12대로 업데이트 경로를 확인한다: 사용자가 `/release`를 `0.1.0-rc.1`, `0.1.0-rc.2`로 차례로 부르고, 설치한 rc.1이 rc.2를 알리고 설치하는지 본다. 결과를 app-update 문서나 DESIGN·BACKLOG에 남긴다.
  - 검증: 설치한 rc.1의 Settings > About 버전이 업데이트 뒤 rc.2로 바뀌고, `~/.local/bin/doan`이 새 번들을 가리킨다(실제 앱 확인, 확인 방법은 C7이 정한다).
- [ ] R2. 사용자가 `/release`를 `0.1.0`으로 부른다. 스킬이 끝나면 README의 다운로드 링크를 `develop`에서 채운다(다음 `/release` 때 `main`에 들어간다).
  - 검증: Release에서 받은 dmg에 `/tester-build` 6단계의 `spctl` 검사 두 개가 `source=Notarized Developer ID`를 낸다. `git ls-remote --tags origin v0.1.0`이 한 줄을 낸다.

── commit: `docs(readme): link the 0.1.0 download` ──

## Z. 부모 정리

- [ ] Z1. 모든 자식이 끝났는지, 자식 결론이 PRODUCT·ARCHITECTURE·BACKLOG에 현재 규칙으로 있는지, BACKLOG의 'Release packaging'(docs/BACKLOG.md:7)과 고지 파일 항목(docs/BACKLOG.md:17)이 지워졌는지, ARCHITECTURE §9의 "CI and its secrets come with release packaging" 문장이 현재 규칙으로 바뀌었는지 확인하고 이 디렉터리를 지운다.
  - 검증:
    - `grep -n 'Release packaging\|readable form' docs/BACKLOG.md` 결과 없음
    - `grep -n 'come with release packaging' docs/ARCHITECTURE.md` 결과 없음
    - `ls docs/features/`에 `git-flow`·`public-cleanup`·`community-docs`·`readme-features`·`ci-gate`·`release-ci`·`app-update`·`release-skill`·`release-0-1-0`이 없음

── commit: `docs(feature): remove release-0-1-0 after 0.1.0` ──
