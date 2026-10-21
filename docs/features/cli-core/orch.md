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
