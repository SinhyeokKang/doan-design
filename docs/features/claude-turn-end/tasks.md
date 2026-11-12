# Claude 턴 종료 판정 결함 고치기 — 작업

각 커밋 경계 앞에서 `npm --prefix app run typecheck`, `npm --prefix app run lint`, `npm --prefix app test`를 돌린다. 백그라운드 작업 줄은 새 UI라서 `/design-draft`로 초안을 그리고 사용자 확인을 받은 다음 `/tdd`로 간다.

1. [x] **PoC: 실제 Claude CLI 관찰.** design.md 'PoC 의존' 1–4를 확인한다. 스크립트는 `.scratch/claude-turn-end/`의 명령이고 커밋하지 않는다. `app/node_modules`의 SDK로 원시 프레임을 시각과 함께 기록한다(`.scratch/queue-send-now/claude.mjs` 방식). 설치된 CLI의 기존 로그인, 임시 cwd(`mkdtemp`), `settingSources: []`를 쓴다.
   - 버전: 현재 설치 버전과 최소 버전 2.1.284 둘 다. 2.1.284는 `.scratch/claude-turn-end/cli-284/`에 npm으로 따로 설치하고 `pathToClaudeCodeExecutable`로 가리킨다. 설치 명령(사용자 승인): `npm --prefix .scratch/claude-turn-end/cli-284 install --save-exact @anthropic-ai/claude-code@2.1.284`.
   - 실제 상태 보호: 세션 기록이 실제 `~/.claude/projects/` 아래 임시 cwd 이름의 디렉터리에 남는다. PoC는 자기가 만든 세션 id만 읽고 resume한다. 실행 전후로 비교한다: `~/.claude/projects/`(자기 디렉터리 말고는 목록과 수정 시각이 같다), `~/.claude/sessions/` 목록과 남은 기록, `~/.claude.json`의 수정 시각. 남긴 디렉터리 이름을 'PoC 결과'에 적는다.
   - a. 백그라운드 작업이 남은 세션의 다음 턴: 1턴에서 `run_in_background`로 Bash(`sleep 60`)를 시작하고 끝낸다. 프로세스를 Doan처럼 입력 닫기로 끝낸 경우와 그룹 정지로 끝낸 경우 각각, 같은 세션에 uuid를 단 2턴을 보낸다. 첫 result의 시각, `user_message_uuids`, `background_tasks_changed` 프레임, 프롬프트 uuid가 처음 나오는 프레임을 기록한다.
   - b. 정리 신호: done 턴의 result 뒤 usage 읽기가 끝나고 입력을 닫은 프로세스에 SIGTERM, SIGINT, SIGKILL을 각각 보내 그룹이 사라지기까지의 시간을 잰다(각 10회). SIGKILL 뒤 세션 JSONL 마지막 줄의 무결성과 다음 resume 성공을 확인한다.
   - c. steer 기록: 접힘(도구 실행 중)과 후속 턴(result 직후) 두 경우에 uuid를 단 steer를 보내고, 세션 JSONL에서 그 uuid가 어떤 필드로, 받을 때와 읽을 때 중 언제 쓰이는지 확인한다. 읽히기 전에 그룹을 멈춘 경우도 본다. 일반 턴의 프롬프트 uuid도 기록에 있는지 본다.
   - d. 백그라운드 작업이 살아 있는 done 턴: `run_in_background`로 `sleep 20`을 시작하고 끝나는 턴에서, done result 전후의 `background_tasks_changed`(`task_type`, `ambient` 포함), 입력을 닫은 뒤 CLI가 사는 시간, 작업 종료 뒤 CLI가 스스로 모델을 부르는지(assistant·result 프레임), 집합이 비는 프레임과 첫 모델 요청 사이의 간격을 기록한다. 백그라운드 서브에이전트 하나도 같은 방식으로 본다. 작업 도중 SIGTERM으로 그룹을 멈춰 `sleep`까지 사라지는지도 본다.
   - e. watcher 지연: `node .scratch/claude-turn-end/watcher-latency.mjs`. Playwright `_electron`과 `app/runtime/` 격리(임시 userData·HOME·SHELL·`CLAUDE_CONFIG_DIR`, 에이전트는 띄우지 않음)로 dev 빌드를 띄운다. 등록된 프로젝트의 `.doan/canvases/`에 파일을 쓴 시각부터, `app.evaluate`로 main에 건 계측에서 `refreshed()`가 불린 시각(또는 renderer 목록에 새 캔버스가 나타난 시각)까지를 20회 잰다.
   - fixture: 2.1.284와 현재 버전의 실제 세션 JSONL 줄(일반 턴, 접힌 steer, 후속 턴 steer)을 개인 내용과 경로를 지워 `app/src/main/conversation/fixtures/`에 저장한다. 3번 테스트가 둘 다 쓴다.
   - 결과를 아래 'PoC 결과'에 적는다(버전, 조건, 중앙값과 범위). 다음 중 하나면 여기서 멈추고 사용자에게 돌아온다:
     - 결함 2의 가설이 틀림.
     - 2.1.284가 첫 프롬프트 uuid를 echo하지 않거나 `background_tasks_changed`를 보내지 않음(최소 버전을 올릴지 묻는다).
     - 클라이언트 uuid가 기록에 없음.
     - SIGKILL 뒤 기록이 깨지거나 resume이 실패함.
     - 백그라운드 작업을 스트림으로 알 수 없음.
     - 작업 종료 뒤 CLI가 스스로 모델을 부르는데, 집합이 비는 프레임과 첫 모델 요청 사이가 너무 짧아 막을 수 없음.
   - 확인: `node .scratch/claude-turn-end/<scenario>.mjs`가 로그를 남기고, 'PoC 결과'의 각 수치가 로그와 맞는다. 실제 상태 비교가 위 기준을 통과한다.
   - 커밋 경계: 문서만(이 파일의 'PoC 결과', design.md의 `PROMOTION_SETTLE_MS` 값과 기록 필드). fixture는 3번 커밋에 넣는다.
