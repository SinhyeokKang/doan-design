# 버디 선택 — spec

## 사용자

- **사람**: 첫 실행에서 다섯 버디 중 하나를 고르고, 설정에서 언제든 바꾼다. 고른 버디가 Home과 캔버스 작업 안내에 나오고, 앱의 accent 색이 그 버디 색을 따른다. 버디를 고른 적이 없는 기존 사용자는 다음 실행 때 버디 선택 화면을 한 번 본다.
- **에이전트**: CLI, 스킬, 소켓 메시지 형식은 바뀌지 않는다. `doan onboarding`으로 에이전트가 첫 실행을 끝내면 버디 단계를 거치지 않는다. 그 사람은 다음 실행 때 기존 사용자와 같은 버디 선택 화면을 본다. 이 화면이 떠 있는 동안 `doan open`과 링크는 첫 실행 때와 같은 응답을 받는다(18).

## 문제

- 버디는 Doany(보라 Pebble, 베레모) 하나로 고정돼 있다(PRODUCT §5 item 1 'Doany'). accent도 Doany의 violet 하나다(DESIGN.md 'Accent ramp').
- 친구 버디 4명은 시안(흰 배경 카드 이미지 1장씩)과 화가 GIF만 있었다. 앱이 Doany에 쓰는 투명 정지 이미지, 모션 레이어, 리그 수치가 없었다(1단계에서 만들었다).
- Welcome은 Doany 하나만 보여준다. 바로 다음 단계에서 다섯 버디 중 하나를 고르는데, 첫 화면은 그중 하나만 소개한다. 설치 디스크도 pigment horizon과 Doany 아이콘만 보여준다.
- Home 셰이더의 눈은 평평한 검은 타원에 가로 띠 하이라이트라, 카드 이미지의 광택 있는 구슬 눈과 다르다. 다섯 버디를 카드와 Home에서 나란히 보면 눈이 따로 논다. 버디 발밑에는 카드에 있는 접지 그림자도 없다.
- PRODUCT에는 버디나 accent 개인화가 없다. §3 In scope 번호는 늘리지 않는다. §1의 문제→범위 구조와 이어지지 않기 때문이다. §3 끝 문단(설치·온보딩을 다루는 문단)에 한 줄 적고, 상세는 §5 item 0·1에 둔다(tasks 4.1).

## 버디

| id | 이름 | 색 | 소품 | 성격 한 줄(영어, 화면 문구) |
|---|---|---|---|---|
| `doany` | Doany | violet | 베레모 | A little artist in a beret who just loves to draw. |
| `puri` | Puri | 민트 | 새싹 | A curious walking companion who shares every fun find. |
| `dungdung` | Dungdung | 노랑 | 헤드폰 | A music-loving mood maker who keeps things upbeat. |
| `popo` | Popo | 살구 | 안경 | A whimsical bookworm who dreams up new games. |
| `dori` | Dori | 하늘 | 목도리 | A quiet, caring friend to lean on when you’re tired. |

- id와 에셋 폴더 이름은 버디 이름(소문자 로마자)이다. 기본 순서(레지스트리, 설정)는 이 표의 순서다.

## 완료 조건

### 1단계 — 버디 에셋

1. 친구 4명마다 Doany와 같은 구조의 에셋이 있다(design.md '에셋 구조'): 선택 카드 이미지(`card.png`), 투명 정지 이미지, 눈 없는 몸통 레이어, 소품 레이어, 바닥 그림자 레이어(Doany 포함 다섯 모두), 리그 수치, 정지 이미지·레이어의 출처 프롬프트, 작업 안내 GIF 1종(artist)과 그 첫 프레임 PNG. Doany의 카드 이미지는 원본 정지 이미지 기준으로 다시 그린 것이다. 다섯 버디가 함께 쓰는 눈 이미지(`eye.png`)가 하나 있다.
2. 몸통 레이어 위에 소품 레이어를 합성한 그림이 눈 영역을 빼면 정지 이미지와 알파 경계에서 1px(1254² 원본 기준) 안에서 맞는다. 눈 중심과 반지름은 Doany처럼 정지 이미지의 눈과 UV `.003` 안에서 맞는다(1254² 원본에서 잰다).
3. 작업 안내 GIF는 README 'Working-notice source boxes'의 박스로 잘라 32px 창에서 잘리는 곳이 없다(Doany는 이젤 발이 0.5px 미만 잘림). 박스를 정한 방법과 수치는 `.doan/assets/buddies/README.md`에 있다.
4. 사람이 `.doan/canvases/buddy-choice.html`, `buddy-home.html`, `buddy-assets.html`에서 다섯 버디의 정지 이미지, 카드, 작업 안내 GIF, 모션 미리보기(공용 눈과 털 눈꺼풀 깜박임 포함)를 확인했다.

