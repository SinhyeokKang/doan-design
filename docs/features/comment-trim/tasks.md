# 주석 정리 — tasks

순서: 시작 점검 → 동등성 검사 도구 → 배치별 정리(병렬) → ARCHITECTURE 옮기기 → 통합 검증 → 정리. `[commit]`은 커밋 경계다.

## T0. 시작 점검 (lead)

- chain-261125-1의 마지막 링크(thread-motion) PR이 develop에 머지되었고 `docs/features/chain-261125-1/`이 지워졌는지 확인한다.
- 이 feature가 도는 동안 코드를 바꾸는 다른 conductor를 새로 띄우지 않는다는 것을 사용자와 확인한다.
- 검증: `git log origin/develop`에 thread-motion 머지 커밋이 있고, `docs/features/chain-261125-1/`이 없다. 사용자 확인이 `orch.md`에 적혀 있다.
- 커밋 없음.

## T1. 동등성 검사 도구와 기준 측정 (conductor)

- conductor worktree의 `.scratch/comment-trim/`에 design.md '동등성 검사'의 도구를 만든다.
- 기준 ref(`feat/comment-trim`이 갈라진 `origin/develop` 커밋)에서 다음을 잰다.
  - 배치별 주석 줄 수(소스 / 테스트), design.md '배치' 표의 경로 규칙을 그대로 쓴다.
  - lint 경고 수: `npm --prefix app run lint`의 app 경고 수(2026-11-25에는 77).
  - 문서가 가리키는 주석 목록: `docs/`를 grep해 design.md '판정 기준'의 목록을 다시 만든다.
- `orch.md`에 적는다: 도구 실행 명령(`node <conductor worktree>/.scratch/comment-trim/<도구> --root <repo> --base <sha> --batch <Bn>` 형태, AGENTS.md 'Commands'에 없는 일회성 도구), 위 측정값, `/tdd` 건너뛰기 예외.
- 검증:
  - 자기 검사(design.md '동등성 검사')가 세 언어 모두 기대대로 통과·실패한다.
  - 기준 ref에서 작업 트리를 바꾸지 않은 채 돌리면 바뀐 파일 0개로 통과한다.
- 커밋 없음(`.scratch/`와 `orch.md`).

## T2. 배치별 주석 정리 (B1–B9, 병렬, 워커)

- 각 워커는 design.md '판정 기준'대로 자기 배치의 파일만 고친다. 지시 주석, 테스트가 읽는 주석, 문자열 안의 주석은 손대지 않는다. ARCHITECTURE는 고치지 않고 옮길 후보를 보고에 적는다.
- 코드는 한 글자도 바꾸지 않는다. 낡은 주석 때문에 코드가 의심스러우면 보고만 한다.
- 주석을 바꿔서 테스트가 깨지면 그 주석을 되돌리고 보고한다.
- 검증(배치마다):
  - T1 도구가 `--batch <Bn>`으로 통과한다(경로 가드, 동등성, 지시 주석).
  - T1 도구가 보고한 3줄 이상 덩어리가 0개다(문서가 가리키는 주석 제외). 0이어야 하는 grep 결과가 0이고, 나머지 후보는 줄마다 판정이 보고에 있다.
  - `npm --prefix app test`가 통과한다(모든 배치, 테스트가 다른 배치의 소스를 읽기 때문).
  - `npm --prefix app run lint`가 통과하고 경고 수가 T1 기준값과 같다. 달라지면 멈추고 conductor에게 보고한다. `npm --prefix app run typecheck`가 통과한다.
  - B8: `go vet ./...`와 `go test ./...`가 통과하고, `gofmt -l cli schema`의 출력이 비어 있다(`gofmt`는 AGENTS.md 'Commands'에 없고, 이 feature에서만 쓰는 검증 명령이다).
  - B9:
    - `node --test .agents/skills/verify/scripts/verify.test.mjs`
    - `node --test 'app/runtime/*.test.ts'`
    - `node --test 'eval/**/*.test.ts'`
    - `node eval/run.ts --self-test`가 `self-test PASS`와 exit 0
  - B2, B3, B4: `node app/scripts/viewerInspect.mjs --check`가 통과한다(생성기의 입력이 이 배치들에 있다).
  - 배치의 주석 줄 수(전과 후)가 보고에 있다.
  - `/code-review`에서 🔴가 없다.
- `[commit]` 배치마다 `chore: trim comments in <path>` 하나.

## T3. ARCHITECTURE로 옮기기 (conductor, 워커)

- conductor가 워커 보고의 '옮길 후보'를 모은다. 여러 파일이나 모듈에 걸친 불변식만 고른다. ARCHITECTURE에 이미 있으면 옮기지 않는다.
- 옮긴 문장이 기존 절의 결정과 다르게 읽히면 멈추고 사용자에게 묻는다.
- conductor는 ARCHITECTURE만 커밋한다. 주석을 절 참조(`ARCHITECTURE §N '…'`)로 바꾸는 일은 그 파일을 맡은 워커에게 새 태스크로 보낸다.
- 검증:
  - 옮긴 이유마다 해당 절에 문장이 있다.
  - 이번에 추가한 절 참조의 `'…'`가 ARCHITECTURE의 실제 제목이나 굵은 머리말과 같다(grep으로 대조).
  - 바뀐 배치마다 T1 도구가 다시 통과한다.
- `[commit]` `docs(ARCHITECTURE): move cross-module comment constraints`(conductor). 워커는 `chore: point comments to ARCHITECTURE in <path>`.

## T4. 통합 검증 (conductor)

- 모든 배치를 `feat/comment-trim`에 통합한 뒤 `origin/develop`을 머지한다. develop이 움직였으면 design.md '충돌과 시점'대로 처리하고, 기준 ref를 새 merge-base로 옮긴다.
- 검증:
  - 전체 범위에서 T1 도구가 통과한다(배치 B1–B9를 모두 돌린다).
  - `node .agents/skills/verify/scripts/verify.mjs --eval`가 통과한다. viewerInspect와 두 golden의 `--check`는 이 gate가 돌리므로 그 로그를 인용한다.
- 커밋 없음(검증만).

## T5. 승격, 정리, PR (conductor)

- PRODUCT.md에는 승격할 것이 없다. ARCHITECTURE는 T3에서 이미 바뀌었다.
- 워커가 보고한 의심 코드는 conductor가 확인한 뒤 모두 `docs/BACKLOG.md` 'Known defects'에 적는다.
- `docs/features/comment-trim/`을 지운다.
- 그다음 push하고 PR을 연다. PR 본문은 기능 문서 없이 읽히게 쓴다: 배치별 주석 줄 수(전과 후), 옮긴 ARCHITECTURE 절, BACKLOG로 보낸 의심 코드, 되돌린 주석(테스트가 읽는 것).
- 검증: `docs/features/comment-trim/`이 없다. T1 도구가 뽑은 주석 텍스트에서 `comment-trim` grep 결과가 0이다.
- `[commit]` `docs(BACKLOG): …`(있을 때만), `docs(feature): remove comment-trim after promotion`.