2. [x] **초안 (`/design-draft`).** 백그라운드 작업 줄(문구, Stop의 평소·누름·실패 상태, 실패 토스트, 라이트·다크, Overview와 캔버스 패널)과 결함 2의 실패 문구를 `.doan/canvases/`에 그린다.
   - 확인: `doan check`·`doan ls`가 통과하고, 사용자가 앱에서 초안을 확인했다.
3. [ ] **테스트 먼저 (`/tdd`).** red를 확인한다.
   - 순수 함수: `promotionDeadline`, `promptTransport`와 `normalizeClaude`의 프롬프트 읽힘 규칙, `readInTranscript`(두 버전의 fixture), `backgroundTasks`(`local_agent` 포함, `ambient` 제외), `afterTurnCleanup`, `backgroundLine`(design.md '순수 함수').
   - 서비스(판정): 턴(done, failed, interrupted)이 끝나고 그룹이 사라진 뒤 `promotionDeadline`에 판정되고, `turn.done` 순간에 보낸 send가 그때 시작된다(POSTMORTEM 2026-10-28: 이전 프로세스의 종료 콜백 전에 보낸다). 폴더 다시 읽기가 먼저 오면 그때 판정한다. 그룹이 남으면 10초 상한. handoff 판정도 같다. ACP 러너도 같고 Codex는 10초다.
   - 서비스(정리): `previousExit`이 제안 상태와 상관없이 정리 메서드를 부르고, 백그라운드 프로세스가 있어도 busy로 거부되지 않는다. `ended()`가 큐로 `holding`을 세울 때도 정리한다.
   - 서비스(결함 3): 읽히지 않은 steer가 있는 종료가 `pendingTerminal`로 보류되고, `exited()`에서 예약 해제 → 기록 찾기 → `steerConsumed` → 보류한 종료 순서로 쓰이며 `process_exited`가 되지 않는다. Stop, 로그아웃, archive, 앱 종료 각각. 2초 상한. Stop 순간 `stopping`이 나간다. legacy-external 대화는 읽기만 한다.
   - 서비스(백그라운드): done 턴 뒤 집합이 비어 있지 않으면 목록에 `background`가 붙고, 대화는 working이 아니며 `stop_required`가 그 그룹을 세지 않는다. 다음 send(턴 끝의 큐 포함)가 그룹을 SIGTERM 경로로 끝낸다. 로그아웃·Restart to Update·프로젝트 Remove·archive·삭제·앱 종료가 묻지 않고 그룹을 멈춘다. PoC가 CLI의 자발적 모델 호출을 보였으면 집합이 비는 순간 그룹이 멈춘다.
   - Stop 경합: 줄의 Stop은 그 done 턴의 프로세스만 멈춘다. 새 send가 시작된 뒤 늦게 온 Stop은 아무것도 하지 않는다. Overview와 캔버스 패널에서 두 번 눌러도 한 번만 처리한다.
   - 경계 경우: 프로세스가 이미 죽음(`exitedAt ≤ endedAt`), 정착 중 Stop(큐가 돌아오고 타이머가 지워짐), 정착·기록 찾기 중 앱 종료(이벤트를 쓰지 않음), 백그라운드나 기록 찾기 중 archive·삭제, 백그라운드 그룹이 살아 있는 동안 handoff·terminal continue가 같은 세션을 resume, 백그라운드 그룹이 있는 채 로그아웃, Codex는 10초.
   - runner(가짜 CLI): meta 턴 result가 먼저 오고 그 뒤 프롬프트를 읽는 CLI에서 턴이 프롬프트의 result에서 끝나고 meta 턴의 프레임이 그 턴에 나간다. 프롬프트가 상한까지 읽히지 않으면 `turn.failed`(`prompt_unread`)로 끝나고 그룹이 멈춘다. 프롬프트를 읽지 않은 채 failed·aborted result가 오면 그룹이 멈춘다. 제안만 남은 프로세스가 두 호출 지점 모두에서 즉시 SIGKILL로 끝나고, `stopping`이 캐시되어 있어도 SIGKILL이 나가며, 예약은 그룹 소멸 관찰 뒤에만 풀린다. 모든 runner promise를 정리한다(POSTMORTEM 2026-11-11).
   - renderer: 백그라운드 줄이 done 턴 아래에 나타나고, 사람의 메시지가 들어가는 렌더에서 사라진다. Stop을 누르면 스피너와 함께 누를 수 없고, 실패하면 돌아오며 토스트가 뜬다. 접근 가능한 이름, Shift+Tab 도달, 줄이 사라질 때 포커스가 composer 필드로 감. `stopping`이면 턴 표시줄이 바로 숨는다. `homeRun.ts`의 새 캔버스 창이 판정에서 닫힌다. 결함 3에서 남는 Send now 메시지의 `sending` 항목이 정리된다(POSTMORTEM 2026-11-05). 결함 2의 실패 문구(`prompt_unread`)와 strip.
   - 기록: `storeRecovery.test.ts`에서 `prompt_unread`가 든 기록을 읽고, 모르는 코드는 여전히 거부한다.
   - 확인: 새 테스트만 red, 기존 `runners.test.ts`·`service.test.ts`·`project.test.ts`·`process.test.ts`는 녹색.
   - 커밋 경계: 새 함수와 메서드는 stub으로 export해 `npm --prefix app run typecheck`가 통과하고 새 테스트만 red인 상태로 커밋한다.
