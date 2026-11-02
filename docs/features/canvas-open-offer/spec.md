# canvas-open-offer — spec

출처: 2026-11-03 대화. Orca 터미널에서 `doan work done`이 돌려준 `doan://` 링크를 눌러도 아무 일이 없었다. 사용자 제안: 에이전트가 링크를 출력하지 말고 "Doan에서 열어줄까?"를 묻고, 사람이 원하면 명령으로 연다.

## 사용자

- **사람**: 터미널이나 에이전트 앱에서 에이전트가 캔버스를 고친 뒤 Doan에서 열어 줄지 묻는 한 줄을 본다. 문구는 고정하지 않고 에이전트가 답의 언어로 쓴다. 사람이 열어 달라고 답하면 Doan이 그 캔버스(와 프레임)를 연다. 링크를 클릭할 수 있는 화면인지 신경 쓰지 않아도 된다.
- **에이전트**: 가이드 규칙 J를 따라 최종 답 끝에 고친 캔버스를 열어 줄지 묻는다. 사람이 원하면 새 명령 `doan open <canvas path> [--frame <id>] --json`을 실행하고 결과를 한 줄로 알린다.

## 문제 (관찰된 사실)

1. 가이드 규칙 J는 `doan work done`이 돌려준 `doan://open?…` 링크를 최종 답에 넣으라고 한다(PRODUCT §5 item 3 'Deep links', `cli/internal/cli/skill.md`).
2. 에이전트를 돌리는 화면 셋이 모두 `doan://` 클릭을 막는다. 2026-11-03에 각 설치본의 코드를 직접 확인했다.
   - **Orca 1.4.243 터미널**: OSC 8 링크에 http가 아닌 scheme도 허용하지만, 클릭 처리 함수는 `http:`, `https:`, `file:`과 파일 경로만 열고 나머지는 무시한다.
   - **Claude 데스크톱 4.4212.0**: 창 밖으로 여는 링크는 http(s), `mailto:`·`tel:`·`sms:`, MS Office scheme과 앱 자체 scheme만 받는다. 그 밖의 scheme은 막는다.
   - **Codex 앱 26.1027(`com.openai.codex`)**: 링크 검사가 `file:`, http(s), `mailto:`·`sms:`·`tel:`, 일부 `vscode:`, 1Password 한 형식만 통과시키고, 나머지는 "Invalid link URL"로 버린다.
3. macOS Terminal도 출력된 링크를 평소에는 평문으로 보인다(BACKLOG 'Terminal `doan://` links'). 그래서 사람이 링크를 복사하거나 `open "doan://…"`을 직접 쳐야 한다.
4. 클릭 가능한 http 링크를 쓰려면 호스팅(PRODUCT §3 Out of scope 5)이나 고정 포트 루프백 서버가 필요하다. 지금 로컬 서버는 실행할 때마다 포트와 토큰이 바뀐다(ARCHITECTURE §3).

## 완료 조건

1. `doan open <canvas path> [--frame <id>] --json`이 실행 중인 Doan에서 그 캔버스를 연다. 동작은 같은 캔버스·프레임의 `doan://` 링크를 열 때와 같다(PRODUCT §5 item 3 'Deep links'): 취소할 수 있는 다이얼로그를 닫고, 창을 앞으로 가져오고, Quick Open처럼 열고, 프레임으로 이동해 강조한다. 없는 프레임이면 캔버스만 연다. 응답은 renderer가 이동을 결정한 뒤에 돌아오고, 프레임을 찾았는지도 담는다. 확인: Go 단위 테스트, 앱 테스트, `/runtime-test`.
2. 경로가 `.doan/canvases|ds/*.html` 형식이 아니거나, `--frame`이 비었거나 형식이 틀리면 exit 2(`usage_error`)로 실패한다. 파일이 없으면 앱에 묻지 않고 `canvas_not_found`(exit 2)다. 앱이 열지 못하면 ARCHITECTURE §12의 기존 코드로 실패한다. 등록되지 않은 루트는 `project_not_open`(exit 3), 목록에 없는 캔버스는 `canvas_not_found`(exit 2)다. 잠긴 페이지, 취소를 거부하는 다이얼로그, first run은 `busy`(exit 5)이고, 무엇이 막는지 message에 적는다. 거절이면 앱은 창을 앞으로 가져오지 않고 토스트도 띄우지 않는다. 사람에게는 에이전트가 알린다. 확인: Go 테스트와 공유 fixture, 앱 테스트.
3. 앱이 준비되기 전(launch restore, 첫 프로젝트 읽기, 대상 루트가 loading)에 요청이 오면 앱은 재시도할 수 있는 `not_ready`로 바로 답한다. CLI는 정해진 시간 안에서 다시 보낸다. 앱은 요청을 붙잡아 두지 않으므로, CLI가 실패한 뒤 앱이 늦게 이동하는 일은 없다. 확인: Go 테스트(주입 clock), 앱 테스트.
4. `doan open`도 링크처럼 이동만 한다. 쓰기, 보내기, 대화 시작, 프로젝트 추가, 설정 변경을 하지 않는다. 확인: 앱 핸들러 테스트.
5. 가이드 규칙 J가 바뀐다.
   - 에이전트는 `doan work done`을 지금처럼 실행하되 링크를 최종 답에 넣지 않는다.
   - 고친 캔버스를 Doan이 보이는 이름(`doan ls`의 title, 없으면 `.html`을 뗀 파일 이름)으로 들고, Doan에서 열어 줄지 답의 언어로 한 줄로 묻는다. 프레임은 title로 부르고 `--frame`에는 id를 넘긴다.
   - 고친 캔버스가 여럿이면 한 줄에 모두 든다. 사람이 고르지 않고 열어 달라고만 하면 첫 번째 하나만 열고, 나머지는 sidebar에 있다고 말한다.
   - 사람에게 다른 질문을 하며 멈추는 답에는 제안을 붙이지 않는다. 같은 대화에서 이미 열었거나 사람이 거절한 캔버스는 다시 묻지 않는다.
   - 사람이 원하면 `doan open`을 실행하고 결과를 답의 언어로 한 줄로 알린다. 프레임을 찾지 못했으면 캔버스만 열었다고 말하고, 거절이면 이유와 다시 할 일을 말한다.
   
   확인: `go test ./...`(`skill_test.go`), `/agent-eval`.
