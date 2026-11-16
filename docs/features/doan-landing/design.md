# doan-landing — 디자인 (드래프트 먼저)

PRODUCT §5 'Deferred'에 따르면 웹(doan.design)의 스택은 앱이 완성된 뒤에 정하고, 웹은 앱을 내려받는 경로 역할만 한다. 이 문서는 `/feature`보다 먼저 시각 방향을 잡으려고 쓰는 드래프트 요청이다. 디자인이 확정되면 `/feature doan-landing`에서 spec·tasks와 함께 다시 쓴다.

## 드래프트 요청

- 캔버스: `.doan/canvases/doan-landing.html`, id `doan-landing`
- 프레임: `landing-desktop`(1440), `landing-mobile`(390), `landing-tablet`(1024), `landing-video-states`, `landing-not-mac`, `landing-notes`
- `data-doan-implements` 없음(구현할 파일이 아직 없다)

## 방향 (사용자 지시)

- 레퍼런스는 buzz.xyz와 aside.com이고, 주로 buzz처럼 단순하게 간다.
- buzz처럼 페이지 중간에 앱 영상 영역을 둔다.
- hero에는 Welcome과 설치 디스크에 쓰는 buddy 단체 사진(`.doan/assets/buddies/group/group.png`)을 쓴다.
- feature 영역은 buzz처럼 카드로 5개를 두고, 카드마다 buddy 하나가 그 기능을 하는 모습으로 보여 준다.

## 섹션 (드래프트 기준)

1. 내비게이션: 로고, Features, GitHub, Download
2. Hero: 워드마크 `Doan`, Welcome 카피, Download for macOS + View on GitHub, 단체 사진
3. 영상: 제목·설명 + 앱 창만 담은 데모 영상(영상은 아직 없다, 포스터는 readme-features hero 프레임의 앱 창)
4. Feature 5개: Doany·Dungdung·Puri·Popo·Dori가 한 기능씩 맡는다
5. 마무리 CTA: 다운로드 + GitHub
6. 푸터: 오픈소스 표기와 링크

## 결정 (critique·audit 검토 후)

- Mac에서는 "Download for Mac"이 기본 행동이다. CTA 버튼에는 아이콘을 넣지 않고, 페이지 어디에도 Apple silicon을 적지 않는다.
- Mac이 아니면(폰, Windows, Linux, iPad) GitHub이 기본 행동이다. Download 대신 "Doan runs on Mac. Open this page on your Mac to download it." 안내를 보여 준다.
- 데모 영상은 클릭해야 재생한다. 준비, 로딩, 재생, 실패 상태를 그린다.
- 마무리 패널에 Doany를 다시 등장시킨다.
- 섹션은 hero, 영상, features, 마무리+푸터 넷이다. buzz처럼 섹션 사이 간격을 크게 벌린다. 16:9 모니터(1440×810)는 간격을 가늠하는 참고값일 뿐, 섹션 내용을 그 화면에 맞추지 않는다. 섹션마다 높이는 최소 한 화면이고, 뒤에 빈 바탕을 둔다(데스크톱 320, 태블릿 240, 모바일 160).
- 영상 목업은 데스크톱 960 너비다.
- Feature 카드는 buzz 카드처럼 단순하게 둔다. 흰 카드, 왼쪽 위 buddy 이미지, 그 아래 제목과 한 줄 설명뿐이다. 색 띠, 'Doany draws' 같은 줄, 배지는 없다. buddy 이미지는 버디 고르기 화면이 쓰는 `card.png`다(움짤 아님).
- 카드는 데스크톱과 태블릿에서 3열이다. 카드가 5장이라 둘째 줄의 2장은 가운데로 모은다. 모바일은 세로로 쌓는다.
- 데스크톱, 태블릿, 모바일, Mac 아님 네 페이지를 프로토타입으로 재생한다. 스크롤, sticky nav, Features 이동, 데모 플레이어(재생 → 로딩 → 재생 중, 일시정지)가 동작한다. Download와 GitHub 링크는 이동하지 않는다.
- 섹션 요소는 buzz처럼 스크롤 위치에 따라 차례로 올라온다. 화면에 들어오면 32px 아래에서 700ms 동안 떠오르며 나타나고, 같은 섹션 안에서 90ms 간격으로 이어진다. hero는 페이지를 열 때 같은 방식으로 나타난다. 동작 줄이기 설정에서는 페이드만 남긴다.
- 영상 목업은 그라디언트 배경 없이 앱 창만 페이지 바탕 위에 둔다.
- hero 위쪽 여백을 늘린다(데스크톱 64). hero 단체 사진은 흐리게 하거나 자르지 않고 전체를 보여 준다. 영상 목업과 설명 사이 간격은 56이다.
- hero의 보조 문구는 태그라인 하나만 둔다. Doan이 무엇인지는 바로 아래 영상 섹션의 제목과 설명이 맡는다. 영상 설명은 "repo," 뒤에서 줄을 바꾼다(모바일은 자연 줄바꿈).
- 배경은 점 격자 없는 흰색이다. 단체 사진은 원본(`group.png`)을 그대로 쓴다.

## 카피 출처

기능 설명은 README의 기존 문장을 줄여 쓰고, 제품이 확인하지 않은 주장은 넣지 않는다.

## 열린 질문

- 데모 영상의 내용, 길이, 호스팅 위치
- 도메인(doan.design)·호스팅·스택은 PRODUCT 'Deferred'대로 나중에 정한다