4. [ ] **순수 함수와 기록 형식.** `project.ts`·`transport.ts`·`io.ts` 기록 파싱·백그라운드 집합·정리 결정·줄. `types.ts` `FailureCode`와 `store.ts` 검증 목록에 `prompt_unread`를 더한다.
   - 확인: `npm --prefix app test`에서 3번의 순수 함수 테스트 녹색.
   - 커밋 경계.
5. [ ] **프로세스 정리와 runner.** `OwnedGroup.kill()`, Claude runner의 프롬프트 uuid, 정리 메서드와 두 호출 지점, done 뒤 백그라운드 집합 읽기와 자발적 모델 호출 막기.
   - 확인: `npm --prefix app test`에서 runner·process 테스트 녹색.
   - 커밋 경계.
6. [ ] **서비스와 IPC.** `promotionDeadline` 타이머와 handoff 판정, `previousExit`·`ended()`의 정리, `pendingTerminal`과 기록 찾기, `interrupt()` not-busy 분기, 조용한 정지 경로와 `stop_required`, `background`·`stopping` 목록 필드.
   - 확인: `npm --prefix app test` 녹색, `node .agents/skills/verify/scripts/verify.mjs` PASS.
   - 커밋 경계.
7. [ ] **스레드 UI.** 백그라운드 줄과 Stop, 실패 문구, `stopping`의 표시줄 숨김, `homeRun.ts` 창을 Overview와 캔버스 패널에 반영한다. 첫 구현이므로 `/design-sync`로 2번 초안과 맞춘다.
   - 확인: `npm --prefix app test` 녹색, `node .scratch/design-sync/<screen>/measure.mjs` 측정 통과.
   - 커밋 경계.
8. [ ] **노티스 버튼 세로 가운데 (공통 규칙).** 초안 선택 6. 이 기능만이 아니라 모든 노티스에 적용한다.
   - 대상: `app/src/renderer/ds/surfaces.css`의 `.doan-notice > :is(.doan-button, :has(> .doan-button))` 규칙.
     - `align-self: flex-start`를 `center`로 바꾼다. 음수 `margin-block`은 그대로 둔다. 그래야 한 줄 노티스의 높이가 그대로다.
     - 아이콘 자리(`.doan-alert-icon`, 스피너, strip의 상태 표시)는 첫 줄에 그대로 둔다.
     - 스레드 노티스는 바꾸지 않는다. 버튼이 텍스트 아래 자기 줄에 있기 때문이다(`.thread-notice > .strip-actions`).
     - 위 규칙 바로 앞의 주석을 새 규칙에 맞게 고친다.
   - 테스트: `ds/controls.test.ts`의 규칙 문자열을 바꾼다.
   - 캔버스 정리: `.doan/canvases/claude-turn-end.html`의 임시 override 줄을 지운다.
   - 문서: 다음 세 곳의 "첫 줄" 설명을 바꾼다.
     - `.doan/ds/notice.html`의 설명과 'sm action on the first line' 라벨.
     - DESIGN.md 'Notices'.
     - DESIGN.md 'Conversation strip'의 "sm actions on the first line".
   - 확인:
     - `npm --prefix app test`가 녹색이다.
     - 실제 앱 짧은 probe로 두 가지를 잰다. 하나는 두 줄 Home strip(권한 요청 또는 실패)이다. 버튼이 노티스 세로 가운데에 있고, 아이콘은 첫 줄에 있어야 한다. 다른 하나는 버튼이 있는 한 줄 노티스다. 높이가 44 px 그대로여야 한다.
   - 커밋 경계.