6. 에이전트는 사람이 묻지 않았는데 `doan open`을 실행하지 않는다. 확인: 가이드 문구 고정 테스트, W3b·R8b의 automatic check(`doan open` 호출 없음).
7. `/agent-eval`의 W3 판정 기준을 링크 대신 제안으로 바꾼다(W3b). 사람이 열어 달라고 하는 시나리오 W4를 더해 `doan open` 호출과 가짜 앱이 받은 v4 요청을 확인한다. eval 러너에는 여러 턴이 없으므로 W4는 처음부터 고친 뒤 열어 달라고 하는 한 프롬프트다. 확인: `node eval/run.ts --self-test` 통과, 실제 라운드 기록.
8. 앱이 꺼져 있으면 앱 안에 든 CLI가 앱을 한 번 열고 기다린 뒤 캔버스를 연다. `onboarding start`와 같은 bootstrap이다(2026-11-03 user). `DOAN_RUNTIME`이 설정됐거나 앱 밖의 CLI면 앱을 열지 않고 `app_not_running`을 돌려준다. 확인: Go 테스트(`onboarding_test.go`의 bootstrap 테스트와 같은 방식). 실제 앱을 띄우는 경로는 격리 probe로 확인할 수 없으므로 BACKLOG에 미검증으로 남긴다.
9. Doan이 Claude Code에 설정하는 허용 규칙에 `Bash(doan open *)`이 더해진다(2026-11-03 user). 이미 두 규칙이 있는 설정 파일에는 다음 실행 때 이 규칙만 더해진다. 링크로 된 설정 파일일 때 About이 보이는 안내도 세 규칙을 든다. 확인: `app/src/main/agentSetup/plan.test.ts`, `notice.test.ts`.
10. Doan 앱 안의 대화에서는 에이전트가 열어 줄지 묻지 않는다. 턴 프롬프트가 이를 막고, 이 줄이 가이드의 제안 규칙보다 우선한다고 밝힌다(2026-11-03 user). 사람이 앱 대화에서 먼저 열어 달라고 하면 `doan open`은 그대로 동작한다. 화면과 대화 패널이 그 캔버스로 넘어가고, Back으로 이전 화면에 돌아갈 수 있다. 확인: `prompt.test.ts`, R8b eval.
11. `doan work done`의 응답(`{delivered, links, skipped}`)은 바뀌지 않는다. 사람이 링크를 달라고 하면 에이전트는 `links`를 준다(2026-11-03 user). 확인: `skill_test.go` 문구 고정.
12. 다음이 현재 규칙을 서술한다.
    - PRODUCT §3 Out of scope 4, §5 item 0 'Agent setup'(첫 실행 줄과 허용 규칙), item 3 'Deep links', item 10(앱이 필요한 명령)
    - ARCHITECTURE §4·§6·§7·§11·§12·§14
    - README의 에이전트 답과 허용 규칙 설명
    
    BACKLOG의 'Terminal `doan://` links' 항목을 정리하고, 잠긴 페이지 링크 항목은 링크에만 해당한다고 고친다. 그 뒤 이 디렉터리를 지운다.

## 비목표

- `doan://` 링크의 동작과 보안 경계는 바꾸지 않는다. 판정 코드를 `doan open`과 나누려고 `resolveOpenLink`를 분리하지만, 링크의 결과와 `open-link` fixture는 그대로다. 사람이 링크를 직접 열면 지금처럼 동작한다.
- 클릭 가능한 http 루프백 링크, 호스팅 리다이렉트는 만들지 않는다.
- 에이전트가 `open "doan://…"`을 실행하는 방식은 쓰지 않는다. Launch Services가 어느 Doan 사본을 열지 고르고, dev 실행과 eval이 격리되지 않으며, 거절 이유를 돌려받을 수 없다.
- Orca·Claude·Codex 앱에 scheme 허용을 요청하는 일은 이 feature가 하지 않는다.
- 앱 대화의 에이전트 답에서 프레임·요소를 가리키는 칩은 `agent-reply-chips`가 맡는다.
- 잠긴 페이지나 거부하는 다이얼로그에 막힌 `doan://` 링크를 알리는 일은 하지 않는다. 링크는 지금처럼 조용히 버려진다(BACKLOG). `doan open`만 `busy`를 돌려준다.
