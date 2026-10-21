# formats — spec

MVP 피처 1번(PRODUCT §5 피처 분할). 앱(TypeScript)과 CLI(Go)가 함께 읽고 쓰는 형식 세 가지를 JSON Schema로 정하고, 같은 픽스처로 두 구현을 묶는다.

## 사용자

- **에이전트**(CLI·MCP를 쓰는 쪽): `doan comments`가 돌려주는 코멘트 상태, `--json` 봉투, 종료 코드가 런타임에 상관없이 같다. 앱과 CLI의 버전이 다르면 형식 버전 `v`로 알아채고 경고를 받는다. 그래서 기계적으로 읽을 수 있다.
- **사람**(앱에서 보고 코멘트하는 쪽): 앱에서 남긴 코멘트를 CLI가 똑같이 읽는다. 다른 머신에서 pull해도 상태가 같게 접힌다.
- **doan 개발자**: TS와 Go 구현이 어긋나면 테스트가 잡는다.

## 문제

- 코멘트는 리포 파일로 남고, 어느 머신에서 읽어도 같은 상태로 접혀야 한다(PRODUCT §1 문제 4). 에이전트는 그 상태를 CLI로 기계적으로 읽는다(PRODUCT §3 In scope 3 'Deliver').
- 형식의 원본이 아직 없다. ARCHITECTURE §11 'Shared formats'는 "JSON Schema가 원본, TS·Go가 같은 픽스처로 테스트"라고 정했지만, 스키마 파일도 픽스처도 없다.
- 코멘트 이벤트·config·CLI 응답의 필드가 문장으로만 정해져 있다(ARCHITECTURE §2 'Comment storage' · §3 · §12). 이대로 TS와 Go가 각자 구현하면 필드 이름·접기 규칙이 갈라진다.

## 완료 조건

1. 스키마 세 개가 있다: 코멘트 이벤트, `.doan/config.json`, CLI 응답 봉투. 셋 다 형식 버전 `v`를 가진다. 봉투의 `v`는 ARCHITECTURE §12를 바꾸는 결정이므로(Q5) 구현 전에 정본에 기록한다(tasks 0).
2. 유효·무효 픽스처가 있고, TS와 Go 검증기가 둘 다 같은 판정(유효/무효)을 낸다. `v`가 2인 config·봉투 픽스처는 무효로 판정한다.
3. 접기 픽스처(이벤트 JSONL → 기대 결과 JSON)가 있고, TS와 Go의 `parseLines` + `fold` 결과를 파싱해 비교하면 기대 결과와 같다(deep-equal). 코멘트는 `createdAt` → 코멘트 id 순, 경고는 줄 번호 순이다(design §2).
4. 접기가 다음을 만족한다(각각 픽스처로 덮는다):
   - 줄 순서와 무관하다. 경고가 없는 같은 이벤트 집합을 섞어도 결과가 같다.
   - 같은 이벤트 `id`가 두 번 있어도 한 번으로 친다(union 머지로 생기는 중복). 내용이 다르면 그 id의 이벤트를 모두 버리고 경고한다.
   - 삭제된 코멘트는 결과에 없고, 삭제 뒤 이벤트는 무시한다.
   - 에이전트가 낸 생성·수정·삭제·다시 open은 무시하고 경고로 보고한다(PRODUCT §5: 수정·삭제는 사람만, 에이전트는 resolve만). 사람의 resolve는 받아들인다.
   - 모르는 `v`를 만나면 그 이벤트를 무시하고 "더 새 버전의 Doan이 쓴 기록" 경고를 낸다.
   - 빈 파일과 빈 줄은 경고 없이 빈 결과·건너뜀으로 처리한다.
5. PRODUCT §6에 PoC 5(`merge=union`)의 통과, 관찰 내용, 날짜가 기록돼 있다. 머지 부분은 tasks 1, 접은 결과가 기대와 같은지는 tasks 4의 `union-merge` 픽스처와 tasks 6으로 확인한다.

## 비목표

- CLI 명령 자체(`doan comments` 등)와 명령별 `result` 모양 — 2번 `cli-core`.
- 빈 캔버스·`doan:width` 누락 같은 캔버스 규약 검사 — 2번 `cli-core`의 `doan check`.
- config 경로의 정규화·심링크 검사 — 2번 `cli-core`와 로컬 서버(PRODUCT §6 PoC 4). 이 피처의 스키마는 절대 경로와 `..`만 막는다.
- 앵커를 실제 DOM에서 다시 찾는 로직(재앵커링)과 코멘트 표시 — 7번 `comments-ui`.
- `doan active` 응답 모양 — 6번 `select-inspect`.
- JSONL 압축(PRODUCT §8: MVP에서 하지 않는다).
- 스키마로 TS·Go 타입을 생성하는 코드 생성기. 필요가 보이면 그때 정한다.
