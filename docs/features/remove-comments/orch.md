# remove-comments — orch

계획 원본: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md). 이 문서는 진행 상태와 conductor의 판단만 적는다.

- 시작 해시: `03eda4bb` (origin/develop)
- 통합 브랜치: `feat/remove-comments` → PR base `develop`. 병합하지 않는다(lead 세션이 리뷰·병합).
- 모델 경계: worker와 리뷰어는 Claude만. T10 `/agent-eval`은 Claude Code·Codex를 함께 돌리는 상시 예외다.

## 결정 로그

D1–D8은 feature 문서에서 사용자가 승인했다. 아래는 실행 중 conductor가 정한 것이다.

- **O1. 규칙 글자 인용의 담당.** T3 검증의 `rg` 범위(`cli app/src eval .agents docs/ARCHITECTURE.md`)는 B2·B3·B4 파일까지 걸친다. B1은 `cli/`와 `app/src/main/conversation/prompt.ts`·`prompt.test.ts`(B2가 건드리지 않는 파일)를 고치고, `eval/scenarios/R8d/`는 B3, `.agents/`와 ARCHITECTURE는 B4가 고친다. 남은 인용은 B4 T9에서 같은 `rg`로 다시 확인한다. — conductor's call: tasks.md 파일 소유와 병렬 순서를 지키기 위해.
- **O2. `app/src/formats/types.ts`.** B1은 fold 삭제로 고아가 된 타입만 지우고, `Comment`·`Target`과 나머지 코멘트 타입은 B2가 `projection.ts`를 정리할 때 지운다. — conductor's call: design '앱' 문장.
- **O3. 감시 방식.** Orca가 `worker_done`·`question`·`escalation`(stopReason 포함)으로 conductor를 깨운다. 별도 polling 스크립트는 돌리지 않는다. — conductor's call: Orca 버전 맞춤 가이드가 polling 스크립트를 금지한다(`check`가 메일을 가져가 깨움이 사라진다).

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| B1 | T1–T3 | `cli/`, `schema/`, `app/src/formats/`(fold·validate·고아 타입), `app/src/brand/candidates.ts`, `app/src/main/conversation/prompt*.ts`, `eval/lib/socket.ts`, `eval/lib/workspace.test.ts`, `eval/scenarios/H6`·`H7`·`H8` | 없음 | Opus high — 스키마·CLI의 깨지는 변경과 에이전트가 읽는 가이드를 출력 예산 안에서 다시 쓴다 | `go test ./...`, `go vet ./...`, `npm --prefix app test`, `node --test 'eval/lib/*.test.ts'`, `verify.mjs`(--eval 없이) | 대기 |
| B2 | T4–T7 | `app/src/`(B1 소유 제외), `.doan/canvases/canvas-row-menu.html`·`doan-shell.html`·`local-doan-files.html` | B1 통합 | Opus high — 공용 앵커·문서 바인딩 모듈 이동(D4), Trash IPC 변경, 격리 앱 runtime-test | typecheck·lint·`npm --prefix app test`, `doan check`, T7 runtime-test 증거 | 대기 |
| B3 | T8 | `eval/`(B1 소유 제외) | B1 통합 | Sonnet high — 시나리오 은퇴와 시드 정리가 대부분 기계적이지만 단계가 많고 self-test를 통과해야 한다 | `node --test 'eval/**/*.test.ts'`, `node eval/run.ts --self-test` | 대기 |
| B4 | T9–T12 | `docs/`, `README.md`, `AGENTS.md`, `.agents/skills/`, 루트 `.gitattributes`, `docs/features/remove-comments/` 삭제 | B2·B3 통합 | conductor | T9 `rg`, T10 agent-eval 라운드, T11 `verify.mjs --eval` | 대기 |

리뷰: B1·B2 diff는 Opus medium, B3 diff는 Sonnet high 독립 리뷰 worker가 `/code-review`로 본다.

## 겹침과 순서

- B1 → {B2 ∥ B3} → B4. B2와 B3은 파일이 겹치지 않는다(`app/src`·`.doan/canvases` 대 `eval/`).
- B1이 `app/src/formats/`와 `eval/` 일부를 먼저 고치므로 B2·B3은 B1 통합 뒤에 시작한다.
- B1·B2 통합 HEAD의 `/verify`는 `--eval` 없이, B3 통합 뒤부터 `--eval`로 돌린다.

## 진행 기록

(통합 해시, 리뷰 라운드, runtime-test 증거를 여기에 적는다.)
