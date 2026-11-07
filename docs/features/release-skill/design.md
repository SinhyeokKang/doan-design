# release-skill — design

결정: 부모 [design.md](../release-0-1-0/design.md)의 '사용자 결정' 2, D1(출시본 급한 수정), D7(게시 방식), D12(rc 검증), D13(올림 커밋 위치, rc 식별자, 노트), D22(절차는 스킬에). 모두 결론이다(사용자, 2026-11-07).

## 영향 범위

- 새 `.agents/skills/release/SKILL.md`(영어, AGENTS.md 언어 정책), 링크 `.claude/skills/release`.
- AGENTS.md 'Workflow'(스킬 목록), 'Commands'(필요한 `gh` 명령), 'Documents' 표.
- 앱·CLI·형식·`doan check`: 영향 없음. 순수 함수 대상은 release-ci의 `checkReleaseVersion`을 스킬이 부르는 것으로 대신한다(스킬 문서에는 로직을 두지 않는다).
- PoC 의존: release-ci의 PoC 결과(태그를 누가 언제 만드는지, `app-update.yml` 유무).

## 절차 (스킬 본문의 골격)

`/release <version>` — `<version>`은 `x.y.z` 또는 `x.y.z-rc.N`(D13).

0. **호출 확인**: 사용자가 이 대화에서 `/release`를 직접 불렀을 때만 진행한다. 다른 스킬·체인·worker가 부르면 멈춘다.
1. **사전 확인**(하나라도 실패하면 멈추고 보고):
   - 작업 트리가 깨끗하고 `origin/develop`과 같다. 진행 중인 `/orchestrate`·체인(`docs/features/chain-*`)이 없다.
   - `develop` HEAD의 CI 게이트가 통과했다(ci-gate의 작업 이름).
   - `checkReleaseVersion`(release-ci)이 `<version>`을 받아들인다.
   - `docs/features/`에 완료됐는데 지우지 않은 feature 디렉터리가 없는지 보고만 한다(막지 않는다).
2. **버전 올림**(D13): `app/package.json` `version`이 `<version>`과 다르면 `develop`에 `chore(release): <version>` 커밋을 push한다. 0.1.0처럼 같으면 건너뛴다.
3. **릴리스 노트 초안**: 마지막 태그(없으면 처음) 이후 `develop`에 병합된 PR 제목을 Conventional Commit 타입별로 묶는다. 사용자에게 보여 주고 고친 것을 받는다(승인 지점 1).
4. **`develop` → `main`**: `develop`에서 `main`으로 PR을 열고(`Release <version>`), 게이트가 통과하면 병합 커밋으로 병합한다. 사용자가 `/release`를 부른 것이 이 병합의 허락이다. G3의 `main` 보호가 PR 병합만 허락하는지 확인한다.
5. **릴리스 워크플로**: `main`에서 release-ci의 릴리스 워크플로를 시작하고, 환경 `release`의 승인을 사용자에게 요청한다(승인 지점 2, GitHub 화면). 끝날 때까지 기다린다. 공증 대기 30분을 넘기면 실행 id를 보고하고 멈춘다.
6. **확인**: draft Release의 자산(dmg, zip, `latest-mac.yml`)을 받아 release-ci의 검증 스크립트로 `/tester-build` 6단계 검사를 다시 하고, 태그 `v<version>`이 `main`의 병합 커밋을 가리키는지 본다.
7. **게시**(D7): 검사 결과와 노트를 보여 주고 사용자의 게시 승인을 받은 뒤(승인 지점 3) draft를 게시한다. rc면 prerelease로 게시한다.
8. **보고**(한국어): 버전, 태그와 커밋, PR, 워크플로 실행, 자산과 검사 결과, 게시 URL, 하지 못한 것.

## hotfix 모드 (D1)

`/release hotfix <slug> <version>` — `<version>`은 마지막 출시본의 다음 패치(`x.y.z+1`).

1. **호출 확인과 사전 확인**: 출시 모드의 0·1단계와 같다. 단 기준은 `develop`이 아니라 마지막 태그다. `main`은 `/release`로만 바뀌므로 `main` HEAD가 마지막 태그의 커밋인지 확인하고, 다르면 멈춘다.
2. **브랜치**: 마지막 태그에서 `hotfix/<slug>`를 만들어 push한다.
3. **수정**: 그 브랜치에서 `/ship`의 단계(tdd → implement → code-review → refactor → verify)로 고친다. `/ship`은 지금 브랜치가 `hotfix/<slug>`이면 그대로 쓰고 PR 대상을 `main`으로 한다(git-flow가 `/ship`에 이 예외를 적는다). 회귀 수정이면 `/postmortem`도 한다.
4. **버전 올림**: 같은 브랜치에 `chore(release): <version>` 커밋.
5. **`main`에 병합과 태그**: `hotfix/<slug>` → `main` PR(게이트 통과)을 병합하고, 출시 모드 5–7단계(릴리스 워크플로, 확인, 사용자 승인 뒤 게시)를 그대로 한다. 태그 `v<version>`은 이 병합 커밋에 붙는다. `develop`의 미출시 변경은 들어가지 않는다.
6. **되돌림**: `hotfix/<slug>` → `develop` PR을 열고 게이트가 통과하면 병합한다. 충돌이 나면 멈추고 충돌 파일을 보고한다(해결은 사용자와 함께, 출시 모드 2단계의 버전 올림과 겹치는 `app/package.json`은 높은 버전을 남긴다).
7. **보고**: 출시 모드 8단계 + 되돌림 PR.

## One-time setup (사람)

release-ci가 design.md '비밀과 권한'에 둔 비밀 이름 목록과, 인증서 `.p12`·App Store Connect API 키를 만들고 GitHub 환경 `release`에 넣고 갱신하는 절차를 옮긴다. 지금 `/tester-build`의 관찰(G2 중간 인증서, Xcode 라이선스, Team 키 Request Access)은 로컬 keychain에만 해당하는 것을 빼고 옮긴다.

## 금지

- 사용자가 직접 부르지 않은 실행, `main`에 직접 push, 태그 강제 이동·삭제, 이미 게시된 Release 덮어쓰기.
- 비밀을 읽거나 출력하는 것(`/tester-build` 'Prohibited'와 같다).
- 검사가 실패한 draft 게시.

## 참고

- Orca의 `release-cut.yml`은 종류(rc/patch/minor/major)를 받아 버전을 계산하고, 최신 게시본보다 낮은 버전을 거부한다(https://github.com/stablyai/orca/blob/main/.github/workflows/release-cut.yml). 버전 계산은 가져오지 않고(D13: 사용자가 버전을 준다) 낮은 버전 거부만 가져온다.
