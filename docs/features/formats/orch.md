# formats — orch

원본: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md)

- 시작 해시: `1bd63ab` (main)
- 통합 브랜치: `feat-formats`
- 지휘: Claude Code (claude-opus-5-5)

## 결정 기록

| 날짜 | 결정 | 근거 |
|---|---|---|
| 2026-10-21 | Go는 Homebrew로 설치한다(go 1.27.3). 없는 도구는 brew로 설치한다 | 사용자 |
| 2026-10-21 | 코드 위치: 루트 `go.mod`(module `github.com/SinhyeokKang/doan-design`), `schema/embed.go`, Go는 `cli/internal/formats/`, TS는 `app/`(npm) 아래 `app/src/formats/` | 사용자 |
| 2026-10-21 | JSON Schema 2020-12, TS ajv(`ajv/dist/2020`), Go `github.com/santhosh-tekuri/jsonschema/v6`, vitest + `tsc --noEmit` | 사용자 |
| 2026-10-21 | 게이트 명령: `go test ./...` · `go vet ./...` · `npm --prefix app test` · `npm --prefix app run typecheck`. 배치 A가 AGENTS.md 'Commands'에 적는다 | 지휘 판단 — 위 결정에서 나온다 |
| 2026-10-21 | 구현 워커는 Codex(gpt-6-astra, effort high), 독립 리뷰는 Claude(claude-opus-5-5) | 사용자가 모델 교차를 허가했다. 구현과 리뷰의 모델군을 달리해 같은 맹점을 피한다 |
| 2026-10-21 | 태스크 0·1은 지휘가 main에서 처리한다(`5c8ffe4`·`80c7b99`·`1bd63ab`) | tasks.md 브랜치 규칙: 문서만 바꾸는 태스크 |
| 2026-10-21 | 태스크 4(접기 픽스처와 테스트)는 배치 A가 쓴다. B·C는 테스트와 픽스처를 고치지 않는다 | 지휘 판단 — 두 구현이 같은 기대 결과에 묶이도록 테스트 소유자를 하나로 둔다 |

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 워커 모델 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| — | 태스크 0 정본 기록 | `docs/PRODUCT.md` · `docs/ARCHITECTURE.md` | — | 지휘 | 세 결정이 날짜와 함께 있음 | 완료 `5c8ffe4` `80c7b99` |
| — | 태스크 1 PoC 5 머지 | `docs/PRODUCT.md` §6 | — | 지휘 | 충돌 없음 + 대조군 충돌 | 완료 `1bd63ab` |
| A | 태스크 2 · 3a · 3b · 4 | `go.mod` · `go.sum` · `schema/**` · `app/package.json` · `app/package-lock.json` · `app/tsconfig.json` · `app/vitest.config.*` · `app/src/formats/**`(검증기, 테스트, 접기 스텁) · `cli/internal/formats/**`(검증기, 테스트, 접기 스텁) · `.gitignore` · `AGENTS.md` 'Commands' · `docs/DIRECTORY.md` | — | Codex | 네 게이트 명령. 검증 테스트 green, 접기 테스트 red | 대기 |
| B | 태스크 5 TS `parseLines` + `fold` | `app/src/formats/` 안의 parse·fold 구현 파일만 | A | Codex | `npm --prefix app test` · `typecheck` green | 대기 |
| C | 태스크 6 Go `parseLines` + `fold` | `cli/internal/formats/` 안의 parse·fold 구현 파일만 | A | Codex | `go test ./...` · `go vet ./...` green | 대기 |
| — | 태스크 6 뒤 PoC 5 접기 기록 · 태스크 7 정본 승격 | `docs/PRODUCT.md` · `docs/ARCHITECTURE.md` · 디렉터리 삭제 | B · C | 지휘 | tasks 7 검증 | 대기 |

## 겹침과 순서

- A가 끝나야 B·C가 시작한다. A는 위치·명령·스키마·테스트를 모두 정하므로 나누지 않고 한 워커가 차례로 진행한다.
- B와 C는 파일이 겹치지 않으므로 병렬로 돌린다.
- 각 배치는 `feat-formats`에서 갈라진 자체 worktree에서 일한다. 지휘가 `feat-formats`로 cherry-pick해 통합한다.
