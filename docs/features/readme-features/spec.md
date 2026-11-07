# readme-features — spec

> 부모: [release-0-1-0](../release-0-1-0/tasks.md) (C4) · 선행: [git-flow](../git-flow/spec.md) (부모 P1의 D16) · 병렬: [public-cleanup](../public-cleanup/spec.md), [community-docs](../community-docs/spec.md) · 후행: 부모 G2(공개), R2(다운로드 링크 채우기)

GitHub 첫 화면의 README를 기능 설명 중심으로 다시 쓴다. 하네스·문서 변경이라 대화 중에 커밋한다. README는 결정 원천이 아니라 소개다(AGENTS.md 'Decision sources'): 내용은 PRODUCT·ARCHITECTURE의 현재 상태에서만 가져온다.

## 사용자

- **처음 온 사람**: 무엇을 하는 앱인지, 무엇을 할 수 있는지, 어떻게 설치하는지를 한 화면 안에서 파악한다.
- **기여자**: 소스 빌드와 기여 문서로 가는 길을 찾는다.

## 문제

- 지금 README는 기능을 'What works today'의 긴 문단 세 개로 나열한다(README.md:20–24). 기능마다 무엇을 보여 주는지 이미지가 없다.
- 상태 줄이 "in development, not released … there is no signed build or installer yet"이다(README.md:9). 0.1.0 뒤에는 사실이 아니게 된다.
- 'Background'(README.md:52–60)는 malmoi 개발 중의 마찰을 자세히 적고, 'References'(README.md:62–74)는 계획 때 본 도구 목록이다. 기능보다 앞의 독자에게는 덜 중요하다.
- 사용자가 참고로 든 두 저장소(부모 design.md '조사' 참고 저장소)는 기능마다 이미지와 두세 문장을 붙이고, 다운로드 → 기능 → 설치 → 기여 → 라이선스 순서다.

## 완료 조건

- README가 D16 결론의 구성을 따른다( 한 줄 소개 → 다운로드 → Features → Supported agents → Install and requirements → CLI → Build from source → Documents → Contributing → Background(짧게) → References → License).
- Features의 각 항목이 PRODUCT §3 'In scope'·§5의 현재 기능 하나에 대응하고, 근거 절을 리뷰에서 대조할 수 있다(README에 절 번호를 쓰지는 않는다).
- 기능마다 스크린샷 한 장이 있고(D16), `docs/assets/readme/`(위치는 이 자식 design.md)의 이미지가 실제 앱에서 데모 프로젝트로 찍은 것이고 개인 경로·계정·이메일이 보이지 않는다.
- 0.1.0 전에는 상태 줄이 "pre-release"이고 다운로드 줄이 없다. R2가 `releases/latest/download/<dmg 이름>` 링크를 채운다(dmg 이름은 release-ci가 정한다).
- 링크가 모두 저장소 안 경로이거나 공개 URL이다(`docs/features/` 링크 없음).

## 비목표

- 번역본(D16), 웹사이트(PRODUCT §5 'Deferred').
- PRODUCT·ARCHITECTURE 변경. README가 사실과 다르면 README를 고친다.
