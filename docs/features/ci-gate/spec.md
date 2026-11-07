# ci-gate — spec

> 부모: [release-0-1-0](../release-0-1-0/tasks.md) (C5) · 선행: [git-flow](../git-flow/spec.md), 부모 G2(공개, D21) (부모 P1의 D4 D5) · 후행: [release-ci](../release-ci/spec.md), 부모 G3(필수 검사 등록)

GitHub Actions에서 공유 게이트(`node .agents/skills/verify/scripts/verify.mjs`)를 돌려 병합 전 검사로 건다. e2e는 넣지 않는다(AGENTS.md 'Verification policy'). `/ship`으로 진행한다.

## 사용자

- **기여자와 에이전트**: PR에서 로컬 `/verify`와 같은 게이트 결과를 받는다.
- **메인테이너**: 필수 검사가 통과하지 않은 PR을 병합하지 않는다(G3의 보호 규칙).

## 문제

- CI가 없다(`.github/` 없음). 게이트는 로컬에서만 돈다(AGENTS.md 'Commands').
- Node 버전이 고정돼 있지 않다(`.nvmrc`·`.node-version`·`engines` 없음). 이 기기는 Node 26.4.0이다. `node --test 'app/runtime/*.test.ts'`처럼 TypeScript를 바로 읽는 단계가 Node 버전에 기댄다. Go는 `go.mod:3`의 `go 1.27.0`이다.
- 게이트가 macOS가 아닌 곳에서 통과하는지 모른다. 앱 테스트 파일 12개가 `darwin`·`/usr/bin/`·`osascript`·Keychain 중 하나를 언급하고, CLI에 `//go:build darwin || linux` 파일이 있다(`cli/internal/cli/terminal_unix.go:1`).
- `verify.mjs`는 실패하면 멈추고 로그를 `.scratch/verify/`에 남긴다(`.agents/skills/verify/scripts/verify.mjs`). CI에서 이 로그를 볼 방법이 없다.

## 완료 조건

- D4의 이벤트(`develop`·`main`을 향한 `pull_request`, `develop`·`main`으로의 `push`)에서 D5의 러너(`macos-26` 고정)가 게이트를 돌린다.
- 게이트 작업 이름이 하나로 고정돼 G3의 필수 검사로 등록할 수 있다.
- 실패하면 `.scratch/verify/`의 로그가 작업 산출물로 남는다.
- 워크플로가 비밀을 쓰지 않고, `permissions: contents: read`이며, `pull_request_target`을 쓰지 않는다.
- Node 버전이 저장소에 고정돼(D5와 함께 정할 파일) 로컬과 CI가 같은 값을 읽는다.
- 게이트 한 번의 시간을 측정해 기록한다(`--eval`을 넣을지 판단 근거).

## 비목표

- e2e, 야간 실행, 실제 에이전트 eval(`/agent-eval`은 실제 계정과 `python3.12`가 필요하다, AGENTS.md 'Commands').
- 서명·패키징(release-ci).
- 비공개 상태의 CI 비용 관리(D21이 공개 뒤로 두었다).
