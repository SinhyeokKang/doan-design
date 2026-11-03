# mcp-connectors — tasks

순서: PoC → 파일 스키마와 순수 함수 → main 셸(I/O) → Codex 대화 → UI → 실제 앱 확인 → 문서 승격. UI 초안은 `/feature-review` 뒤 `/design-draft`로 그리고, 사람이 앱에서 확인한 뒤 구현한다.

## P. PoC (구현 전)

PoC 코드는 `.scratch/mcp-poc/`에 둔다. 격리 HOME·userData·`Library/Keychains` 링크를 쓰고, 끝나면 만든 키체인 항목을 지우고 `app/runtime/real-state.ts` 스냅샷과 비교한다(2026-11-03 PoC와 같은 방식).

- [ ] P1. 상태 읽기와 토큰 파일 (design 'PoC 의존' P1).
  - 검증: 명령 미정 — `.scratch` probe. `claude mcp get`·`codex mcp list --json`의 등록 전·인증 필요·연결됨 출력 세 가지를 픽스처로 저장하고, Codex 프로필에 MCP 토큰 파일이 없음을 기록한다.
- [ ] P2. Codex app-server의 설정 재읽기와 `mcpServer/startupStatus/updated` (P2).
  - 검증: 명령 미정 — `.scratch` probe. 실행 중인 app-server에서 등록 뒤 새 thread가 서버를 보는지, 이벤트 형태, 이벤트를 기다린 뒤의 첫 턴에서 도구가 보이는지를 기록한다.
- [ ] P3. Atlassian·Figma 프리셋 URL (P3).
  - 검증: 명령 미정 — `.scratch` probe. Claude·Codex 각각 연결과 도구 호출 한 번의 결과를 기록하고, 통과한 프리셋만 남긴다.
- [ ] P4. sign-out과 교체 프로필 (P4).
  - 검증: 명령 미정 — `.scratch` probe. `claude auth logout` 뒤 MCP 상태, Codex 교체 프로필에서 기존 `doan-*` 토큰이 쓰이는지 기록한다.
- [ ] P4b. node-pty 패키징: Electron 45에서 빌드되는 node-pty 버전을 정하고, 외부화·`asarUnpack`·재빌드 설정으로 `npm --prefix app run package`가 만든 `Doan.app`에서 pty로 `claude mcp login`이 링크 파일에 URL을 쓰는지 확인한다. 실험 브랜치나 `.scratch` 복사본에서 하고 main에는 들이지 않는다.
  - 검증: `npm --prefix app run package` 성공, 패키지 앱 probe에서 링크 파일 생성.
- [ ] P5. PoC 결과를 design.md에 반영한다(가정이 틀린 곳은 설계를 고친다).
  - 검증: design.md 'PoC 의존'의 각 항목이 결과 문장으로 바뀌었다.

── commit: `docs(feature): record mcp-connectors PoC results` ──

## A. 파일 스키마와 순수 함수

- [ ] A1. `mcp-connectors.json` 파서·patch(`parseConnectorsFile`, `patchConnectors`), `parseConnectorUrl`, `connectorName`, `PRESETS`.
  - 검증: `npm --prefix app test` — 새 테스트가 먼저 red, 구현 뒤 green.
- [ ] A2. `parseClaudeMcpGet`, `parseCodexMcpList`(P1 픽스처), `connectorState`, `plaintextLeftovers`.
  - 검증: `npm --prefix app test` green.
- [ ] A3. `codexStartupGate`(P2 이벤트 픽스처), `parseSettingsSection`의 `"mcp"`.
  - 검증: `npm --prefix app test` green.

── commit: `feat: add MCP connector rules` ──

## B. main 셸

- [ ] B1. `mcpConnectors/store`(temp+rename 쓰기, 읽을 수 없는 파일은 오류로).
  - 검증: `npm --prefix app test` green(손상 파일·새 `v` 케이스 포함).
