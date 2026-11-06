# fast-mode — orch

- 계획: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md)
- 시작 hash: `ea36aece`(main)
- 통합 브랜치: `feat/fast-mode`(사람이 만든 worktree, main `ea36aece`에서 시작)
- 모델 교차: 이 실행에서 사람이 허용했다(Claude·Codex 섞어 씀).

## 실행 규칙(사람)

- main에는 문서 커밋이 계속 들어온다. `/verify` 전마다, 그리고 마지막 push·PR 전에 `feat/fast-mode`를 최신 `origin/main`으로 rebase하고, 충돌을 풀고, rebase 뒤에 `/verify`를 돌린다.
- 마지막은 `feat/fast-mode` push와 PR이다. 병합하지 않는다.

## 결정 기록

| # | 질문 | 답 | 근거 |
|---|---|---|---|
| 1 | R1을 실제 계정으로 돌릴까 | main checkout의 `.scratch/provider-profile/userData`(실제 HOME, 기존 로그인)를 재사용해 진행한다 | 사람 |
| 2 | R1에서 Claude `fast_mode_state: "on"`을 어떻게 볼까 | 토큰(추가 사용량)이 남은 Claude 계정으로 바꿔 로그인한다. 로그인 승인은 사람이 브라우저에서 한다 | 사람 |
| 3 | P1·P2 확인 명령 | 이미 끝났다(tasks P1·P2 체크, design §8) | conductor 판단 — tasks |
| 4 | B3 `/design-sync`에서 모델 목록을 어떻게 얻을까 | 결정 1의 프로필로 목록만 읽는다(프롬프트를 보내지 않는다). Fast 행은 목록이 있어야 보인다 | conductor 판단 — 결정 1과 같은 계정, 목록 읽기는 사용량을 쓰지 않는다 |
| 5 | 계약 타입을 어디에 둘까 | 배치 C가 main 쪽 타입(`types.ts`, `models.ts`, `summary.ts`, `StartRequest`, preload send 요청)을 먼저 정한다. 그 뒤 M과 R을 나란히 돌린다 | conductor 판단 — preload와 renderer가 main 타입을 import하므로 파일 겹침 없이 병렬로 가려면 계약이 먼저 와야 한다 |
| 6 | Claude 목록 읽기의 `unavailable` | C가 `models.ts`에 reason → `unavailable` 순수 함수를 두고, M이 `runners.ts`의 목록 읽기에서 부른다 | conductor 판단 — design §1 `models.ts`·§2 1 |
| 7 | R1·Z1 담당 | R1은 별도 확인 worker(보고만), R2·Z1은 conductor | conductor 판단 — orchestrate §4·§5 |

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| C | A1, A2, 계약 타입(`StartRequest.fast?`, preload `sendConversation` 요청의 `fast?`) | `app/src/main/conversation/{store,types,summary,models}.ts`와 그 테스트, `service.ts`의 `StartRequest` 한 줄, `app/src/preload/index.ts` | — | Codex `gpt-6.1-sol` medium — 검증 규칙과 파싱이 정해진 기계적 작업 | `npm --prefix app test`(storeIndex·storeRecovery·summary·models), `npm --prefix app run typecheck` | 대기 |
| M | A3, A4(main: `claudeFastOutcome`, 자동 끔), B1 | `app/src/main/conversation/{ipc,service,runners,transport}.ts`와 그 테스트 | C | Claude Opus high — queue·Send now·핸드오프·steer·이벤트 순서와 자동 끔이 얽혀 틀리면 잘못된 과금 요청이 나간다 | `npm --prefix app test`, `npm --prefix app run typecheck`, `grep -rn '\.acquire(' app/src/main` 전후 동일 | 대기 |
| R | A4(renderer: `fastUnusedText`), A5, B2 | `app/src/renderer/**`, `app/src/restore/uiState.ts`와 그 테스트 | C | Claude Opus high — 메뉴 접근성, 기억 경로(POSTMORTEM 11-01·11-02), 실시간 이벤트만 반영하는 자동 끔 | `npm --prefix app test`, `npm --prefix app run typecheck`, `rg -n "startConversation\(\|sendConversation\(\|onRemember" app/src/renderer --glob '!*.test.*'` | 대기 |
| S | B3 `/design-sync fast-mode` | renderer 구현 수정, `docs/DESIGN.md` | R 통합 | R worker의 후속 Task(Claude Opus high) — 자기 구현을 재는 편이 맥락이 이어진다 | `/design-sync` 보고에 불일치 없음 | 대기 |
| T | R1 `/runtime-test` | 없음(보고만, `.scratch/`) | C·M·R·S 통합 | Claude Opus high — 실제 계정, 계정 교체, 여러 경우 | `/runtime-test` 보고와 스크린샷 | 대기 |
| — | R2 `/verify` | — | 모든 통합, rebase 뒤 | conductor | 종료 코드 0 | 대기 |
| — | Z1 문서 승격 | PRODUCT, ARCHITECTURE, DESIGN, BACKLOG, `docs/features/fast-mode/` 삭제 | T | conductor | tasks Z1 검증 | 대기 |

리뷰 worker(보고만, `/code-review`): C → Claude Sonnet medium(작은 diff), M → Codex `gpt-6-astra` medium, R → Codex `gpt-6-astra` medium. 모두 batch와 다른 모델 계열이다.

## 겹침과 순서

- C를 먼저 통합한다. 그 뒤 M과 R은 파일이 겹치지 않아 나란히 돈다(M은 main, R은 renderer·restore).
- `app/src/preload/index.ts`와 `service.ts`의 `StartRequest`는 C만 고친다. M·R이 더 바꿔야 하면 conductor에게 알린다.
- S(B3)는 R 통합 뒤, T(R1)는 S 뒤다. GUI 확인은 한 번에 하나만 돈다.

## 검토 기록

(통합하면서 적는다)