### 2단계 — accent 동적 변경

5. 버디마다 accent 램프가 있다. 고른 버디가 바뀌면 모든 Accent places(DESIGN.md 'Accent places')와 새 Accent place인 선택 카드의 테두리·글로우가 그 램프로 바뀐다. 앱을 다시 시작하지 않아도 바뀐다.
6. 글로우, 그라데이션, 채움은 램프의 9단계를 쓴다. accent 아이콘, 점, 외곽선은 버디별 아이콘 색을 쓰며, 놓이는 가장 어두운 면(눌린 사이드바 행) 대비 3:1 이상이다. Doany는 지금처럼 violet 9단계다.
7. Home Send는 accent로 채운다. 아이콘과 스피너는 흰색이 9·hover·pressed 모두에서 3:1 이상이면 흰색(Doany, Popo, Dori), 아니면 중립 잉크(Puri, Dungdung)다. Send는 아이콘만 있는 버튼이라 비텍스트 기준 3:1로 검사한다.
8. accent 칩(프리셋 칩, 추천 프롬프트의 이름 강조, 앵커 칩)은 3단계 바탕 위 11단계 글자이고, 모든 램프에서 4.5:1 이상이다.
9. 앱을 시작할 때 저장된 버디의 accent로 첫 화면을 그린다. violet이 잠깐 보였다가 바뀌지 않는다.

### 3단계 — 버디 설정

10. 첫 실행은 Welcome → Buddy → Agent → Project → Home 순서다. 스텝퍼에는 1 Buddy · 2 Agent · 3 Project가 표시된다. Buddy 단계는 다섯 버디를 Cover Flow 형태의 선택 카드 한 줄로 보여준다. 이 줄만 특별 순서 Popo · Puri · Doany · Dungdung · Dori를 쓴다. 카드마다 그림, 이름, 성격 한 줄이 있다.
11. Buddy 단계에 들어오면 저장된 버디(없으면 Doany)가 선택된 채 가운데에 있다. Doany가 선택돼 있으면 다섯이 모두 보인다. 카드 클릭, ←/→(↑/↓도 같음), 가로 스크롤(트랙패드 스와이프, Shift+마우스 휠)로 넘기고, 양끝에서 멈춘다. 가로 스크롤 중에는 줄이 이동량과 관성을 따라 연속으로 움직이고, 멈추면 가장 가까운 카드에 붙어 그 카드를 고른다(저장과 accent 변경은 이때 한 번). Return은 그룹 안에서 아무것도 하지 않는다.
12. Buddy 단계에서 고르면 즉시 저장하고 accent도 즉시 바뀐다. 첫 실행 도중 앱을 종료해도 고른 버디가 남는다. 저장에 실패하면 저장된 버디로 돌아가고 "Couldn’t switch to <고른 버디>. <저장된 버디> is still your buddy."와 Retry를 보여준다. 빠르게 여러 번 고르면 마지막 선택의 결과만 화면에 반영한다. 저장이 끝나기 전에 Continue를 누르면 저장을 기다렸다가 진행하고, 실패하면 단계에 남아 같은 notice를 보인다.
13. 설정 목록 맨 위에 General 카테고리가 있고, 그 안의 Buddy 그룹에서 다섯 버디를 기본 순서의 행으로 보여준다. 고르면 즉시 저장되고 Home, 작업 안내, accent에 즉시 반영된다. 저장에 실패하면 저장된 버디로 돌아가고, 그룹 위에 12와 같은 문구와 Retry가 나온다.
14. preferences 파일을 더 새로운 Doan이 썼으면(newer), 설정 General과 Buddy 단계 모두 선택을 끄고 기존 newer notice만 보여준다. 이때 Continue는 Doany로 진행한다. 파일을 읽을 수 없으면(broken), Buddy 단계, 기존 사용자용 버디 화면, 설정 General 모두 기존 broken notice("Doan couldn’t read its saved settings, so defaults apply.")를 보여주고, 기본값으로 고를 수 있다. 저장하면 파일을 옆으로 옮기고 기본값에서 시작한다. 설정을 아직 읽지 못한 동안에는 고르기를 끈다.
15. Welcome은 Doany 대신 다섯 버디의 단체 사진을 보여준다. 흰 바탕(pigment horizon과 grain 없음) 위쪽에 워드마크, 문장, Get started가 있고, 그 아래 단체 사진이 창 아래 가장자리에서 잘린다. 창이 커지면 사진도 커지고, 어느 크기에서도 다섯 버디의 눈이 보인다. 사진을 읽지 못하면 사진만 숨기고 글자 묶음은 그대로다. Welcome에는 Doany와 그 WebGL이 없고 accent도 없다. 저장된 버디와 상관없이 같다. 사람이 `.doan/canvases/buddy-welcome.html`에서 이 안을 확정했다.
16. Home에는 고른 버디가 나오고, Doany와 같은 모션(숨쉬기, 깜박임, 시선, 포인터 따라보기, 입력 중 주목, 홉, reduced motion에서 정지, WebGL이 없거나 텍스처를 못 읽으면 정지 이미지)을 한다. Doany도 다음 셋이 바뀐다.
    - 눈: 셰이더가 공용 `eye.png`를 버디별 눈 중심·반지름에 놓는다(`doanyRender.test.ts`가 앵커를 검사한다).
    - 깜박임: 구슬은 모양을 유지하고 털 눈꺼풀이 위에서 덮는다. 길이와 간격은 260 ms·2.5–6초에서 420 ms·4–8초로 바뀐다.
    - 바닥 그림자: 다섯 버디 모두 발밑에 있다. 홉하는 동안 바닥에 남아 접지점을 중심으로 줄어든다(lift 1에서 크기 55%, 불투명도 40%). reduced motion과 정지 이미지 폴백에서는 lift 0의 같은 그림자를 보인다. 정지 이미지도 없어 슬롯을 비우면 그림자도 숨긴다.