9. [ ] **실제 앱 확인 (`/runtime-test`).** 패키지 앱(`npm --prefix app run package`)을 design.md '실제 앱 확인의 로그인'대로 실제 HOME, 임시 `DOAN_RUNTIME`·repo, 계속 쓰는 userData로 띄우고, 그 userData의 Doan Claude 연결이 살아 있는지 본 뒤(끊겼으면 사용자가 자기 브라우저에서 한 번 승인한다), 각 결함을 `turn.done` 순간에 보내는 짧은 probe로 확인한다.
   - 프로젝트 대화: 파일 변경 없는 턴과 새 캔버스를 만든 턴 각각, send에서 다음 턴 시작까지 시간. 새 캔버스 턴은 승격된다.
   - 캔버스 대화: send에서 다음 턴 시작까지의 중앙값이 PoC 1b의 "SIGKILL 뒤 그룹이 사라지기까지" + 100ms 이하. 그 뒤 resume 정상. 앱의 `settingSources`와 MCP 아래에서도 SIGTERM을 무시하는 원인이 PoC와 같은지 본다.
   - 백그라운드 작업 세션: 2턴이 프롬프트의 답에서 끝나고 그 답이 보인다. meta 턴의 답이 사람의 답보다 먼저 보여 헷갈리는지 관찰해 적는다.
   - 일반 턴의 프롬프트 uuid를 기록 찾기가 찾는다.
   - 백그라운드 작업 줄: `sleep`을 백그라운드로 남긴 done 턴에 줄이 보이고, 다음 send와 줄의 Stop 각각으로 `sleep`까지 사라지며 줄이 없어진다. 앱 종료와 archive 뒤에도 `sleep`이 남지 않는다(`pgrep`).
   - 결함 3의 늦은 읽힘은 실제 CLI로 만들 수 없으므로 가짜 CLI 테스트로만 확인했다고 남긴다. ACP의 판정 시점은 측정하지 않았다고 남긴다.
   - 실제 상태 비교 위치: `~/Library/Application Support/doan/`, `~/.claude/`, `~/.local/bin/doan`.
   - 확인: probe 로그의 수치가 spec.md 완료 조건 1–5를 만족하고, 실제 상태 비교를 통과한다.
10. [ ] **승격과 삭제.**
   - PRODUCT §5 item 1 'Project conversations': 판정 시점(그룹 소멸 뒤 정착 시간, 10초 상한, Claude·ACP, handoff 포함), 새 캔버스를 여는 창이 판정에서 닫힘. 두 턴이 겹칠 때의 규칙은 그대로.
   - PRODUCT §5 'Send now': 기록에 있는 steer는 그 턴에 남음.
   - PRODUCT §5 'Turn indicator': "No … "still working" line"을 실행 중인 턴으로 좁히고, 백그라운드 줄을 별도 항목으로 둔다(문구, Stop과 그 상태, 사라지는 때, 턴 끝의 큐도 다음 send, 다른 곳에서는 실행 중이 아님, 로그아웃·Restart to Update·프로젝트 Remove·archive·삭제·앱 종료에서 묻지 않고 멈춤, 사람의 메시지 없는 모델 요청 막기, 재시작 뒤 없음).
   - PRODUCT: 결함 2의 실패 문구.
   - ARCHITECTURE §7 이벤트 항목: `prompt_unread` 코드와, 이 코드가 든 기록을 이전 빌드가 읽지 못한다는 결과.
   - ARCHITECTURE §7: Steering Claude 항목(프롬프트 uuid, 보류한 종료와 기록 찾기), 'Project conversations and promotion'(`PROMOTION_SETTLE_MS`, `promotionDeadline`), 'Next-message suggestions'와 그룹 정리 규칙(즉시 SIGKILL·SIGTERM 경로), 'Turn-end reads', 백그라운드 집합 감지와 메모리 전용 목록 필드, `stop_required` 제외. `runners.ts` `TURN_USAGE_MS` 주석의 "SIGKILL after 0.5 s"를 맞춘다. `handoffView.ts` `HANDOFF_WAIT_MS`는 바뀌지 않음, `homeRun.ts`는 창 규칙만 바뀜을 적는다.
   - DESIGN.md: 백그라운드 줄의 측정값(`/design-sync`).
   - BACKLOG: 'Known defects'의 세 항목을 지운다. 'Not verified'에 결함 3의 실제 CLI 늦은 읽힘과 ACP 판정 시점을 적는다.
   - PoC 관찰은 커밋 메시지에 남긴다. `docs/features/claude-turn-end/`를 삭제한다.
   - 확인: 문서 diff 검토, `node .agents/skills/verify/scripts/verify.mjs` PASS.
   - 커밋 경계: 문서별 커밋.

## PoC 결과

