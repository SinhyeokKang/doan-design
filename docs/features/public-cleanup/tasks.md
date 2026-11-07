# public-cleanup — tasks

`/orchestrate`로 진행한다(D27). conductor가 `develop`에서 `feat/public-cleanup`을 만들고 design.md 'batch' 표대로 worker를 나눈다. 부모 tasks.md는 체크하지 않는다(부모 '자식 진행 규칙' 1).

- [ ] T0. (conductor) 참조 패턴과 한국어 검사의 기준 수치를 다시 재고 batch 브리프에 넣는다.
  - 검증: design.md '참조 패턴'과 '한국어 검사'의 두 명령 결과 수(기준: 1,851줄과 397줄)를 `orch.md`에 적는다.
- [ ] T1. (conductor) design.md '비밀 스캔'대로 모든 ref를 스캔한다. gitleaks 모듈 경로와 버전을 확인해 고정한다.
  - 검증: 확인 명령 미정 — 사용자 확인 필요(그 `go run` 명령이 exit 0이거나 발견 목록을 낸다). 결과(발견 수, 각 발견의 파일·커밋·규칙)를 PR 본문 초안에 적는다.
- [ ] T2. (B1, B2a–B2d, B3) 맡은 디렉터리의 주석과 테스트 제목을 design.md '주석 번역 규칙'과 '참조 처리'대로 고친다. 커밋은 처리 규칙별로 나눈다.
  - 검증: 맡은 디렉터리에서 design.md '한국어 검사'와 '참조 패턴'의 결과가 허용 목록의 줄뿐이다. 커밋마다 `npm --prefix app run typecheck`, `npm --prefix app run lint` 통과(Go만 바꾼 커밋은 `go vet ./...`).

── commit(batch마다): `chore(app): drop deleted-doc references in comments` / `chore(app): point comments at PRODUCT and ARCHITECTURE` / `chore(app): translate comments and test titles` (CLI는 `chore(cli): …`) ──

- [ ] T3. (conductor) 통합 뒤 전체 검사를 돌린다.
  - 검증: design.md '한국어 검사'와 '참조 패턴'의 결과가 허용 목록의 줄뿐이다. `node .agents/skills/verify/scripts/verify.mjs --eval` 통과.
- [ ] T4. (B3, D20 사용자 예외) 초안 다섯 줄의 개인 경로를 `/Users/you/…`로 바꾼다.
  - 검증: 바꾸기 전과 후의 `doan check --json --repo .` 출력을 `.scratch/public-cleanup/`에 저장해 diff하면 세 초안에 차이가 없다. `git grep -n '/Users/sinhyeok' -- .doan/canvases` 결과 없음.

── commit: `docs(design): drop personal paths from shipped drafts` ──

- [ ] T5. (conductor) diff가 주석·테스트 제목·초안 경로만 건드렸는지 확인한다.
  - 검증:
    - `git diff --stat develop...HEAD`의 경로가 design.md '영향 범위'의 디렉터리와 세 초안뿐이다.
    - `git diff develop...HEAD -- '*.ts' '*.tsx' '*.go' '*.css' '*.js' | grep -E '^[+-][^+-]' | grep -v -E '^[+-]\s*(//|/\*|\*|\{/\*)' | grep -v -E '^[+-]\s*(describe|test|it)\('` 결과를 사람이 확인한다: 남는 줄은 블록 주석의 이어지는 줄뿐이어야 한다.
    - `/code-review`가 ②③ 커밋의 번역이 원문의 뜻을 지켰는지 원문과 대조한다.
- [ ] T6. (conductor, D26) AGENTS.md 'Commit conventions'의 주석 규칙에 "코드 주석은 `docs/features/` 문서(절, 결정·task id, slug)를 인용하지 않고 이유를 직접 쓰거나 PRODUCT·ARCHITECTURE를 가리킨다"를 더하고, `.agents/skills/code-review/SKILL.md`의 점검 항목에 같은 줄을 더한다.
  - 검증: `grep -n 'docs/features' AGENTS.md`가 주석 규칙 줄에서 나오고, `grep -n 'docs/features' .agents/skills/code-review/SKILL.md`가 점검 항목에서 나온다.

── commit: `docs(agents): keep feature-doc citations out of code comments` / `docs(skills): check feature-doc citations in code review` ──

- [ ] T7. 결론 승격: PRODUCT·ARCHITECTURE 변경 없음. 기준·처리 뒤 수치와 스캔 결과를 PR 본문에 적고, 이 디렉터리를 지운다.
  - 검증: `ls docs/features/public-cleanup` 결과 없음.

── commit: `docs(feature): remove public-cleanup` ──
