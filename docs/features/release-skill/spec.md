# release-skill — spec

> 부모: [release-0-1-0](../release-0-1-0/tasks.md) (C8) · 선행: [git-flow](../git-flow/spec.md), [release-ci](../release-ci/spec.md) (부모 P1의 D1 D7 D12 D13) · 병렬: [app-update](../app-update/spec.md) · 후행: 부모 R1(rc), R2(0.1.0)

`develop`에서 `main`으로 가는 유일한 길인 `/release` 스킬을 만든다. 출시본만 고치는 hotfix 모드도 이 스킬에 있다(D1). 규칙은 부모 [design.md](../release-0-1-0/design.md) '사용자 결정 (2026-11-07)' 2다: 사용자가 명시적으로 부를 때만 돌고, 버전 올림, `main`의 태그, 릴리스 노트, 배포에 필요한 나머지(릴리스 빌드, GitHub Release)를 한다. 하네스 변경이라 대화 중에 `develop`에 커밋한다.

## 사용자

- **메인테이너**: `/release <version>`(또는 D13이 정한 올림 방식)을 부르고, 스킬이 멈추는 승인 지점에서만 답한다.
- **에이전트**: 스킬을 따라 병합·태그·워크플로 시작·게시를 한다. 사용자가 부르지 않으면 `main`을 건드리지 않는다(git-flow가 AGENTS.md에 적은 규칙).
- **앱 사용자**: 게시된 Release와 `latest-mac.yml`로 새 버전을 받는다(app-update).

## 문제

- 사용자 결정 2가 `main`을 `/release`로만 바꾸게 했지만 그 스킬이 없다(`ls .agents/skills`에 `release` 없음).
- 출시에 필요한 단계가 여러 곳에 나뉜다: 버전 원천 `app/package.json`(`app/package.json:46`), CLI 버전 찍기(`app/scripts/package.mjs:18`), release-ci의 릴리스 워크플로, 서명 검증 스크립트, GitHub Release.
- 사람만 하는 일(인증서와 API 키를 만들어 GitHub 환경 비밀로 넣고 갱신하기)의 안내가 지금은 `/tester-build`의 'One-time setup'에 로컬 keychain 기준으로 있다(`.agents/skills/tester-build/SKILL.md` 'One-time setup').

## 완료 조건

- `.agents/skills/release/SKILL.md`가 있고, `.claude/skills/release`가 `../../.agents/skills/release`를 가리키는 링크다(AGENTS.md 'Runtime differences'의 스킬 위치 규칙, 다른 스킬과 같은 상대 링크 형태).
- 스킬이 출시 모드와 hotfix 모드(D1)의 순서를 적고, 각 단계의 멈춤 조건과 보고 형식을 가진다(design.md '절차', 'hotfix 모드').
- AGENTS.md 'Workflow'와 'Commands'에 `/release`가 있고, "사용자가 명시적으로 부를 때만"이 적혀 있다. 'Documents' 표의 `docs/OPERATIONS.md` 행에서 릴리스 패키징 역할이 빠졌다(D22 결론).
- 부모 R1에서 rc 두 번으로 스킬이 끝까지 돈다(D12). 이 자식의 완료는 스킬 문서와 링크까지이고, 실제 실행 검증은 R1이다.

## 비목표

- 워크플로·검증 스크립트 자체(release-ci).
- Homebrew cask 갱신, 웹사이트 갱신.