2026-11-12에 돌렸다. CLI는 설치된 2.1.322와 따로 설치한 2.1.284, SDK는 0.3.312다. 설치된 CLI의 기존 로그인, 임시 cwd, `settingSources: []`, `includePartialMessages`, `promptSuggestions`와 `CLAUDE_CODE_ENABLE_PROMPT_SUGGESTION=true`, 분리된 프로세스 그룹으로 Doan runner처럼 열었다. 모든 프레임을 받은 시각과 함께 기록했다. a와 d의 모델 요청 시각은 `ANTHROPIC_BASE_URL`로 둔 로컬 전달 서버가 받은 `POST /v1/messages`의 시각이다(경로만 기록). 스크립트와 로그는 `.scratch/claude-turn-end/`에 있고 커밋하지 않는다. 아래 수치는 `node .scratch/claude-turn-end/analyze.mjs`가 로그에서 뽑은 `logs/summary.json`과 같다. 반복 횟수가 1이면 범위를 쓰지 않는다.

**멈춤 조건: 여섯 가지 모두 해당하지 않는다.**

- 결함 2의 가설은 맞다(a).
- 2.1.284는 첫 프롬프트 uuid를 그 프롬프트의 result `user_message_uuids`로 echo한다(b 40회와 a 5회 모두). `background_tasks_changed`도 보낸다(d).
- 클라이언트 uuid는 세션 기록에 있다(c).
- SIGKILL 뒤 기록은 온전하고 resume은 성공했다(b 20회, c 2회).
- 백그라운드 작업은 스트림으로 알 수 있다(d).
- 작업 종료 뒤 CLI가 스스로 모델을 부르지만, 집합이 비는 프레임에서 그룹을 멈추면 요청이 나가지 않았다(d).

### a. 백그라운드 작업이 남은 세션의 다음 턴

조건: 1턴이 `run_in_background` Bash로 `sleep 60.4x`를 시작하고 끝난다. usage를 읽고 입력을 닫은 뒤, 프로세스를 그대로 두거나("입력 닫기") 1초 뒤 SIGTERM, 그 500ms 뒤 SIGKILL로 멈춘다("그룹 정지"). 프로세스가 사라지면 2턴이 같은 세션을 resume하고 uuid를 단 프롬프트를 보낸다. 로그: `logs/a-background-<버전>-run1.jsonl`(입력 닫기 1회, 그룹 정지 1회), `logs/a-background-<버전>-stop3.jsonl`(그룹 정지 3회).

- 그룹 정지(버전마다 4회): 4회 모두 2턴의 첫 result가 meta 턴의 것이다. `success`, `num_turns: 0`, `result: ""`이고 `user_message_uuids`가 없다. 그 앞에 `task_notification`(`status: "stopped"`)이 오고, 그 result 전에 모델 요청은 없다(POST 0). 지금의 `normalizeClaude`는 4회 모두 이 result로 턴을 끝낸다. 모델을 부르지 않는 턴이라 BACKLOG의 56ms가 설명된다.

  | | 프롬프트 `command_lifecycle`(`queued`) → meta result | meta result → 프롬프트 uuid가 처음 나오는 프레임 | meta result → 프롬프트의 result |
  |---|---|---|---|
  | 2.1.322 | 중앙값 16.7ms (8.2–21.1) | 20.35ms (16.5–23.3), `system/init` | 1403.65ms (1254.5–1484.8) |
  | 2.1.284 | 11.35ms (−9.3–63) | 1220.75ms (946.2–1277.4), `stream_event` `message_start` | 1315.85ms (1299.5–1357.9) |

  2.1.284에서 음수 1회는 meta result가 프롬프트의 `queued` 프레임보다 먼저 온 경우다.
- 입력 닫기(버전마다 1회):
  - 2.1.322: 1턴 프로세스가 입력을 닫은 뒤 62.5초 살았다. 작업이 끝나자(`completed`) 사람 메시지 없이 모델을 불렀다(POST 2, uuid 없는 result 1). 2턴에는 meta result가 없고 첫 result가 프롬프트의 것이다.
  - 2.1.284: 1턴 프로세스가 입력을 닫은 뒤 작업을 스스로 멈추고(`stopped`) 5.7초에 끝났다. 모델 요청은 없었다. 2턴의 첫 result는 meta 턴의 것이다(`queued` 뒤 246.1ms). 프롬프트 uuid는 그 1185.4ms 뒤에 처음 나온다.
- 2턴에는 `background_tasks_changed`가 오지 않았다. 두 버전 모두 프롬프트의 result가 그 uuid를 echo한다.

### b. 정리 신호

조건: 한 단어로 답하는 턴의 done result 뒤 usage를 읽고 입력을 닫자마자 신호를 보내고, 그룹이 사라지기까지 5ms 간격으로 확인했다. 신호마다 10회이고, 매 실행이 앞 실행의 세션을 resume한다. 로그: `logs/b-signals-<버전>.jsonl`, 제안을 끈 비교는 `logs/b-signals-current-nosuggest.jsonl`.

