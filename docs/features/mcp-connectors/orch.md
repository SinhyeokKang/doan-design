# mcp-connectors — 지휘 기록

- 원본: [spec.md](./spec.md), [design.md](./design.md), [tasks.md](./tasks.md). 이 문서는 배치 분할과 결정만 적는다.
- 시작 hash: `adb3cdb2` (main)
- 통합 브랜치: `feat/mcp-connectors`
- 모델 경계: 사용자가 이 세션에서 Codex 워커를 허가했다. 주 구현은 Claude, 기계적 배치와 교차 리뷰는 Codex.

## 결정 기록

- 사용자가 약 한 시간 뒤부터 머신에 접근할 수 있다. 그 전에는 사람이 필요 없는 배치만 진행한다.
- PoC 원본 `.scratch/mcp-poc/`는 이 머신에 없었다. 사용자가 계정 식별자를 지운 사본을 `docs/features/mcp-connectors/poc/`로 main에 올렸고(`d06721c8`), 통합 브랜치를 그 위로 rebase했다. A0와 픽스처가 필요한 함수(`parseClaudeMcpGet`, `parseCodexMcpList`, `mcpAuthLink`, `codexStartupGate`, `codexMcpApproval`)는 BA가 같은 배치에서 이어서 한다.
- 조율자 판단 — 진행 라벨 정리(S1)는 PRODUCT.md·DESIGN.md의 문구도 같은 커밋 범위에서 고친다(tasks S1이 정한 범위).
- 조율자 판단 — 설치된 `doan check --repo .`는 base `f6439835`에서 이미 exit 4다(`.doan/canvases/select-inspect.html`의 `implements_not_found`, S1 범위 밖). 배치의 `doan check` 검증은 "base와 HEAD의 finding 목록이 같다"로 본다.
- 조율자 판단 — 새 child worktree에는 `node_modules`가 없으므로 워커는 AGENTS.md 'App setup'(`npm --prefix app ci`, Electron 바이너리 다운로드)을 먼저 한다. gate 실패로 보지 않는다.
- 사용자 결정 — Disconnect는 그 provider의 `everConnected`를 지운다. 해제한 항목은 `Reconnect needed`가 아니라 `Not connected`(Connect)로 보이고, 확정 초안처럼 이름 아래 'Not connected' 줄을 유지한다. `Reconnect needed`는 사람이 해제하지 않았는데 끊긴 경우(교체, 만료)에만 보인다. Z1에서 PRODUCT에 반영한다.
- 사용자 결정 — `poc/p2/probe-approval.log`에 남은 Atlassian account_id·계정 날짜와 `poc/links/`의 DCR client_id는 비밀값이 아니므로 main 이력을 다시 쓰지 않는다(force push 안 함). `poc/`는 Z1에서 디렉터리째 지운다.
- 조율자 판단 — npm의 node-pty prebuild `spawn-helper`가 0644라 dev·vitest에서 `posix_spawnp failed`가 난다. BB의 pty loader가 패키지되지 않은 앱에서만 실행 권한을 준다. 패키지 앱에서는 서명된 번들을 고치지 않고 Connect를 이유와 함께 실패시킨다. Z1에서 ARCHITECTURE에 적는다.
- 조율자 판단 — Codex 대화 history는 append-only라 main은 'Waiting for <Notion>'과 '<Notion> wasn’t ready…' 두 activity를 보낸다. spec 완료 조건 6과 초안 프레임 11은 한 줄이 바뀌는 것으로 정했으므로, 렌더러(`threadItems.ts`)가 Waiting 줄 뒤에 같은 서버의 not-ready 줄이 오면 하나로 접는다. BU가 맡는다.
- 조율자 판단 — Codex `config/mcpServer/reload`가 오류로 답하면 runner는 새 세대를 적용한 것으로 기록하지 않아 다음 턴에 reload를 다시 보낸다(BC 리뷰 ⚪4, 계획에 실패 정책이 없었다).
- 조율자 판단 — 계정 교체 commit은 커넥터 세대를 올리지 않는다. Codex 교체는 새 staging 프로필이라 runner가 새로 열리고, Claude는 턴마다 SDK를 새로 띄운다(BB 질문).
- 조율자 판단 — BB 리뷰 Y1: Claude 링크 상한은 두 개다. 링크 파일 도착은 로그인 시작부터 30초(브라우저 설정으로 링크가 오지 않는 경우), 허용 대기는 링크를 받은 뒤 5분(spec 완료 조건 4). tasks B2가 두 상한을 따로 적었으므로 그대로 둔다.
- 조율자 판단 — BB 리뷰 Y3: sign-out·교체 중 provider 목록을 읽지 못하면 프로필 자신의 설정(Codex `config.toml`, Claude 프로필 `.claude.json`)에서 `doan-*` 이름과 URL을 읽는다(토큰은 읽지 않는다). 미뤄 둔 로그아웃 파일이 깨졌으면 `.broken-*`로 옮기고, 깨졌거나 더 새로운 `v`이면 이번 실행에서 각 `doan-*` 서버의 로그아웃이 한 번 성공할 때까지 두 provider 모두 Connect를 막는다.
- 조율자 판단 — BB 리뷰 Y4: Codex에 쓰는 `[mcp_servers.doan-*]`의 URL은 받은 문자열을 그대로 쓴다(https 검증과 TOML escape는 유지). design의 `URL.href` 문구는 Z1에서 고친다.
- 조율자 판단 — Claude sign-out은 `claude auth logout`이 MCP 토큰을 비우므로(P4) 그 provider의 Claude 미뤄 둔 로그아웃 기록도 지운다. Codex 기록은 연결이 없어도 앱 시작 때 임시 `CODEX_HOME`으로 다시 시도한다.
- 조율자 판단 — E1은 사용자의 Notion 계정과 브라우저 승인이 필요하므로 사용자가 돌아온 뒤 시작한다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 | 상태 |
|---|---|---|---|---|---|---|
| BS | S1 | S1 목록의 renderer·main 파일과 테스트, `docs/PRODUCT.md`·`docs/DESIGN.md`의 해당 문구, `.doan/ds/project-setup.html`·`.doan/ds/spinner.html` | 없음 | Codex Sol medium — 정해진 문자열 교체라 판단이 적다 | S1 검증(test, typecheck, `doan check`, `rg`) | 통합 `217ac0c2`(리뷰 1회) |
| BD | B0 | `app/package.json`, `app/package-lock.json`, electron-vite 설정, electron-builder 설정 | 없음 | Codex Sol medium — 정해진 설정 세 가지, 패키징으로 확인 | B0 검증(build, package, codesign 전후 비교, `pty.node`·`spawn-helper`) | 통합 `2519a9cb`(리뷰 1회) |
| BA | A0–A3. 처음에는 픽스처 없이 시작했고, PoC 사본이 main에 들어온 뒤 A0와 픽스처 함수를 이어서 한다 | `app/src/main/mcpConnectors/`(순수 모듈), `conversation/transport.ts`의 `claudePermissionSummary`, `renderer/settingsSections.ts`와 각 테스트 | 없음 | Opus high — 이후 배치가 모두 기대는 스키마와 상태 판정 | `npm --prefix app test`, typecheck | 통합 `f71fabfb`(리뷰 2회) |
| BB | B1–B4 | `mcpConnectors/`의 store·pending·providers·service·ipc, `agentAuth/`, `main/index.ts`, preload, `senderAllowed.ts` | BA, BD | Opus high — 프로세스 그룹, lease, 직렬화, sign-out 경계 | B1–B4 검증 | 리뷰 중 |
| BC | C1–C3 | `conversation/`(runners, service, dispatcher, transport) | BA | Opus high — Codex ingress와 POSTMORTEM 2026-10-27 함정 | C1–C3 검증 | 통합 `03d44db1`(리뷰 3회), `main/index.ts` 배선은 BB 통합 뒤 |
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

