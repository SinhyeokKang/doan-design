# cli-minimum-versions — tasks

순서: 실험(사용자 버전 → 설치 → 정적 검사 → 실제 앱 확인) → 사람의 결정 → 테스트 → 상수 → 실제 앱 확인 → verify → 문서 승격.

mcp-connectors가 main에 합쳐진 뒤 main에서 시작한다. D1에서 어느 provider도 낮추지 않기로 정하면 A·C를 건너뛰고 Z로 간다.

## E. 실험 (PoC)

- [ ] E0. 사용자 버전을 모은다. 사람이 테스터들에게 Settings > About의 Copy details를 받아 준다. provider마다 가장 오래된 설치 버전을 범위의 하한으로 두고, 그 하한부터 지금 최소 버전 바로 아래까지의 릴리스 목록을 만든다. 테스터는 A, B…로만 적고 이름과 경로는 적지 않는다. 후보가 없는 provider와 지금 최소 버전 이상인데 Update를 보는 테스터는 spec.md '범위'를 따른다. Antigravity는 design.md 'Antigravity'의 코드 근거를 적는다.
  - 검증: 'E 결과'에 테스터별(익명) provider 버전, provider별 릴리스 목록, Antigravity의 코드 근거가 있다. 릴리스 목록 조회는 AGENTS.md 'Commands'에 없는 명령이라 사용한 명령을 함께 적는다.
- [ ] E1. 후보 CLI를 사람의 설치본 옆에 설치한다. 사람은 후보마다 내려받기 전에 승인한다. 방법은 design.md '실험 환경' '후보 CLI 설치'와 '자체 업데이트'(wrapper script, 끄는 switch와 그 출처)를 따른다. 그렇게 설치할 수 없는 후보는 이유를 적고 뺀다.
  - 검증: 설치된 후보의 `--version`이 그 버전을 출력하고, 설치 전후에 design.md '사람의 상태 보호'의 비교 대상이 같다. 설치 명령과 비교 스크립트는 AGENTS.md 'Commands'에 없으므로(`.scratch` 스크립트) 'E 결과'에 함께 적는다.
- [ ] E2. 정적 검사(로그인 없음, 임시 HOME): design.md '정적 검사'를 provider마다 돌린다. credential 격리를 먼저 보고, 확인되지 않은 후보는 E3에서 sign-in하지 않는다. 결과로 provider마다 실제 앱에서 확인할 후보를 두 개 이하로 줄인다(정적 검사를 통과한 가장 오래된 버전과, 그것이 실패할 때 쓸 더 새로운 버전).
  - 검증: `.scratch/cli-minimum-versions/static/`의 스크립트(AGENTS.md 'Commands'에 없음). 'E 결과' 정적 표에 버전 × 항목의 통과·실패를 적는다.
- [ ] E3. 실제 앱 확인(Doan 연결, Claude Code·Codex·Cursor·Copilot): 실험 worktree에서 `minimumVersions.ts`와 floor를 후보 값으로 잠시 바꾼 dev 앱(커밋하지 않음), 실제 HOME, 후보별 userData, 후보 bin을 맨 앞에 둔 PATH를 출력하는 가짜 `SHELL`로 design.md '통과 기준' 1~9를 돌린다. 실제 HOME은 AGENTS.md의 dev 실행 규칙에서 벗어난 것이므로 design.md '실험 환경' 'HOME과 로그인'의 조건을 지킨다. 후보의 registry 모양 때문에 `io.ts`를 고쳐야 하면 design.md 'floor'의 조건 안에서 실험 빌드에 넣고, 통과 기준 4와 10을 그 빌드로 본다. 에이전트가 probe를 돌리고, 사람은 sign-in을 자기 브라우저에서 승인한다. Copilot은 상태 확인과 대화 턴마다 요청을 쓰므로 후보마다 쓸 요청 수를 어림해 사람에게 미리 알린다. 스크린샷과 결과는 `.scratch/cli-minimum-versions/live/`에 둔다. 첫 후보가 실패하면 두 번째 후보로 같은 확인을 한다.
  - 검증: `go build -o <tmp>/doan ./cli/cmd/doan`, `DOAN_CLI=<tmp>/doan npm --prefix app run dev -- -- --user-data-dir=<후보별 userData>`, 그 위의 `.scratch` probe. 'E 결과' 실제 앱 표에 후보 × 항목의 통과·실패를 적는다. probe마다 전후의 후보 `--version`이 같고, 단계 전후에 design.md '사람의 상태 보호'의 비교 대상이 같다(적어 둔 새 항목만 다르다).