| 그룹이 사라지기까지 (ms) | 신호 없음 | SIGTERM | SIGINT | SIGKILL |
|---|---|---|---|---|
| 2.1.322 | 1728.5 (763–2019) | 528.5 (515–569) | 525 (504–566) | 11 (5–13) |
| 2.1.284 | 2099.5 (870–2385) | 857.5 (838–1003) | 867 (835–965) | 11 (7–13) |

- SIGTERM을 무시하지 않는다. CLI는 자기 종료 처리를 마치고 코드 143으로 끝나는데, 그 처리에 0.5초가 넘게 걸린다. 그래서 Doan의 SIGKILL(500ms 뒤)이 먼저 닿아 BACKLOG의 0.53–0.55초가 된다. 제안을 끄고(`promptSuggestions: false`, 환경변수 없음) 2.1.322로 3회 재도 796ms(530–1499)라, 제안 API 호출을 기다리는 것이 아니다.
- 제안은 신호 없는 실행에서만 왔다(두 버전 모두 10회 중 9회).
- SIGKILL 20회 모두 세션 JSONL의 모든 줄이 파싱되고, 마지막 줄이 온전하며 줄바꿈으로 끝났다. 바로 다음 resume은 모두 성공했다(result가 그 프롬프트 uuid를 echo). 마지막 실행 뒤의 resume도 두 버전 모두 성공했다.
- 완료 조건 2와 tasks 9의 기준값 "SIGKILL 뒤 그룹이 사라지기까지"는 중앙값 11ms다.

### c. steer 기록

조건: 버전마다 경우당 1회. 접힘은 전경 Bash `sleep 6`의 `tool_use`가 온 1초 뒤에 steer를 보낸다. 후속 턴은 첫 result 직후, 입력을 닫기 전에 보낸다. 정지는 접힘처럼 보내고 300ms 뒤 그룹을 멈춘다(SIGTERM → 500ms → SIGKILL 경로와 즉시 SIGKILL 각각). 세션 JSONL을 25ms 간격으로 읽어 uuid가 처음 나타난 시각을 쟀다. 로그: `logs/c-steer-<버전>.jsonl`, 줄 내용은 `logs/c-steer-<버전>-<경우>.transcript-lines.json`.

- 일반 턴 프롬프트: `type: "user"` 줄의 `uuid`. 2.1.322는 같은 값을 `turnAttributionKey`에도 쓴다.
- 후속 턴 steer: `type: "user"` 줄의 `uuid`(2.1.322는 `turnAttributionKey`에도).
- 접힌 steer: `type: "attachment"`이고 `attachment.type: "queued_command"`인 줄의 `attachment.source_uuid`. 2.1.322는 그 뒤 `queue-operation`(`operation: "remove"`) 줄의 `commandUuid`에도 같은 값을 쓰고, 2.1.284는 쓰지 않는다.
- 쓰는 때: CLI가 메시지를 큐에서 꺼낼 때(읽을 때) 쓴다. 받을 때는 `queue-operation`(`operation: "enqueue"`) 줄이 내용만 담고 uuid 없이 쓰인다.
  - 접힘: 보낸 뒤 5364ms(2.1.322), 5559ms(2.1.284)에 썼다. Bash가 끝나 큐에서 꺼낸 때다. 2.1.322는 uuid를 처음 echo한 프레임(`system/status`)보다 102ms 뒤에 썼다. 2.1.284는 echo가 그 턴의 `result`에서야 나왔고, 기록은 그보다 2153ms 먼저 썼다.
  - 후속 턴: 보낸 뒤 118ms(2.1.322), 126ms(2.1.284)에 썼다. 2.1.322는 echo(`system/init`) 105ms 뒤, 2.1.284는 echo(`stream_event`) 688ms 전이다.
- 읽히기 전에 멈춤(두 버전, 두 정지 경로): 기록에 uuid가 없다(`enqueue` 줄만 있다). 같은 세션을 resume해도 그 메시지는 실행되지 않았다. 답에 없고, echo도 없고, resume 뒤 기록에도 uuid가 없다. 기록은 온전했다.

### d. 백그라운드 작업이 살아 있는 done 턴

조건: 셸은 `run_in_background` Bash로 `sleep 20.3x`를 시작하고 끝나는 턴이다. 에이전트는 `run_in_background` 서브에이전트가 전경 `sleep 20.3x`를 도는 턴이다. done result 뒤 usage를 읽고 입력을 닫는다. 변형마다 버전당 1회. 로그: `logs/d-background-<버전>.jsonl`.

- `background_tasks_changed`: 두 버전 모두 done result 전에 작업 하나(`task_type: "local_bash"` 또는 `"local_agent"`)를 싣고 오고, 작업이 끝나면 빈 집합으로 온다. 어느 항목에도 `ambient`가 없었다. 2.1.322는 서브에이전트 항목에 `subagent_type`을 싣고, 2.1.284는 싣지 않는다.
- 입력을 닫은 뒤의 수명과 자발적 모델 호출:

  | | 셸 | 에이전트 |
  |---|---|---|
  | 2.1.322 | 작업 끝까지 산다(22.9초). 빈 집합 뒤 모델을 부른다(POST 2, assistant 2, uuid 없는 result 1) | 작업 끝까지 산다(19.4초). 빈 집합 뒤 모델을 부른다(POST 2) |
  | 2.1.284 | 닫은 뒤 5.1초에 작업을 스스로 멈추고(`stopped`) 5.7초에 끝난다. 모델 요청 없음 | 작업 끝까지 산다(17.6초). 빈 집합 뒤 모델을 부른다(POST 1) |

