# public-cleanup — orch

계획: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md). 결정은 부모 [design.md](../release-0-1-0/design.md) D19 D20 D26 D27(다시 묻지 않는다).

- 시작 hash: `origin/develop` `17aa6a9f`
- 통합 브랜치: `feat/public-cleanup`(develop에서 분기, PR `--base develop`, 병합하지 않는다 — 병합 권한 없음)
- 모델 교차: 사용자가 이 세션에서 Codex worker를 허용했다. batch마다 난이도로 고른다.

## T0 기준 수치 (2026-11-07, `17aa6a9f`)

| 검사 | 설계 기준 | 다시 잰 값 |
|---|---|---|
| 참조 패턴 | 1,851줄, 501파일 | **1,169줄, 339파일** |
| 한국어 검사 | 397줄 | **387줄, 182파일** |
| 둘의 합집합 | — | 1,302줄 |

- 참조 수치 차이: 이 셸에서 `grep`이 ugrep 함수라 `grep -- -`가 실패하고 slug 목록(`SL`)이 비면 패턴의 slug 갈래가 ` design` 같은 일반 단어에 걸린다. 그렇게 돌린 값이 1,846줄로 설계 기준과 비슷하다. slug 81개가 든 패턴으로 `rg -P -f`를 돌린 값은 1,169줄이다.
- 검사 도구(지휘자 판단 — 근거: worker 셸마다 `rg`·`grep`이 다르다): 설계의 두 명령을 node로 옮긴 `.scratch/public-cleanup/scan.mjs`(conductor checkout, 절대 경로로 부른다)를 공통 검사로 쓴다. `rg -P -f <pattern>` 결과와 줄 단위로 같다(diff 0). 한국어 검사는 `git grep -P` 결과(387줄)와 같다. rg -P는 `\b`를 유니코드로 보므로(`design 결정 6`이 걸린다) node 쪽도 유니코드 경계로 맞췄다.
- batch별 합집합 줄 수와 파일 목록: `.scratch/public-cleanup/files-<batch>.txt`.

## 결정 기록

1. batch 재분할(지휘자 판단 — 근거: D27 "renderer 묶음 여럿", 설계 표의 규모는 한국어 주석 수만 셌다): 합집합 줄 수로 다시 재면 `app/src/main` 347줄, renderer 나머지 449줄이라 B1을 B1a(`main/conversation/`)·B1b로, B2d를 B2d(a–d)·B2e(e–z)로 나눴다. 파일 소유는 겹치지 않는다.
2. 한 줄이 여러 규칙에 걸리면 가장 뒤 규칙의 커밋에 넣는다(지휘자 판단 — 근거: design 'batch'의 ①②③ 리뷰 깊이). 한국어 줄은 번역과 참조 처리를 함께 ③에 넣는다. ①은 괄호 안 참조를 지우기만 한 줄이어서 diff 모양으로 확인할 수 있다.
3. 주석·테스트 제목이 아닌 줄(문자열 리터럴, 테스트 데이터, `cli/internal/designskill/SOURCES.md`의 "user decision 2026-10-28" 같은 날짜 문장)은 바꾸지 않고 허용 목록에 넣는다(지휘자 판단 — 근거: design '영향 범위'). worker가 handoff에 `<path>\t<trimmed line>` 형식으로 적고, 지휘자가 `.scratch/public-cleanup/allow-{ref,ko}.tsv`로 모은다.
4. 커밋 scope: `app/src/*`는 `chore(app)`, `cli`는 `chore(cli)`, `eval`은 `chore(eval)`(지휘자 판단 — 근거: tasks의 꼴을 디렉터리에 맞춤).
5. 감시: Orca 1.4.250 안내서는 감시 스크립트의 `check`가 메일을 가로챈다며 폴링을 금한다. Orca가 `worker_done`·`question`·`escalation`(stopReason 포함)으로 지휘자를 깨우므로 이 run은 별도 루프를 돌리지 않는다(지휘자 판단 — 근거: 버전이 맞는 바이너리 안내서가 orchestrate §2의 루프 예시보다 우선).
6. 테스트 제목을 바꾸면 이름으로 찾는 곳이 깨질 수 있다: 저장소에 snapshot 파일과 `-t`·`testNamePattern` 사용이 없다(`git grep`, 2026-11-07).
7. T1 gitleaks 버전 고정: (T1 진행 뒤 기록)

## batch

모든 batch는 `feat/public-cleanup`에서 만든 Orca child worktree에서 돈다. 파일 소유가 겹치지 않아 모두 병렬이다.

| batch | 파일 소유 | 규모(합집합) | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|
| B1a | `app/src/main/conversation/**` | 175줄, 57파일 | Claude Opus high — 결정 id 인용이 가장 촘촘하고, 대화 전송 불변식의 이유를 이력에서 옮겨야 한다 | 커밋마다 typecheck·lint, 끝에 app test, 범위 scan | 대기 |
| B1b | `app/src/main/**`(conversation 밖) | 172줄, 83파일 | Claude Sonnet high — 이유 판단이 섞인 다수 파일 | 같음 | 대기 |
| B2a | `app/src/renderer/App.tsx`, `styles.css` | 105줄, 2파일 | Claude Sonnet high — JSX·CSS 주석 문법, 큰 파일 둘 | 같음 | 대기 |
| B2b | `app/src/renderer/{canvas,Canvas}*`(최상위) | 154줄, 37파일 | Claude Sonnet high | 같음 | 대기 |
| B2c | `app/src/renderer/{home,Home,conversation,Conversation}*`(최상위) | 175줄, 33파일 | Claude Sonnet high | 같음 | 대기 |
| B2d | renderer 나머지 중 a–d로 시작(`components/`, `ds/` 포함) | 201줄, 54파일 | Codex Sol high — 기계적 처리가 다수이고 단계가 많다(교차 허용) | 같음 | 대기 |
| B2e | renderer 나머지 중 e–z로 시작(`public/` 포함) | 248줄, 77파일 | Claude Sonnet high | 같음 | 대기 |
| B3 | `app/src/restore`, `app/src/preload`, `app/runtime`, `app/scripts`, `cli`, `eval`, 초안 세 파일(T4) | 72줄, 36파일 + 초안 5줄 | Codex Sol high — 작고 허용 목록 판단이 대부분, Go·TS·초안이 섞여 단계가 많다(교차 허용) | 커밋마다 typecheck·lint 또는 `go vet ./...`, 끝에 app test·`go test ./...`·eval unit test, `doan check` 전후 diff | 대기 |

- 리뷰: batch마다 독립 리뷰 worker(`/code-review`, 보고만)가 ②③ 커밋을 원문과 대조한다. Claude batch는 Codex Astra medium(교차 읽기), Codex batch는 Claude Opus high가 본다. 리뷰 worker와 모델은 batch가 끝날 때 이 표 아래에 적는다.

## task 대응

| task | 담당 |
|---|---|
| T0 기준 재기 | 지휘자 (위 표) |
| T1 비밀 스캔 | 지휘자 |
| T2 주석·테스트 제목 | B1a B1b B2a B2b B2c B2d B2e B3 |
| T3 통합 뒤 전체 검사 | 지휘자 |
| T4 초안 개인 경로 | B3 |
| T5 diff 범위 확인 | 지휘자(+리뷰 worker) |
| T6 AGENTS·code-review 규칙 | 지휘자(하네스 문서) |
| T7 결론 승격·디렉터리 삭제 | 지휘자 |
