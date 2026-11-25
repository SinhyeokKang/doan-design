# 주석 정리 — tasks

순서: 동등성 검사 도구 → 배치별 정리(병렬) → ARCHITECTURE 옮기기 → 통합 검증 → 정리. `[commit]`은 커밋 경계다. 구현은 chain-261125-1의 마지막 링크가 develop에 머지된 뒤 시작한다.

## T1. 동등성 검사 도구와 기준 측정

- main checkout의 `.scratch/comment-trim/`에 design.md '동등성 검사'의 도구를 만든다(TS·JS는 TypeScript 컴파일러 API, Go는 `go/parser` + `go/printer`, CSS는 주석 제거와 공백 정규화).
- 같은 곳에 주석 줄 수 측정 스크립트를 두고, 기준 ref에서 배치별 주석 줄 수(소스 / 테스트)를 잰다. design.md '배치' 표의 경로 규칙을 그대로 쓴다.
- 검증:
  - 자기 검사: 세 언어 각각에서 주석만 지운 사본은 통과하고, 식 하나나 문자열 리터럴 하나를 바꾼 사본은 실패(exit 1)한다.
  - 기준 ref에서 작업 트리를 바꾸지 않은 채 돌리면 바뀐 파일 0개로 통과한다.
- 커밋 없음(`.scratch/`). 측정값은 `orch.md`에 적는다.

## T2. 배치별 주석 정리 (B1–B9, 병렬)

- 각 워커는 design.md '판정 기준'대로 자기 배치의 파일만 고친다. 지시 주석과 생성 파일·데이터는 손대지 않는다. ARCHITECTURE는 고치지 않고, 옮길 후보를 보고에 적는다.
- 코드는 한 글자도 바꾸지 않는다. 낡은 주석 때문에 코드가 의심스러우면 보고만 한다.
- 검증(배치마다):
  - 동등성 검사가 배치의 모든 바뀐 파일에서 통과한다.
  - `npm --prefix app run lint`, `npm --prefix app run typecheck`(app·eval 배치), `go vet ./...`(B8)가 통과하고, lint 경고 수가 기준보다 늘지 않는다.
  - 코드 주석에서 `docs/features` grep 결과가 0이다. 나머지 grep 후보(design.md '판정 기준')는 줄마다 남김·지움 판정이 보고에 있다.
  - 배치의 주석 줄 수(전과 후)가 보고에 있다.
  - `/code-review`에서 🔴가 없다.
- `[commit]` 배치마다 `chore: trim comments in <path>` 하나.

## T3. ARCHITECTURE로 옮기기

- 워커 보고의 '옮길 후보'를 모은다. 여러 파일이나 모듈에 걸친 불변식만 고른다. ARCHITECTURE에 이미 있으면 옮기지 않고, 주석만 그 절을 가리키게 바꾼다.
- 옮긴 문장이 기존 절의 결정과 다르게 읽히면 멈추고 사용자에게 묻는다.
- 검증: 옮긴 이유마다 해당 절에 문장이 있다. 그 이유를 가리키는 주석의 `ARCHITECTURE §N 'Title'`이 실제 절 제목과 같다(grep으로 대조). 동등성 검사가 계속 통과한다.
- `[commit]` `docs(architecture): move cross-module comment constraints`, 그리고 주석을 절 참조로 바꾼 `chore: point comments to ARCHITECTURE`.

## T4. 통합 검증

- 모든 배치를 `feat/comment-trim`에 통합한 뒤, 기준 ref와 비교해 전체 범위에서 동등성 검사를 다시 돌린다.
- 검증: `node .agents/skills/verify/scripts/verify.mjs`가 통과한다. `node app/scripts/viewerInspect.mjs --check`, `node app/scripts/doanyGolden.mjs --check`, `node app/scripts/dockedBuddyGolden.mjs --check`가 통과한다(gate가 이미 돌리면 그 결과를 쓴다). 전체 동등성 검사가 통과한다.
- PR 본문에 배치별 주석 줄 수(전과 후), 옮긴 ARCHITECTURE 절, 코드가 의심스러웠던 곳(BACKLOG 후보)을 적는다.
- 커밋 없음(검증만).

## T5. 승격과 정리

- PRODUCT.md에는 승격할 것이 없다. ARCHITECTURE는 T3에서 이미 바뀌었다.
- 워커가 보고한 의심 코드 가운데 사용자가 고르지 않은 것은 `docs/BACKLOG.md` 'Known defects'에 적는다.
- `docs/features/comment-trim/`을 지운다.
- 검증: `docs/features/comment-trim/`이 없고, 코드 주석에서 `comment-trim` grep 결과가 0이다.
- `[commit]` `docs(backlog): …`(있을 때만), `docs(feature): remove comment-trim after promotion`.
