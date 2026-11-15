# 코드베이스 audit — 2026-11-16 (audit-loop 2라운드)

- 실행일: 2026-11-16
- 리뷰한 checkout: `develop` HEAD `7f099fc79`. 1라운드의 PR #212–#220이 모두 병합된 상태다.
- 워킹트리: 깨끗하다. 세션 전부터 untracked였던 `.doan/seen/`만 있다.
- 범위: 저장소 전체. 1라운드 PR이 바꾼 영역의 회귀를 먼저 봤다.
- 완료 상태: **완료**(정적 범위). 리뷰어 원본은 `.scratch/audit/261116-r2/`에 있다(`brief.md`, 관점별 보고서, `verify.md`).

## 실행 한계와 덜 본 곳

- 정적 검토만 했다. 테스트, 빌드, 실제 앱 실행은 하지 않았다. SUSPECTED 항목은 수정 컨덕터가 probe로 먼저 확인한다.
- 경계 리뷰어가 근거로 쓴 Claude Code 동작은 SDK에 묶인 2.1.312 bundle의 문자열에서 읽었다. Doan이 실제로 실행하는 것은 사용자가 설치한 CLI(1라운드 probe 당시 2.1.325)다.
- 1라운드 이후 바뀌지 않은 코드는 1라운드 판정을 그대로 가져왔다. 대상은 다음과 같다.
  - 계약 관점: designskill, export, update, document
  - 수명주기 관점: quit 외의 `service.ts`, `manager.ts`, `mcpConnectors` 흐름
  - 경계 관점: 모듈 3, 4, 15
- renderer는 계약 관점에서는 계약 표면만, 유지보수 관점에서는 스캔 수준으로 봤다. 수명주기 관점은 #219의 Home buddy 복구와 툴팁 상태를 따로 추적했다.
- 유지보수 리뷰어는 eval의 W1–W11, R2, R4b, R5, D5–D13 판정 로직을 다시 읽지 않았다.
- `shell.test.ts`의 "setting up the same folder again"이 로컬에서만 실패하는 원인은 정적으로 찾지 못했다.

## 1라운드 수정의 상태