- 빈 집합 프레임에서 첫 `POST /v1/messages`까지: 2.1.322 셸 119.3ms, 에이전트 59.4ms, 2.1.284 에이전트 27.5ms. `status: "requesting"` 프레임까지는 각각 109.8ms, 53.9ms, 16.2ms다.
- 막기: 빈 집합 프레임을 받은 그 tick에 그룹에 SIGKILL을 보내면(버전마다 셸 1회, 에이전트 1회) 그 뒤 모델 요청은 0이었다.
- 작업 도중 그룹 정지(입력을 닫고 3초 뒤):
  - SIGTERM: CLI가 작업을 멈춘다. 빈 집합 프레임이 SIGTERM 뒤 36ms(2.1.322), 14ms(2.1.284)에 오고, 그룹은 614ms, 561ms에 사라진다(코드 143). `sleep`도 사라졌다.
  - SIGKILL: 그룹은 11ms, 5ms에 사라지지만 `sleep`은 부모 1로 남았다(PoC가 직접 지웠다).
- 백그라운드 Bash와 서브에이전트의 Bash는 CLI 그룹이 아니라 자기 프로세스 그룹에서 돈다(pgid가 그 셸의 pid). `OwnedGroup`의 그룹 소멸 관찰은 이 프로세스를 보지 않는다.

### e. watcher 지연

조건: dev 빌드를 `app/runtime/` 격리(임시 userData·HOME·SHELL·`CLAUDE_CONFIG_DIR`·`CODEX_HOME`·`DOAN_RUNTIME`, 에이전트 없음)로 띄우고 임시 프로젝트를 등록했다. probe 프로세스가 `.doan/canvases/`에 새 캔버스를 쓴 시각부터, main이 그 캔버스가 든 `"folders"`를 보낸 시각까지 쟀다. main은 같은 콜백에서 `refreshed()`를 부른 직후 이것을 보낸다(`index.ts`). 실행마다 20회. 로그: `logs/e-run<n>.out`, `logs/e-watcher-latency-run<2|3>.jsonl`.

| 실행 | 쓰기 간격 | 중앙값 | 범위 | 끝 |
|---|---|---|---|---|
| 1 | 1.5초 | 1529ms | 1006.6–3714.6ms | 앱 종료가 5초를 넘겨 실패. 실제 상태 비교는 통과 |
| 2 | 3초 | 1432.2ms | 1262.9–2683.7ms | 통과 |
| 3 | 3초 | 1290.65ms | 1055.1–2817.4ms | 실제 상태 비교 실패(아래) |

- 60회 전체: 중앙값 1382.4ms, 1006.6–3714.6ms. 같은 프로젝트의 `doan ls` 한 번이 1307ms(실행 2), 887ms(실행 3)라, 지연의 대부분은 목록 읽기다.
- 실행 3의 실제 상태 차이는 `~/Library/Application Support/doan/agent-auth`다. 같은 시각(00:03:50–51 KST)에 사용자의 설치된 Doan.app이 자기 Claude 프로필에 쓴 것이다. probe 앱의 userData와 `CLAUDE_CONFIG_DIR`은 임시 경로라 그 경로를 쓰지 않는다.
- 이 셋보다 먼저 한 실행은 실제 상태 비교가 실패했고, 출력이 남지 않아 수치에 넣지 않았다.
- `PROMOTION_SETTLE_MS` = 60회의 최댓값 3714.6ms × 1.5 → 5572ms.

### 실제 상태 비교

전후 스냅샷: `.scratch/claude-turn-end/state/before.json`, `after.json`, 비교: `logs/real-state-compare.json`.

