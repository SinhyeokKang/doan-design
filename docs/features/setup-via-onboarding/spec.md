# setup-via-onboarding — spec

출처: 2026-11-03 대화. 사용자가 앱을 설치하고 한 번 연 뒤, 첫 실행을 마치지 않은 채 자기 에이전트에게 "이 프로젝트를 Doan에 세팅해 줘"라고 맡기는 경우를 짚었다.

## 사용자

- **에이전트**: 사용자가 저장소를 Doan에 세팅해 달라고 하면, `doan init` 대신 `doan onboarding`으로 프로젝트를 고른다. 가이드가 그 기준을 준다.
- **사람**: 에이전트에게 맡기기만 하면 프로젝트가 앱에 등록되고 첫 실행이 끝난다. 첫 실행 화면을 직접 넘기지 않아도 된다. 로그인 승인은 지금처럼 브라우저에서 한다.

## 문제 (관찰된 사실)

1. `doan init`은 저장소에 `.doan/config.json`·`.doan/canvases/`·`.gitattributes`만 쓴다. 앱에 프로젝트를 등록하지 않고 첫 실행 완료 기록(`<userData>/onboarding.json`)도 쓰지 않는다(PRODUCT §5 item 8, ARCHITECTURE §7 'First-run onboarding').
2. 첫 실행에는 Skip이 없고, 완료 기록이 생길 때까지 앱을 켤 때마다 창을 덮는다(PRODUCT §5 item 0 'First run'). 그래서 에이전트가 init만 하면 사람은 다음 실행 때 첫 실행 화면을 다시 만난다.
3. `doan onboarding project select`는 등록·`--initialize`(init과 같은 파일)·완료까지 한 번에 처리한다. 첫 실행이 끝난 뒤에도 요청을 받는다(ARCHITECTURE §4).
4. 가이드 'Onboarding'은 "the user asks you to set up Doan"일 때만 onboarding을 쓰라고 한다(`cli/internal/cli/skill.md`). Commands의 `doan init` 줄은 "initialize the current directory"라고만 한다. "이 저장소를 Doan에 세팅해 줘" 같은 요청에서 에이전트가 무엇을 고르는지는 아직 재지 않았다(T1에서 잰다).

## 결정 (2026-11-03 사용자)

1. 사용자가 저장소를 Doan에 세팅해 달라고 하면 에이전트는 첫 실행 여부와 관계없이 `doan onboarding`으로 프로젝트를 고른다. 첫 실행이 끝난 뒤에도 이 경로가 프로젝트를 앱에 등록하기 때문이다(init은 등록하지 않는다).
2. `doan init`은 사용자가 그 명령을 직접 말했을 때, 또는 앱을 쓸 수 없을 때(`app_not_running`·`app_launch_failed`로 사용자가 앱을 열지 않겠다고 했을 때)만 쓴다. 명시적인 `doan init` 요청은 지금처럼 init만 한다(eval D12 그대로).
3. CLI, 앱, 소켓 형식은 바꾸지 않는다. 가이드 문구와 eval만 바꾼다.

## 완료 조건

1. 가이드 'Onboarding' 첫 문단이 결정 1·2를 말한다. Commands의 `doan init` 줄이 "앱에 등록하지 않는다, 세팅 요청에는 onboarding"을 짧게 말한다. 확인: `go test ./...`(`skill_test.go`가 새 문구를 고정한다), 출력 예산 테스트(`skillOutputBudget`) 통과.
2. 새 eval 시나리오가 "저장소를 Doan에 세팅해 달라"는 요청(명령 이름 없음)과 첫 실행이 끝나지 않은 가짜 앱으로, 에이전트가 `doan init`을 부르지 않고 onboarding으로 inspect → (변경 안내) → select `--initialize` → complete 하는지 본다. 확인: `node eval/run.ts --self-test --scenarios <새 id>` 통과.
3. 가이드를 바꾸기 전에 새 시나리오를 실제 에이전트로 한 번 돌려 지금 행동을 기록한다(기준선). 확인: `docs/USABILITY-EVAL.md`에 기준선 라운드.
4. 가이드를 바꾼 뒤 새 시나리오가 Claude Code와 Codex 모두 통과하고, O1·O2·D12가 지금처럼 통과한다. 확인: 실제 라운드를 `docs/USABILITY-EVAL.md`에 기록.
5. PRODUCT §5 item 0(에이전트가 첫 실행을 대신 진행)과 item 8(`doan init`)이 결정 1·2를 서술한다. 그 뒤 이 디렉터리를 지운다.

## 비목표

- `doan init`이 첫 실행 상태를 알려 주는 안내(앱 소켓 조회)는 만들지 않는다.
- 창을 띄우지 않는 첫 실행 상태 조회 명령은 만들지 않는다.
- 첫 실행 화면에 Skip을 더하거나 완료 조건을 바꾸지 않는다.
- 설치 시점 CLI 설치(.pkg, Homebrew cask)는 다루지 않는다(BACKLOG 'Release packaging').
