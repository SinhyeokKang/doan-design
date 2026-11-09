# 마스코트 선택 — spec

## 사용자

- **사람**: 첫 실행에서 다섯 마스코트 중 하나를 고르고, 설정에서 언제든 바꾼다. 고른 마스코트가 Home, Welcome, 캔버스 작업 안내에 나오고, 앱의 accent 색이 그 마스코트 색을 따른다.
- **에이전트**: 해당 없음. CLI, 스킬, 소켓 메시지는 바뀌지 않는다. `doan onboarding`으로 에이전트가 첫 실행을 끝내면 마스코트 단계를 거치지 않으므로 기본값 Doany가 남는다.

## 문제

- 마스코트는 Doany(보라 Pebble, 베레모) 하나로 고정돼 있다(PRODUCT §5 item 1 'Doany'). accent도 Doany의 violet 하나다(DESIGN.md 'Accent ramp').
- 친구 마스코트 4명은 시안(흰 배경 정지 이미지 1장씩)만 있다. 원본은 `/Users/sinhyeok/Desktop/doan-family/`에 있다. 앱이 Doany에 쓰는 투명 정지 이미지, 모션 레이어, 리그 수치, 작업 안내 GIF는 없다.

## 마스코트

| id | 이름(임시) | 색 | 소품 | 성격 한 줄(시안, 한국어 원문) |
|---|---|---|---|---|
| `doany` | Doany | violet | 베레모 | (없음 — `/design-draft`에서 작성) |
| `saemi` | Saemi(새미) | 민트 | 새싹 | 호기심 많은 산책 친구. 재미있는 것을 발견하면 꼭 데려가 보여줘요. |
| `dungdung` | Dungdung(둥둥) | 노랑 | 헤드폰 | 음악을 좋아하는 분위기 메이커. 친구의 기분에 맞는 노래를 골라줘요. |
| `popo` | Popo(포포) | 살구 | 안경 | 책을 좋아하는 엉뚱한 생각쟁이. 함께 상상하며 새로운 놀이를 만들어요. |
| `dori` | Dori(도리) | 하늘 | 목도리 | 말없이 곁을 지켜주는 다정한 친구. 지친 날 조용히 기대 쉴 수 있어요. |

- id와 에셋 폴더 이름은 마스코트 이름(소문자 로마자)이다.
- 화면에 나오는 영어 이름과 성격 한 줄은 `/design-draft`에서 Doan clarify preset으로 다듬는다.

## 완료 조건

### 1단계 — 마스코트 에셋

1. 친구 4명마다 Doany와 같은 구조의 에셋이 있다(design.md '에셋 구조'): 투명 정지 이미지, 눈 없는 몸통 레이어, 소품 레이어, 리그 수치, 작업 안내 GIF 1종(artist, 그림 그리기)과 그 첫 프레임 PNG, 출처 프롬프트.
2. 레이어 두 장과 셰이더가 그리는 눈을 합친 rest 프레임이 정지 이미지와 겹친다. 경계와 눈 위치가 1 device px 안에서 맞는다(Doany의 `doanyRender.test.ts` 기준과 같다).
3. 작업 안내 GIF는 Doany 가족 정렬 규칙을 따른다. 32px 창 높이의 52%에 눈높이를 맞추고, 무게중심을 가로 50%에 둔다(`public/doany/README.md` 'Doany the artist').
4. 사람이 캔버스에서 다섯 마스코트의 정지 이미지, 모션, 작업 안내 GIF를 확인했다.

### 2단계 — accent 동적 변경

5. 마스코트마다 12단계 accent 램프가 있고, 고른 마스코트가 바뀌면 지금 violet을 읽는 모든 곳(DESIGN.md 'Accent places')이 그 램프로 바뀐다. 앱을 다시 시작하지 않아도 바뀐다.
6. 글로우, 그라데이션, 채움은 램프의 9단계를 쓴다. 흰 패널 위 accent 아이콘, 점, 외곽선은 마스코트별 아이콘 색을 쓰며 `--surface-panel` 대비 3:1 이상이다. Doany는 지금처럼 9단계다.
7. Home Send는 accent로 채운다. 아이콘과 스피너는 흰색이 3:1 이상이면 흰색(Doany, Popo, Dori), 아니면 중립 잉크(Saemi, Dungdung)다.
8. accent 칩(프리셋 칩, 추천 프롬프트의 이름 강조, 앵커 칩)의 글자는 모든 램프에서 4.5:1 이상이다.
9. 앱을 시작할 때 저장된 마스코트의 accent로 첫 화면을 그린다. violet이 잠깐 보였다가 바뀌지 않는다.

### 3단계 — 마스코트 설정

10. 첫 실행은 Welcome → Mascot → Agent → Project → Home 순서다. 스텝퍼에는 1 Mascot · 2 Agent · 3 Project가 표시된다. Mascot 단계는 다섯 마스코트를 선택 카드(그림과 이름)로 보여주고, 선택한 마스코트의 성격 한 줄을 보여준다. 처음에는 Doany가 선택돼 있다.
11. Mascot 단계에서 고르면 즉시 저장하고 accent도 즉시 바뀐다. 첫 실행 도중 앱을 종료해도 고른 마스코트가 남는다. Welcome는 그때 저장된 마스코트를 보여준다.
12. 설정 목록 맨 위에 General 카테고리가 있고, 그 안의 Mascot 그룹에서 같은 선택지로 언제든 바꿀 수 있다. 바꾸면 Home, Welcome, 작업 안내, accent에 즉시 반영된다.
13. Home과 Welcome에는 고른 마스코트가 나오고, Doany와 같은 모션(숨쉬기, 깜박임, 시선, 포인터 따라보기, 입력 중 주목, 홉, reduced motion에서 정지, WebGL이 없으면 정지 이미지)을 한다.
14. 캔버스 작업 안내에는 고른 마스코트의 GIF가 나온다. Doany를 고르면 지금처럼 세 변형 중 하나를 무작위로 고르고, 친구는 artist GIF 하나만 쓴다.
15. 이미 첫 실행을 마친 사용자는 Doany로 시작하고, 설정에서 바꿀 수 있다.
16. 앞으로 마스코트를 Overview, AppShell 등에 넣을 때도 이 설정 하나를 읽는다(design.md '마스코트 레지스트리').

## 비목표

- 앱 아이콘, 파비콘, README 이미지는 Doany 그대로 둔다.
- 친구의 작업 안내 GIF는 artist 1종만 만든다. typing·reading 변형은 만들지 않는다.
- 첫 실행을 이미 마친 사용자에게 마스코트 선택을 따로 권하지 않는다.
- `doan onboarding`(CLI·소켓)에 마스코트 단계를 넣지 않는다.
- Overview, AppShell 등 새 위치에 마스코트를 넣는 일은 이번 범위가 아니다.
- 마스코트별 다크 모드는 다루지 않는다. 앱에는 다크 테마가 없다.
- Welcome horizon의 보조색(indigo, orange)과 jump highlight의 indigo는 바꾸지 않는다.