- B-1(#215): probe에서 확인한 형태는 모두 막혔다. 남은 감지 우회 가능성은 아래 B2-1, B2-2, B2-4, B2-5, B2-8, B2-9에 있다.
- B-2(#212), B-3(#214), B-4(#218), L-1–L-3(#213): 고쳐졌다. 다만 #214가 남긴 읽기 경로는 G2에, #213이 남긴 quit·close 경로는 M2-2와 M2-3에 이어진다.
- 계약 관점에서는 #216의 BOM·패턴·소문자 `.html`·`WriteStaged`, #217의 incomplete 읽기, #218·#219의 이름 규칙과 import에서 회귀를 찾지 못했다.

## 발견 — High (모두 SUSPECTED, 경계)

모두 #215의 규칙("저장소나 profile이 실행할 코드를 가지면 바깥 fence를 씌우고, fence 밖에서 도는 명령이 읽는 설정 경로는 쓰기를 막는다") 안에서 생긴 빈틈이다. 사용자가 1라운드에서 정한 "확인된 빈틈은 같은 규칙으로"를 따라, probe로 확인한 것만 고친다.

- **B2-1** `.claude/skills/` 아래 plugin 모양의 폴더를 저장소 코드로 세지 않는다. 대상은 `.claude-plugin`, `hooks/hooks.json`, `.mcp.json`, `.lsp.json`이다. `frontmatterHooks`가 `*.md`만 읽기 때문이다(`conversation/prepare.ts:193`). profile 쪽에서는 이미 "skills-dir plugins"를 막는다(`agentAuth/fence.ts:38-39`).
- **B2-2** Doan의 frontmatter 판정이 CLI의 parser와 다르다(`prepare.ts:196-199`). Doan은 다음 경우에 hook을 놓친다.
  - BOM이 붙은 파일
  - 구분선 `--- ` 뒤에 공백이 있는 경우
  - `hooks` 키를 다른 YAML 표기로 쓴 경우(flow, 들여쓰기, escape, `?`, tag)
  - 대소문자를 구분하지 않는 APFS 위의 `SKILL.MD`
  CLI는 BOM을 지우고 `^---\s*\n` 블록을 YAML로 파싱한다.
- **B2-4** 바깥 fence는 profile의 `.claude.json`에 쓰기를 허용한다. CLI가 매 실행마다 이 파일을 쓰기 때문이다(ARCHITECTURE §7). 그런데 이 파일의 `mcpServers`는 fence 밖에서 도는 `claude mcp` connector 명령(`mcpConnectors/service.ts:632`)과 이후 sandbox-on 턴에서 시작된다.
- **B2-5 (= C2-1)** Claude usage read와 `claude mcp` connector 명령은 fence 밖에서 돈다. 둘 다 cwd가 userData 아래(`usage-probe`, profile)라서, userData의 상위 폴더에 있는 `.mcp.json`을 읽는다. 대상은 `~/Library/Application Support/.mcp.json`, `~/Library/.mcp.json`, `~/.mcp.json` 등이다. 바깥 fence는 userData만 막으므로(`fence.ts:21-23`) fence 안의 에이전트가 이 파일들을 쓸 수 있다. usage read는 앱을 켤 때마다 돈다(`agentAuth/usageRead.ts:174`). 2026-11-15 postmortem은 이 상위 폴더 탐색을 놓쳤다.
- **B2-8** CLI가 시작할 때 실행하는 자체 `git status`는 hook과 fsmonitor만 끄고 `filter.*.clean`은 끄지 않는다. 그래서 바깥 fence 턴에서 에이전트가 쓴 `.git/config`의 `filter.*.clean`과 `.gitattributes`가 다음 sandbox-on 턴에서 fence 밖에서 프로그램을 실행할 수 있다.

## 발견 — High (사용자 결정 필요)

- **B2-3 [SUSPECTED] [사용자에게 보임]** sandbox-on Full access 턴은 저장소 `.claude/skills/`에 hook을 가진 skill을 쓰고, 같은 턴 안에서 그 skill을 실행할 수 있다. CLI는 세션 중에 skill을 다시 읽어 들이고(`skillChangeDetector`), Doan의 저장소 코드 판정은 CLI를 시작하기 전에 한 번만 돈다. 막으려면 그 턴에서 저장소 `.claude/`를 쓰지 못하게 하거나, Claude 턴을 항상 바깥 fence로 돌려야 한다. 둘 다 사용자가 겪는 동작이 바뀐다 → BACKLOG.

## 발견 — Medium

- **B2-6 [CONFIRMED]** 저장소 내용을 따라가는 두 탐색에 깊이 한도만 있고 전체 작업량 한도가 없다. 그래서 조작된 저장소가 main을 오래 막을 수 있다.
  - `frontmatterHooks`: link 방문 집합이 없어 링크가 갈래로 퍼지면 같은 곳을 여러 번 걷는다.
  - `gitConfig.ts`의 include 탐색: cycle 검사가 현재 chain만 봐서 DAG 모양의 include를 반복해서 읽는다.
- **G2 = C2-2 = L2-2 = M2-1 = B2-7** B-3 유형의 blocking 읽기가 남아 있다.
  - `mcpConnectors/service.ts:346`: profile `.claude.json`을 `readFileSync`로 읽는다. 바깥 fence 턴에서 에이전트가 이 파일을 FIFO로 바꿀 수 있다.
  - `onboarding/projects.ts:121`: `.gitattributes`를 async `readFile`로 읽는다.
  - `usageRead.ts:202-205`의 `cursorCookie`: lstat 뒤에 읽어서 경쟁 조건이 있다.
  - `storage.ts`의 `readWorking`·`collect`: lstat 뒤에 크기 상한 없이 읽는다.
  - Codex `config.toml` 읽기는 fence가 쓰기를 막으므로 트리거가 없다.
- **B2-9 [SUSPECTED]** 저장소 설정의 `env` 키로도 CLI가 프로그램을 실행할 수 있다. 예를 들어 Bedrock 전환과 `AWS_CONFIG_FILE`의 `credential_process`, Vertex의 external-account credentials가 있다. ARCHITECTURE는 이를 시도하지 않은 수용된 한계로 적었는데, 2026-11-15 postmortem 규칙은 probe 없이 이런 한계를 두지 말라고 한다.
- **L2-1 [CONFIRMED, 타이밍은 SUSPECTED]** quit이 강제로 해제한 credential lease가 나중에 다시 해제되면 hold count가 -1이 된다. 그러면 빈 작업 사본을 흡수해 빈 vault를 저장하고, 사용자는 다음 실행에서 다시 로그인해야 한다. `drop()`에 하한이 없고, `acpLogout`만 0 아래로 내려가지 않게 막는다(`agentAuth/manager.ts:875-877`).

## 발견 — Low (모두 사용자에게 보이지 않음)

| id | 내용 | 근거 |
|---|---|---|
| C2-3 | v7 순서의 근거("renderer는 first run과 buddy 화면이 끝난 뒤 ready")가 사실과 다르다. ready 조건은 restore 완료와 첫 folders 수신이다 | ARCHITECTURE 293행, `cliRemove.ts:36-37`, `App.tsx:1283-1287` |
| M2-2 | quit 루프에서 append가 throw하면 뒤 conversation의 정리(held timer, busy, `lookLater`, `dropSteers`)가 생략된다(2026-11-15 postmortem의 부분 재발) | `conversation/service.ts:855-864` |
| M2-3 | staged write가 끝난 뒤 close가 실패하면 `*.tmp`가 남는다(부분 재발) | `conversation/store.ts:453-456` |
| M2-4 | real-state 가드가 userData의 `agent-runtimes`, `terminal`, `usage-probe`를 보지 않는다. main이 쓰는 목록과 묶는 테스트도 없다 | `app/runtime/real-state.ts` |
| G3 = L2-3 = M2-5 | 앱 테스트가 `$TMPDIR`에 폴더를 남긴다(약 4.6만 개). `acpRunner.test.ts`는 만든 폴더를 지우지 않고, `manager.test.ts`의 Cursor 흐름은 테스트가 끝난 뒤에도 profile을 쓴다(2026-11-11 postmortem 재발) | `acpRunner.test.ts`, `manager.test.ts` |
| M2-6 | #218이 고아 타입을 남겼다: `ConversationBinding`, `NotifyService`, `PreferencesStore` | `conversation/types.ts`, `notifyService.ts`, `preferences.ts` |
| M2-7 | WebGL 복구 상수(`RETRY_MS`/`RETRIES`)가 두 곳에 복사돼 있다 | `Doany.tsx`, `dockedBuddyShell.ts` |
| M2-8 | work·open·handoff의 canvas 경로 규칙이 6곳(Go, app, eval)에 따로 쓰여 있고, schema와 묶는 테스트가 없다 | Go rules, `runtime.ts`, `deepLinks.ts`, eval |
| M2-9 | design 문서 두 줄이 #220 이전 상태를 적고 있다 | `docs/design/canvas-conversation.md:36`, `shell.md:173` |
| M2-10 | `.doan-panel` 주석과 `.doan/ds` 캔버스 5개가 #220 이전의 패널 그림자와 `sm` 확인 버튼을 그대로 그린다 | `ds/surfaces.css`, `.doan/ds/{panel,shadow,shell-layout,remove-confirmation,dialog}.html` |
| M2-11 | eval: 문자열이 아닌 Codex `exec_command`를 incomplete 표시 없이 버린다 | `eval/lib/transcript.ts` |
| M2-12 | eval: "실행 안 함" 검사 네 곳이 doan 명령을 각자 파싱해서 잘못 통과할 수 있다 | H5, O1 `onboardingCalls`, `lib/prototype.ts`, D4b·D1 |
| M2-13 | eval·app이 CLI 사실을 복사해 쓰는데 묶는 테스트가 없다. 대상은 플래그 표(drift 테스트가 한 방향만 본다), preset `CATALOG`, `.gitattributes` 줄이다 | `transcript.test.ts`, `D1/presets.ts`, `onboarding/projects.ts`, eval fake |
| M2-14 | R10이 첫 번째로 수락된 handoff만 판정한다. H3b의 부정 테스트 하나는 :31이 이미 같은 동작을 고정하므로 중복이다 | `R10/checks.ts`, `H3b/checks.test.ts:39` |
| M2-15 | 추천 프롬프트 버튼이 세 곳에 따로 있고 이미 한 번 어긋났다 | `HomeComposerView.tsx`, `ProjectOverview.tsx`, `CanvasConversationPanel.tsx` |

## Coverage

| # | 모듈 | 계약 | 경계 | 수명주기 | 유지보수 |
|---|---|---|---|---|---|
| 1–2 | CLI | 완료 | 완료 | 완료 | 완료 |
| 3–4 | designskill, export | 1라운드 판정 유지(변경 없음) | 1라운드 판정 유지 | 완료 | 완료 |
| 5 | schema | 완료 | 완료 | 해당 없음 | 완료 |
| 6–9 | app main | 완료 | 완료 | 변경 경로 완료, 나머지는 1라운드 판정 유지 | 완료 |
| 10 | preload | 완료 | 완료(제거·주석) | 완료 | 완료 |
| 11 | renderer | 계약 표면 | 완료(경계) | 변경 경로 완료 | 스캔 수준 |
| 12–14 | shared, runtime, eval | 완료 | 완료 | 완료 | 완료(eval 일부 판정 로직 제외) |
| 15 | packaging/CI | 완료 | 1라운드 판정 유지 | 완료 | 완료 |

## Postmortem 적용 점검

- 2026-11-15에 추가한 8개 항목과 재발 기록을 다시 확인했다. 부분 재발은 M2-1(G2), M2-2, M2-3, M2-4, M2-11·M2-12, M2-14다. 나머지는 유지된다.
- 2026-11-15 'Claude settings' 항목의 검색 메모는 usage read를 안전하다고 판정했다. 이 판정이 틀렸다(B2-5).
- 1라운드 PR이 건드린 파일의 이전 항목 112개를 다시 확인했다. 재발은 없고, 코드가 지워져 해당 없는 항목이 4개다.

## Triage

- **사용자 결정 필요**: B2-3. 처음에는 BACKLOG에 올렸다가, 2026-11-16 사용자가 'Doan 연결의 Claude 실행은 모두 바깥 fence로 돌리고, Claude 자체 sandbox는 항상 끈다'로 정했다. 감지 방식을 걷어내는 일까지 `fix/claude-fence-gaps`가 맡는다.
- **컨덕터로 고친다**:
  - `fix/claude-fence-gaps`: B2-1, B2-2, B2-4, B2-5/C2-1, B2-6, B2-8, B2-9, G2. probe로 먼저 확인하고, 확인된 것만 같은 규칙으로 고친다.
  - `fix/auth-quit-cleanup`: L2-1, M2-2, M2-3, M2-4, G3
  - `fix/eval-checks-2`: M2-11, M2-12, M2-13, M2-14
  - `chore/cleanup-2`: C2-3, M2-6, M2-7, M2-8, M2-9, M2-10, M2-15