- [ ] E4. 실제 앱 확인(legacy external, Claude Code·Codex): 가짜 셸이 임시 `CLAUDE_CONFIG_DIR`·`CODEX_HOME`을 출력하게 하고 design.md '통과 기준' 10을 돌린다. 터미널은 design.md '실험 환경' 'legacy external'대로 갖춘다(같은 프로필 경로, `<tmp>/doan`과 `DOAN_RUNTIME`, 임시 프로필의 skill). 사람은 그 임시 프로필에 터미널에서 로그인한다. Codex 후보가 0.164.0 미만이면 X15를 본다.
  - 검증: E3과 같은 명령. 'E 결과'에 적고, 후보별 userData의 `sessions.jsonl`에 그 세션의 줄이 있고, 실제 runtime의 `sessions.jsonl`에는 없다. 단계 전후에 design.md '사람의 상태 보호'의 비교 대상이 같다.
- [ ] E5. 실험 worktree의 임시 변경(상수, floor, `io.ts`)을 되돌린다. 후보 CLI와 후보별 userData는 Z0까지 남긴다.
  - 검증: 실험 worktree에서 `git status --porcelain`에 `app/` 아래 변경이 없다.

### E 결과

(E0~E4가 채운다. 날짜, CLI 버전, 경로, 항목별 결과, 조용한 실패를 본 방법. 테스터는 익명으로 적는다.)

── commit: `docs(feature): record cli-minimum-versions PoC results` ──

## D. 결정

- [ ] D1. **사람의 결정**: E 결과를 보고 Claude Code, Codex, Cursor, Copilot마다 새 최소 버전을 정하거나 지금 값을 유지한다. 새 최소 버전은 design.md '통과 기준'을 모두 통과한 후보 중에서만 고른다. 새 최소 버전이 floor 아래면 그 floor도 새 최소 버전으로 내린다(Claude Code는 floor가 지금 최소 버전과 같아서 낮추면 반드시 해당한다). 결정을 'E 결과' 밑에 적는다.
  - 검증: 사람의 확인.

── commit: `docs(feature): cli-minimum-versions decisions` ──

## A. 테스트와 상수 (D1에서 낮추기로 정한 provider가 있을 때)

- [ ] A1. 테스트 먼저(`/tdd`): `sessions.test.ts`의 버전 표와 `MINIMUM_VERSIONS`·floor 기대값, `facts.test.ts`의 경계, `about.test.ts`의 "Doan needs X or later." 문구, `prepare.test.ts`의 최소 버전 아래 stub(지금 `codex-cli 0.162.0`)과 Codex rollout 버전 표, `io.test.ts`의 floor 아래 registry 버전을 새 경계로 바꾼다. 최소 버전 아래를 뜻하는 fixture 값(`SettingsAbout.test.tsx:61`의 Codex `0.163.0` 등)이 새 경계에서 뜻이 바뀌면 고친다. 빠짐을 막기 위해 옛 경계 값과 그 한 단계 아래 값으로 `rg -n` 한 결과를 'E 결과' 밑에 남기고, 고치지 않은 줄은 이유를 적는다. E3에서 Claude registry 모양이 달랐으면 그 기록의 fixture를 `io.test.ts`에 더한다.
  - 검증: `npm --prefix app test` — 새 경계 테스트가 red.
- [ ] A2. 구현: `minimumVersions.ts`, `sessions.ts`의 floor, (E3에서 registry 모양이 달랐으면) `io.ts`의 registry 기록 판정. 버전을 근거로 적거나 옛 규칙을 적은 주석(`minimumVersions.ts:1-2`의 "raising one is a decision…", `sessions.ts:10-11`의 floor 주석, `providers.ts`의 provider 주석, `io.ts:70`, `io.ts:116`(Codex를 0.164.0 아래로 내린 경우), `io.ts:142-145`, `conversation/fixtures/README.md`)은 사실이 바뀐 곳만 고친다. `rg -n 'loginClears: true' app/src/main/agentAuth/providers.ts`의 결과가 E3의 통과 기준 2 결과와 맞는지 본다(POSTMORTEM 2026-10-29).
  - 검증: `npm --prefix app test` green, `npm --prefix app run typecheck`.

── commit: A1은 `test(conversation): pin the lowered provider CLI minimums`, A2는 `feat(conversation): accept older provider CLIs` (`/ship`의 test → 구현 커밋 순서) ──

## C. 확인

- [ ] C1. `/runtime-test`: E3과 같은 checkout, 실제 HOME(design.md 'HOME과 로그인'), 커밋된 코드로 한다. 낮춘 provider마다 새 최소 버전과 정확히 같은 CLI를 쓴다. Settings > Agents가 Update 없이 Connected, About이 "Doan needs <새 버전> or later."다. 새 최소 버전보다 patch 하나 낮은 버전은 `--version`만 출력하는 stub 실행 파일을 가짜 셸 PATH에 두고 Update를 확인한다. 대화 기능 증거는 E3·E4의 같은 버전 결과를 다시 쓴다. A2에서 `io.ts`를 고쳤으면 통과 기준 4(resume)와 10을 다시 본다. Copilot의 Connected는 요청 하나를 쓰는 Retry가 필요하므로 사람에게 미리 알린다.
  - 검증: `DOAN_CLI=<tmp>/doan npm --prefix app run dev -- -- --user-data-dir=<후보별 userData>`와 `.scratch` probe, 스크린샷. 단계 전후에 design.md '사람의 상태 보호'의 비교 대상이 같다.
