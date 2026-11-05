# canvas-handoff — orch

원본: [spec](./spec.md)·[design](./design.md)·[tasks](./tasks.md). 체인 [chain-261106](../chain-261106/chain.md) 링크 2이다. 권한(main 병합, 실제 HOME·공용 프로필 probe, `/agent-eval`)은 체인 파일의 '상시 권한'과 '시작 점검 승인'을 따른다.

- 시작 hash: `53314359`(origin/main, 링크 1 병합 `3e98f455` 뒤), D1 체크 `8024e44e`.
- 통합 branch: `feat/canvas-handoff`.
- 지휘자: Claude Code(canvas-handoff-orch). 작업자는 모두 Claude다.
- Codex: 쓰지 않는다. 2026-11-06 Codex 주간 한도(`window_minutes: 10080`)가 92% 사용이고 2026-11-11에 초기화된다(`$CODEX_HOME/sessions/2026/11/06/rollout-2026-11-06T04-47-14-…jsonl`, 2026-11-05T19:47Z 기록). 남은 양은 E3의 Codex 실행에 남긴다.

## 결정 기록

1. **Codex 프로필의 `doan handoff` 승인**(사람, 2026-11-06): 링크 1이 Codex 프로필에 `doan` 전부 허용 규칙을 넣어, 그대로 두면 Codex Default·Accept edits의 핸드오프가 묻지 않는다. 사람은 "handoff만 묻게"를 골랐다. Codex 프로필에만 `rules/doan-handoff.rules`(`prompt`)를 더한다(design §4, tasks C4). 고르지 않은 것: Codex는 묻지 않게 두기, Claude에도 허용 규칙 더하기.
2. **batch 나누기**(지휘자 판단, 근거: 파일 겹침과 선행 관계). schema(A1)가 Go CLI와 TS main 둘의 선행이라 먼저 둔다. renderer(U)는 main의 이벤트 타입·IPC에 기대므로 M 뒤이고, eval(E)은 `turnPrompt`(B3)와 v5 schema에 기대므로 M 뒤에 U와 나란히 돈다.
3. **R1·R2·Z는 지휘자가 맡는다**(지휘자 판단, 근거: R1은 실제 HOME과 공용 프로필을 쓰고, Z는 문서 승격이다).
4. **`/design-sync`**(지휘자 판단, 근거: AGENTS.md 'Workflow', 이 화면들의 첫 구현): U batch가 design '초안 요청'의 여섯 frame을 비교한다.

## batch

| batch | 항목 | 파일 소유 | 선행 | 모델·effort(이유) | gate | 상태 |
|---|---|---|---|---|---|---|
| S | A1 | `schema/app-socket.v5.schema.json`, `schema/fixtures/app-socket-v5/`, `app/src/formats/validate.ts`, `cli/internal/formats/validate.go`(+테스트) | — | Sonnet high(v4 패턴을 따르지만 바이트 상한·코드 목록을 맞춰야 한다) | `go test ./...`, `npm --prefix app test` | 통합(`3e7a38a8`·`7821d922`). 리뷰는 G·M 리뷰가 schema를 함께 본다(지휘자 판단: schema·fixture만이고 v4 패턴) |
| G | B1, C3 | `cli/`(formats 제외) | S | Opus medium(직렬화 줄 상한과 exit 매핑의 경계 사례가 많다) | `go test ./...`, `go vet ./...` | 통합(`d353bb8a`·`5ea6bd15`·`f58cff7d`). 리뷰 RG(Opus medium): 🔴0 🟡0 🟢4, 고치지 않음 |
| M | B2, B3, B4, C1, C2, C4 | `app/src/main/`(runtime·conversation·agentAuth), `app/src/shared/`·preload의 이벤트·IPC 타입 | S | Opus high(턴 끝 판정, `contested`, 큐 옮기기, 수락 직전 재확인 등 동시성) | `npm --prefix app test`, typecheck | 대기 |
| U | B5, U1, U2, `/design-sync` | `app/src/renderer/`, DESIGN.md | M | Opus high(이동·toast·read 대기 규칙과 초안 일치) | `npm --prefix app test`, typecheck, build, `/design-sync` | 대기 |
| E | E1, E2, E3 | `eval/`, USABILITY-EVAL.md | G, M | Sonnet high(fake app·시나리오는 기존 패턴, E3는 실제 실행) | `node eval/run.ts --self-test`, `node --test 'eval/**/*.test.ts'`, E3 라운드 | 대기 |
| 지휘자 | R1, R2, Z1–Z3 | PRODUCT·ARCHITECTURE·BACKLOG, feature 디렉터리 | 모두 | — | `/runtime-test`, `verify.mjs --eval`, `/doc-check` 범위 확인 | 대기 |

리뷰: batch마다 독립 Claude 리뷰 작업자가 `/code-review`를 돈다(모델은 diff 난이도로 정한다).

순서: S → (G ∥ M) → (U ∥ E) → R1 → R2 → Z → rebase → 통합 gate → PR·병합. G와 M, U와 E는 파일이 겹치지 않는다.

## 진행 기록
- G 리뷰 RG의 🟢 4개(U+FEFF만 있는 메시지가 Go에서는 통과하고 ajv `\S`에서는 막혀 `internal_error`가 됨, C1 허용 fixture 없음, root가 길 때 넘침 메시지가 `--message`를 탓함, `v` 해석 중복)는 고치지 않는다(지휘자 판단: 사람이 쓰지 않는 경계이거나 동작에 영향이 없다). 근거: `.scratch/evidence/review-G.md`.
