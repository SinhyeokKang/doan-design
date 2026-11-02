# canvas-open-offer — design

## 영향 범위

| 구성 요소 | 변화 |
|---|---|
| CLI (Go) | 새 명령 `doan open <canvas path> [--frame <id>] [--json]`(`cli/internal/cli/open.go`). 루트는 다른 저장소 명령처럼 `--repo` 또는 위로 찾은 `.doan/config.json`의 디렉터리이고, 경로는 `work_rules.go`의 캔버스 경로 규칙을 재사용한다. 앱 소켓으로 요청을 보내고 앱의 결과를 돌려준다 |
| 앱 소켓 | 새 버전 `app-socket.v4`(open). v1(active)·v2(onboarding)·v3(work)는 그대로다. main은 `v: 4`를 받으면 schema → token → 처리 순서로 다룬다(v2·v3와 같은 dispatch) |
| App main | v4 open 요청을 deep link와 같은 경로로 처리한다. `resolveOpenLink`가 쓰는 판정(등록 루트 글자 비교, 목록에 있는 캔버스)을 공유하고, 결과를 `deep-link:open`과 같은 renderer 경로로 보낸다. 링크와 달리 응답으로 결과(`opened` 또는 거절 이유)를 돌려준다 |
| 가이드 (`skill.md`, `skill_test.go`) | 규칙 J와 Commands의 `doan work done`·새 `doan open` 설명 |
| 에이전트 설정 | Claude Code 허용 규칙에 `Bash(doan open *)`을 더한다(`CLAUDE_ALLOW_RULES`, `app/src/main/agentSetup/plan.ts`). 기존 merge가 빠진 규칙만 더하므로 이미 설정된 사람은 다음 실행 때 채워진다. Codex 규칙은 모든 `doan` 명령을 이미 허용하므로 그대로다 |
| 앱 턴 프롬프트 | `app/src/main/conversation/prompt.ts`에 한 줄을 더한다. 이 대화는 Doan 안이므로 캔버스를 열어 줄지 묻지 않는다는 내용이다 |
| eval | 다음을 바꾼다.<br>- W3 rubric<br>- 새 시나리오(사람이 열어 달라고 할 때)<br>- 가짜 소켓(`eval/lib/socket.ts`)의 v4 지원<br>- R8: 턴 프롬프트가 바뀌므로 ARCHITECTURE §14의 시나리오 버전 규칙을 따른다<br>- 실제 실행 workspace의 Claude 허용 규칙(`eval/lib/workspace.ts`) |

## 동작

- **가이드 규칙 J(새 문구 방향)**: 답을 끝내기 전에 지금처럼 `doan work done <edited canvas paths> --json`을 실행한다. 링크는 최종 답에 넣지 않는다. 고친 캔버스가 있으면 답 끝에서 캔버스 이름(파일 이름)으로 Doan에서 열어 줄지 한 줄로 묻고, 가리킬 프레임이 있으면 그 이름도 적는다. 사람이 원하면 `doan open <path> [--frame <id>] --json`을 실행하고 결과를 한 줄로 알린다. 묻지 않았는데 실행하지 않는다. 사람이 링크를 달라고 하면 `doan work done`이 돌려준 `links`를 준다.
- **`doan open` 응답**: 성공하면 `{opened: true}`를 돌려준다. 앱이 거절하면 이유 코드(`not_registered`, `not_listed`, `busy`)와 앱이 토스트로 보이는 것과 같은 문장을 돌려준다. 잠긴 페이지나 취소를 거부하는 다이얼로그 때문에 링크를 버리는 경우가 `busy`다. 지금 링크는 이 경우를 조용히 버리지만, 명령은 응답이 있으므로 이유를 돌려준다(BACKLOG 'A `doan://` link that arrives while a page is locked').
- **앱이 꺼져 있을 때**: `onboarding start`의 bootstrap을 재사용한다(2026-11-03 user).
  - 첫 시도에서 앱이 없고 `DOAN_RUNTIME`이 설정되지 않았으면, 앱 안에 든 CLI가 자기 `.app`을 한 번 열고 정해진 시간만큼 기다린 뒤 요청을 보낸다. 실패하면 `app_launch_failed`다.
  - 앱 밖의 CLI이거나 `DOAN_RUNTIME`이 설정된 경우(빈 값 포함)에는 앱을 열지 않고 `app_not_running`이다.
  - runtime이나 소켓에 권한이 거부되면 앱을 열지 않는다. ARCHITECTURE §4 'Bootstrap'의 신뢰 조건을 그대로 따른다.
- **앱 대화**: `DOAN_APP_CONVERSATION`이 있는 Doan 안의 대화에서는 턴 프롬프트가 제안을 막는다(2026-11-03 user). 사람이 이미 Doan에 있고, 앱 안의 이동은 `agent-reply-chips`의 칩이 맡기 때문이다. 사람이 앱 대화에서 직접 열어 달라고 하면 `doan open`은 그대로 동작한다.
- **`links`**: `doan work done`의 응답은 바꾸지 않는다(2026-11-03 user). 가이드에는 사람이 링크를 달라고 할 때만 `links`를 주라고 적는다.

