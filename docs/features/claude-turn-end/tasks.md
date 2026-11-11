# Claude 턴 종료 판정 결함 고치기 — 작업

각 커밋 경계 앞에서 `npm --prefix app run typecheck`, `npm --prefix app run lint`, `npm --prefix app test`를 돌린다. 백그라운드 작업 줄은 새 UI라서 `/feature-review` 뒤 `/design-draft`로 초안을 그리고 사용자 확인을 받은 다음 `/tdd`로 간다.

1. [ ] **PoC: 실제 Claude CLI 관찰.** design.md 'PoC 의존' 1–4를 확인한다. 스크립트는 `.scratch/claude-turn-end/`에 두고, `app/node_modules`의 SDK로 원시 프레임을 시각과 함께 기록한다(`.scratch/queue-send-now/claude.mjs` 방식). 설치된 CLI의 기존 로그인, 임시 cwd(`mkdtemp`), `settingSources: []`를 쓴다. 현재 설치 버전과 최소 버전 2.1.284에서 각각 돌린다.
   - 주의: 세션 기록이 실제 `~/.claude/projects/` 아래 임시 cwd 이름의 디렉터리에 남는다. PoC는 자기가 만든 세션 id만 읽고 resume한다. 다른 세션의 기록, 설정, 자격 증명은 읽지도 바꾸지도 않는다. 끝나면 남긴 디렉터리 이름을 'PoC 결과'에 적는다.
   - a. 백그라운드 작업이 남은 세션의 다음 턴: 1턴에서 `run_in_background`로 Bash(`sleep 60`)를 시작하고 끝낸다. 프로세스를 Doan처럼 입력 닫기로 끝낸 경우와 그룹 정지로 끝낸 경우 각각, 같은 세션에 uuid를 단 2턴을 보낸다. 첫 result의 시각, `user_message_uuids`, `task_*`·`background_tasks_changed` 프레임, 프롬프트 uuid가 처음 나오는 프레임을 기록한다.
   - b. 정리 신호: done 턴의 result 뒤 usage 읽기가 끝나고 입력을 닫은 프로세스에 SIGTERM, SIGINT, SIGKILL을 각각 보내 그룹이 사라지기까지의 시간을 잰다(각 10회). SIGKILL 뒤 세션 JSONL 마지막 줄의 무결성과 다음 resume 성공을 확인한다.
   - c. steer 기록: 접힘(도구 실행 중)과 후속 턴(result 직후) 두 경우에 uuid를 단 steer를 보내고, 세션 JSONL에서 그 uuid가 어떤 필드로, 받을 때와 읽을 때 중 언제 쓰이는지 확인한다. 읽히기 전에 그룹을 멈춘 경우도 본다.
   - d. 백그라운드 작업이 살아 있는 done 턴: `run_in_background`로 `sleep 20`을 시작하고 끝나는 턴에서, done result 전후의 `background_tasks_changed`·`task_*` 프레임, 입력을 닫은 뒤 CLI가 사는 시간, 작업 종료 뒤 CLI가 스스로 모델을 부르는지(assistant·result 프레임)를 기록한다. 작업 도중 SIGTERM으로 그룹을 멈춰 `sleep`까지 사라지는지도 본다.
   - e. watcher 지연: 격리한 실제 앱(AGENTS.md 'Commands'의 dev 실행, 임시 userData·HOME·SHELL·`CLAUDE_CONFIG_DIR`, 에이전트는 띄우지 않음)에서 등록된 프로젝트의 `.doan/canvases/`에 파일을 쓰고 `refreshed()`가 불릴 때까지의 시간을 20회 잰다.
   - 결과를 아래 'PoC 결과'에 적는다(버전, 조건, 중앙값과 범위). 다음 중 하나면 여기서 멈추고 사용자에게 돌아온다: 결함 2의 가설이 틀림, 2.1.284가 첫 프롬프트 uuid를 echo하지 않음, 클라이언트 uuid가 기록에 없음, SIGKILL 뒤 기록이 깨지거나 resume이 실패함, 백그라운드 작업을 스트림으로 알 수 없음.
   - 확인: `node .scratch/claude-turn-end/<scenario>.mjs`가 로그를 남기고, 'PoC 결과'의 각 수치가 로그와 맞는다. 실행 전후 `~/.claude/projects/`의 다른 디렉터리 목록과 수정 시각이 같다.
   - 커밋 경계: 문서만(이 파일의 'PoC 결과', 필요하면 design.md의 수치와 감지 방식).
2. [ ] **초안 (`/design-draft`).** 백그라운드 작업 줄(문구, Stop, 라이트·다크, Overview와 캔버스 패널)을 `.doan/canvases/`에 그린다.
   - 확인: `doan check`·`doan ls`가 통과하고, 사용자가 앱에서 초안을 확인했다.
