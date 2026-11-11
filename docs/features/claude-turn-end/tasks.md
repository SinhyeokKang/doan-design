# Claude 턴 종료 판정 결함 고치기 — 작업

각 커밋 경계 앞에서 `npm --prefix app run typecheck`, `npm --prefix app run lint`, `npm --prefix app test`를 돌린다. 백그라운드 작업 줄은 새 UI라서 `/design-draft`로 초안을 그리고 사용자 확인을 받은 다음 `/tdd`로 간다.

1. [ ] **PoC: 실제 Claude CLI 관찰.** design.md 'PoC 의존' 1–4를 확인한다. 스크립트는 `.scratch/claude-turn-end/`의 명령이고 커밋하지 않는다. `app/node_modules`의 SDK로 원시 프레임을 시각과 함께 기록한다(`.scratch/queue-send-now/claude.mjs` 방식). 설치된 CLI의 기존 로그인, 임시 cwd(`mkdtemp`), `settingSources: []`를 쓴다.
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
2. [ ] **초안 (`/design-draft`).** 백그라운드 작업 줄(문구, Stop의 평소·누름·실패 상태, 실패 토스트, 라이트·다크, Overview와 캔버스 패널)과 결함 2의 실패 문구를 `.doan/canvases/`에 그린다.
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
8. [ ] **실제 앱 확인 (`/runtime-test`).** 패키지 앱(`npm --prefix app run package`)을 격리 조건(임시 userData·HOME·SHELL·`CLAUDE_CONFIG_DIR`)으로 띄우고, 사용자가 그 앱에서 Doan Claude 연결에 한 번 로그인한 뒤(사용자 참여 필요), 각 결함을 `turn.done` 순간에 보내는 짧은 probe로 확인한다.
   - 프로젝트 대화: 파일 변경 없는 턴과 새 캔버스를 만든 턴 각각, send에서 다음 턴 시작까지 시간. 새 캔버스 턴은 승격된다.
   - 캔버스 대화: send에서 다음 턴 시작까지의 중앙값이 PoC 1b의 "SIGKILL 뒤 그룹이 사라지기까지" + 100ms 이하. 그 뒤 resume 정상. 앱의 `settingSources`와 MCP 아래에서도 SIGTERM을 무시하는 원인이 PoC와 같은지 본다.
   - 백그라운드 작업 세션: 2턴이 프롬프트의 답에서 끝나고 그 답이 보인다. meta 턴의 답이 사람의 답보다 먼저 보여 헷갈리는지 관찰해 적는다.
   - 일반 턴의 프롬프트 uuid를 기록 찾기가 찾는다.
   - 백그라운드 작업 줄: `sleep`을 백그라운드로 남긴 done 턴에 줄이 보이고, 다음 send와 줄의 Stop 각각으로 `sleep`까지 사라지며 줄이 없어진다. 앱 종료와 archive 뒤에도 `sleep`이 남지 않는다(`pgrep`).
   - 결함 3의 늦은 읽힘은 실제 CLI로 만들 수 없으므로 가짜 CLI 테스트로만 확인했다고 남긴다. ACP의 판정 시점은 측정하지 않았다고 남긴다.
   - 실제 상태 비교 위치: `~/Library/Application Support/doan/`, `~/.claude/`, `~/.local/bin/doan`.
   - 확인: probe 로그의 수치가 spec.md 완료 조건 1–5를 만족하고, 실제 상태 비교를 통과한다.
9. [ ] **승격과 삭제.**
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

(1번에서 채운다.)
