# mcp-connectors — 지휘 기록

- 원본: [spec.md](./spec.md), [design.md](./design.md), [tasks.md](./tasks.md). 이 문서는 배치 분할과 결정만 적는다.
- 시작 hash: `adb3cdb2` (main)
- 통합 브랜치: `feat/mcp-connectors`
- 모델 경계: 사용자가 이 세션에서 Codex 워커를 허가했다. 주 구현은 Claude, 기계적 배치와 교차 리뷰는 Codex.

## 결정 기록

- 사용자가 약 한 시간 뒤부터 머신에 접근할 수 있다. 그 전에는 사람이 필요 없는 배치만 진행한다.
- 조율자 판단 — PoC 원본 `.scratch/mcp-poc/`가 이 checkout과 디스크 어디에도 없다(`find`·Spotlight로 확인). A0 픽스처와 그 픽스처로 테스트하는 함수(`parseClaudeMcpGet`, `parseCodexMcpList`, `mcpAuthLink`, `codexStartupGate`, `codexMcpApproval`)는 BA의 미뤄 둔 항목으로 두고, 사용자가 돌아오면 원본 위치를 묻는다. 원본이 없으면 다시 만든다(연결됨 상태와 elicitation은 실제 OAuth와 Codex 턴이 필요하다).
- 조율자 판단 — 진행 라벨 정리(S1)는 PRODUCT.md·DESIGN.md의 문구도 같은 커밋 범위에서 고친다(tasks S1이 정한 범위).
- 조율자 판단 — E1은 사용자의 Notion 계정과 브라우저 승인이 필요하므로 사용자가 돌아온 뒤 시작한다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 | 상태 |
|---|---|---|---|---|---|---|
| BS | S1 | S1 목록의 renderer·main 파일과 테스트, `docs/PRODUCT.md`·`docs/DESIGN.md`의 해당 문구, `.doan/ds/project-setup.html`·`.doan/ds/spinner.html` | 없음 | Codex Sol medium — 정해진 문자열 교체라 판단이 적다 | S1 검증(test, typecheck, `doan check`, `rg`) | 대기 |
| BD | B0 | `app/package.json`, `app/package-lock.json`, electron-vite 설정, electron-builder 설정 | 없음 | Codex Sol medium — 정해진 설정 세 가지, 패키징으로 확인 | B0 검증(build, package, codesign 전후 비교, `pty.node`·`spawn-helper`) | 대기 |
| BA | A1, A2·A3 중 픽스처가 필요 없는 함수(`connectorState`, `plaintextLeftovers`, `reconcilePlan`, `mcpLogoutPlan`, `codexServerToml`, `claudePermissionSummary`, `parseSettingsSection`). 미뤄 둔 항목: A0, `parseClaudeMcpGet`, `parseCodexMcpList`, `mcpAuthLink`, `codexStartupGate`, `codexMcpApproval` | `app/src/main/mcpConnectors/`(순수 모듈), `conversation/transport.ts`의 `claudePermissionSummary`, `renderer/settingsSections.ts`와 각 테스트 | 없음 | Opus high — 이후 배치가 모두 기대는 스키마와 상태 판정 | `npm --prefix app test`, typecheck | 대기 |
| BB | B1–B4 | `mcpConnectors/`의 store·pending·providers·service·ipc, `agentAuth/`, `main/index.ts`, preload, `senderAllowed.ts` | BA, BD | Opus high — 프로세스 그룹, lease, 직렬화, sign-out 경계 | B1–B4 검증 | 대기 |
| BC | C1–C3 | `conversation/`(runners, service, dispatcher, transport) | BA(미뤄 둔 `codexStartupGate`·`codexMcpApproval` 포함) | Opus high — Codex ingress와 POSTMORTEM 2026-10-27 함정 | C1–C3 검증 | 대기 |
| BU | D2, D3 | `SettingsMcpConnectors.tsx`, `settingsSections.ts`, `App.tsx`, `agentAuthView.ts`, `public/mcp-logos/`, `docs/DESIGN.md`(D3) | BB, BS | Opus high — 포커스·읽어 주기 규칙이 많은 화면 | D2 검증, `/design-sync` | 대기 |
| BE | E1 | `.scratch/`, 필요하면 `app/runtime/` | BB, BC, BU, 사용자 | Opus high — 실제 계정과 키체인 상태 보호 | `/runtime-test` 보고, real-state 비교 | 대기 |
| 조율자 | E2, Z1 | `docs/` 승격 문서 | 전부 | — | verify exit 0, Z1 grep | 대기 |

리뷰: 각 구현 배치는 다른 모델 계열의 독립 리뷰 워커가 `/code-review`로 본다. BA·BB·BC·BU는 Codex Astra medium, BS·BD는 Claude Sonnet medium.

## 파일 겹침과 순서

- 1차 병렬: BS, BD, BA. 셋은 파일이 겹치지 않는다(BS의 `App.tsx`·renderer 문구, BD의 패키지 설정, BA의 새 모듈·`transport.ts`·`settingsSections.ts`).
- BB와 BC는 BA 뒤에 병렬로 돈다. C1의 세대 번호는 BC가 주입 getter로 받고, `main/index.ts` 배선은 BB 통합 뒤의 미뤄 둔 항목이다.
- BU는 `App.tsx`가 BS와, `settingsSections.ts`가 BA와 겹치므로 BS·BA·BB 통합 뒤에 시작한다.
- `transport.ts`는 BA(`claudePermissionSummary`)와 BC(C2·C3)가 고치므로 BC는 BA 통합 뒤에 시작한다.

## 리뷰와 검증 기록

(배치가 끝나면 적는다)
