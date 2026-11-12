# Claude 턴 종료 판정 결함 고치기

`docs/BACKLOG.md` 'Known defects'의 Claude 턴 종료 결함 세 건을 고친다. 세 건 모두 Doan이 Claude 턴이 끝났다고 판단하는 시점, 또는 끝난 턴의 프로세스를 정리하는 방식에서 생긴다. 결함 2와 맞닿은 백그라운드 작업 처리도 이번에 정한다(사용자 결정).

## 사용자

- **사람**: 프로젝트 대화와 캔버스 대화에서 Claude Code와 이야기하는 사람. 턴이 끝나자마자 보낸 메시지가 바로 시작되고, 보낸 메시지가 두 번 가거나 답이 안 보이는 채로 실행되지 않는다. 에이전트가 턴에서 시작한 백그라운드 작업(빌드, 개발 서버)이 턴 뒤에도 돌고 있으면, 스레드에서 그 사실과 다음 메시지나 Stop으로 끝난다는 것을 본다.
- **에이전트**: 바뀌는 것이 없다. CLI, 가이드, `doan check`, 스킬 stub은 그대로다.

## 문제 (관찰된 사실)

BACKLOG 원문을 그대로 옮긴다.

1. **턴 종료 직후 보낸 메시지의 대기**
   > A send fired at a Claude turn's `turn.done` waits before its turn starts, without being refused. In a project conversation it waits for the ended turn's promotion judgement (`BIND_GRACE_MS` 10 s, `project.ts`), although the CLI and its process group are already gone. In a canvas conversation it waits 0.53-0.55 s: the CLI, its input closed, does not end on the SIGTERM Doan sends when the next send arrives and goes only with the SIGKILL 0.5 s later (`process.ts`). Measured on 2026-11-09 with a packaged build and Claude Code 2.1.319, on a profile without hooks or local MCP servers; no fix was chosen.

2. **백그라운드 작업이 남은 세션의 조기 `turn.done`**
   > A Claude send to a session whose previous turn left a background task (`run_in_background`) recorded `turn.done` 56 ms later while the Claude process went on running Bash; the next send stopped that process and continued normally (seen once on 2026-11-09, Claude Code 2.1.319). The turn-end judgement is suspected; not investigated.

3. **읽힘 보고가 늦은 Send now 메시지의 중복 전송**
   > A Claude steered message whose read arrives after `STEER_READ_WAIT_MS`, or a CLI that changes how it reports reads (only the uuid echo counts), ends the turn as done and returns the message to the queue, so it goes out again in the next turn even if the agent already acted on it. Never observed; the bound was checked only with a fake CLI, not with a real Claude CLI.

코드에서 확인한 원인 후보(읽기만 했다):

- 1(프로젝트): `ConversationService.ended()`가 판정을 `refreshed()`(폴더 다시 읽기)나 `BIND_GRACE_MS` 타이머에만 건다. 턴이 끝난 뒤 파일 변경이 없으면 다시 읽기가 오지 않아 10초를 채운다. 보낸 메시지는 `submit()`의 `judgement()`에서 이 판정을 기다린다. handoff 판정(`judgeHandoff(id, true)`, `handoffWait`)도 같은 10초 타이머를 쓴다.
- 1(캔버스): 다음 send의 `previousExit()`가 `endSuggestion()`을 부르고, 이것이 `OwnedGroup.stop()`으로 SIGTERM을 보낸다. SIGKILL은 500ms 뒤 고정이고, 그룹이 사라졌는지는 100ms 간격으로 확인한다.
- 2: `normalizeClaude`는 보낸 프롬프트와 상관없이 첫 success `result`를 턴의 끝으로 본다. 턴 프롬프트는 uuid 없이 보낸다(`runners.ts` `send`). SDK 0.3.312 타입 설명에 따르면 synthetic(meta) 프롬프트로 시작한 턴의 프레임은 클라이언트 uuid를 싣지 않는다. 56ms는 모델 왕복보다 짧아, CLI가 이전 백그라운드 작업 때문에 스스로 연 턴의 `result`를 Doan이 이 턴의 끝으로 읽었다는 가설이 가장 유력하다. 실제 CLI로 확인한 적은 없다.
- 3: `STEER_READ_WAIT_MS`(30초)가 지나면 `endSteerWait`가 `turn.done`을 내고, 서비스가 읽지 않은 steer를 큐에 되돌린다(`dropSteers`). CLI가 이미 그 메시지를 받아 세션 기록에 썼다면, 다음 resume에서 에이전트가 그 메시지를 다시 보게 된다.
- 백그라운드 작업: done 턴 뒤 Doan은 입력을 닫고, 프로세스가 스스로 끝나기를 기다린다. 백그라운드 작업이 살아 있는 동안 CLI가 끝나는지, 작업이 끝나면 CLI가 스스로 턴을 여는지는 확인한 적이 없다. 지금 스레드는 턴이 끝나면 아무것도 돌지 않는 것처럼 보인다. 그 프로세스가 `EXIT_WAIT_MS`(10초)보다 오래 살면 다음 send가 busy로 거부된다(POSTMORTEM 2026-10-28과 같은 모양).

## 완료 조건