3. [ ] **테스트 먼저 (`/tdd`).** red를 확인한다.
   - 순수 함수: `promotionDeadline`, `promptTransport`와 `normalizeClaude`의 프롬프트 읽힘 규칙, `readInTranscript`, `backgroundTasks`, `backgroundLine`(design.md '순수 함수').
   - 서비스: 프로젝트 턴이 `turn.done`이고 그룹이 사라진 뒤 `PROMOTION_SETTLE_MS`에 판정되고, `turn.done` 순간에 보낸 send가 그때 시작된다. 폴더 다시 읽기가 먼저 오면 그때 판정한다. 그룹이 남으면 10초 상한. ACP 러너에서도 같다. 판정을 기다리는 send가 제안 대기 프로세스를 끝낸다(POSTMORTEM 2026-10-28: 이전 프로세스의 종료 콜백 전에 보낸다).
   - 서비스(백그라운드): done 턴 뒤 집합이 비어 있지 않으면 목록에 표시가 붙고, 다음 send가 그룹을 SIGTERM 경로로 끝낸 뒤 시작하며 busy로 거부되지 않는다. Stop IPC가 그룹을 끝내고 턴 이벤트를 쓰지 않는다. 그룹이 사라지면, archive·삭제·로그아웃·종료 때 표시가 사라진다. PoC가 CLI의 자발적 모델 호출을 보였으면, 집합이 비는 순간 그룹이 멈추는 것을 고정한다.
   - runner(가짜 CLI): meta 턴 result가 먼저 오고 그 뒤 프롬프트를 읽는 CLI에서 턴이 프롬프트의 result에서 끝나고 meta 턴의 프레임이 그 턴에 나간다. 프롬프트가 상한까지 읽히지 않으면 `turn.failed`(`unknown`)로 끝나고 그룹이 멈춘다. 제안만 남은 프로세스가 즉시 SIGKILL로 끝나고, 예약은 그룹 소멸 관찰 뒤에만 풀린다. 상한 만료·failed·aborted·Stop 각각에서 steer uuid가 기록에 있으면 종료 이벤트 전에 `steerConsumed`가 보고되고, 없으면 큐로 돌아간다. 모든 runner promise를 정리한다(POSTMORTEM 2026-11-11).
   - renderer: 백그라운드 줄이 done 턴 아래에 나타나고, 다음 턴이 시작되면 사라지며, Stop이 IPC를 부른다. 결함 3에서 남는 Send now 메시지의 `sending` 항목이 정리된다(POSTMORTEM 2026-11-05).
   - 확인: 새 테스트가 red, 기존 `runners.test.ts`·`service.test.ts`·`project.test.ts`·`process.test.ts`는 녹색.
   - 커밋 경계.
4. [ ] **순수 함수 구현.** `project.ts`·`transport.ts`·기록 파싱·백그라운드 집합과 줄.
   - 확인: `npm --prefix app test`에서 3번의 순수 함수 테스트 녹색.
   - 커밋 경계.
5. [ ] **프로세스 정리와 runner.** `OwnedGroup` 즉시 정리 경로, Claude runner의 프롬프트 uuid, 만료·종료 경로의 기록 찾기, done 뒤 백그라운드 집합 읽기.
   - 확인: `npm --prefix app test`에서 runner·process 테스트 녹색.
   - 커밋 경계.
6. [ ] **서비스와 IPC.** 판정 타이머 재설정, 판정 대기 send의 정리, 백그라운드 표시 보관·목록 노출·Stop IPC.
   - 확인: `npm --prefix app test` 녹색, `node .agents/skills/verify/scripts/verify.mjs` PASS.
   - 커밋 경계.
7. [ ] **스레드 UI.** 백그라운드 줄과 Stop을 Overview와 캔버스 패널에 그린다. 첫 구현이므로 `/design-sync`로 2번 초안과 맞춘다.
   - 확인: `npm --prefix app test` 녹색, `/design-sync` 측정 통과.
   - 커밋 경계.
8. [ ] **실제 앱 확인 (`/runtime-test`).** 패키지 앱(`npm --prefix app run package`)을 격리 조건(임시 userData·HOME·SHELL·`CLAUDE_CONFIG_DIR`)으로 띄우고, 사용자가 그 앱에서 Doan Claude 연결에 한 번 로그인한 뒤(사용자 참여 필요), 각 결함을 `turn.done` 순간에 보내는 짧은 probe로 확인한다.
   - 프로젝트 대화: 파일 변경 없는 턴과 새 캔버스를 만든 턴 각각, send에서 다음 턴 시작까지 시간. 새 캔버스 턴은 승격된다.
   - 캔버스 대화: send에서 다음 턴 시작까지 시간, 그 뒤 resume 정상.
   - 백그라운드 작업 세션: 2턴이 프롬프트의 답에서 끝나고 그 답이 보인다.
   - 백그라운드 작업 줄: `sleep`을 백그라운드로 남긴 done 턴에 줄이 보이고, 다음 send와 줄의 Stop 각각으로 `sleep`까지 사라지며 줄이 없어진다.
   - 결함 3은 실제 CLI로 늦은 읽힘을 만들 수 없으므로 가짜 CLI 테스트로만 확인했다고 남긴다. ACP의 판정 시점은 측정하지 않았다고 남긴다.
   - 확인: probe 로그의 수치가 spec.md 완료 조건 1–5를 만족하고, 실제 사용자 상태 비교를 통과한다.
9. [ ] **승격과 삭제.** PRODUCT §5 item 1 'Project conversations'(판정 시점: 그룹 소멸 뒤 정착 시간, 10초 상한, Claude·ACP), 'Send now'(기록에 있는 steer는 그 턴에 남음), 대화 스레드의 백그라운드 작업 줄(문구, Stop, 사라지는 때, 재시작 뒤 없음)을 현재 규칙으로 고친다. ARCHITECTURE §7의 Steering Claude 항목(프롬프트 uuid, 기록 찾기), 'Project conversations and promotion'(`PROMOTION_SETTLE_MS`), 'Next-message suggestions'와 그룹 정리 규칙(제안만 남은 프로세스의 즉시 SIGKILL, 백그라운드 작업 프로세스의 SIGTERM 경로), 백그라운드 집합 감지와 메모리 전용 목록 필드를 고친다. DESIGN.md에 백그라운드 줄의 측정값을 적는다(`/design-sync`). BACKLOG 'Known defects'의 세 항목을 지운다. `docs/features/claude-turn-end/`를 삭제한다.
   - 확인: 문서 diff 검토, `node .agents/skills/verify/scripts/verify.mjs` PASS.
   - 커밋 경계: 문서별 커밋.

## PoC 결과

(1번에서 채운다.)
