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

- Feature 카드는 데스크톱과 태블릿 모두 한 줄 5열이다. 모바일에서만 행 목록으로 바꾼다.
- Mac에서는 Download가 기본 행동이고, 레이블에 요건을 넣는다("Download for Mac (Apple silicon)"). 브라우저는 Apple silicon과 Intel을 확실히 구분하지 못해서 레이블로 안내한다.
- Mac이 아니면(폰, Windows, Linux, iPad) GitHub이 기본 행동이다. Download 대신 "Doan runs on Macs with Apple silicon. Open this page on your Mac to download it." 안내를 보여 준다.
- 데모 영상은 클릭해야 재생한다. 준비, 로딩, 재생, 실패 상태를 그린다.
- 마무리 패널에 Doany를 다시 등장시킨다.
- 섹션은 hero, 영상, features, 마무리+푸터 넷이다. buzz처럼 16:9 모니터(1440×810)에서 섹션 하나가 sticky nav 아래 한 화면을 채워, 섹션 사이에는 빈 바탕을 크게 둔다(데스크톱 320, 태블릿 240, 모바일 160). 두 섹션이 한 화면에 함께 보이지 않는다. 태블릿(1024×768)과 모바일(390×844)도 섹션마다 최소 한 화면을 차지한다.
- 데스크톱, 태블릿, 모바일, Mac 아님 네 페이지를 프로토타입으로 재생한다. 스크롤, sticky nav, Features 이동, 데모 플레이어(재생 → 로딩 → 재생 중, 일시정지)가 동작한다. Download와 GitHub 링크는 이동하지 않는다.
- 섹션 요소는 buzz처럼 스크롤 위치에 따라 차례로 올라온다. 화면에 들어오면 32px 아래에서 700ms 동안 떠오르며 나타나고, 같은 섹션 안에서 90ms 간격으로 이어진다. hero는 페이지를 열 때 같은 방식으로 나타난다. 동작 줄이기 설정에서는 페이드만 남긴다.
- 영상 목업은 그라디언트 배경 없이 앱 창만 페이지 바탕 위에 둔다.
- hero 위쪽 여백을 늘린다(데스크톱 64). 데스크톱에서는 hero 사진 아래를 흐리게 처리하지 않고 화면 경계에서 자른다. 영상 목업은 900으로 키우고, 설명과의 간격을 56으로 띄운다.
- hero의 보조 문구는 태그라인 하나만 둔다. Doan이 무엇인지는 바로 아래 영상 섹션의 제목과 설명이 맡는다. 영상 설명은 "repo," 뒤에서 줄을 바꾼다(모바일은 자연 줄바꿈).
- 배경은 점 격자 없는 흰색이다. 단체 사진은 원본(`group.png`)을 그대로 쓴다.

## 카피 출처

기능 설명은 README의 기존 문장을 줄여 쓰고, 제품이 확인하지 않은 주장은 넣지 않는다.

## 열린 질문

- 데모 영상의 내용, 길이, 호스팅 위치
- Dungdung(듣기)과 Dori(내보내기) 카드에 쓸 새 동작 이미지
- 도메인(doan.design)·호스팅·스택은 PRODUCT 'Deferred'대로 나중에 정한다
