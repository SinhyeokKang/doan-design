# readme-features — spec

> 부모: [release-0-1-0](../release-0-1-0/tasks.md) (C4) · 선행: [community-docs](../community-docs/spec.md)(C3, README가 CONTRIBUTING을 링크) · 병렬: 부모 P0 · 후행: [git-flow](../git-flow/spec.md)(C1) → 부모 G2(공개), R2(다운로드 링크·배지·상태 줄·업데이트 문단)

GitHub 첫 화면의 README를 기능 설명 중심으로 다시 쓴다. 하네스·문서 변경이라 대화 중에 커밋한다. `develop`이 아직 없으므로 지금 규칙대로 `main`에 커밋한다(부모 '사용자 결정' 5). README는 결정 원천이 아니라 소개다(AGENTS.md 'Decision sources'): 내용은 PRODUCT·ARCHITECTURE의 현재 상태에서만 가져온다. 그래서 README Background에만 있던 Malmoi 근거는 PRODUCT §1로 옮긴다(D28).

## 사용자

- **처음 온 사람**: 무엇을 하는 앱인지, 무엇을 할 수 있는지, 어떻게 설치하는지를 한 화면 안에서 파악한다.
- **기여자**: 소스 빌드와 기여 문서로 가는 길을 찾는다.
- **메인테이너**: 화면이 바뀌면 README 이미지를 앱 촬영 없이 캔버스만 고쳐 다시 내보낸다(D29).

## 문제

- 지금 README는 기능을 'What works today'의 긴 문단 세 개로 나열한다(README.md:20–24). 기능마다 무엇을 보여 주는지 이미지가 없다.
- 상태 줄이 "in development, not released … there is no signed build or installer yet"이다(README.md:9). 0.1.0 뒤에는 사실이 아니게 된다.
- 'Background'(README.md:52–60)는 malmoi 개발 중의 마찰을 자세히 적고, 'References'(README.md:62–74)는 계획 때 본 도구 목록이다. 기능보다 앞의 독자에게는 덜 중요하다. 그런데 PRODUCT §1 끝줄은 "Source: the Malmoi case in the README background."라며 README를 근거로 가리킨다(docs/PRODUCT.md:17).
- 앱 화면을 찍으면 로그인이 필요한 화면에 실제 계정 이메일과 사용량이 보이고, 격리 실행에서도 자격 증명이 keychain에 남는다(docs/ARCHITECTURE.md:600).
- 사용자가 참고로 든 두 저장소(부모 design.md '조사' 참고 저장소)는 기능마다 이미지와 두세 문장을 붙이고, 다운로드 → 기능 → 설치 → 기여 → 라이선스 순서다.

## 완료 조건

- README가 이 자식 design.md '구성'의 순서를 따른다.
- Features의 각 항목이 PRODUCT §3 'In scope'·§5의 현재 기능 하나에 대응하고, 근거 절(design.md 표, 모두 PRODUCT·ARCHITECTURE)을 리뷰에서 대조할 수 있다(README에 절 번호를 쓰지는 않는다).
- 기능마다 이미지 한 장이 있다. 이미지는 `.doan/canvases/readme-features.html`의 프레임을 내보낸 PNG이고(D29), 더미 데이터만 쓰며, `docs/assets/readme/`에 장당 500 KB 이하로 있다.
- 0.1.0 전에는 상태 줄이 "pre-release"이고 Download 절은 "Pre-release: build from source" 한 줄이다. 릴리스 배지, `releases/latest/download/<dmg 이름>` 링크, 업데이트 문단은 부모 R2가 넣는다(dmg 이름은 release-ci, 업데이트 문장은 app-update가 정한다).
- Background는 짧게 줄었고, Malmoi 근거 항목은 PRODUCT §1에 있으며 PRODUCT §1의 출처 줄이 README를 가리키지 않는다(D28).
- 링크가 모두 저장소 안 경로이거나 공개 URL이다(`docs/features/` 링크 없음). AGENTS.md 'Documents' 표의 README 행과 'References'의 "(README §1)"이 새 README와 맞다.

## 비목표

- 번역본(D16), 웹사이트(PRODUCT §5 'Deferred').
- PRODUCT·ARCHITECTURE의 다른 변경. README가 사실과 다르면 README를 고친다(D28의 §1 이동만 예외).
- 아직 없는 기능(앱 안 업데이트, CI)을 README에 쓰기.
