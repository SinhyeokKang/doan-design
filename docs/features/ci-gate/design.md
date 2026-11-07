# ci-gate — design

결정: 부모 [design.md](../release-0-1-0/design.md)의 D4(트리거), D5(러너), D21(공개 시점), D25(필수 검사 등록 시점). 모두 결론이다.

## 영향 범위

- 새 `.github/workflows/ci.yml`, 루트 `.node-version`(Open Design도 같은 파일을 쓴다 — https://github.com/nexu-io/open-design/blob/main/.node-version). 값은 이 기기의 26.4.0이다.
- `verify.mjs`는 바꾸지 않는다.
- 앱·CLI·형식·`doan check`: 영향 없음.
- 순수 함수로 뺄 부분: 없다. 워크플로는 선언이고 게이트 로직은 이미 `verify.mjs`에 있다. `/tdd` 대상이 없으면 설계를 다시 보라는 skill 규칙에 따라 확인했다: 새 로직을 만들지 않는 것이 이 자식의 목표다.
- `.github/`는 community-docs가 DIRECTORY.md에 더했다. 이 자식은 `.github/workflows`의 역할만 그 줄에 더한다.
- AGENTS.md 'Commands'에 CI 줄과 `gh pr checks <n>`(PR의 검사 결과를 읽는 명령)을 더한다. 그래서 T2·T3의 검증을 명령으로 판정할 수 있다.

## 워크플로 골격

```yaml
name: CI
on:
  pull_request:
    branches: [develop, main]
  push:
    branches: [develop, main]
  workflow_call:
permissions:
  contents: read
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: ${{ github.event_name == 'pull_request' }}
jobs:
  gate:            # name: 없음 — 필수 검사 이름이 작업 id 'gate'다
    runs-on: macos-26
    timeout-minutes: <T2에서 잰 시간의 두 배 정도>
    steps:
      - checkout
      - setup-node (node-version-file: .node-version, npm cache: app/package-lock.json)
      - setup-go (go-version-file: go.mod)
      - npm --prefix app ci
      - node .agents/skills/verify/scripts/verify.mjs
```

- 액션 버전은 커밋 SHA로 고정한다(공개 저장소의 공급망 위험). 어떤 SHA를 쓸지는 구현 때 각 액션의 릴리스에서 읽는다.
- `cancel-in-progress`는 PR에만 건다. `develop` push에 걸면 연속 병합 때 앞 커밋의 결과가 취소로 남는다.
- Electron 바이너리 내려받기(`node -e "require('electron')"`, AGENTS.md 'Commands' App setup)는 게이트 단계 중 Electron을 띄우는 곳이 보이지 않아 넣지 않는다(`app/runtime/windows.ts:1`은 타입 import뿐). T2에서 이 단계 없이 통과하는지 보고, 필요하면 넣는다.
- 산출물 업로드를 하지 않는다. 로그는 작업 로그에 있다. 넣는다면 `actions/upload-artifact` v4.4+가 숨김 경로를 빼므로 `include-hidden-files: true`가 필요하다.
- `--eval`의 self-test는 `python3`을 문자열로만 다루므로(`eval/lib/judge.test.ts`) 러너에서 돌 수 있다. 넣을지는 T2의 시간으로 정한다.

## PoC (T2)

- 게이트가 `macos-26`에서 통과하는지, 시간이 얼마인지. `.node-version`을 먼저 더한 뒤(T1) 돌린다.
- PR이 있어야 `pull_request`가 돈다. `/ship`은 마지막에만 push하므로, 사용자 승인 아래 PoC용 draft PR을 먼저 연다.
- 통과하지 않으면 실패 단계와 원인을 적고, 테스트가 이 기기의 상태(설치된 CLI, HOME 내용)에 기대는지 본다. 고치는 것은 `develop`을 향한 별도 `fix/` 작업이고, ci-gate는 그 PR이 `develop`에 병합될 때까지 멈춘다.

## 공통 함정

- POSTMORTEM 2026-10-24 'Agent shells bypassed the evaluation runner's packaged CLI': eval이 PATH의 `doan`을 집으면 실패를 가린다. CI 러너에는 `doan`이 없으므로 게이트가 PATH의 `doan`에 기대는 곳이 있으면 PoC에서 드러난다.