17. 캔버스 작업 안내에는 고른 버디의 GIF가 나온다. Doany는 지금처럼 세 변형 중 하나를 무작위로 고르고, 친구는 artist GIF 하나만 쓴다. 안내가 떠 있는 동안 버디가 바뀌면 떠 있는 안내도 즉시 새 버디의 GIF로 바뀐다.
18. 첫 실행을 마쳤고 preferences 파일에 `buddy` 키가 아예 없는 사람은 다음 실행 때 버디 선택 화면을 한 번 본다. 알 수 없는 id(더 새로운 빌드가 저장한 값), newer, broken이면 띄우지 않는다. 이 화면은 창 전체를 덮고, 스텝퍼와 Back 없이 Buddy 단계와 같은 카드 줄과 Continue만 둔다. Continue를 누르면 그때 선택된 버디(처음엔 Doany)를 저장하고 닫는다. 닫힌 뒤에는 실행 때 복원한 화면이 그대로 보인다. 이 화면이 떠 있는 동안 링크, `doan open`, 메뉴(Settings…, Add Project…, ⌘B), 알림은 첫 실행 때와 똑같이 동작한다. 저장 실패와 broken 처리는 12·14와 같다.
19. 설치 디스크(dmg) 배경은 흰 바탕 위쪽에 단체 사진, 그 아래 Doan → Applications를 왼쪽에서 오른쪽으로, 맨 아래에 "A place for your next idea."를 둔다. pigment horizon은 쓰지 않는다. 사람이 `.doan/canvases/buddy-installer.html`에서 이 안을 확정했다. 실제 dmg 창에서 문장이 Finder 경로·상태 막대에 가리지 않는다. 다크 모드에서 Finder가 아이콘 라벨을 흰 글자로 그려 안 보여도 받아들인다(아이콘과 화살표만으로 동작이 읽힌다).

## 비목표

- 앱 아이콘, 파비콘, README 이미지는 Doany 그대로 둔다.
- 친구의 작업 안내 GIF는 artist 1종만 만든다. typing·reading 변형은 만들지 않는다.
- `doan onboarding`(CLI·소켓)에 버디 단계를 넣지 않는다.
- Overview, AppShell 등 새 위치에 버디를 넣는 일은 이번 범위가 아니다.
- 다크 테마용 램프는 다루지 않는다. 앱에는 다크 테마가 없다.
- jump highlight의 indigo는 바꾸지 않는다.
- 눈에 표정이나 효과를 더하지 않는다. 카드 눈의 느낌만 살린다.
