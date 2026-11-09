# provider-profile-isolation — orch

- 원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md). 체인: [chain-261109](../chain-261109/chain.md) 링크 2.
- 시작 hash: `c21530f2`(develop, 링크 1 merge `fad00be9` 포함).
- 통합 브랜치: `feat/provider-profile-isolation`(lead가 만들었다). conductor worktree: `/Users/sinhyeokkang/orca/workspaces/doan-design/provider-profile-isolation-orch`.

## 결정 기록

- Q1–Q6, A–D: design §10에서 이미 정해졌다.
- T0 Keychain 링크·Antigravity 실제 로그인, T5 실제 HOME Antigravity 확인: 사용자가 미리 승인했다(체인 파일 '인계 기록'). 다시 묻지 않는다.
- P0 실패 시 방향, P2 실패 provider 처리, T2a 초안 확인: PoC 결과가 나온 뒤 conductor가 추천과 함께 사용자에게 묻는다.
- 링크 1이 넣은 `account_changed`·`sign_in_changed` 판정(`prepare.ts`)과 `releaseFailed`·`TransportState.running`(`service.ts`·`runners.ts`)은 fence를 얹을 때 그대로 둔다 — conductor 판단, 근거: 체인 파일 '링크 1 merge'.
- model 경계: Claude worker만 쓴다. 체인 파일이 Codex 사용을 허락했지만 이번 링크에서는 쓰지 않는다 — conductor 판단, 근거: batch가 직렬이라 병렬 용량이 필요 없다. Codex를 쓰게 되면 그때 남은 사용량을 확인하고 여기에 적는다.

## batch

batch는 모두 직렬이다. T0와 T1은 둘 다 실제 Antigravity와 `~/.gemini/antigravity-cli/`·Keychain 전후 비교를 다루므로 같이 돌면 측정이 섞인다. T3 스냅숏은 T1의 통과 정책 문장이 있어야 한다. T5는 T4 구현이 있어야 한다.

| batch | 항목 | 파일 소유 | 선행 | model·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| W1 PoC-A | P0, T0(P1·P3) | `.scratch/provider-profile-isolation/`, design.md §8 P0·P1·P3 | 없음 | Opus high — 바이너리 archive 해석과 실제 Keychain을 건드리는 판단, 틀리면 사람의 `agy` 로그인을 망친다 | tasks P0·T0 검증, 실제 상태 전후 비교 | 대기 |
| W2 PoC-B | T1(P2) | `.scratch/provider-profile-isolation/`, design.md §8 P2 | W1, T2의 P0 분기 | Opus high — Seatbelt 정책 평가와 다섯 provider × 모드 판단 | tasks T1 검증, provider × 모드 표 | 대기 |
| conductor | T2 결정 확인, (조건부) T2a 초안 | spec·design·tasks | W2 | — | design §10 남은 확인 필요가 결정으로 바뀜 | 대기 |
| W3 구현 | T3, T4 | `app/src/main/agentAuth/`(새 fence 모듈, `environment.ts`, `manager.ts`), `app/src/main/conversation/`(`prepare.ts`, `service.ts`, `runners.ts`, `acpRunner.ts`)와 각 테스트 | T2 | Opus high — process spawn·fail closed·보안 경계, 링크 1 거절 경로 보존 | `npm --prefix app test`·typecheck·lint, `verify.mjs` | 대기 |
| W4 실제 앱 | T5 | `.scratch/provider-profile-isolation/` | W3 | Opus high — 다섯 provider 실제 턴과 실제 HOME 확인 | `/runtime-test` 보고서, 실제 상태 전후 비교 | 대기 |
| W5 리뷰 | T6 `/code-review` | 없음(보고만) | W4 | Opus high — 독립 리뷰, 보안 경계 diff | 보고서 | 대기 |
| W3 수정 | T6 `/refactor`, `/postmortem` | W3과 같음, `docs/POSTMORTEM.md` | W5 | Opus high(W3 재사용) | 🔴 0, `verify.mjs` | 대기 |
| conductor | T7 승격과 정리 | ARCHITECTURE·PRODUCT·BACKLOG·(DESIGN), feature 디렉터리 삭제 | 전부 | — | tasks T7 grep 두 개 | 대기 |

항목 대응: P0·T0 → W1, T1 → W2, T2·T2a → conductor(T2a 초안을 그리게 되면 새 worker), T3·T4 → W3, T5 → W4, T6 → W5·W3, T7 → conductor.

## 진행 기록
