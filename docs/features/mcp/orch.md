# mcp — orch

- 원본: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md)
- 시작 해시: `2c9c538` (main)
- 통합 브랜치: 배치 B0은 main(tasks.md 태스크 0). 배치 A부터는 B0을 통합한 main에서 `feat-mcp`를 만들어 쓴다.
- 지휘: Claude Code(claude-opus-5-5). Orca orchestration Run으로 워커를 관리한다.

## 결정 로그

| 날짜 | 결정 | 근거 |
|---|---|---|
| 2026-10-21 | 의존성은 `go get github.com/modelcontextprotocol/go-sdk@v1.8.0` + `go mod tidy`로 추가한다 | 사용자 |
| 2026-10-21 | 일회성 에이전트 호출은 `claude -p --mcp-config <tmp.json> --strict-mcp-config --allowedTools 'mcp__<이름>__*'`, `codex exec -c 'mcp_servers.<이름>.command=…' -c 'mcp_servers.<이름>.args=[…]'`로 한다 | 사용자 |
| 2026-10-21 | 태스크 0·4에 한해 Claude 워커가 `codex exec`를 부른다 | 사용자(feature-review에서 허락) |
| 2026-10-21 | 워커는 Claude Code, 모델은 사용자 기본 설정을 따른다(`--model` 생략, 실행 뒤 `launch.effective`로 확인) | 지휘 판단 — AGENTS.md 모델 경계, Orca 지침(사용자가 모델을 지정하지 않으면 생략) |
| 2026-10-21 | 배치는 B0(태스크 0) → A(태스크 1~4) → 지휘(태스크 5) 순서로 직렬이다 | 지휘 판단 — 태스크 1~3이 모두 `cli/internal/cli/`와 테스트 도우미를 공유하고, 태스크 4는 태스크 2의 바이너리가 필요하며, 태스크 1 이후는 태스크 0 통과가 전제다 |
| 2026-10-21 | 태스크 5(승격과 정리)는 지휘가 한다 | 지휘 판단 — orchestrate 5단계가 승격과 디렉터리 삭제를 지휘에게 둔다 |
| 2026-10-21 | B0 결과로 Q2·Q3를 그대로 둔다. 텍스트와 `structuredContent`에 같은 봉투를 넣는다 | 지휘 판단 — 두 에이전트 모두 작업 디렉터리가 프로젝트 루트였고, Claude Code는 `structuredContent`만, Codex는 둘 다 보여 줬다(PRODUCT §6). design이 이미 두 채널에 같은 봉투를 넣는다 |
| 2026-10-21 | 일회성 호출 명령을 고친다: `claude -p … --allowedTools '…' -- "<프롬프트>" < /dev/null`. Codex는 도구 이름의 `-`를 `_`로 바꿔 노출한다 | B0 관찰 — `--allowedTools`가 가변 인자라 프롬프트를 삼켰다 |

## 배치

| 배치 | 항목 | 파일 소유 | 전제 | 워커 모델 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| B0 | 태스크 0 | `.scratch/poc6-mcp/`, `docs/PRODUCT.md` §6 | 없음 | Claude Code(기본) | PRODUCT §6 기록 세 항목(호출 결과·작업 디렉터리·텍스트/`structuredContent`)이 모두 있음, `mcp list` 전후 같음 | 통과, main `7f9c5d9`(워커 `495c095`), 1회 |
| A | 태스크 1, 2, 3, 4 | `cli/internal/cli/mcp.go`·`mcp_test.go`, `run.go`·`run_test.go`, `skill.md`·`skill_test.go`, `go.mod`, `go.sum` | B0 통과, `feat-mcp` | Claude Code(기본) | `go test ./...`, `go vet ./...`, 태스크 2 수동 확인, 태스크 4 통과 기준 | 진행 |
| 지휘 | 태스크 5 | `docs/ARCHITECTURE.md`, `docs/PRODUCT.md`, `docs/DIRECTORY.md`, `AGENTS.md`, `docs/features/mcp/` 삭제 | A 통합 | — | grep(도구 이름 여섯 개, `isError`), 디렉터리 없음 | 대기 |

## 겹침과 순서

- B0과 A는 겹치는 파일이 없지만 A가 B0 결과(작업 디렉터리, SDK 동작)에 기대므로 직렬로 둔다.
- B0 커밋은 main에 cherry-pick하고 push한다. 그 뒤 main에서 `feat-mcp`를 만들고 A를 띄운다.
- A가 끝나면 독립 리뷰 워커가 `/code-review`를 하고, 🔴가 0이 될 때까지 A 워커가 고친다.
