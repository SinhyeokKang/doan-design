# public-cleanup — tasks

`/ship`으로 진행한다. 분기와 PR은 [git-flow](../git-flow/design.md)의 규칙(`develop`에서 `chore/public-cleanup`)을 따른다.

- [ ] T1. 비밀 스캔 도구와 명령을 사용자와 정하고 전체 이력을 스캔한다. 결과(발견 수, 각 발견의 파일·커밋·규칙)를 이 문서에 적는다.
  - 검증: 명령 미정 — 사용자 확인 필요.
- [ ] T2. `app/src/main`, `app/src/renderer`, `app/runtime`, `cli`, `eval`의 주석을 design.md '주석 번역 규칙'과 '지운 문서 참조 처리'대로 고친다. 디렉터리마다 커밋한다.
  - 검증: `git grep -n -P '//.*[\x{AC00}-\x{D7A3}]' -- app/src cli eval app/runtime` 결과 없음. `node .agents/skills/verify/scripts/verify.mjs --eval` 통과.

── commit: `chore(main): translate and resolve comment references` / `chore(renderer): …` / `chore(cli): …` / `chore(eval): …` ──

- [ ] T3. (D20, 사용자 예외) 초안 다섯 줄의 개인 경로를 `/Users/you/…`로 바꾸고 `doan check`로 확인한다.
  - 검증: `git grep -n '/Users/sinhyeok'` 결과 없음. `doan check --repo .` 가 세 초안에 오류를 내지 않는다(AGENTS.md 'Commands'의 설치된 `doan`).

── commit: `docs(canvases): drop personal paths from shipped drafts` ──

- [ ] T4. diff가 주석·초안 텍스트만 건드렸는지 확인한다.
  - 검증: `git diff develop...HEAD --stat`와 `git diff develop...HEAD -- '*.ts' '*.tsx' '*.go' | grep -E '^[+-][^+-]' | grep -v -E '^[+-]\s*(//|/\*|\*)'` 결과 없음.
- [ ] T5. 결론 승격: PRODUCT·ARCHITECTURE 변경 없음. 남은 참조 수와 스캔 결과를 PR 본문에 적고, 부모 tasks.md의 C2를 체크하고, 이 디렉터리를 지운다.
  - 검증: `ls docs/features/public-cleanup` 결과 없음.

── commit: `docs(feature): remove public-cleanup` ──
