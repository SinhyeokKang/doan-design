# setup-via-onboarding — spec

출처: 2026-11-03 대화. 사용자가 앱을 설치하고 한 번 연 뒤, 첫 실행을 마치지 않은 채 자기 에이전트에게 "이 프로젝트를 Doan에 세팅해 줘"라고 맡기는 경우를 짚었다. 결정은 대화와 `/feature-review`(chain-261103 시작 점검)에서 사용자가 했다.

## 사용자

- **에이전트**: 사용자가 저장소를 Doan에 세팅해 달라고 하면, `doan init` 대신 `doan onboarding`으로 프로젝트를 고른다. 가이드가 그 기준을 준다.
- **사람**: 에이전트에게 맡기기만 하면 프로젝트가 앱에 등록된다. 첫 실행 중이면 첫 실행도 끝나서, 첫 실행 화면을 직접 넘기지 않아도 된다. 첫 실행이 이미 끝났으면 Doan 창이 앞으로 오고 사이드바에 프로젝트가 더해진다. Home의 기본 프로젝트는 바뀌지 않는다. 로그인 승인은 지금처럼 브라우저에서 한다.

## 문제 (관찰된 사실)

1. `doan init`은 저장소에 `.doan/config.json`·`.doan/canvases/`·`.gitattributes`만 쓴다. 앱에 프로젝트를 등록하지 않고 첫 실행 완료 기록(`<userData>/onboarding.json`)도 쓰지 않는다(PRODUCT §5 item 8, ARCHITECTURE §7 'First-run onboarding').
2. 첫 실행에는 Skip이 없고, 완료 기록이 생길 때까지 앱을 켤 때마다 창을 덮는다(PRODUCT §5 item 0 'First run'). 그래서 에이전트가 init만 하면 사람은 다음 실행 때 첫 실행 화면을 다시 만난다.
3. `doan onboarding project select`는 등록과 `--initialize`(init과 같은 파일, token CSS 없음)를 처리한다. 완료는 따로 `doan onboarding complete`가 한다. `complete`는 준비된 에이전트를 요구하고, 완료 기록의 `projectRoot`를 고른 루트로 다시 쓴다(Home 컴포저의 기본 프로젝트). onboarding 요청은 첫 실행이 끝난 뒤에도 받고, `start`는 `completed`를 돌려준다(ARCHITECTURE §4, `app/src/main/onboarding/service.ts`).
4. 가이드 'Onboarding'은 "the user asks you to set up Doan"일 때만 onboarding을 쓰라고 한다(`cli/internal/cli/skill.md`). Commands의 `doan init` 줄은 "initialize the current directory … Run it only when the user asks, and ask the user for the token CSS path first"라고 한다. "이 저장소를 Doan에 세팅해 줘" 같은 요청이 init의 "the user asks"에 드는지 모호하다. 그런 요청에서 에이전트가 무엇을 고르는지는 아직 재지 않았다(T2에서 잰다).

## 결정 (2026-11-03 사용자)

1. 사용자가 저장소를 Doan에 세팅해 달라고 하면 에이전트는 첫 실행 여부와 관계없이 `doan onboarding`으로 프로젝트를 고른다. 첫 실행이 끝난 뒤에도 이 경로가 프로젝트를 앱에 등록하기 때문이다(init은 등록하지 않는다).
2. `start`가 `completed: false`를 돌려주면 inspect → (변경 안내) → select `--initialize` → `complete`까지 한다. `completed: true`이면 select에서 멈추고 `complete`를 부르지 않는다. Home의 기본 프로젝트를 바꾸지 않고, 준비된 에이전트도 요구하지 않기 위해서다.
3. onboarding으로 앱에 닿지 못하면(`app_not_running`, `app_launch_failed`, `app_protocol_mismatch`, 샌드박스가 소켓을 막음) 묻지 않고 `doan init`으로 세팅한다. 그리고 프로젝트가 앱에 등록되지 않았으니 앱을 열면 Add Project가 필요하다고 사용자에게 알린다. 답할 사람이 없는 실행(eval, CI)도 멈추지 않게 하기 위해서다. 앱 없이 CLI만 가진 환경도 이 경우다(앱을 설치하지 않았으면 PATH의 `doan` 링크도 없다).
4. `doan init`은 이 밖에는 사용자가 그 명령을 직접 말했을 때만 쓴다. 명시적인 `doan init` 요청은 지금처럼 init만 한다(eval D12 그대로).
5. token CSS: onboarding 경로에서는 token CSS를 묻지 않는다(앱의 첫 실행과 같다). 사용자가 token CSS 경로를 말했으면 select 뒤에 `doan config --token-css <path>`로 넣는다. init 경로(결정 3·4)는 지금 규칙대로 init에 넘긴다.
6. CLI, 앱, 소켓 형식은 바꾸지 않는다. 가이드 문구와 eval(시나리오, 가짜 앱 하네스)만 바꾼다.

## 완료 조건

1. 가이드 'Onboarding' 첫 문단이 결정 1·2·5를 말한다. Commands의 `doan init` 줄이 결정 3·4와 "앱에 등록하지 않는다"를 그 자리에서 짧게 말한다. 확인: `go test ./...`(`skill_test.go`가 새 문구를 고정한다), 출력 예산 테스트(`skillOutputBudget`, 일반 출력과 `--json`+bundle 안내 둘 다) 통과.
2. 새 eval 시나리오 O3는 저장소 안에서 경로 없이 "이 저장소를 Doan에 세팅해 달라"고 요청하고(명령 이름 없음), 첫 실행이 끝나지 않은 가짜 앱을 쓴다. 에이전트가 `doan init`을 부르지 않고 onboarding으로 inspect → select `--initialize` → complete 하는지 본다. 확인: `node eval/run.ts --self-test --scenarios O3` 통과.
3. 변형 시나리오 O3b는 같은 요청을 첫 실행이 끝난 가짜 앱(`completed: true`)으로 보낸다. 에이전트가 `doan init`을 부르지 않고 select `--initialize`까지 하며 `complete`를 부르지 않는지 본다. 확인: `node eval/run.ts --self-test --scenarios O3b` 통과.
4. 가이드를 바꾸기 전에 O3·O3b를 실제 에이전트로 돌려 지금 행동을 기록한다(기준선). 확인: `docs/USABILITY-EVAL.md`에 기준선 라운드.
5. 가이드를 바꾼 뒤 O3·O3b가 Claude Code와 Codex 모두 통과하고, 세팅에 닿는 기존 시나리오 O1·O2·D12·D9·D10h가 기준 라운드처럼 통과한다. 기준 라운드는 링크 시작 때 `docs/USABILITY-EVAL.md`에서 각 시나리오의 최신 기록 라운드로 정해 tasks에 적는다. 확인: 실제 라운드를 `docs/USABILITY-EVAL.md`에 기록.
6. PRODUCT §2(사람이 에이전트에게 첫 실행을 맡김), §5 item 0(에이전트가 세팅 요청을 onboarding으로 진행)과 item 8(`doan init`)이 결정 1–5를 서술한다. 그 뒤 이 디렉터리를 지운다.

## 비목표

- `doan init`이 첫 실행 상태를 알려 주는 안내(앱 소켓 조회)는 만들지 않는다.
- 창을 띄우지 않는 첫 실행 상태 조회 명령은 만들지 않는다.
- 첫 실행 화면에 Skip을 더하거나 완료 조건을 바꾸지 않는다.
- onboarding `select`에 token CSS 인자를 더하지 않는다.
- 설치 시점 CLI 설치(.pkg, Homebrew cask)는 다루지 않는다(BACKLOG 'Release packaging').
