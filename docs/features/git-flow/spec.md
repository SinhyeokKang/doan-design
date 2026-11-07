# git-flow — spec

> 부모: [release-0-1-0](../release-0-1-0/tasks.md) (C1) · 선행: problem-project-overlay `/orchestrate`의 `main` 병합(부모 P0), [readme-features](../readme-features/spec.md)(C4, 그 앞은 [community-docs](../community-docs/spec.md)), 부모 D1 D2 D3 · 후행: [public-cleanup](../public-cleanup/spec.md) → 공개(G2) → [ci-gate](../ci-gate/spec.md) → [release-ci](../release-ci/spec.md) → [app-update](../app-update/spec.md) ∥ [release-skill](../release-skill/spec.md)

`develop`을 만들고, 이 저장소의 하네스(AGENTS.md와 스킬)가 모든 작업을 `develop`으로 보내게 한다. `main`은 사용자가 `/release`를 부를 때만 바뀐다. 규칙은 부모 [design.md](../release-0-1-0/design.md) '사용자 결정 (2026-11-07)' 1·2이고, 이 자식은 그것을 하네스에 옮긴다. 하네스·문서 변경이라 대화 중에 커밋한다.

## 사용자

- **에이전트**: `/ship`·`/orchestrate`·`/chain`·`/feature`·`/code-review`·`/design-draft`·`/design-sync`·`/tester-build`·`/audit`가 분기·PR 대상·병합 대상·빌드 원천으로 `develop`을 쓴다. `main`을 바꾸는 조작은 하지 않는다.
- **메인테이너**: G1에서 기본 브랜치를 설정하고, 출시는 `/release`(release-skill)로만 한다.
- **외부 기여자**: 직접 대상은 아니다. CONTRIBUTING(community-docs, 이 자식보다 먼저 `main`에 들어간다)이 이 규칙을 미리 적어 두었고, 이 자식이 끝나면 그 문장이 사실이 된다.

## 문제

- 통합과 출시가 모두 `main`이다. `/ship`·`/orchestrate`는 main에서 분기해 `--base main`으로 PR을 열고(`.agents/skills/ship/SKILL.md:18`, `:35`, `.agents/skills/orchestrate/SKILL.md:6`, `:76`), 하네스·문서 변경은 main에 바로 push하며(AGENTS.md:134), 체인 링크는 main에 병합하고 체인 파일을 main에 커밋한다(`.agents/skills/chain/SKILL.md:6`, `:8`, `:33`).
- 기준 브랜치를 가정하는 줄이 AGENTS.md와 스킬 아홉 개에 흩어져 있다(부모 design.md '하네스 영향').
- `/tester-build`는 `origin/main`에서 빌드한다(`.agents/skills/tester-build/SKILL.md:48`, `:52`). `main`이 출시 때만 바뀌면 낡은 커밋을 빌드한다.
- Orca worktree를 `--base-branch` 없이 만들면 Orca의 저장소 기본 원천을 쓴다(`orca worktree create --help`: "omit --base-branch to use the repo default base"). 이 기기의 Orca 설정에 기대면 기기마다 기준이 달라진다.

## 완료 조건

- `origin/develop`이 P0 병합과 C3·C4 뒤의 `main`에서 만들어져 있고, GitHub 기본 브랜치가 `develop`이며, 이 체크아웃의 `origin/HEAD`가 `origin/develop`을 가리킨다.
- AGENTS.md 'Commit conventions'가 사용자 결정 1·2와 D1·D3을 현재 규칙으로 적는다: 모든 코드·하네스·문서·체인 작업은 `develop`으로, `main`은 사용자가 부른 출시만 바꾼다. `main` 체크아웃에서는 커밋하지 않고 `develop`으로 바꾼다. `hotfix/*` 체크아웃에는 그 수정만 커밋한다. 브랜치 목록은 `main`, `develop`, `feat/*`·`fix/*`(와 `docs`·`chore`·`refactor`), `hotfix/*`다.
- 부모 design.md '하네스 영향' 표의 줄이 모두 `develop` 기준으로 바뀌었다. `git grep -n -w main AGENTS.md .agents/skills`의 결과가 design.md '허용 목록'의 줄뿐이다.
- Orca worktree를 만드는 문장(AGENTS.md:111, `.agents/skills/orchestrate/SKILL.md:31`, `.agents/skills/chain/SKILL.md:40`, `:49`)이 기준을 명시한다(`--base-branch feat/<slug>` 또는 `--base-branch origin/develop`).
- `/tester-build`가 `origin/develop`에서 빌드한다(CI로 옮기는 것은 release-ci의 D8).
- `docs/CONTRIBUTING.md`의 브랜치 문장(community-docs가 먼저 쓴 것)이 이 자식이 AGENTS.md에 쓴 규칙과 같다.
- G1(사용자)에게 넘길 설정 목록이 이 디렉터리의 design.md에 있다.

## 비목표

- `/release` 스킬 자체와 hotfix 절차, AGENTS.md 'Workflow'의 `/release` 줄, `/ship`의 hotfix 예외. 모두 스킬이 생기는 release-skill이 넣는다(없는 스킬을 가리키지 않기 위해). 이 자식은 "`main`은 사용자가 부른 출시만 바꾼다" 규칙과 브랜치 목록만 적는다.
- GitHub 보호 규칙. 사용자가 G3b·G3c에서 한다(D25).
- 기존 원격 브랜치 정리(D19, G2 전).
- 개인 메모리(`~/.claude/projects/…/memory/`)의 규칙. 저장소 밖이라 다루지 않는다.
