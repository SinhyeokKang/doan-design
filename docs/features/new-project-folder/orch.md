# new-project-folder — orch

- 원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md)
- 체인: [chain-261114-1](../chain-261114-1/chain.md) 링크 2/2. 상시 권한과 시작 점검은 그 파일을 따른다.
- 시작 해시: 31e9b0ee2 (origin/develop). 통합 브랜치: `feat/new-project-folder`(리드가 만들어 체크아웃했다).
- 컨덕터: Claude(이 세션). 워커는 `--worktree new-child --base-branch feat/new-project-folder`, `/ship bypass new-project-folder`, push 전에 멈춘다.

## 모델 경계

- 체인 파일이 이 링크에 Codex 워커를 허가했다(2026-11-14). 컨덕터는 Claude다.
- 시작 시 Codex 주간 사용량: 42% 사용(`window_minutes: 10080`, 재설정 2026-11-19 18:16 KST, Orca `CODEX_HOME`의 최신 rollout).
- 쓰는 범위: 독립 `/code-review`(R)와 그 재검토만 Codex `gpt-6-astra` medium. 구현과 PoC는 Claude(메모리 규칙: Claude가 주, Codex는 교차 리뷰).

## 결정 로그

- 컨덕터 판단 — 문서 정렬: `project-step-actions` 병합(PR #196) 뒤 바뀐 줄 번호(`Onboarding.tsx:369-411`, `:367`, `App.tsx:1302`, `Onboarding.test.tsx:266`)와 `LocalFolderCard.interaction.test.tsx`를 문서에 반영했다. `projectFocusNode`의 '알림 버튼이 사라지면 카드 첫 버튼' 규칙에 New folder 경우를 더한다고 design.md에 적었다(spec 정한 점 8이 이미 정한 동작).
- 컨덕터 판단 — 작업 2 완료: 체인 파일 시작 점검 2와 링크 2 '초안' 줄이 2026-11-14 사용자 확인을 적고 있고, PR #196은 `shipped-notices-choose` 안만 바꿨다. `doan check --repo . --json` 오류 0(경고 40, 모두 이 초안 밖).
- 컨덕터 판단 — PoC와 구현 병렬: 비재귀 `mkdir`는 창이 무엇을 돌려주든 덮어쓰지 않으므로(design.md 'PoC 의존') PoC는 이미 있음 문구만 바꿀 수 있다. B는 그 문구를 잠정으로 두고 시작한다. PoC가 문구를 바꾸면 초안 수정과 사용자 확인을 거친 뒤 B에 새 Task로 보낸다.
- 사용자 결정(2026-11-14) — 저장 창 이름 칸: PoC(P)에서 Electron 저장 창은 이름 칸을 비워 둘 수 없었다. macOS 기본 이름("Untitled"/"무제")이 선택된 채 여는 것으로 정했다. spec 정한 점 3·완료 조건, design '세부 규칙', 작업 6을 고쳤고(c8760cc65), 초안 `save-panel` 프레임은 P가 고친 뒤 사용자 확인을 받는다.
- 컨덕터 판단 — 이미 있음 문구: PoC 결과 바꾸지 않는다(macOS Replace 질문 뒤에도 "Doan didn’t replace it"이 맞게 읽힌다).
- 컨덕터 판단 — 대소문자만 다른 이름: 알림의 “<name>”은 입력한 이름을 보인다. B가 이미 그렇게 구현했고, 디스크 이름을 찾는 규칙을 더하지 않는다.
- 컨덕터 판단 — `/agent-eval` 없음: 체인 파일 운영 메모와 tasks.md 머리. 에이전트가 읽는 글(`skill.md:53`, `active.go:30`, `open_rules.go:82`)은 바뀌는 라벨을 말하지 않는다. PR 본문에 적는다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| P | tasks 1, 초안 수정 | `.scratch/new-project-folder/`, design.md 'PoC 의존' | — | Claude Opus high: 네이티브 시트 입력, POSTMORTEM 함정 셋(잠긴 데스크톱·눌린 ⌥·격리 안 된 Electron) | `node .scratch/new-project-folder/poc.mjs` 완료 줄·exit 0, design.md 관찰 기록 | 완료(d65d7f9c0), 초안 수정 진행 |
| B | tasks 3, 4, 5, 6 | `app/src/main/index.ts`, `app/src/main/onboarding/projects.ts`, `app/src/main/senderAllowed.ts`, `app/src/preload/`, `app/src/renderer/{projectStep,Onboarding,folderDrop,App}.ts(x)`와 그 테스트, 스타일, `docs/DESIGN.md`, `.scratch/design-sync/new-project-folder/`, `.scratch/runtime-test/new-project-folder/` | GUI 단계(5, 6)는 P의 GUI가 끝난 뒤 | Claude Opus high: main IPC 경계, 상태 전이, 포커스, 네이티브 probe | tasks 3–6의 검증 줄 | 완료(a11d0bdba, 1cde70f44, d397dfc9c), 미통합 |
| R | tasks 7(리뷰) | 보고서만 | B | Codex gpt-6-astra medium: 교차 계열 판단 리뷰(체인 허가) | 🔴 0 | 진행 |
| B(수정) | tasks 7(`/refactor`) | B와 같음 | R | B 워커가 이어서 | 🔴 0, 영향받은 6번 항목 재확인 | 대기 |
| 컨덕터 | tasks 8, 9 | PRODUCT, ARCHITECTURE, BACKLOG, feature 디렉터리 삭제 | B 통합 | — | tasks 8·9 검증 줄 | 대기 |

- 작업 2는 완료(결정 로그).
- 겹침: P와 B는 코드 파일이 겹치지 않는다. 둘 다 격리 앱과 네이티브 입력을 쓰므로 B는 5·6 전에 `ask`로 컨덕터에 묻고, 컨덕터가 P의 GUI 종료를 확인한 뒤 답한다. design.md는 P만 고친다.
- 모든 체크박스(1–9)가 한 행에 걸린다.

## 진행

| 배치 | Run·Task·Dispatch | 워크트리 | 통합 해시 | 라운드 |
|---|---|---|---|---|
| P | run_6648828fe5bb · task_638787e4ebbb · ctx_6ec6ae0a9668 | `npf-poc` (5fa5a713a 기준) | d65d7f9c0 | 1 완료 |
| P(초안) | task_c53ed68a51e9 · ctx_3a3f7d5a778e | `npf-poc` | — | 진행 |
| B | run_6648828fe5bb · task_4387308aad57 · ctx_d3f8c9e2289b | `npf-impl` (5fa5a713a 기준) | — | 1 완료(design-sync 2279행 차이 0, runtime 19 checks) |
| R | task_52d60241ce7d · ctx_b46ef401ca8c (Codex gpt-6-astra medium) | `npf-impl`(읽기만) | — | 진행 |
