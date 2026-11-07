# ci-gate — design

결정: 부모 [design.md](../release-0-1-0/design.md)의 D4(트리거), D5(러너), D21(공개 시점). 모두 결론이다(사용자, 2026-11-07).

## 영향 범위

- 새 `.github/workflows/ci.yml`, Node 버전 고정 파일 하나(제안: 루트 `.node-version`, Open Design도 같은 파일을 쓴다 — https://github.com/nexu-io/open-design/blob/main/.node-version).
- `verify.mjs`는 바꾸지 않는 것을 기본으로 한다. CI에서만 다르게 할 일이 생기면(예: 로그 위치) 그 이유를 이 문서에 적고 `verify.test.mjs`에 회귀를 더한다.
- 앱·CLI·형식·`doan check`: 영향 없음.
- 순수 함수로 뺄 부분: 없다. 워크플로는 선언이고 게이트 로직은 이미 `verify.mjs`에 있다. `/tdd` 대상이 없으면 설계를 다시 보라는 skill 규칙에 따라 확인했다: 새 로직을 만들지 않는 것이 이 자식의 목표다.
- 새 디렉터리 `.github/`는 DIRECTORY.md에 적는다(community-docs가 먼저 더했으면 줄만 고친다).

## 워크플로 골격

```yaml
name: CI
on:
  pull_request:
    branches: [develop, main]
  push:
    branches: [develop, main]
permissions:
  contents: read
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
jobs:
  gate:
    runs-on: macos-26
    steps:
      - checkout
      - setup-node (node-version-file: .node-version, npm cache: app/package-lock.json)
      - setup-go (go-version-file: go.mod)
      - npm --prefix app ci
      - (cd app && node -e "require('electron')")   # AGENTS.md 'Commands' App setup
      - node .agents/skills/verify/scripts/verify.mjs
      - on failure: upload .scratch/verify/
```

- 액션 버전은 커밋 SHA로 고정한다(공개 저장소의 공급망 위험). 어떤 SHA를 쓸지는 구현 때 각 액션의 릴리스에서 읽는다.
- Electron 바이너리 내려받기는 `postinstall`이 없어 따로 한다(AGENTS.md 'Commands' App setup, ARCHITECTURE §7 'Setup').

## PoC (첫 task)

- 게이트가 `macos-26`에서 통과하는지, 시간이 얼마인지. 통과하지 않으면 실패 단계와 원인을 적고, 테스트가 이 기기의 상태(설치된 CLI, HOME 내용)에 기대는지 본다. 고치는 것은 별도 `fix/` 작업이다.
- `ubuntu-latest` 분할은 하지 않는다(D5: `macos-26` 고정).

## 공통 함정

- POSTMORTEM 2026-10-24 'Agent shells bypassed the evaluation runner's packaged CLI': eval이 PATH의 `doan`을 집으면 실패를 가린다. CI 러너에는 `doan`이 없으므로 게이트가 PATH의 `doan`에 기대는 곳이 있으면 PoC에서 드러난다.