- `~/.claude/projects/`: PoC가 만든 디렉터리 49개가 늘었다(아래). 그 밖에 새 디렉터리 3개(`-Users-sinhyeok-orca-workspaces-doan-design-css-bc`, `-css-bg`, `-space-cursor-over-frame`)와 기록이 바뀐 디렉터리 6개(`-Users-sinhyeok-code-doan-design`, Orca 작업 공간 `canvas-svg-sprites-orch`, `claude-turn-end-orch`, `css-bp`, `cte-a`, `cte-b`)가 있다. 같은 시간에 돌던 다른 Claude 세션(이 워커 포함)의 것이고, PoC 세션 id는 그 안에 없다. 그래서 "자기 디렉터리 말고는 목록과 수정 시각이 같다"는 글자 그대로는 맞지 않는다.
- `~/.claude/sessions/`: 전후 모두 비어 있다.
- `~/.claude.json`: 수정 시각이 바뀌었다(13:51:38Z → 15:05:19Z). PoC CLI 한 번을 따로 돌려 전후를 비교하니, CLI는 시작할 때 최상위 키 `cachedGrowthBookFeatures`, `cachedGrowthBookFeaturesAt`, `cachedUsageUtilization`, `migrationVersion`을 다시 쓴다. `projects`에 더해진 항목은 없다. 설치된 CLI의 로그인을 쓰는 한 피할 수 없는 쓰기다.
- 남긴 디렉터리: 모두 `~/.claude/projects/-private-var-folders-xd-rjwhs0w16mj23787mhbbdv500000gn-T-` 뒤에 다음 이름이 붙는다. 세션의 임시 cwd(`$TMPDIR/cte-poc-*`)도 남아 있다.
  - a: `cte-poc-a-close-2-1-284-lPgDEr`, `cte-poc-a-close-current-642Xr1`, `cte-poc-a-stop-2-1-284-{6pMyMI,KLOath,RuZ9dJ,VQVhFH}`, `cte-poc-a-stop-current-{CwjUpF,YNzxRO,dRPjFL,eKkrp7}`
  - b: `cte-poc-b-2-1-284-IS8cJG`, `cte-poc-b-current-{V1bSlJ,i4lG3t,w2GroK}`
  - c: `cte-poc-c-folded-2-1-284-N1d5sA`, `cte-poc-c-folded-current-{hnwaCL,iwbitx}`, `cte-poc-c-followup-2-1-284-Tlr0yN`, `cte-poc-c-followup-current-{Nvg5hO,VHAKCc}`, `cte-poc-c-stop-kill-2-1-284-igNnay`, `cte-poc-c-stop-kill-current-{1ASyGa,5Ud6EW,jEM1cQ}`, `cte-poc-c-stop-term-2-1-284-2ots2k`, `cte-poc-c-stop-term-current-{DEEa0J,DUAHVH,MM1swO}`
  - d: `cte-poc-d-agent-2-1-284-1HQ7Wl`, `cte-poc-d-agent-current-{NB0q2q,pLxM9J}`, `cte-poc-d-block-agent-2-1-284-tmbpCt`, `cte-poc-d-block-agent-current-P6943q`, `cte-poc-d-block-shell-2-1-284-rQuVPL`, `cte-poc-d-block-shell-current-tmegs3`, `cte-poc-d-kill-2-1-284-dv8qZU`, `cte-poc-d-kill-current-dhKib8`, `cte-poc-d-shell-2-1-284-UXmVzn`, `cte-poc-d-shell-current-{Ye3Hpn,iqalS9}`, `cte-poc-d-term-2-1-284-UEUtey`, `cte-poc-d-term-current-{7uSP7m,uQxW4R}`
  - 준비 실행: `cte-poc-proxy-1DepqX`, `cte-poc-smoke-{ENhPSo,EiOJo7,OVGQYN,gqp701,zKWLFt}`

### fixture

`.scratch/claude-turn-end/fixtures/`에 두었다(`extract-fixtures.mjs`). 3번이 `app/src/main/conversation/fixtures/`로 옮겨 커밋한다.

- `transcript-<2.1.284|2.1.322>-<folded|followup|stop-term|stop-kill>.jsonl`: c 세션의 기록 줄. `queue-operation`, `user`, `attachment`(`queued_command`), `assistant`, `last-prompt`만 남기고, 경로·계정 id·환경 필드와 사용자 커넥터를 언급한 문단을 지웠다. 정지 경우에는 뒤이은 resume 턴도 들어 있다. 옆의 `.meta.json`이 프롬프트와 steer uuid를 적는다.
- `frames-<버전>-<next-turn-after-stop|next-turn-after-close|background-shell-done|background-agent-done>.jsonl`: a의 2턴과 d의 원시 프레임(받은 시각 포함). init 목록과 경로를 지웠다.

### 설계에 걸리는 관찰

재설계는 하지 않았다. 다음 단계에서 판단할 것만 적는다.

- 백그라운드 프로세스는 CLI 그룹 밖에 있다. SIGTERM을 받은 CLI는 14–36ms 안에 작업을 멈췄지만, 그 전에 SIGKILL이 닿으면 작업은 고아로 남는다. 2절 `"term"`, 5절의 조용한 정지와 줄의 Stop이 이 순서에 기댄다.
- 입력을 닫은 셸 작업을 2.1.284는 약 5초 뒤 스스로 멈추고, 2.1.322는 끝까지 돌린 뒤 모델을 부른다. 서브에이전트는 두 버전 모두 끝까지 돌고 모델을 부른다.
- 2.1.284의 프롬프트 uuid echo는 `stream_event` `message_start`에서 처음 나온다. 그래서 meta result와 읽힘 사이가 0.95–1.28초다. 2.1.284의 접힌 steer echo는 그 턴의 result에서야 왔고, 기록에는 그보다 먼저 있었다.
- watcher 지연의 대부분은 `doan ls`이고, 실행마다 최댓값이 2.7–3.7초로 흔들린다.