- BS: Sonnet 리뷰 🔴0 🟡1(`docs/BACKLOG.md`의 `Stopping…`) → 수정 `1a4166cd`. 테스트 6717개·typecheck green, S1 `rg` 빈 결과, `doan check`는 base와 같다. 실제 앱 확인은 하지 않았다(문구만 바뀜). 증거 `.scratch/mcp-evidence/bs/`.
- BD: 첫 전체 테스트에서 `onboarding/clone.test.ts` 프로세스 그룹 테스트 1개 실패(다른 워커 둘이 동시에 전체 테스트를 돌림). 단독 3회·전체 1회 재실행 green이라 부하 flake로 기록했다. Sonnet 리뷰 🔴0 🟡0. codesign 출력은 node-pty 전후가 같고, unpacked `pty.node`·`spawn-helper`가 0755다. main 프로세스에서 app.asar로 로드하는 것은 BB·E1에서 확인한다. 증거 `.scratch/mcp-evidence/bd/`.
- BA: Codex Astra 리뷰 🔴0 🟡2(정규화한 URL을 저장 파서가 거절, blocked가 Connected·확인 실패와 겹칠 때 사라짐) ⚪3. 수정 `8a036a80`·`db3ac93a`·`1166e47b`·`b7f67299` 뒤 Round 2는 🔴0 🟡0. 미뤄 둔 로그아웃이 있는 서버는 Connected로 읽혀도 `Reconnect needed`+Reconnect로 보인다(이전 계정 토큰일 수 있다). Z1에서 이 예외를 '상태 판정'과 함께 적는다. ⚪3(`mcp`→`agents` 임시 처리)은 BU가 최종 규칙으로 바꾼다. 리뷰 `.scratch/review-BA.md`, 증거 `.scratch/mcp-evidence/ba/`.
- BC: Codex Astra 리뷰 🔴0 🟡3 ⚪4. Stop 뒤 도착한 MCP 승인이 답할 수 없는 대기로 남음, reload 응답 대기 중 Stop이 없는 턴을 interrupt해 서버를 죽임, Waiting 줄이 교체되지 않음(BU 렌더러로 배정). 🟡1·🟡2와 ⚪1·⚪2·⚪4를 수정 중이다. ⚪3(만료 승인의 `-32601`)은 E1에서 확인한다. 리뷰 `.scratch/review-BC.md`. 수정 `b2ef7e63`·`a2df8988` 뒤 Round 2에서 🟡1 추가(Stop 직후 새 send가 이전 턴 시작의 취소를 지움) → `4d542686`, Round 3 🔴0 🟡0.
- BB: Codex Astra 리뷰 🔴3 🟡4 ⚪2. 교체 MCP 로그아웃 전에 새 계정 대화가 허용됨, 시작 작업이 stop·quit 소유 밖, 실패·취소한 Claude 로그인의 평문 파일 미삭제, 연결 없는 시작에서 미뤄 둔 로그아웃 재시도 없음, 정리 대상을 모를 때 차단 없음, TOML URL 재정규화. 수정 중이다. 리뷰 `.scratch/review-BB.md`, probe `.scratch/review-BB-evidence/`.
- 통합 `f71fabfb`(BS·BD·BA)에서 `verify.mjs` PASS: verify-tests, runtime-support, go-test, go-vet, typecheck, app-test, build.
