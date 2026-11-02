# canvas-open-offer — spec

출처: 2026-11-03 대화. Orca 터미널에서 `doan work done`이 돌려준 `doan://` 링크를 눌러도 아무 일이 없었다. 사용자 제안: 에이전트가 링크를 출력하지 말고 "Doan에서 열어줄까?"를 묻고, 사람이 원하면 명령으로 연다.

## 사용자

- **사람**: 터미널이나 에이전트 앱에서 에이전트가 캔버스를 고친 뒤 "Doan에서 열어줄까?"라는 제안을 본다. "열어줘"라고 답하면 Doan이 그 캔버스(와 프레임)를 연다. 링크를 클릭할 수 있는 화면인지 신경 쓰지 않아도 된다.
- **에이전트**: 가이드 규칙 J를 따라 최종 답 끝에 고친 캔버스를 열어 줄지 묻는다. 사람이 원하면 새 명령 `doan open <canvas path> [--frame <id>] --json`을 실행한다.

## 문제 (관찰된 사실)

1. 가이드 규칙 J는 `doan work done`이 돌려준 `doan://open?…` 링크를 최종 답에 넣으라고 한다(PRODUCT §5 item 3 'Deep links', `cli/internal/cli/skill.md`).
2. 에이전트를 돌리는 화면 셋이 모두 `doan://` 클릭을 막는다. 2026-11-03에 각 설치본의 코드를 직접 확인했다.
   - **Orca 1.4.243 터미널**: OSC 8 링크에 http가 아닌 scheme도 허용하지만, 클릭 처리 함수는 `http:`, `https:`, `file:`과 파일 경로만 열고 나머지는 무시한다.
   - **Claude 데스크톱 4.4212.0**: 창 밖으로 여는 링크는 http(s), `mailto:`·`tel:`·`sms:`, MS Office scheme과 앱 자체 scheme만 받는다. 그 밖의 scheme은 막는다.
   - **Codex 앱 26.1027(`com.openai.codex`)**: 링크 검사가 `file:`, http(s), `mailto:`·`sms:`·`tel:`, 일부 `vscode:`, 1Password 한 형식만 통과시키고, 나머지는 "Invalid link URL"로 버린다.
3. macOS Terminal도 출력된 링크를 평소에는 평문으로 보인다(BACKLOG 'Terminal `doan://` links'). 그래서 사람이 링크를 복사하거나 `open "doan://…"`을 직접 쳐야 한다.
4. 클릭 가능한 http 링크를 쓰려면 호스팅(PRODUCT §3 Out of scope 5)이나 고정 포트 루프백 서버가 필요하다. 지금 로컬 서버는 실행할 때마다 포트와 토큰이 바뀐다(ARCHITECTURE §2).

## 완료 조건

1. `doan open <canvas path> [--frame <id>] --json`이 실행 중인 Doan에서 그 캔버스를 연다. 동작은 같은 캔버스·프레임의 `doan://` 링크를 열 때와 같다(PRODUCT §5 item 3 'Deep links': 창을 앞으로, Quick Open처럼 열기, 프레임 이동·강조, 없는 프레임이면 캔버스만). 확인: Go 단위 테스트, `/runtime-test`.
2. 경로가 `.doan/canvases|ds/*.html` 형식이 아니거나, `--frame`이 비었거나 형식이 틀리면 exit 2로 실패한다. 앱이 열 수 없는 경우(등록되지 않은 루트, 목록에 없는 캔버스)에는 그 이유를 응답으로 돌려준다. 확인: Go 테스트와 공유 fixture.
3. `doan open`도 링크처럼 이동만 한다. 쓰기, 보내기, 대화 시작, 프로젝트 추가, 설정 변경을 하지 않는다. 확인: 앱 핸들러 테스트.
4. 가이드 규칙 J가 바뀐다. 에이전트는 `doan work done`을 지금처럼 실행하되 링크를 최종 답에 넣지 않는다. 대신 고친 캔버스를 이름으로 들고 Doan에서 열어 줄지 묻는다. 사람이 원하면 `doan open`을 실행한다. 확인: `go test ./...`(`skill_test.go`), `/agent-eval`.
5. 에이전트는 사람이 묻지 않았는데 `doan open`을 실행하지 않는다. 확인: 가이드 문구 고정 테스트, `/agent-eval` 판정.
6. `/agent-eval`의 W3 판정 기준을 링크 대신 제안으로 바꾸고, 사람이 열어 달라고 하는 시나리오를 하나 더해 `doan open` 호출을 확인한다. 확인: `node eval/run.ts --self-test` 통과, 실제 라운드 기록.
7. 앱이 꺼져 있으면 앱 안에 든 CLI가 앱을 한 번 열고 기다린 뒤 캔버스를 연다. `onboarding start`와 같은 bootstrap이다(2026-11-03 user). `DOAN_RUNTIME`이 설정됐거나 앱 밖의 CLI면 앱을 열지 않고 `app_not_running`을 돌려준다. 확인: Go 테스트(`onboarding_test.go`의 bootstrap 테스트와 같은 방식).
8. Doan이 Claude Code에 설정하는 허용 규칙에 `Bash(doan open *)`이 더해진다(2026-11-03 user). 이미 두 규칙이 있는 설정 파일에는 다음 실행 때 이 규칙만 더해진다. 확인: `app/src/main/agentSetup/plan.test.ts`.
9. Doan 앱 안의 대화에서는 에이전트가 열어 줄지 묻지 않는다. 턴 프롬프트가 이를 막는다(2026-11-03 user). 확인: 턴 프롬프트 테스트, R8 eval.
10. `doan work done`의 응답(`{delivered, links, skipped}`)은 바뀌지 않는다. 사람이 링크를 달라고 하면 에이전트는 `links`를 준다(2026-11-03 user).
11. PRODUCT §5 item 3 'Deep links'·item 10(앱이 필요한 명령)·item 0의 1(에이전트 설정)과 ARCHITECTURE §4·§6·§7·§11·§12가 현재 규칙을 서술한다. BACKLOG의 'Terminal `doan://` links' 항목을 정리한다. 그 뒤 이 디렉터리를 지운다.

## 비목표

- `doan://` 링크와 그 처리(`parseOpenLink`, `resolveOpenLink`, 보안 경계)는 바꾸지 않는다. 사람이 링크를 직접 열면 지금처럼 동작한다.
- 클릭 가능한 http 루프백 링크, 호스팅 리다이렉트는 만들지 않는다.
- Orca·Claude·Codex 앱에 scheme 허용을 요청하는 일은 이 feature가 하지 않는다.
- 앱 대화의 에이전트 답에서 프레임·요소를 가리키는 칩은 `agent-reply-chips`가 맡는다.
- `doan open`이 잠긴 페이지나 취소를 거부하는 다이얼로그 때문에 이동하지 못해도 따로 알리지 않는다. 링크와 같은 한계이며 BACKLOG에 이미 있다.
