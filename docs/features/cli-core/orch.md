# cli-core — orch

- 계획 원본: [spec.md](./spec.md)·[design.md](./design.md)·[tasks.md](./tasks.md). 이 문서는 배치 나누기와 진행만 적는다.
- 시작 해시: `4ce0995`(main, 태스크 0 완료).
- 통합 브랜치: `feat-cli-core`(main에서 분기). 끝은 push + PR 하나이고 병합하지 않는다(design Q7).
- 지휘: Claude Code(`claude-opus-5-5`). 배치 코드를 고치지 않는다.

## 결정 로그

| # | 결정 | 출처 |
|---|---|---|
| 1 | 구현 워커는 Codex, 독립 리뷰 워커는 Claude. Codex는 사용자 설정 기본 모델(`gpt-6-astra`)을 그대로 쓰고, 실제 모델은 `worker-start`의 `launch.effective`로 확인한다. 구현자와 다른 계열이 리뷰해야 독립성이 생긴다(POSTMORTEM 2026-10-21도 독립 리뷰어가 잡았다) | 사용자 2026-10-21 (모델 교차 허가) |
| 2 | tasks의 '명령 미정' 두 개 허용: `go get golang.org/x/net/html`(네트워크), `go run ./cli/cmd/doan`(바이너리 수동 실행) | 사용자 2026-10-21 |
| 3 | 태스크 8(승격과 정리)은 지휘자가 한다 | 지휘자 판단 — `/orchestrate` §5가 승격을 지휘자 몫으로 둔다 |
| 4 | `Reach` 만들기(태스크 5의 하위 항목)는 배치 D가 `cli` 패키지에서 한다 | 지휘자 판단 — `check`는 순수 패키지라 `repo`를 import하지 않고, A와 B가 병렬이라 타입을 미리 공유할 수 없다. `cli`가 `repo`·`canvas`·`check`를 조립하는 층이다 |
| 5 | `check`는 경로 상태(안·없음·밖) 타입을 스스로 정의하고 `repo`를 import하지 않는다. `repo.Resolve`의 결과를 `check` 타입으로 바꾸는 일은 D가 한다 | 지휘자 판단 — 4와 같은 근거 |
| 6 | 워커는 `docs/`를 고치지 않는다. tasks 체크박스, 정본과 어긋나는 점, POSTMORTEM 후보는 handoff에 적고 지휘자가 반영한다 | 지휘자 판단 — 병렬 워커가 같은 문서를 고치면 파일이 겹친다 |
| 7 | resolve 이벤트 붙이기(I/O)는 D가 `cli/internal/comments/`에 새 파일로 둔다 | 지휘자 판단 — design '코드 배치'가 붙이기를 `comments`에 두고, 태스크 4는 순수 함수만 다룬다 |
| 8 | `NewResolve`는 `(formats.CommentEvent, error)`, `NextAt`은 `(string, error)`를 돌려준다. `MaxAt`은 `(string, bool)` 그대로다. D가 이 에러를 `internal_error`로 넘긴다 | 지휘자 판단(C 질문) — 난수 읽기와 시각 파싱 실패를 숨기지 않으려는 것이다 |
| 9 | `canvas.Parse`는 `(Canvas, error)`를 돌려준다(`x/net/html`은 요소 중첩이 512개를 넘으면 에러를 낸다). 파싱에 실패한 캔버스는 명령 전체를 실패시키지 않고, 새 검사 규칙 `unparsable_canvas`(error, `path`는 캔버스)로 알린다. D는 그 캔버스를 `check.Input.Unparsable`에 넣고, `ls`에는 `path`만 내며, `comments`에서는 캔버스가 없는 것으로 다룬다. 규칙은 19개가 된다 | 사용자 2026-10-21 — `check`는 에이전트에게 고칠 곳을 알려 주는 명령이다. `internal_error`는 CLI 버그처럼 보이고 다른 캔버스의 결과까지 가린다 (처음의 지휘자 판단 "`internal_error`로 넘김"을 뒤집음) |
| 10 | `repo.Resolve`는 `(State, string, error)`를 돌려준다. 심링크 루프·권한 같은 예상 밖 I/O 실패를 "없음"으로 숨기지 않고, D가 `internal_error`로 넘긴다 | A의 계획 차이 — 리뷰 A에서 판정 |
| 11 | 스키마 패턴은 통과하지만 달력에 없는 `at`(`2026-02-30`·`T24`·윤초 `:60`)이 파일의 최댓값이면 `NextAt`이 에러를 낸다. 지금은 그대로 두고, D가 파일 경로를 메시지에 담아 `internal_error`로 넘긴다. 태스크 8에서 PRODUCT §8 열린 질문에 적는다 | 사용자 2026-10-21(리뷰 C 🟡) — 손으로 고친 줄에서만 생기는 경우라 이 피처의 범위를 넓히지 않는다 |
| 12 | `repo.Resolve`는 `ENOENT`·`ENOTDIR`·`EINVAL`·`ENAMETOOLONG`·`ELOOP`를 "없음"으로 판정하고, 그 밖의 에러(`EACCES`·`EIO` 등)만 돌려준다 | 지휘자 판단(리뷰 A 🔴) — 앞의 것은 캔버스·config 내용만으로 생기고 브라우저도 그 파일을 못 불러온다. 뒤의 것은 환경 문제다 |
| 13 | 대소문자를 구분하지 않는 파일시스템에서 `repo.Resolve`는 디스크에 저장된 표기를 돌려준다 | 사용자 2026-10-21(리뷰 A 🟡) — design의 "실제 경로로 정규화하므로 같은 파일이면 같은 키"와 맞추고 `css_not_served` 오탐을 막는다 |
| 14 | 심링크 `.doan`(`Find`는 따라가고 `CommentFiles`는 건너뜀), `--repo` 상대 경로는 시작 디렉터리 기준, 파일 나열은 바이트 순 정렬 — 지금 동작 그대로 두고 승격 때 ARCHITECTURE §13에 적는다 | 지휘자 판단(리뷰 A 결정 3·4·5) — 읽기만 하는 경우라 위험이 작고, 바꿀 근거가 정본에 없다 |
| 15 | `orphan_comment_file`은 id가 무효이거나 meta가 두 개인 캔버스도 센다. `HasID`인 캔버스의 id 문자열(첫 번째)이 코멘트 파일 id와 정확히 같으면 orphan이 아니다. D의 `comments`도 같은 기준으로 캔버스와 파일을 잇는다 | 지휘자 판단(리뷰 B) — design의 조건은 "같은 id의 캔버스가 없음"이다. 원인은 `invalid_canvas_id`가 이미 알리고, Q4가 막으려던 코멘트 파일 삭제 유도를 피한다 |
| 16 | 간접 `@import`(Direct 아님)가 리포 밖이거나 서빙 범위 밖이면, 그 `@import`를 담은 CSS 파일에 귀속한다(`path`는 CSS 파일, `target`은 href, `(path, code, target)`마다 한 건) | 지휘자 판단(리뷰 B) — design '귀속'은 CSS 파일에서 나온 finding을 그 파일로 보낸다. 고칠 곳도 그 파일이다 |
| 17 | `canvas.LocalPath`는 `?`·`#`를 뗀 결과가 빈 문자열이면 로컬 경로가 아니다(무시) | 지휘자 판단(리뷰 B) — 브라우저는 href가 빈 `<link>`를 가져오지 않는다 |
| 18 | 토큰 CSS가 `@import`하는 파일의 색은 지금처럼 `hardcoded_color`로 경고한다 | 지휘자 판단(리뷰 B) — design이 "토큰 CSS 파일 자신"만 뺀다고 명시했고, warning이다 |

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 워커 모델 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| A | 태스크 1, 태스크 5(`Reach` 제외) | `cli/internal/cli/`(인자·봉투·이스케이프 파일), `cli/internal/repo/**` | 없음 | Codex | `go test ./...`, `go vet ./...` | 대기 |
| B | 태스크 2, 태스크 3 | `cli/internal/canvas/**`, `cli/internal/check/**`, `go.mod`, `go.sum` | 없음(3은 같은 워커 안에서 2 다음) | Codex | `go test ./...`, `go vet ./...`, `grep -rnE 'TrimSpace\|strings\.Trim\(' cli/internal/canvas` 0건 | 대기 |
| C | 태스크 4 | `cli/internal/comments/**`(순수 함수) | 없음 | Codex | `go test ./...`, `go vet ./...` | 대기 |
| D | 태스크 5의 `Reach`, 태스크 6, 태스크 7 | `cli/internal/cli/**`(A 파일 포함, 새 파일), `cli/cmd/doan/**`, `cli/internal/comments/`의 붙이기 파일 | A·B·C 통합 | Codex | `go test ./...`, `go vet ./...`, `go run ./cli/cmd/doan --json ls` | 대기 |
| 지휘 | 태스크 8 | `docs/**`, `AGENTS.md` | D 통합 | — | grep(태스크 8 검증) | 대기 |

태스크 0은 main에서 끝났다(`4ce0995`). tasks의 체크박스 1~8은 모두 위 표의 한 행에 속한다.

## 겹침과 순서

- 1차(병렬): A·B·C. 소유 파일이 겹치지 않는다. `go.mod`·`go.sum`은 B만 바꾼다.
- 2차(직렬): D. A의 `cli` 파일, C의 `comments` 패키지를 이어서 고치므로 A·B·C 통합 뒤에 시작한다.
- 각 배치는 `feat-cli-core`에서 갈라진 자식 worktree에서 일한다. 지휘자가 배치 커밋을 `feat-cli-core`에 cherry-pick한다.
- 리뷰: 배치마다 Claude 리뷰 워커가 `/code-review`로 보고만 한다. 🔴가 0이 될 때까지 고칠 점을 원래 Codex 워커에 보낸다.

## 진행

(통합 해시·라운드는 진행하며 적는다)