1. 프로젝트 대화: 턴마다 프로세스 그룹이 끝나는 제공자(Claude, ACP)의 턴이 끝나고(done, failed, interrupted) 그룹이 사라지면, `PROMOTION_SETTLE_MS` 안에 승격 판정과 handoff 판정이 끝나고, 그 순간 보낸 메시지가 시작된다. 그룹이 남아 있으면 10초 상한은 그대로다. 승격 결과 규칙과 두 턴이 겹칠 때의 규칙은 그대로다. 턴 중이나 뒤에 생긴 캔버스를 여는 창("within 10 seconds after")은 판정에서 닫힌다. Claude로 측정하고, ACP는 단위 테스트로만 확인한다.
2. 캔버스 대화: Claude 턴의 `turn.done`에서 보낸 메시지가, 남은 일이 제안 생성뿐이고 백그라운드 작업이 없는 이전 프로세스를 즉시 SIGKILL로 끝내고 시작된다. send에서 다음 턴 시작까지의 중앙값이 PoC 1b에서 잰 "SIGKILL 뒤 그룹이 사라지기까지" 시간 + 100ms 이하다. 그 뒤 resume이 정상이고 세션 기록이 깨지지 않는다.
   - PoC가 SIGKILL 뒤 기록 무결성이나 resume을 확인하지 못하면 이 조건은 빠지고, BACKLOG 항목의 캔버스 부분은 남는다.
3. 백그라운드 작업을 남긴 세션에 보낸 메시지의 턴은, CLI가 그 메시지를 읽고 그에 대한 `result`를 낼 때까지 끝나지 않는다. 프롬프트를 읽기 전에 CLI가 연 meta 턴의 답과 도구 실행도 그 턴에 보인다. 상한까지 프롬프트가 읽히지 않으면 턴은 실패로 끝나고 "Claude Code didn’t pick up your message. Send it again."을 보인다. 그 메시지는 스레드에 남고 큐로 돌아가지 않는다.
   - PoC가 가설을 반박하면 이 조건은 빠지고 BACKLOG 항목은 남는다. 최소 버전 2.1.284가 첫 프롬프트 uuid를 echo하지 않으면, 최소 버전을 올리는 것은 사용자 승인이 필요하다.
4. 읽히지 않은 Send now 메시지를 남기고 끝난 Claude 턴(상한 만료, failed, aborted, Stop, 로그아웃, archive, 앱 종료)은, 그룹이 사라진 뒤 세션 기록에서 그 uuid를 찾는다. 있으면 메시지가 큐로 돌아가지 않고 그 턴의 사람 메시지로 남는다. archive와 앱 종료에서는 큐로 돌아가지 않기만 하고, 스레드에는 그 메시지가 없을 수 있다(사용자 결정). 없거나 기록을 읽을 수 없을 때만 지금처럼 큐로 돌아간다. Stop하면 턴 표시줄은 그 순간 사라진다.
5. Claude 턴이 done으로 끝날 때 에이전트가 시작한 백그라운드 작업이 아직 돌고 있으면, 턴은 done으로 끝나고 스레드에 그 작업이 아직 돌고 있으며 다음 메시지나 Stop으로 끝난다는 줄이 보인다. 줄 안에 작은 Stop 버튼이 있다.
   - 다음 send(턴 끝에 나가는 큐 포함)는 그 프로세스 그룹을 끝낸다. 줄은 사람의 메시지가 스레드에 들어가는 렌더(턴 표시줄이 나타나는 순간)에 사라진다.
   - send 없이 작업이 스스로 끝나거나 줄의 Stop으로 끝나면, 그룹이 사라질 때 줄이 사라진다.
   - 백그라운드만 남은 대화는 다른 곳에서 "실행 중"이 아니다. 슬롯, 사이드바 스피너, Home strip, 에이전트 표시는 그대로다. 로그아웃, Restart to Update, 프로젝트 Remove, archive, 삭제, 앱 종료는 묻지 않고 그 그룹을 조용히 멈춘다.
   - 사람의 메시지 없이는 모델 요청이 나가지 않는다(PRODUCT §3 Out of scope 4). 작업이 끝난 뒤 CLI가 스스로 모델을 부르면, 작업 집합이 비는 순간 Doan이 그룹을 멈춘다.
   - PoC가 백그라운드 작업을 스트림으로 알 수 없음을 보이거나, 집합이 비는 순간과 첫 모델 요청 사이가 너무 짧아 막을 수 없으면 사용자에게 돌아온다.
6. 각 수정은 단위 테스트(가짜 CLI와 실제 CLI에서 받은 JSONL fixture 포함)로 고정되고, 결함 1·2와 백그라운드 작업 줄은 실제 Claude CLI를 쓴 짧은 probe로 확인된다.
7. 결론이 PRODUCT·ARCHITECTURE에 현재 규칙으로 들어가고, BACKLOG의 세 항목이 지워진다. 실제 CLI로 확인하지 못한 것(결함 3의 늦은 읽힘, ACP 판정 시점)은 BACKLOG 'Not verified'에 남는다.

## 하지 않는 것

- Codex·Cursor·Antigravity·Copilot의 턴 종료 판정과 백그라운드 작업 처리. 단, 완료 조건 1의 판정 시점 규칙은 그룹이 턴마다 끝나는 ACP 제공자에도 적용한다(측정은 하지 않는다). Codex는 10초 그대로다.
- 백그라운드 작업의 출력, 진행률, 개별 종료 UI. 스레드 줄은 "돌고 있다"와 "언제 끝나는지"만 알린다.
- `STEER_READ_WAIT_MS` 값 변경, Send now UI 변경.
- Codex steer 중복(PRODUCT §5 'Send now' Limits의 Codex 항목).
- 다음 메시지 제안 기능 자체의 변경.
- 버전별 동작 분기. 최소 버전에서 필요한 보고가 없으면 최소 버전을 올릴지 사용자에게 묻는다.