- [ ] C2. `/code-review`, 필요하면 `/refactor`. `/refactor`가 코드를 바꾸면 `refactor:` 커밋을 따로 만든다.
  - 검증: 보고서에 남은 지적이 없다.
- [ ] C3. `/verify`.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs` exit 0.

`/agent-eval`은 하지 않는다. guide, CLI 출력·메시지, `doan check` 규칙, skill stub이 바뀌지 않는다(design.md '`/agent-eval`').

## Z. 정리와 승격

- [ ] Z0. 실험 정리: 실험이 만든 것만 지운다.
  - 후보별 userData의 연결을 앱에서 sign-out하고 Keychain 항목이 없어졌는지 본 뒤 userData를 지운다. 커밋된 앱이 그 후보 버전을 거절해서 sign-out하지 못하면 그 후보 값을 넣은 실험 빌드로 sign-out한다. sign-out이 `stop_required`로 거절되면 대화를 멈춘 뒤 다시 한다(BACKLOG: 그대로 앱을 끄면 Codex Keychain 항목이 남는다).
  - 통과 기준 8이 만든 MCP 연결은 Remove하고, Codex MCP OAuth의 Keychain 항목과 Claude MCP token이 남지 않았는지 본다. 실제 계정을 연결했으면 그 서비스에서 OAuth 승인도 거둔다.
  - 임시 legacy 프로필은 그 프로필에서 `claude auth logout`·`codex logout`을 돌린 뒤 지운다. 그 프로필의 Keychain 항목은 앱의 sign-out이 지우지 않는다.
  - `.scratch/cli-minimum-versions/clis/`를 지운다. 실험 전에 있던 `doan Safe Storage`는 지우지 않는다(design.md '사람의 상태 보호').
  - 검증: 실험 시작 전에 적어 둔 design.md '사람의 상태 보호'의 비교 대상과 같다. 사람의 사용으로 바뀐 항목은 그 사실을 적는다. 실험이 만든 Keychain 항목이 하나도 남지 않았다.
- [ ] Z1. 결론을 현재 규칙으로 옮긴다(영문). 근거와 E 결과 요약은 커밋 메시지에 둔다.
  - PRODUCT §3 'Transport and evidence boundary'(PRODUCT.md:58): 최소 버전 숫자. Cursor·Copilot을 낮췄으면 그 숫자도 적는다. floor를 내렸으면 "fixed floors that do not follow the minimums"를 floor가 낮아진 최소 버전을 따라 내려간다는 규칙으로 고친다. Codex를 0.164.0 아래로 내렸으면 'Live terminal policy'(PRODUCT.md:62)의 writer lock 문장도 그 버전의 사실에 맞춘다.
  - ARCHITECTURE §7 'Agent authentication' 'Versions'(ARCHITECTURE.md:530): 최소 버전을 낮출 때 그 버전이 통과 기준을 모두 통과해야 한다는 규칙(올릴 때의 규칙은 그대로), Antigravity에 최소 버전이 없는 이유. 'Transport and environment'(:433-434): floor는 낮아진 최소 버전을 따라 내려간다는 규칙. steer 관찰 버전(:437), writer lock 버전(:442), effort 관찰(:506), 0.163.0 관찰(:459)은 사실이 바뀐 곳만. 'Known limits'(:576-578)는 사실이 바뀐 곳만.
  - 어느 provider도 낮추지 않았으면 PRODUCT는 그대로 두고, ARCHITECTURE에는 낮출 때의 규칙과 Antigravity에 최소 버전이 없는 이유만 더한다. 실험 관찰(어느 버전이 어느 항목에서 실패했는지)은 커밋 메시지에 남긴다.
  - 그리고 `docs/features/cli-minimum-versions/`를 지운다.
  - 검증: `grep -n 'verified minimums' docs/PRODUCT.md`의 숫자가 `MINIMUM_VERSIONS`와 같다. floor를 내렸으면 `grep -n 'do not follow the minimums' docs/PRODUCT.md docs/ARCHITECTURE.md`의 결과가 없다. ARCHITECTURE.md:530 부근에 낮출 때의 규칙이 있다. `docs/features/cli-minimum-versions/`가 없다.

── commit: `docs(product): lower the provider CLI minimum versions` / `docs(architecture): evidence for changing a CLI minimum` / `docs(feature): remove cli-minimum-versions docs` ──
