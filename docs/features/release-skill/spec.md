# release-skill — spec

> 부모: [release-0-1-0](../release-0-1-0/tasks.md) (C8) · 선행: [git-flow](../git-flow/spec.md), [release-ci](../release-ci/spec.md) (부모 D1 D7 D12 D13 D22 D25) · 병렬: [app-update](../app-update/spec.md) · 후행: 부모 G3c(`main` 보호), R1(rc), R2(0.1.0)

`develop`에서 `main`으로 가는 유일한 길인 `/release` 스킬을 만든다. 출시본만 고치는 hotfix 모드도 이 스킬에 있다(D1). 규칙은 부모 [design.md](../release-0-1-0/design.md) '사용자 결정 (2026-11-07)' 2다: 사용자가 명시적으로 부를 때만 돌고, 버전 올림, `main`의 태그 push(릴리스 워크플로가 이 태그로 시작한다, D7), 릴리스 노트, GitHub Release 게시를 한다. 하네스 변경이라 대화 중에 `develop`에 커밋한다.

## 사용자

- **메인테이너**: `/release <version>`이나 `/release hotfix <slug>`를 부르고, 스킬이 멈추는 승인 지점에서만 답한다.
- **에이전트**: 스킬을 따라 병합·태그·게시를 한다. 사용자가 부르지 않으면 `main`을 건드리지 않는다(git-flow가 AGENTS.md에 적은 규칙).
- **앱 사용자**: 게시된 Release와 `latest-mac.yml`로 새 버전을 받는다(app-update).

## 문제

- 사용자 결정 2가 `main`을 `/release`로만 바꾸게 했지만 그 스킬이 없다(`ls .agents/skills`에 `release` 없음).
- 출시에 필요한 단계가 여러 곳에 나뉜다: 버전 원천 `app/package.json`(`app/package.json:46`)과 `app/package-lock.json`, CLI 버전 찍기(`app/scripts/package.mjs:17`), release-ci의 릴리스 워크플로와 스크립트, GitHub Release.
- 사람만 하는 일(인증서와 API 키를 만들어 GitHub 환경 비밀로 넣고 갱신하기)의 안내가 지금은 `/tester-build`의 'One-time setup'에 로컬 keychain 기준으로 있다. release-ci T7이 CI 기준 절차를 이 자식의 design.md에 쓴다.
- 출시가 중간에 멈추면(올림 커밋만 push, PR 게이트 실패, 워크플로 실패, 검사 실패, 태그만 있음) 같은 버전으로 다시 부를 때 할 일이 정해져 있지 않다.
- AGENTS.md는 `/ship`·`/orchestrate`가 "do not merge"라고 한다(AGENTS.md:109). `/release`는 PR을 병합한다.

## 완료 조건

- `.agents/skills/release/SKILL.md`가 있고, `.claude/skills/release`가 `../../.agents/skills/release`를 가리키는 링크다(AGENTS.md 'Runtime differences'의 스킬 위치 규칙, 다른 스킬과 같은 상대 링크 형태).
- 스킬이 출시 모드, hotfix 모드(두 번 호출, D1), '재개와 중단' 표를 가지고, 각 단계의 멈춤 조건과 보고 형식을 가진다(design.md).
- 스킬은 release-ci의 '/release와의 계약'에 있는 이름만 쓴다.
- 모델이 스스로 이 스킬을 부르지 못하게 하는 장치를 확인해 적용했다(Claude Code frontmatter `disable-model-invocation: true`, 문서로 확인. Codex에 같은 장치가 없으면 0단계의 자기 점검만 남긴다).
- AGENTS.md에 다음이 있다:
  - 'Workflow'의 `/release` 줄(사용자만 부른다, `main`을 바꾸는 유일한 길).
  - 'Commit conventions'의 예외 두 개: `/release`는 PR을 병합한다. `/ship`은 지금 브랜치가 `/release hotfix`가 만든 `hotfix/<slug>`이면 그대로 쓰고 `--base main`으로 PR을 연다(병합은 `/release`가 한다).
  - 'Commands'의 `gh` 명령(`gh pr create`, `gh pr merge`, `gh release view`, `gh release download`, `gh release edit`, `gh release delete`).
  - 'Documents' 표의 `docs/OPERATIONS.md` 행에서 릴리스 패키징 역할이 빠졌다(D22).
- `.agents/skills/ship/SKILL.md`에 위 hotfix 예외가 있다. CONTRIBUTING의 Branches 절이 출시를 `/release`로 설명한다.
- 이 자식의 완료는 스킬 문서와 링크까지이고, 실제 실행 검증은 부모 R1이다. hotfix 모드는 R1에서 돌리지 않으므로 BACKLOG에 미확인으로 남는다.

## 비목표

- 워크플로·검증 스크립트 자체(release-ci).
- Homebrew cask 갱신, 웹사이트 갱신.