## 순수 함수로 뺄 부분 (/tdd 대상)

1. Go `openRequest(root, path, frame)`: 인자 검사(캔버스 경로 규칙, frame 비어 있음·제어 문자·길이)와 v4 요청 생성.
2. Go `openReply(line)`: v4 응답 검증과 CLI 결과·exit code 변환(`opened`, 거절 이유 → exit 3 계열 코드, 버전 불일치 → `app_protocol_mismatch`).
3. TS `openRequestResult(request, registeredRoots, listings, pageState)`: deep link의 `resolveOpenLink`와 같은 판정에 잠금·다이얼로그 상태를 더해 `opened` 또는 거절 이유를 정한다. 링크와 판정 코드를 공유한다.
4. 공유 fixture `schema/fixtures/app-socket-v4/`: 요청·응답의 정상과 거절 예. Go와 TS가 같은 파일을 읽는다.

## 포맷 변경

- 새 schema `schema/app-socket.v4.schema.json`과 fixture `schema/fixtures/app-socket-v4/`. 기존 v1–v3의 `v`는 바뀌지 않는다. v1 전용 reader가 `app-socket/`을 glob하므로 fixture는 별도 디렉터리에 둔다(ARCHITECTURE §11 'Onboarding and work sockets').
- CLI 응답: `doan open`의 결과 형식이 CLI envelope에 새로 생긴다. `doan work done`의 `{delivered, links, skipped}`는 바뀌지 않는다.

## 컨벤션 영향

ARCHITECTURE §1 'Conventions'의 캔버스 규칙과 `doan check`는 바뀌지 않는다. 가이드 규칙 J(에이전트 규칙)가 바뀐다.

## 결정 영향

- **링크의 보안 경계를 그대로 지킨다.** `doan open`은 등록된 루트의 목록에 있는 캔버스로 이동만 한다(ARCHITECTURE §7 'Deep links' 'Security boundary'). 소켓은 같은 사용자의 토큰이 필요하므로 웹 페이지보다 좁은 입구다.
- **앱을 여는 명령**: 지금은 `onboarding start`만 앱을 연다(PRODUCT §5 item 10). `doan open`도 같은 bootstrap으로 앱을 열게 되므로 이 규칙이 바뀐다(2026-11-03 user). 에이전트는 사람이 열어 달라고 했을 때만 이 명령을 실행하므로, 에이전트가 마음대로 앱을 띄우는 길은 생기지 않는다.
- **사용자 설정 파일**: Doan이 `~/.claude/settings.json`에 더하는 규칙이 둘에서 셋이 된다(PRODUCT §5 item 0의 1). 다른 바이트를 건드리지 않고 빠진 규칙만 더한다는 규칙은 그대로다.
- **에이전트가 앱을 움직이는 일**: PRODUCT §3 Out of scope 4는 에이전트를 깨우는 일만 막는다. `doan open`은 사람이 요청했을 때만 실행하고 에이전트를 깨우지 않으므로 이 항목에 걸리지 않는다.
- git 작업, 서비스 범위, sandbox iframe, append-only events, 토큰 처리에는 영향이 없다.

## PoC 의존

없다. 소켓 버전 추가(v2·v3), deep link 처리, 앱 실행(onboarding bootstrap)이 모두 출하된 경로다.

## POSTMORTEM 인용

- **2026-10-29 'Codex cut the middle out of the doan guide and kept its end marker'**: 규칙 J와 `doan open` 설명을 더할 때 가이드 출력 예산 테스트(`skillOutputBudget`)를 지킨다. 줄이는 쪽이 낫다.
- **2026-11-02 'Evaluation unit checks inherited the real session-recording runtime'**: `doan open`을 부르는 eval fixture는 모두 절대 경로의 임시 `DOAN_RUNTIME`을 쓴다. 실제 Doan이 움직이면 안 된다.
- **2026-10-24 'Agent shells bypassed the evaluation runner's packaged CLI'**: 새 시나리오도 에이전트 셸이 패키지 CLI를 쓰는지 증거를 남긴다.
- **2026-10-25 'A new link state silently removed replacement-guard coverage'**: 거절 이유를 더할 때 기존 deep link 거절 fixture가 그대로 지켜지는지 확인한다.

## 결정 (2026-11-03 user)

1. 앱이 꺼져 있으면 `doan open`이 onboarding bootstrap으로 앱을 연다.
2. Claude Code 허용 규칙에 `Bash(doan open *)`을 더한다.
3. 앱 대화에서는 턴 프롬프트로 제안을 막는다.
4. `doan work done`의 `links`를 남긴다.
