# readme-features — tasks

하네스·문서 변경이라 대화 중에 커밋한다. `develop`이 아직 없으므로 지금 규칙대로 `main`에 커밋하고 push한다(부모 '사용자 결정' 5). 문서마다 커밋을 나눈다. 부모 tasks.md는 체크하지 않는다(부모 '자식 진행 규칙' 1).

- [ ] T0. community-docs(C3)가 `main`에 들어갔는지 확인한다(README가 `docs/CONTRIBUTING.md`를 링크한다).
  - 검증: `git fetch origin` 뒤 `git ls-tree origin/main docs/CONTRIBUTING.md`가 한 줄, `git ls-tree origin/main docs/features/community-docs` 결과 없음.
- [ ] T1. Features 표의 각 항목을 PRODUCT의 근거 절과 대조해 문구를 쓴다(README 본문, 이미지 자리는 비워 둔다).
  - 검증: 리뷰어(사용자)가 README 초안과 design.md 표를 나란히 놓고 근거 절과 문장을 대조한다. 확인 명령 미정 — 사용자 확인 필요.
- [ ] T2. `/design-draft readme-features`로 `.doan/canvases/readme-features.html`에 design.md '이미지'의 프레임을 그린다. 사용자가 앱에서 확인하고 확정한다.
  - 검증: `doan check --json --repo .`의 error가 시작 전과 같고 이 캔버스에서 나온 것이 없다. `doan ls --json --repo .`에 `readme-features`가 프레임 9개로 나온다. 확정은 사용자 답으로 확인한다.

── commit: `docs(design): readme-features draft` ──

- [ ] T3. 내보내기 스크립트로 프레임을 PNG로 내보내 `docs/assets/readme/`에 넣는다.
  - 검증: `find docs/assets/readme -type f -size +500k` 결과 없음, `ls docs/assets/readme | wc -l`이 9.

── commit: `docs(readme): add feature images` ──

- [ ] T4. 나머지 절(Install, CLI, Build, Documents, Contributing, Background 축약, References, License)을 쓰고 상태 줄을 "pre-release"로 바꾼다.
  - 검증:
    - `grep -n 'docs/features' README.md` 결과 없음
    - `grep -n -i 'pre-release' README.md`가 한 줄 이상, `grep -n 'releases/latest/download' README.md` 결과 없음
    - 상대 링크와 이미지 경로가 모두 있다: `grep -o -E '\]\((\./)?[^):#]+\)|src="[^"]+"' README.md`에서 http가 아닌 경로를 뽑아 `ls`로 확인

── commit: `docs(readme): describe Doan by feature` ──

- [ ] T5. (D28) Malmoi 근거를 PRODUCT §1로 옮기고 출처 줄을 고친다.
  - 검증: `grep -n 'README background' docs/PRODUCT.md` 결과 없음, `grep -n '256 KiB' docs/PRODUCT.md`가 §1에서 나온다.

── commit: `docs(PRODUCT): keep the Malmoi evidence in the problem section` ──

- [ ] T6. AGENTS.md 'Documents' 표의 README 행(구성과 이미지 다시 내보내기)과 'References'의 "(README §1)"을 새 README에 맞춘다.
  - 검증: `grep -n 'README §1' AGENTS.md` 결과 없음, `grep -n 'readme-features' AGENTS.md`가 README 행에서 나온다.

── commit: `docs(agents): describe the feature README` ──

- [ ] T7. `docs/DIRECTORY.md`에 `docs/assets/readme/`를 더한다.
  - 검증: `grep -n 'docs/assets/readme' docs/DIRECTORY.md`가 한 줄.

── commit: `docs(directory): add docs/assets/readme` ──

- [ ] T8. 이 디렉터리를 지운다. 다운로드 링크, 릴리스 배지, 업데이트 문단, 상태 줄 변경은 부모 R2가 한다.
  - 검증: `git fetch origin` 뒤 `git ls-tree origin/main docs/features/readme-features` 결과 없음.

── commit: `docs(feature): remove readme-features` ──