- [ ] B0. node-pty 의존성과 빌드 설정(P4b 결과): `npm --prefix app install --save-exact node-pty@<version>`, main 외부화, electron-builder `asarUnpack`·재빌드.
  - 검증: `npm --prefix app run build`, `npm --prefix app run package` 성공.
- [ ] B2. Claude·Codex 어댑터와 `service`: 연결·해제·삭제·취소, lease 용도 `"mcp"`, Claude pty(node-pty)와 링크 파일, Codex 자동 열기 없음, 평문 파일 처리.
  - 검증: `npm --prefix app test` green(가짜 프로세스로 명령 인자·환경·취소·lease 확인), `npm --prefix app run typecheck`.
- [ ] B3. agentAuth sign-out에 Doan 커넥터 MCP 로그아웃을 더하고, 교체 sign-in 규칙을 P4 결과대로 맞춘다.
  - 검증: `npm --prefix app test` green(sign-out 순서, 실패한 교체가 기존 등록을 남기는 케이스).
- [ ] B4. IPC 채널과 preload, 입력 검증.
  - 검증: `npm --prefix app test` green(다른 frame 거부, 잘못된 URL·이름 거부).

── commit: `feat: run MCP connector sign-ins through provider CLIs` ──

## C. Codex 대화

- [ ] C1. 커넥터 변경 뒤 idle app-server 재시작(P2 결과가 재시작을 요구할 때), 턴 전 `codexStartupGate` 대기와 상한 초과 알림.
  - 검증: `npm --prefix app test` green(`transport.test.ts`·`service.test.ts`에 대기·상한·재시작 케이스).

── commit: `feat: wait for MCP servers before a Codex turn` ──

## D. UI

- [ ] D1. `/design-draft`로 설정 > MCP Connectors 초안을 `.doan/canvases/`에 그리고 사람이 앱에서 확인한다(`/feature-review` 뒤, `/tdd` 전).
  - 검증: `go run ./cli/cmd/doan check --repo .` 통과, 사람의 확인.
- [ ] D2. `SettingsMcpConnectors.tsx`: 목록, 추가(프리셋·URL), 에이전트별 상태와 동작, 실행 중 대화 안내, 빈 상태와 오류 상태.
  - 검증: `npm --prefix app test` green(`SettingsMcpConnectors.test.tsx`), `npm --prefix app run build`.
- [ ] D3. `/design-sync`로 초안과 구현을 맞추고 DESIGN.md에 측정값을 적는다.
  - 검증: `/design-sync` 보고의 측정 일치.

── commit: `feat: add the MCP Connectors settings category` ──

## E. 실제 앱 확인

- [ ] E1. `/runtime-test`: 격리 앱에서 Claude·Codex 각각 Notion 연결 → 새 대화 첫 턴에서 도구 호출 → 해제 → 삭제. 터미널 쪽 `~/.claude.json`·`~/.codex/config.toml`·키체인 항목이 바뀌지 않았음을 real-state 비교로 확인한다.
  - 검증: `/runtime-test` 보고(스크린샷, real-state 비교 결과).
- [ ] E2. `node .agents/skills/verify/scripts/verify.mjs`.
  - 검증: exit 0.

## Z. 승격과 정리

- [ ] Z1. 결론을 현재 규칙으로 옮긴다(영문). PRODUCT §3 In scope(MCP 커넥터와 지원 provider), §5 항목 0(Settings 카테고리 목록과 MCP Connectors 동작), ARCHITECTURE §7(새 모듈, 이름 규칙의 이유, lease 용도, Codex 대기, `mcp-connectors.json`), BACKLOG(Cursor·Copilot·Antigravity의 막힌 이유, design의 'BACKLOG 후보'). 근거는 커밋 메시지에 둔다. 그리고 `docs/features/mcp-connectors/`를 지운다.
  - 검증: `grep -n 'MCP Connectors' docs/PRODUCT.md docs/ARCHITECTURE.md`에 줄이 있고, `docs/features/mcp-connectors/`가 없다.

── commit: `docs(product): add MCP connectors` / `docs(architecture): describe MCP connectors` / `docs(backlog): record MCP gaps for ACP providers` ──
