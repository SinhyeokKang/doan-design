# ci-gate — spec

> 부모: [release-0-1-0](../release-0-1-0/tasks.md) (C5) · 선행: [public-cleanup](../public-cleanup/spec.md)(그 앞은 [git-flow](../git-flow/spec.md)), 부모 G2(공개, D21), G3a (부모 D4 D5) · 후행: 부모 G3b(`develop` 필수 검사), [release-ci](../release-ci/spec.md)

GitHub Actions에서 공유 게이트(`node .agents/skills/verify/scripts/verify.mjs`)를 돌려 병합 전 검사로 건다. e2e는 넣지 않는다(AGENTS.md 'Verification policy'). `/ship`으로 진행한다.

## 사용자

- **기여자와 에이전트**: PR에서 로컬 `/verify`와 같은 게이트 결과를 받는다.
- **메인테이너**: 필수 검사가 통과하지 않은 PR을 병합하지 않는다(G3b·G3c의 보호 규칙, D25).
- **release-ci**: 서명 작업 앞에서 같은 게이트를 `workflow_call`로 부른다.

## 문제

- CI가 없다(`.github/workflows/` 없음). 게이트는 로컬에서만 돈다(AGENTS.md 'Commands').
- Node 버전이 고정돼 있지 않다(`.nvmrc`·`.node-version`·`engines` 없음). 이 기기는 Node 26.4.0이다. `node --test 'app/runtime/*.test.ts'`처럼 TypeScript를 바로 읽는 단계가 Node 버전에 기댄다. Go는 `go.mod:3`의 `go 1.27.0`이다.
- 게이트가 macOS가 아닌 곳에서 통과하는지 모른다. 앱 테스트 파일 12개가 `darwin`·`/usr/bin/`·`osascript`·Keychain 중 하나를 언급하고, CLI에 `//go:build darwin || linux` 파일이 있다(`cli/internal/cli/terminal_unix.go:1`).

## 완료 조건

- D4의 이벤트(`develop`·`main`을 향한 `pull_request`, `develop`·`main`으로의 `push`)에서 D5의 러너(`macos-26` 고정)가 게이트를 돌린다. 같은 워크플로를 `workflow_call`로도 부를 수 있다.
- 게이트 작업 id가 `gate`이고 `name:`을 붙이지 않아, 필수 검사 이름이 `gate`로 고정된다(G3b·G3c).
- 실패한 단계의 출력은 작업 로그에 남는다(`verify.mjs`가 단계마다 stdout/stderr를 콘솔에 쓴다, `verify.mjs:62–63`). 산출물 업로드는 하지 않는다.
- 워크플로가 비밀을 쓰지 않고, `permissions: contents: read`이며, `pull_request_target`을 쓰지 않는다. 작업에 `timeout-minutes`가 있다.
- Node 버전이 루트 `.node-version`에 고정돼 로컬과 CI가 같은 값을 읽는다. ARCHITECTURE에 Node 버전의 위치가 적혀 있다.
- 게이트 한 번의 시간을 측정해 커밋 메시지와 ARCHITECTURE의 CI 줄에 남긴다(`--eval`을 넣을지 판단 근거).
- CONTRIBUTING의 Checks 절이 CI를 설명한다(community-docs가 미뤄 둔 문장).

## 비목표

- e2e, 야간 실행, 실제 에이전트 eval(`/agent-eval`은 실제 계정과 `python3.12`가 필요하다, AGENTS.md 'Commands').
- 서명·패키징(release-ci).
- 비공개 상태의 CI 비용 관리(D21이 공개 뒤로 두었다).
